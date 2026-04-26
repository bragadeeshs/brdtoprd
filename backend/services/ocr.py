"""OCR via Claude vision (M7.3).

When a user uploads a scanned PDF, pypdf returns near-empty text and
the existing pipeline 422s with "No readable text in the input." This
module provides a fallback: hand the raw PDF bytes to Claude as a
`document` content block and ask for a plaintext transcription.

Claude reads PDF documents natively — both embedded text and rendered
page imagery — so this works for scanned PDFs, image-only PDFs, and
mixed text+image documents alike. Cost is meaningful (~1.5K-3K input
tokens per page on top of the eventual extraction call) so callers
should only fire OCR when the cheap pypdf path produced nothing.

Public surface:
  - ocr_pdf_via_claude(pdf_bytes, *, api_key, model)
        → (plaintext, TokenUsage)
  - looks_like_empty(text) → bool
        cheap heuristic for "pypdf produced nothing useful"

We deliberately don't try to merge the OCR call with the extraction
call: keeping them separate lets the user's prompt template (M7.1)
+ the structured-output schema apply cleanly to a plain raw_text input
without changing every Claude call site to handle two input modes.
"""

from __future__ import annotations

import base64
import logging

import anthropic
from fastapi import HTTPException

from services.cost import TokenUsage

log = logging.getLogger("storyforge.ocr")

# 100 alphanumeric chars ≈ 15-20 words. Below this the pypdf output is
# almost certainly headers + page numbers + noise — not real content.
# Above it, even a sparse page has enough signal that Claude can extract
# from the text directly without OCR.
EMPTY_THRESHOLD_CHARS = 100

OCR_PROMPT = (
    "Transcribe ALL text from this PDF document, preserving paragraph "
    "structure with blank lines between paragraphs. Include section "
    "numbers and headings if present. Return ONLY the transcribed text "
    "— no commentary, no markdown formatting, no apologies."
)


def looks_like_empty(text: str | None) -> bool:
    """True when pypdf's output is below the OCR-fallback threshold.
    Counts alphanumeric chars only — page numbers + whitespace + dots
    don't bump the count."""
    if not text:
        return True
    alnum = sum(1 for c in text if c.isalnum())
    return alnum < EMPTY_THRESHOLD_CHARS


def ocr_pdf_via_claude(
    pdf_bytes: bytes,
    *,
    api_key: str,
    model: str,
) -> tuple[str, TokenUsage]:
    """Send the PDF to Claude as a document block; return (plaintext, usage).

    Raises HTTPException with the same status-code convention as
    services/extractions.call_claude — 401 for auth, 400 for bad
    request, 502 for upstream errors. Caller surfaces them.

    No `thinking`, no tool use — this is a one-shot text-out call. The
    user's `prompt_suffix` (M7.1) is intentionally NOT applied: OCR is
    a mechanical operation, not a stylistic one, and prepending custom
    instructions risks the model "interpreting" content instead of
    transcribing it.
    """
    client = anthropic.Anthropic(api_key=api_key)
    b64 = base64.standard_b64encode(pdf_bytes).decode("ascii")

    try:
        response = client.messages.create(
            model=model,
            # 8K is enough for ~50 pages of dense text. Scanned PDFs
            # producing more than that are rare enough we accept truncation
            # over a separate pagination loop in v1.
            max_tokens=8000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": OCR_PROMPT},
                    ],
                }
            ],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid Anthropic API key (OCR call rejected).")
    except anthropic.RateLimitError as e:
        retry_after = e.response.headers.get("retry-after", "60") if e.response else "60"
        raise HTTPException(status_code=429, detail=f"Anthropic rate limit hit during OCR. Retry after ~{retry_after}s.")
    except anthropic.BadRequestError as e:
        raise HTTPException(status_code=400, detail=f"Claude rejected the PDF: {e.message}")
    except anthropic.APIConnectionError:
        log.exception("anthropic connection error during OCR")
        raise HTTPException(status_code=503, detail="Could not reach Anthropic for OCR.")
    except anthropic.APIStatusError as e:
        log.exception("anthropic API error during OCR")
        raise HTTPException(status_code=502, detail=f"Anthropic OCR error ({e.status_code}): {e.message}")
    except Exception as e:
        log.exception("OCR call failed")
        raise HTTPException(status_code=500, detail=f"OCR failed: {e}")

    # Concatenate any text content blocks (usually one). Skip non-text
    # blocks (Claude doesn't return any here, but be defensive).
    text_parts = [
        block.text
        for block in (response.content or [])
        if getattr(block, "type", None) == "text"
    ]
    plaintext = "\n".join(text_parts).strip()

    if not plaintext:
        # Claude saw the PDF but transcribed nothing — probably empty pages
        # or pure imagery with no readable text. Surface as 422 so the
        # frontend shows a sensible error.
        raise HTTPException(status_code=422, detail="OCR succeeded but the PDF contains no readable text.")

    raw_usage = getattr(response, "usage", None)
    usage = TokenUsage(
        input_tokens=getattr(raw_usage, "input_tokens", 0) or 0,
        output_tokens=getattr(raw_usage, "output_tokens", 0) or 0,
        cache_creation_input_tokens=getattr(raw_usage, "cache_creation_input_tokens", 0) or 0,
        cache_read_input_tokens=getattr(raw_usage, "cache_read_input_tokens", 0) or 0,
    )
    return plaintext, usage
