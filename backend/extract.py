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
from services.cost import TokenUsage

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
  - source_quote: the verbatim snippet from the source that most directly supports this story (1-2 sentences max, exact text — do not paraphrase). Empty string when no single passage supports it (synthesized from multiple places, or implied).
- nfrs: non-functional requirements as {category, value, source_quote} triples. Examples: Performance/"p95 < 2s", Accessibility/"WCAG 2.1 AA", PCI-DSS/"SAQ-A". source_quote follows the same verbatim rule as stories.
- gaps: ambiguities, missing information, or contradictions. severity is one of high|med|low. Include a short context quoting or paraphrasing the relevant source passage. source_quote: the verbatim passage that makes the gap evident (e.g. the vague phrase, the contradiction). Empty string for "absence of info" gaps where there is no specific passage to point at.

Rules:
- Be faithful to the source. Do not invent requirements not supported by the text.
- If a list would be empty, return [] rather than fabricating.
- Prefer concise wording over paraphrase of the source.
- Severity guide: high = blocks delivery / violates compliance, med = decision needed, low = nice to clarify.
- source_quote MUST be exact text copied from the source — never reworded. Use empty string if you can't find a clean exact-match passage. The frontend uses it for click-to-source navigation, so reworded text breaks the search."""


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
                source_quote="Returning customers should see their saved payment methods at checkout.",
            ),
            UserStory(
                id="US-02",
                actor="guest",
                want="to check out without creating an account",
                so_that="I'm not blocked on first purchase",
                section="§ 2.4",
                criteria=["Email captured for receipt", "No password prompt"],
                source_quote="Guest checkout must be supported.",
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
                source_quote="Refunds are allowed within 30 days.",
            ),
        ],
        nfrs=[
            NonFunctional(category="Performance", value="p95 < 2s", source_quote="Pages should load fast."),
            NonFunctional(category="Availability", value="99.9%", source_quote="Service uptime: 99.9%."),
            NonFunctional(category="Accessibility", value="WCAG 2.1 AA", source_quote="Must meet WCAG 2.1 AA."),
            NonFunctional(category="PCI-DSS", value="SAQ-A", source_quote="PCI-DSS compliant."),
        ],
        gaps=[
            Gap(
                severity="high",
                question="What is the target p95 latency?",
                section="§ 4.1",
                context="Document says 'fast' but never specifies a number.",
                source_quote="Pages should load fast.",
            ),
            Gap(
                severity="med",
                question="Is there an admin actor?",
                section="§ 3.2",
                context="Refunds mentioned but no role defined.",
                source_quote="Refunds are allowed within 30 days.",
            ),
            Gap(
                severity="med",
                question="Error-state copy owner?",
                section="§ 5",
                context="Failure modes listed without messaging.",
                source_quote="",
            ),
            Gap(
                severity="low",
                question="Supported currencies?",
                section="§ 2.4",
                context="USD is implied; no list provided.",
                source_quote="",
            ),
        ],
    )


def resolve_model(model: str | None) -> str:
    """Per-request header → `STORYFORGE_MODEL` env → built-in default.

    Exposed so callers (and routes that persist provenance) see the same
    answer the LLM call uses. Unknown ids are surfaced as Anthropic 400s.
    """
    return model or os.environ.get("STORYFORGE_MODEL") or DEFAULT_MODEL


def extract_requirements(
    filename: str,
    raw_text: str,
    api_key: str | None = None,
    model: str | None = None,
    prompt_suffix: str | None = None,
) -> tuple[ExtractionResult, TokenUsage | None]:
    """Run the extraction. Returns the parsed result + token usage (or None for mock).

    The usage tuple lets callers persist M3.0 UsageLog rows without re-querying
    the SDK. Mock-mode returns `None` because no real call was made.

    M7.1: `prompt_suffix` (from `services/prompts.resolve_prompt_suffix`) is
    appended to the system prompt when set, letting power users enforce
    house-style overrides without forking the codebase.
    """
    # BYOK key (from request header) takes precedence over the server's env key
    effective_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not effective_key:
        return _mock(filename, raw_text), None

    effective_model = resolve_model(model)

    client = anthropic.Anthropic(api_key=effective_key)

    from services.prompts import join_system_prompt

    # System prompt is stable across runs — mark it cacheable. The user's
    # suffix is part of the cached block; same user across runs hits cache,
    # different users with different suffixes don't share cache (correct).
    system_blocks = [
        {
            "type": "text",
            "text": join_system_prompt(EXTRACTION_SYSTEM, prompt_suffix),
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

    # SDK Usage object → our flat dataclass. `getattr` because cache fields
    # are absent on responses where the model didn't hit the cache.
    raw_usage = getattr(response, "usage", None)
    usage = TokenUsage(
        input_tokens=getattr(raw_usage, "input_tokens", 0) or 0,
        output_tokens=getattr(raw_usage, "output_tokens", 0) or 0,
        cache_creation_input_tokens=getattr(raw_usage, "cache_creation_input_tokens", 0) or 0,
        cache_read_input_tokens=getattr(raw_usage, "cache_read_input_tokens", 0) or 0,
    ) if raw_usage is not None else None

    parsed = response.parsed_output
    if parsed is None:
        # parse() returns None on refusal or invalid output — fall back to mock with a note.
        # Still return the usage so the (failed) call gets billed accurately.
        fallback = _mock(filename, raw_text)
        fallback.brief = Brief(
            summary="Claude refused or returned output that didn't validate against the schema. Showing mock fallback.",
            tags=["refusal or schema mismatch"],
        )
        return fallback, usage

    result = ExtractionResult(
        **parsed.model_dump(),
        filename=filename,
        raw_text=raw_text,
        live=True,
    )
    return result, usage
