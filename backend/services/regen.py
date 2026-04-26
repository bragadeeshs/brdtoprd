"""Regenerate one section of an existing extraction (M4.4).

Flow:
  1. Caller hands us the live extraction (brief / actors / current section
     contents / source raw_text) plus the section name to regenerate.
  2. We build a focused prompt: the brief + actors + raw_text are *context*;
     the existing items in the target section are shown as "current — replace
     entirely"; the model is asked to produce ONLY that section.
  3. We pin the output via tool-use against a section-specific Pydantic
     wrapper (`StoriesPayload` / `NfrsPayload` / `GapsPayload`) — same trick
     M5.3 streaming uses, but non-streaming here. Regen is small enough
     (~3-8s) that progress events would mostly add complexity.
  4. Caller writes the resulting list back onto the row + records usage.

Why a separate module from extract.py: regen has its own prompt + section-
specific schemas + a different cost-accounting tag (`action="regen"` in
usage_log). Sharing one giant function would be a footgun.
"""

from __future__ import annotations

import logging
from typing import Literal

import anthropic
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, ValidationError

from extract import resolve_model
from models import Gap, NonFunctional, UserStory
from services.cost import TokenUsage

log = logging.getLogger("storyforge.regen")

# Sections this endpoint supports. Brief + actors aren't here — those are
# small and users edit them inline (M4.1); regenerating them would lose the
# user's edits without much benefit. Stories / NFRs / gaps are the heavy
# lists where "ask Claude again with my updates as context" is most useful.
Section = Literal["stories", "nfrs", "gaps"]


# Tool-input wrappers — Anthropic tool schemas need an object at the root,
# can't take a top-level array. One thin wrapper per supported section.
class StoriesPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stories: list[UserStory]


class NfrsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nfrs: list[NonFunctional]


class GapsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gaps: list[Gap]


_SECTION_META = {
    "stories": {
        "wrapper": StoriesPayload,
        "field": "stories",
        "tool_name": "emit_stories",
        "instruction": (
            "Produce ONLY the user stories. Each story: id (sequential US-01, "
            "US-02, ...), actor, want, so_that, section (best-guess source "
            "location, else \"\"), criteria (2-5 short declarative items), "
            "source_quote (verbatim snippet from the source — empty string "
            "when no clean exact-match passage exists)."
        ),
    },
    "nfrs": {
        "wrapper": NfrsPayload,
        "field": "nfrs",
        "tool_name": "emit_nfrs",
        "instruction": (
            "Produce ONLY the non-functional requirements as {category, value, "
            "source_quote} triples. Examples: Performance/\"p95 < 2s\", "
            "Accessibility/\"WCAG 2.1 AA\", PCI-DSS/\"SAQ-A\". source_quote "
            "is verbatim source text or empty string."
        ),
    },
    "gaps": {
        "wrapper": GapsPayload,
        "field": "gaps",
        "tool_name": "emit_gaps",
        "instruction": (
            "Produce ONLY the gaps — ambiguities, missing information, or "
            "contradictions. severity = high|med|low. question is the open "
            "question; context paraphrases the gap; source_quote is verbatim "
            "source text where the gap is evident, or \"\" for absence-of-info "
            "gaps."
        ),
    },
}


REGEN_SYSTEM = """You are a senior business analyst. You are REGENERATING one section of an existing extraction. The brief, actors, and other sections (NFRs, gaps, stories — whichever you're not regenerating) are STABLE — they reflect the user's current understanding. Do not contradict them.

Be faithful to the source document. Do not invent requirements not supported by the text. Empty list is fine if the section truly contains nothing — fabrication is worse.

source_quote MUST be exact text copied from the source — never reworded. Empty string when you can't find a clean exact-match passage. The frontend uses it for click-to-source navigation, so reworded text breaks the search."""


def _build_user_message(
    *,
    section: Section,
    filename: str,
    raw_text: str,
    brief: dict,
    actors: list[str],
    stories: list[dict],
    nfrs: list[dict],
    gaps: list[dict],
) -> str:
    """Assemble the per-call user message. The current contents of the target
    section are shown as "REPLACE" so the model knows it's regenerating, not
    appending. The other sections are shown as "STABLE" context."""
    meta = _SECTION_META[section]

    parts = [
        f"Source document: {filename}",
        "",
        f"Brief: {brief.get('summary', '')}",
        f"Brief tags: {', '.join(brief.get('tags', []) or [])}",
        f"Actors: {', '.join(actors or [])}",
        "",
    ]

    # Show "stable" sections (the ones we're NOT regenerating) as context.
    # Show the target section as "current — REPLACE".
    if section != "stories":
        parts.append(f"Existing stories ({len(stories)}):")
        for s in stories:
            parts.append(f"  - [{s.get('id')}] As a {s.get('actor')}, I want {s.get('want')}, so that {s.get('so_that')}")
        parts.append("")
    if section != "nfrs":
        parts.append(f"Existing NFRs ({len(nfrs)}):")
        for n in nfrs:
            parts.append(f"  - {n.get('category')}: {n.get('value')}")
        parts.append("")
    if section != "gaps":
        parts.append(f"Existing gaps ({len(gaps)}):")
        for g in gaps:
            parts.append(f"  - [{g.get('severity')}] {g.get('question')}")
        parts.append("")

    # Show the target section's current contents as "REPLACE entirely".
    current = {"stories": stories, "nfrs": nfrs, "gaps": gaps}[section]
    parts.append(f"Current {section} ({len(current)} items — REPLACE entirely with your output):")
    for item in current:
        parts.append(f"  - {item}")
    parts.append("")

    parts.append(meta["instruction"])
    parts.append("")
    parts.append("---BEGIN SOURCE---")
    parts.append(raw_text)
    parts.append("---END SOURCE---")
    parts.append("")
    parts.append(f"Call {meta['tool_name']} with the regenerated {section} now.")
    return "\n".join(parts)


