"""M14.4 — chat with a document.

Each Lucid dossier becomes a conversational workspace. The user asks
follow-up questions; Claude answers grounded in the source document +
the already-generated dossier + the conversation history.

Architecture: NO embeddings / RAG for v1. We stuff the entire raw_text
+ a compact dossier digest into every call. Most docs fit Claude's
1M context window comfortably; prompt caching (5-min TTL) makes
follow-up messages ~10× cheaper than the first because the doc +
dossier prefix is unchanged.

When (if) users start uploading books that don't fit, we'll add a
chunk + embed + retrieval pass without changing this module's public
shape — the call sites just see `chat_stream(extraction, history,
user_msg, ...)` either way.

Cost note: each message bills the full doc + dossier as input tokens
on the FIRST request (or after the 5-min TTL), then cached on
follow-ups. Default model = Sonnet 4.6 (cheaper, faster, plenty smart
for Q&A over a doc you've already extracted).
"""
from __future__ import annotations

import logging
from collections.abc import Iterator

import anthropic

log = logging.getLogger("storyforge.chat")

CHAT_MODEL_DEFAULT = "claude-sonnet-4-6"
MAX_OUTPUT_TOKENS = 4000


def _system_prompt(extraction) -> str:
    """Build the chat system prompt: persona + the document + a compact
    dossier digest so Claude can reference everything the dossier surfaced
    without us re-stuffing the full lens_payload (which can be 15k+ tokens
    of sometimes-redundant prose)."""
    raw_text = extraction.raw_text or ""
    filename = extraction.filename or "(unnamed document)"

    # Compact dossier digest — only the high-signal bits. The full dossier
    # lives in the UI; we don't need to re-give Claude prose it already wrote.
    digest = _dossier_digest(getattr(extraction, "lens_payload", None) or {})

    return f"""You are an expert analyst helping the user understand a document.

The user has uploaded the document below. You have ALREADY produced a structured \
dossier (digest below). Now they want to ask follow-up questions, get specific \
sections elaborated, draft response text, run "what if" scenarios, or anything \
else that builds on the document.

Rules:
- Always ground answers in the document. If asked something not in the doc, say so \
  ("the document doesn't say") and offer to reason about it as inference.
- Quote the document verbatim when citing specific facts. Use "" quotes inline.
- Be concise by default. Bullet points or short paragraphs. Long expositions only \
  when the user explicitly asks.
- Reference dossier sections by name when relevant ("see Better Questions #4...") so \
  the user can jump to them.
- For draft requests (response email, meeting agenda, counter-proposal), produce \
  the actual draft, not a description of how to write one.

═══════════════════════════════════════════════════
DOCUMENT: {filename}
═══════════════════════════════════════════════════

{raw_text}

═══════════════════════════════════════════════════
DOSSIER DIGEST
═══════════════════════════════════════════════════

{digest}
"""


def _dossier_digest(payload: dict) -> str:
    """Compact digest of the dossier — pulls the most useful bits without
    re-streaming the full prose. Used in the chat system prompt so Claude
    can reference what was already extracted."""
    if not payload:
        return "(no dossier — chat is grounded in raw document only)"

    out = []
    if payload.get("overture"):
        out.append(f"OVERTURE: {payload['overture']}")
    brief = payload.get("brief") or {}
    if brief.get("summary"):
        out.append(f"BRIEF: {brief['summary']}")

    # Numbers — high info density
    nums = (payload.get("numbers_extract") or {}).get("facts") or []
    if nums:
        out.append("KEY NUMBERS:")
        for n in nums[:20]:
            out.append(f"  - {n.get('label')}: {n.get('value')}")

    # 5W1H — orientation
    w = payload.get("five_w_one_h") or {}
    if w:
        out.append("5W1H:")
        for k in ("who", "what", "when", "where", "why", "how"):
            if w.get(k):
                out.append(f"  {k.upper()}: {w[k]}")

    # Assumptions + Inversion + Negative Space — the "what's underneath" bits
    assumptions = payload.get("assumptions") or []
    if assumptions:
        out.append("KEY ASSUMPTIONS:")
        for a in assumptions[:7]:
            out.append(f"  - [{a.get('risk_level', 'med')}] {a.get('assumption')}")

    inversion = payload.get("inversion") or []
    if inversion:
        out.append("FAILURE MODES:")
        for f in inversion[:7]:
            out.append(f"  - {f.get('scenario')}")

    neg = (payload.get("negative_space") or {}).get("items") or []
    if neg:
        out.append("WHAT'S MISSING:")
        for it in neg[:7]:
            out.append(f"  - {it.get('missing_item')}")

    # Action items + open decisions — actionable surface
    actions = payload.get("action_items") or []
    if actions:
        out.append("ACTION ITEMS:")
        for a in actions[:10]:
            out.append(f"  - [{a.get('owner')}] {a.get('action')} ({a.get('when')})")

    open_decisions = payload.get("decisions_open") or []
    if open_decisions:
        out.append("OPEN DECISIONS:")
        for d in open_decisions[:7]:
            out.append(f"  - {d}")

    return "\n".join(out)


