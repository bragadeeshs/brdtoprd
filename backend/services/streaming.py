"""Streaming extraction (M5.3).

`stream_extraction(...)` is a sync generator that yields a small set of
event dicts:

  {"type": "usage",     "input": int, "output": int, "max": int}
  {"type": "complete",  "result": ExtractionResult, "usage": TokenUsage|None,
                        "model_used": str}
  {"type": "error",     "detail": str, "status": int}

The route layer (main.py) wraps each event in SSE framing
(`event: <type>\\ndata: <json>\\n\\n`) and ships it to the browser.

We use the Anthropic SDK's `messages.stream()` with a tool-use definition
(`emit_extraction`) instead of `messages.parse()`, because parse() doesn't
stream. Tool-use streaming gives us `input_json_delta` events plus the
final tool block we can validate against ExtractionPayload — same end shape
as parse(), just with progress events along the way.

Mock mode (no ANTHROPIC_API_KEY) simulates the stream with a few sleeps
so the frontend code path is identical between mock + live.
"""

from __future__ import annotations

import logging
import os
import time
from collections.abc import Iterator

import anthropic
from pydantic import ValidationError

from extract import EXTRACTION_SYSTEM, _mock, resolve_model
from models import ExtractionPayload, ExtractionResult
from services.cost import TokenUsage

log = logging.getLogger("storyforge.stream")

MAX_OUTPUT_TOKENS = 16000


