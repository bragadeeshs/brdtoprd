import os

import anthropic

from models import (
    Brief,
    ExtractionPayload,
    ExtractionResult,
    Gap,
    NonFunctional,
    UserStory,
)

DEFAULT_MODEL = "claude-opus-4-7"
ALLOWED_MODELS = {
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
}

EXTRACTION_SYSTEM = """You are a senior business analyst. Extract structured product requirements from messy source documents (BRDs, meeting notes, emails, transcripts).

Produce, strictly grounded in the source:

- brief: 1-2 sentence business summary. tags = 2-5 short phrases (goals, timeline, scope).
- actors: distinct roles or systems that act on or within the product. Use short noun phrases.
- stories: user stories as "As a <actor>, I want <capability>, so that <outcome>". For each story:
  - id: sequential "US-01", "US-02", ...
  - actor, want, so_that: the three parts above
  - section: best-guess source location as "section N.M" or "§N.M" if inferable, else ""
  - criteria: 2-5 short declarative acceptance criteria
- nfrs: non-functional requirements as {category, value} pairs. Examples: Performance/"p95 < 2s", Accessibility/"WCAG 2.1 AA", PCI-DSS/"SAQ-A".
- gaps: ambiguities, missing information, or contradictions. severity is one of high|med|low. Include a short context quoting or paraphrasing the relevant source passage.

Rules:
- Be faithful to the source. Do not invent requirements not supported by the text.
- If a list would be empty, return [] rather than fabricating.
- Prefer concise wording over paraphrase of the source.
- Severity guide: high = blocks delivery / violates compliance, med = decision needed, low = nice to clarify."""


def _mock(filename: str, raw_text: str) -> ExtractionResult:
    """Returned when ANTHROPIC_API_KEY is not set. Lets the UI render without a key."""
    preview = raw_text.strip()[:300].replace("\n", " ") or "(empty document)"
    return ExtractionResult(
        filename=filename,
        raw_text=raw_text,
        live=False,
        brief=Brief(
            summary=f"Mock extraction of {filename}. Source starts: {preview!r}. Set ANTHROPIC_API_KEY on the backend to get a real extraction from Claude.",
            tags=["mock mode", "no API key set"],
        ),
        actors=["Returning shopper", "Guest", "Admin", "Payment service"],
        stories=[
            UserStory(
                id="US-01",
                actor="returning shopper",
                want="my saved cards to autofill at checkout",
                so_that="I can complete purchase in one tap",
                section="§ 2.3",
                criteria=[
                    "Cards list shown on checkout load",
                    "Masked last 4 digits visible",
                    "Default card pre-selected",
                ],
            ),
            UserStory(
                id="US-02",
                actor="guest",
                want="to check out without creating an account",
                so_that="I'm not blocked on first purchase",
                section="§ 2.4",
                criteria=["Email captured for receipt", "No password prompt"],
            ),
            UserStory(
                id="US-03",
                actor="admin",
                want="to issue a refund within 30 days of purchase",
                so_that="customers can be supported quickly",
                section="§ 3.2",
                criteria=[
                    "Refund form accessible from order detail",
                    "Date check enforced server-side",
                ],
            ),
        ],
        nfrs=[
            NonFunctional(category="Performance", value="p95 < 2s"),
            NonFunctional(category="Availability", value="99.9%"),
            NonFunctional(category="Accessibility", value="WCAG 2.1 AA"),
            NonFunctional(category="PCI-DSS", value="SAQ-A"),
        ],
        gaps=[
            Gap(
                severity="high",
                question="What is the target p95 latency?",
                section="§ 4.1",
                context="Document says 'fast' but never specifies a number.",
            ),
            Gap(
                severity="med",
                question="Is there an admin actor?",
                section="§ 3.2",
                context="Refunds mentioned but no role defined.",
            ),
            Gap(
                severity="med",
                question="Error-state copy owner?",
                section="§ 5",
                context="Failure modes listed without messaging.",
            ),
            Gap(
                severity="low",
                question="Supported currencies?",
                section="§ 2.4",
                context="USD is implied; no list provided.",
            ),
        ],
    )


def extract_requirements(
    filename: str,
    raw_text: str,
    api_key: str | None = None,
    model: str | None = None,
) -> ExtractionResult:
    # BYOK key (from request header) takes precedence over the server's env key
    effective_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not effective_key:
        return _mock(filename, raw_text)

    # Model resolution order: per-request header → STORYFORGE_MODEL env → default.
    # If a request supplies an unknown model id we let Anthropic reject it
    # (becomes a BadRequestError surfaced as 400 to the user).
    effective_model = model or os.environ.get("STORYFORGE_MODEL") or DEFAULT_MODEL

    client = anthropic.Anthropic(api_key=effective_key)

    # System prompt is stable across runs — mark it cacheable. (It's short today;
    # the cache kicks in once it crosses the per-model minimum. Harmless either way.)
    system_blocks = [
        {
            "type": "text",
            "text": EXTRACTION_SYSTEM,
            "cache_control": {"type": "ephemeral"},
        }
    ]

    user_msg = (
        f"Source document: {filename}\n\n"
        f"---BEGIN SOURCE---\n{raw_text}\n---END SOURCE---\n\n"
        "Extract the structured requirements now."
    )

    response = client.messages.parse(
        model=effective_model,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=system_blocks,
        messages=[{"role": "user", "content": user_msg}],
        output_format=ExtractionPayload,
    )

    parsed = response.parsed_output
    if parsed is None:
        # parse() returns None on refusal or invalid output — fall back to mock with a note.
        fallback = _mock(filename, raw_text)
        fallback.brief = Brief(
            summary="Claude refused or returned output that didn't validate against the schema. Showing mock fallback.",
            tags=["refusal or schema mismatch"],
        )
        return fallback

    return ExtractionResult(
        **parsed.model_dump(),
        filename=filename,
        raw_text=raw_text,
        live=True,
    )