def chat_stream(
    *,
    extraction,
    history: list[dict],
    user_message: str,
    api_key: str | None,
    model: str | None = None,
) -> Iterator[dict]:
    """Stream a chat response. Yields `{type, ...}` events:

      {"type": "text",     "delta": str}     — incremental text
      {"type": "complete", "content": str, "input_tokens": int,
                           "output_tokens": int, "model_used": str}
      {"type": "error",    "status": int, "detail": str}

    `history` is the persisted message list:
      [{"role": "user"|"assistant", "content": str}, ...]
    `user_message` is the current message being asked (NOT yet in history).
    """
    if not api_key:
        # Mock mode — no Claude, return a friendly placeholder.
        msg = "Mock chat reply. Set ANTHROPIC_API_KEY (or BYOK in Settings) to chat for real."
        yield {"type": "text", "delta": msg}
        yield {
            "type": "complete",
            "content": msg,
            "input_tokens": 0,
            "output_tokens": 0,
            "model_used": "mock",
        }
        return

    eff_model = model or CHAT_MODEL_DEFAULT
    client = anthropic.Anthropic(api_key=api_key)

    # Cache the doc + dossier digest as the system block — same prefix on
    # every chat turn means cache hits after turn 1.
    system = [{
        "type": "text",
        "text": _system_prompt(extraction),
        "cache_control": {"type": "ephemeral"},
    }]

    # Build the message list: prior turns + the new user message.
    messages = [
        {"role": m["role"], "content": m["content"]}
        for m in (history or [])
        if m.get("role") in ("user", "assistant") and m.get("content")
    ]
    messages.append({"role": "user", "content": user_message})

    full_text = []
    try:
        with client.messages.stream(
            model=eff_model,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=system,
            messages=messages,
        ) as stream:
            for event in stream:
                etype = getattr(event, "type", None)
                if etype == "content_block_delta":
                    delta = getattr(event, "delta", None)
                    text = getattr(delta, "text", None) if delta else None
                    if text:
                        full_text.append(text)
                        yield {"type": "text", "delta": text}
            final_message = stream.get_final_message()
    except anthropic.AuthenticationError:
        yield {"type": "error", "status": 401, "detail": "Invalid Anthropic API key. Update in Settings."}
        return
    except anthropic.RateLimitError as e:
        retry_after = e.response.headers.get("retry-after", "60") if e.response else "60"
        yield {"type": "error", "status": 429, "detail": f"Anthropic rate limit. Retry after ~{retry_after}s."}
        return
    except anthropic.BadRequestError as e:
        yield {"type": "error", "status": 400, "detail": f"Claude rejected the request: {e.message}"}
        return
    except anthropic.APIConnectionError:
        log.exception("anthropic connection error during chat")
        yield {"type": "error", "status": 503, "detail": "Could not reach Anthropic API."}
        return
    except Exception as e:
        log.exception("chat stream failed")
        yield {"type": "error", "status": 500, "detail": f"Chat failed: {e}"}
        return

    raw_usage = final_message.usage
    yield {
        "type": "complete",
        "content": "".join(full_text),
        "input_tokens": getattr(raw_usage, "input_tokens", 0) or 0,
        "output_tokens": getattr(raw_usage, "output_tokens", 0) or 0,
        "model_used": eff_model,
    }