def stream_extraction(
    *,
    filename: str,
    raw_text: str,
    api_key: str | None,
    model: str | None,
    prompt_suffix: str | None = None,
    few_shot_examples: list | None = None,
) -> Iterator[dict]:
    """Yield streaming events for an extraction. Sync iterator — FastAPI's
    StreamingResponse runs it in the threadpool, which is the right place
    for blocking SDK calls.

    Errors (Anthropic auth/rate/etc.) surface as a single `error` event then
    iteration stops — no exception is raised out of the generator. The route
    layer translates `error` events into the same paywall/HTTP shape the
    non-streaming endpoint uses.
    """
    # ----- mock mode --------------------------------------------------------
    if not api_key:
        result = _mock(filename, raw_text)
        # Fake a few token-count ticks so the UI's stage progression fires.
        for tokens in (250, 600, 4200, 5800, 7800):
            time.sleep(0.25)
            yield {"type": "usage", "input": 0, "output": tokens, "max": MAX_OUTPUT_TOKENS}
        yield {
            "type": "complete",
            "result": result,
            "usage": None,
            "model_used": "mock",
        }
        return

    # ----- live --------------------------------------------------------------
    eff_model = resolve_model(model)
    client = anthropic.Anthropic(api_key=api_key)
    schema = ExtractionPayload.model_json_schema()
    tool = {
        "name": "emit_extraction",
        "description": "Emit the structured extraction for this source document.",
        "input_schema": schema,
    }

    # Prompt builder reused for both the real call and few-shot example
    # turns — keeping the structure parallel helps Claude lock onto the
    # same shape for the real extraction.
    def _user_msg(fn: str, txt: str) -> str:
        return (
            f"Source document: {fn}\n\n"
            f"---BEGIN SOURCE---\n{txt}\n---END SOURCE---\n\n"
            "Call emit_extraction with the structured requirements now."
        )

    user_msg = _user_msg(filename, raw_text)

    try:
        # NOTE: no `thinking` parameter here — Anthropic rejects
        # `thinking + tool_choice={"type": "tool", ...}` with a 400
        # ("Thinking may not be enabled when tool_choice forces tool use.").
        # Output is schema-constrained via the tool input_schema, so the
        # reasoning lift from adaptive thinking is small here. The
        # non-streaming /api/extract path still uses adaptive thinking via
        # messages.parse() (which uses a different mechanism that's
        # compatible with thinking).
        from services.few_shot import as_tool_messages
        from services.prompts import join_system_prompt

        # M7.2 — prepend few-shot tool-use demonstrations. Each example
        # becomes (user, assistant tool_use, user tool_result) — the trailing
        # tool_result is required by Anthropic for valid conversation shape.
        messages = as_tool_messages(few_shot_examples or [], _user_msg, tool_name="emit_extraction")
        messages.append({"role": "user", "content": user_msg})

        with client.messages.stream(
            model=eff_model,
            max_tokens=MAX_OUTPUT_TOKENS,
            system=[
                {
                    "type": "text",
                    "text": join_system_prompt(EXTRACTION_SYSTEM, prompt_suffix),
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=messages,
            tools=[tool],
            tool_choice={"type": "tool", "name": "emit_extraction"},
        ) as stream:
            last_output = -1
            for event in stream:
                etype = getattr(event, "type", None)
                # `message_delta` carries cumulative usage as the model writes.
                # Throttle: only emit when output_tokens actually changed —
                # otherwise we'd send an event per content_block_delta, which
                # for a long extraction is hundreds of redundant frames.
                if etype == "message_delta":
                    u = getattr(event, "usage", None)
                    if u is not None:
                        out = getattr(u, "output_tokens", 0) or 0
                        if out != last_output:
                            last_output = out
                            yield {
                                "type": "usage",
                                "input": getattr(u, "input_tokens", 0) or 0,
                                "output": out,
                                "max": MAX_OUTPUT_TOKENS,
                            }
            final_message = stream.get_final_message()
    except anthropic.AuthenticationError:
        log.warning("anthropic auth failed during stream")
        yield {
            "type": "error",
            "status": 401,
            "detail": "Invalid Anthropic API key. Update the key in Settings.",
        }
        return
    except anthropic.RateLimitError as e:
        retry_after = e.response.headers.get("retry-after", "60") if e.response else "60"
        yield {
            "type": "error",
            "status": 429,
            "detail": f"Anthropic rate limit hit. Retry after ~{retry_after}s.",
        }
        return
    except anthropic.BadRequestError as e:
        yield {
            "type": "error",
            "status": 400,
            "detail": f"Claude rejected the request: {e.message}",
        }
        return
    except anthropic.APIConnectionError:
        log.exception("anthropic connection error during stream")
        yield {
            "type": "error",
            "status": 503,
            "detail": "Could not reach Anthropic API. Check your network.",
        }
        return
    except anthropic.APIStatusError as e:
        log.exception("anthropic API error during stream")
        yield {
            "type": "error",
            "status": 502,
            "detail": f"Anthropic API error ({e.status_code}): {e.message}",
        }
        return
    except Exception as e:
        log.exception("stream failed")
        yield {
            "type": "error",
            "status": 500,
            "detail": f"Extraction failed: {e}",
        }
        return

    # Find the tool_use block — that's where the structured output lives.
    tool_block = next(
        (b for b in final_message.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if tool_block is None:
        yield {
            "type": "error",
            "status": 502,
            "detail": "Model returned no tool use. Try rerunning.",
        }
        return

    try:
        parsed = ExtractionPayload(**tool_block.input)
    except ValidationError as e:
        yield {
            "type": "error",
            "status": 502,
            "detail": f"Model returned invalid structured output: {e.errors()[:2]}",
        }
        return

    result = ExtractionResult(
        **parsed.model_dump(),
        filename=filename,
        raw_text=raw_text,
        live=True,
    )

    raw_usage = final_message.usage
    usage = TokenUsage(
        input_tokens=getattr(raw_usage, "input_tokens", 0) or 0,
        output_tokens=getattr(raw_usage, "output_tokens", 0) or 0,
        cache_creation_input_tokens=getattr(raw_usage, "cache_creation_input_tokens", 0) or 0,
        cache_read_input_tokens=getattr(raw_usage, "cache_read_input_tokens", 0) or 0,
    )

    yield {
        "type": "complete",
        "result": result,
        "usage": usage,
        "model_used": eff_model,
    }