def regen_section(
    *,
    section: Section,
    filename: str,
    raw_text: str,
    brief: dict,
    actors: list[str],
    stories: list[dict],
    nfrs: list[dict],
    gaps: list[dict],
    api_key: str | None,
    model: str | None,
) -> tuple[list[dict], str, TokenUsage | None]:
    """Run a regen call. Returns `(new_items, model_used, usage)`.

    `new_items` is a list of plain dicts (the wrapper's section field
    `model_dump()`-ed) ready to write straight back into the JSON column.

    Mock mode (no api_key): returns the *current* list unchanged with a
    `model_used="mock"` so the UI flow is testable without an Anthropic key.
    Mock-regen is intentionally a no-op rather than fake-shuffling, because
    a fake change would make integration testing harder.
    """
    if section not in _SECTION_META:
        raise HTTPException(status_code=400, detail=f"Unknown section: {section}")

    if not api_key:
        current = {"stories": stories, "nfrs": nfrs, "gaps": gaps}[section]
        return current, "mock", None

    eff_model = resolve_model(model)
    meta = _SECTION_META[section]
    wrapper_cls = meta["wrapper"]

    client = anthropic.Anthropic(api_key=api_key)
    tool = {
        "name": meta["tool_name"],
        "description": f"Emit the regenerated {section} list.",
        "input_schema": wrapper_cls.model_json_schema(),
    }
    user_msg = _build_user_message(
        section=section,
        filename=filename,
        raw_text=raw_text,
        brief=brief or {},
        actors=actors or [],
        stories=stories or [],
        nfrs=nfrs or [],
        gaps=gaps or [],
    )

    try:
        # NOTE: no `thinking` parameter here — Anthropic rejects
        # `thinking + tool_choice={"type": "tool", ...}` with a 400. Output
        # is schema-constrained via the tool input_schema, so the reasoning
        # lift from adaptive thinking is small for this regen path.
        response = client.messages.create(
            model=eff_model,
            max_tokens=8000,  # smaller than full extract — single section
            system=[{"type": "text", "text": REGEN_SYSTEM, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user_msg}],
            tools=[tool],
            tool_choice={"type": "tool", "name": meta["tool_name"]},
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid Anthropic API key.")
    except anthropic.RateLimitError as e:
        retry_after = e.response.headers.get("retry-after", "60") if e.response else "60"
        raise HTTPException(
            status_code=429,
            detail=f"Anthropic rate limit hit. Retry after ~{retry_after}s.",
        )
    except anthropic.BadRequestError as e:
        raise HTTPException(status_code=400, detail=f"Claude rejected the request: {e.message}")
    except anthropic.APIConnectionError:
        log.exception("anthropic connection error during regen")
        raise HTTPException(status_code=503, detail="Could not reach Anthropic API.")
    except anthropic.APIStatusError as e:
        log.exception("anthropic API error during regen")
        raise HTTPException(
            status_code=502,
            detail=f"Anthropic API error ({e.status_code}): {e.message}",
        )
    except Exception as e:
        log.exception("regen failed")
        raise HTTPException(status_code=500, detail=f"Regen failed: {e}")

    tool_block = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if tool_block is None:
        raise HTTPException(status_code=502, detail="Model returned no tool use. Try again.")

    try:
        parsed = wrapper_cls(**tool_block.input)
    except ValidationError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Model returned invalid structured output: {e.errors()[:2]}",
        )

    new_items = [item.model_dump() for item in getattr(parsed, meta["field"])]

    raw_usage = getattr(response, "usage", None)
    usage = (
        TokenUsage(
            input_tokens=getattr(raw_usage, "input_tokens", 0) or 0,
            output_tokens=getattr(raw_usage, "output_tokens", 0) or 0,
            cache_creation_input_tokens=getattr(raw_usage, "cache_creation_input_tokens", 0) or 0,
            cache_read_input_tokens=getattr(raw_usage, "cache_read_input_tokens", 0) or 0,
        )
        if raw_usage is not None
        else None
    )

    return new_items, eff_model, usage
