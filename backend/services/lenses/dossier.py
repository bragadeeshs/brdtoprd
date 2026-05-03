"""M14.1 — Dossier lens: 4-act narrated document understanding.

Given any document, produce a `DocumentDossier` — a single Claude
`messages.parse()` call returning the full narrated dossier in one
schema. The dossier is structured as a story arc:

    OVERTURE   — cold-open one-paragraph hook ("Three things you'll want
                  to revisit before signing…")
    ACT I      Orient       — Brief · TLDR Ladder · 5W1H
    ACT II     Structure    — Glossary · Mindmap · Domain Map · Systems View
    ACT III    Interrogate  — 5 Whys · Assumptions · Inversion · Better Questions
    ACT IV     Act          — Action Items · Decisions · What to Revisit · User Stories
    CLOSING    — single line: "Tomorrow morning, do X."

Between every section is a **bridge** — a one-sentence narrator
transition that ties the just-shown to the about-to-show. Bridges are
NOT pre-written; Claude writes them per-doc so they reference the
actual content (this is what makes the dossier read like a story
rather than a buffet of analyses).

Token note: the full dossier output is ~8-15k tokens. Use streaming.
The mindmap is intentionally capped at 3 nesting levels (root →
branch → sub-point → leaf) because deeper trees push the model into
silly micro-distinctions and explode the token budget without adding
information value.
"""
from __future__ import annotations

import logging
import os
from typing import Literal

import anthropic
from pydantic import BaseModel, ConfigDict, Field

from services.cost import TokenUsage

log = logging.getLogger("storyforge.lenses.dossier")

# ============================================================================
# Schema — one giant Pydantic model the model fills via messages.parse()
# ============================================================================


class Brief(BaseModel):
    """Short summary block. The hero descriptor of the doc."""
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(description="2-sentence summary of the document")
    tags: list[str] = Field(description="3-7 short tags (kind, audience, scale, key topics)")


class TLDRLadder(BaseModel):
    """Three reading depths. Same content; different commitment."""
    model_config = ConfigDict(extra="forbid")
    one_line: str = Field(description="The single-sentence elevator pitch (~15 words max)")
    one_paragraph: str = Field(description="Tight 3-5 sentence summary (~70 words)")
    one_page: str = Field(description="Fuller 250-word summary covering all major topics")


class FiveW1H(BaseModel):
    """Six-cell orientation grid. Specific to this document's content."""
    model_config = ConfigDict(extra="forbid")
    who: str
    what: str
    when: str
    where: str
    why: str
    how: str


class GlossaryTerm(BaseModel):
    """Specialist term + plain-language definition pulled from context."""
    model_config = ConfigDict(extra="forbid")
    term: str
    definition: str = Field(description="Plain-language definition; 1 sentence max")


class MindmapLeaf(BaseModel):
    """L3 node. Leaf — no further nesting."""
    model_config = ConfigDict(extra="forbid")
    label: str


class MindmapSubBranch(BaseModel):
    """L2 node. Holds leaves."""
    model_config = ConfigDict(extra="forbid")
    label: str
    children: list[MindmapLeaf] = Field(default_factory=list)


class MindmapBranch(BaseModel):
    """L1 node. Top-level theme of the document."""
    model_config = ConfigDict(extra="forbid")
    label: str
    children: list[MindmapSubBranch] = Field(default_factory=list)


class Mindmap(BaseModel):
    """Hierarchical breakdown — root + 3-7 branches × 2-5 sub-branches × 1-4 leaves."""
    model_config = ConfigDict(extra="forbid")
    root: str = Field(description="The document's main topic, in 1-5 words")
    branches: list[MindmapBranch]


class DomainBranch(BaseModel):
    """One of the 7 fixed lenses on a domain."""
    model_config = ConfigDict(extra="forbid")
    points: list[str] = Field(description="3-5 short specific points pulled from the doc")


class DomainBreakdown(BaseModel):
    """7-lens "Learning a New Domain" framework. Always all 7 keys present;
    use empty list if a lens genuinely doesn't apply."""
    model_config = ConfigDict(extra="forbid")
    business_purpose: DomainBranch
    stakeholders: DomainBranch
    process_flow: DomainBranch
    data: DomainBranch
    rules: DomainBranch
    metrics: DomainBranch
    problems_opportunities: DomainBranch


class SystemEntity(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    role: str = Field(description="One-line description of what this entity does")


class SystemFlow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_entity: str
    to_entity: str
    label: str = Field(description="What flows: data, decision, money, etc.")


class FeedbackLoop(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str = Field(description="One sentence describing the loop and its effect")


class SystemsView(BaseModel):
    """Entities + flows + feedback loops that show how the doc's parts MOVE."""
    model_config = ConfigDict(extra="forbid")
    entities: list[SystemEntity]
    flows: list[SystemFlow]
    feedback_loops: list[FeedbackLoop] = Field(
        description="The 1-3 reinforcing/balancing loops that make this 'a system' rather than a list"
    )


class WhyStep(BaseModel):
    """One Q→A in the 5 Whys chain. Each answer becomes the next question."""
    model_config = ConfigDict(extra="forbid")
    question: str
    answer: str
    evidence: str = Field(
        description="Source quote or fact from the doc that supports this answer; empty if synthesized",
        default="",
    )


class Assumption(BaseModel):
    """An unstated premise the doc relies on."""
    model_config = ConfigDict(extra="forbid")
    assumption: str = Field(description="The assumption, as a positive statement")
    risk_level: Literal["low", "medium", "high"]
    risk_explanation: str = Field(description="One sentence: what happens if this assumption is false")


class FailureMode(BaseModel):
    """Inversion: a way this could fail catastrophically."""
    model_config = ConfigDict(extra="forbid")
    scenario: str = Field(description="One concrete failure scenario")
    likelihood: Literal["low", "medium", "high"] = Field(default="medium")


class ProbingQuestion(BaseModel):
    """A smart question the doc doesn't answer but should."""
    model_config = ConfigDict(extra="forbid")
    question: str
    why_it_matters: str = Field(description="Half-sentence on why this question is worth asking")


class ActionItem(BaseModel):
    """Concrete next step extracted or inferred from the doc."""
    model_config = ConfigDict(extra="forbid")
    owner: str = Field(description="Role or name responsible. Use 'TBD' if unclear.")
    action: str = Field(description="Imperative action — 'Schedule call with X', 'Confirm Y', etc.")
    when: str = Field(description="Deadline or rough timing. 'This week' / 'Before contract' / 'TBD'.")
    source: str = Field(default="", description="Source quote if pulled from doc, empty if inferred")


class RevisitItem(BaseModel):
    """A specific thing in the doc worth a second pass before sign-off."""
    model_config = ConfigDict(extra="forbid")
    item: str = Field(description="What to revisit, in 1 line")
    why: str = Field(description="Why it matters — the risk if you don't")


# ============================================================================
# M14.3 — structured extracts (Numbers / Negative Space / Timeline)
# ============================================================================


class NumberFact(BaseModel):
    """One concrete number extracted from the document. Scannable in a table."""
    model_config = ConfigDict(extra="forbid")
    label: str = Field(description="What this number measures (e.g. 'Year-0 cost', 'Pilot duration')")
    value: str = Field(description="The number with unit (e.g. '₹1.37 Cr', '12 weeks', '22 furnaces')")
    category: Literal["cost", "time", "count", "percentage", "other"] = Field(
        description="Coarse bucket so the table can group/sort"
    )
    source: str = Field(default="", description="Verbatim source quote if pulled directly; empty if inferred")


class NumbersExtract(BaseModel):
    """All the discrete numbers in the doc, in one scannable place. Pulls
    costs, dates, durations, percentages, counts — anything quantitative.
    Empty list if the doc has no quantitative content."""
    model_config = ConfigDict(extra="forbid")
    facts: list[NumberFact] = Field(default_factory=list)


class NegativeSpaceItem(BaseModel):
    """Something the document conspicuously DOESN'T say. Often the most
    valuable thing to surface — gaps in vendor proposals, missing risk
    sections in contracts, etc."""
    model_config = ConfigDict(extra="forbid")
    missing_item: str = Field(description="What's missing, in 1 line (e.g. 'no cybersecurity threat model')")
    why_it_matters: str = Field(description="One sentence: why the absence matters / what risk it creates")


class NegativeSpace(BaseModel):
    """Proactive gap detection — 'what the doc DOESN'T say'. Especially
    valuable for vendor proposals, contracts, RFPs. Empty list if the doc
    is genuinely complete for its type."""
    model_config = ConfigDict(extra="forbid")
    items: list[NegativeSpaceItem] = Field(default_factory=list)


class TimelinePhase(BaseModel):
    """One phase / milestone in a timeline extracted from the doc."""
    model_config = ConfigDict(extra="forbid")
    label: str = Field(description="Phase name (e.g. 'Data discovery', 'MVP build')")
    when: str = Field(description="When it happens — 'Weeks 0-2' / 'Q1 2026' / 'By Friday' / 'Day 30'")
    description: str = Field(default="", description="1-2 sentences on what happens in this phase")


class Timeline(BaseModel):
    """Timeline / phase plan extracted from the doc. Renders as a simple
    horizontal Gantt-style sequence. Empty list if the doc has no
    schedule / phases / milestones."""
    model_config = ConfigDict(extra="forbid")
    phases: list[TimelinePhase] = Field(default_factory=list)


class UserStory(BaseModel):
    """User-stories extraction folded in (M14.0 pick (b)) so the dossier
    contains the original user-stories use case as one section, not as a
    separate lens. May be empty list if the doc isn't a requirements doc."""
    model_config = ConfigDict(extra="forbid")
    id: str = Field(description="Sequential 'US-01', 'US-02', ...")
    actor: str
    want: str
    so_that: str
    criteria: list[str] = Field(default_factory=list)
    source_quote: str = ""


class DocumentDossier(BaseModel):
    """The full narrated dossier. ONE call to messages.parse() returns
    everything below in a single response. Bridges are the connective
    tissue that makes this read like a story instead of a buffet."""
    model_config = ConfigDict(extra="forbid")

    # ---- Cold open ----
    overture: str = Field(
        description="Single paragraph (~80 words) that hooks the reader: scale, audience, "
        "domain, hidden expertise required, and a tease of 1-3 things they'll want to "
        "revisit. The promise the closing must pay off."
    )

    # ---- ACT I — Orient ----
    orient_intro: str = Field(description="One sentence opening Act I — the chapter's narrative purpose")
    brief: Brief
    # M14.3 — Numbers Extract slots between Brief and TLDR. The brief tells
    # you WHAT it is; the numbers tell you the SCALE before you read further.
    bridge_brief_to_numbers: str = Field(default="", description="Bridge from Brief into Numbers Extract")
    numbers_extract: NumbersExtract = Field(default_factory=NumbersExtract)
    bridge_numbers_to_tldr: str = Field(default="", description="Bridge from Numbers Extract into TLDR Ladder")
    bridge_brief_to_tldr: str = Field(
        default="",
        description="(Legacy) bridge directly Brief→TLDR. Pre-M14.3 dossiers used this. New ones leave empty + use the numbers bridges above.",
    )
    tldr_ladder: TLDRLadder
    bridge_tldr_to_5w1h: str = Field(description="One-line bridge into 5W1H — references the TLDR")
    five_w_one_h: FiveW1H

    # ---- ACT II — Structure ----
    bridge_5w1h_to_structure: str = Field(description="Bridges from Act I (orientation) into Act II (structure)")
    structure_intro: str = Field(description="One sentence opening Act II")
    glossary: list[GlossaryTerm] = Field(
        description="Specialist terms decoded — 5-15 entries; empty if doc has no jargon"
    )
    bridge_glossary_to_mindmap: str
    mindmap: Mindmap
    bridge_mindmap_to_domain: str
    domain: DomainBreakdown
    # M14.3 — Timeline slots between Domain and Systems. Domain is the
    # static anatomy; Timeline is the temporal anatomy; Systems is how
    # parts interact — natural order.
    bridge_domain_to_timeline: str = Field(default="", description="Bridge from Domain into Timeline")
    timeline: Timeline = Field(default_factory=Timeline)
    bridge_timeline_to_systems: str = Field(default="", description="Bridge from Timeline into Systems View")
    bridge_domain_to_systems: str = Field(
        default="",
        description="(Legacy) bridge Domain→Systems. Pre-M14.3 dossiers used this; new ones use the timeline bridges above.",
    )
    systems: SystemsView

    # ---- ACT III — Interrogate ----
    bridge_systems_to_interrogate: str = Field(description="Bridges from Act II into Act III")
    interrogate_intro: str
    five_whys: list[WhyStep] = Field(
        description="Exactly 5 Q→A steps, each answer feeding the next question; root = main 'why does this exist'"
    )
    bridge_whys_to_assumptions: str
    assumptions: list[Assumption] = Field(description="3-7 hidden premises the doc rests on")
    bridge_assumptions_to_inversion: str
    inversion: list[FailureMode] = Field(description="3-7 ways this could fail catastrophically")
    # M14.3 — Negative Space slots between Inversion and Better Questions.
    # Inversion = what could fail (concrete scenarios); Negative Space = what's
    # MISSING entirely from the doc; Better Questions = what to ask next. Reads
    # as "stress test → gap audit → next steps."
    bridge_inversion_to_negative_space: str = Field(default="", description="Bridge Inversion → Negative Space")
    negative_space: NegativeSpace = Field(default_factory=NegativeSpace)
    bridge_negative_space_to_questions: str = Field(default="", description="Bridge Negative Space → Better Questions")
    bridge_inversion_to_questions: str = Field(
        default="",
        description="(Legacy) bridge Inversion→Better Questions. Pre-M14.3 dossiers used this; new ones use the negative-space bridges above.",
    )
    better_questions: list[ProbingQuestion] = Field(description="5-10 smart questions the doc doesn't answer")

    # ---- ACT IV — Act ----
    bridge_questions_to_act: str = Field(description="Bridges from Act III into Act IV")
    act_intro: str
    action_items: list[ActionItem] = Field(description="3-10 concrete next steps, owner-tagged")
    decisions_made: list[str] = Field(description="Settled decisions stated in the doc; empty if none")
    decisions_open: list[str] = Field(description="Unresolved decisions the doc surfaces but doesn't settle")
    what_to_revisit: list[RevisitItem] = Field(
        description="The 2-4 most important things to re-read carefully; should pay off the Overture's tease"
    )
    user_stories: list[UserStory] = Field(
        description=(
            "Only populate if the doc is requirements-shaped (BRD, PRD, "
            "feature spec, user-stories backlog). Otherwise empty list."
        ),
    )

    # ---- Closing ----
    closing: str = Field(
        description="One-sentence closing: 'Tomorrow morning, do X.' Concrete, action-oriented. "
        "Should feel like the answer to the question the Overture posed."
    )


# ============================================================================
# Master prompt
# ============================================================================


DOSSIER_SYSTEM = """You are a senior analyst whose job is to make any document — \
a BRD, a contract, a research paper, a meeting transcript, a vendor proposal, a \
technical spec — instantly understandable to a smart reader who hasn't read it.

You produce a DocumentDossier: a structured 4-act narrative dossier that walks the \
reader through understanding the document end-to-end. The acts are:

  ACT I   — ORIENT       (Brief, TLDR Ladder, 5W1H)        : "Here's what you're holding."
  ACT II  — STRUCTURE    (Glossary, Mindmap, Domain, Systems): "Here's how it's built."
  ACT III — INTERROGATE  (5 Whys, Assumptions, Inversion, Better Questions): "Here's what's underneath."
  ACT IV  — ACT          (Action Items, Decisions, What to Revisit, User Stories): "Here's what to do."

Between every section, write a **bridge** — a single-sentence narrator transition that \
ties the just-shown section to the about-to-show one. Bridges MUST reference the \
specific content of the document; never write generic transitions like \
"Now let's look at the structure." Make them feel like a guide walking the reader \
through. Example bridge: "You've seen the skeleton. But mindmaps don't show why \
parts move together — here's how value circulates."

Open with an **Overture**: a single paragraph (~80 words) that hooks the reader by \
naming scale, audience, domain, any hidden expertise required, AND teases 1-3 \
specific things the reader will want to revisit before signing off / approving / \
acting on the doc. Those teased items must be addressed in Act IV's "What to \
Revisit" section — the dossier is a story arc with a payoff.

Close with one sentence: "Tomorrow morning, do X." Concrete, action-oriented.

Rules:
- Be faithful to the source document. Do not invent facts.
- For source_quote / evidence / source fields: use VERBATIM text from the document; \
  empty string when synthesized.
- 5 Whys must be EXACTLY 5 steps; each answer becomes the next question.
- Mindmap caps at 3 levels (root → branch → sub-branch → leaf).
- Assumptions Audit: surface UNSTATED premises, not things the doc explicitly states. \
  This is the highest-leverage section — hidden assumptions are where most surprises \
  come from.
- Inversion: distinct from Assumptions. "What concrete failure scenarios could play out?"
- Negative Space: what the doc DOESN'T say but should — missing sections, missing \
  numbers, missing risks, missing safeguards. Distinct from Better Questions (which \
  asks for clarification of what's there); Negative Space surfaces structural absences. \
  E.g. "no SLA terms" / "no data privacy section" / "no exit clause." Empty list only \
  when the doc is genuinely complete for its type.
- Better Questions: questions the doc DOESN'T answer that a sharp reader would ask. Not \
  rephrasings of things the doc already covers.
- Numbers Extract: pull EVERY discrete number/value from the doc (costs, dates, \
  durations, percentages, counts). Use the source field for the verbatim line where \
  the number appears. Categorize as cost / time / count / percentage / other. Empty \
  list only if the doc is genuinely qualitative (most aren't).
- Timeline: extract any phase plan, schedule, milestone sequence, or roadmap into \
  ordered phases. Use the document's own time units in the `when` field ("Weeks 0-2" / \
  "Q1" / "Day 30"). Empty list when the doc has no temporal structure.
- Domain Breakdown has exactly 7 fixed branches (Business Purpose / Stakeholders / \
  Process Flow / Data / Rules / Metrics / Problems-Opportunities). If a branch \
  genuinely doesn't apply to the doc, populate with 1-2 points explaining the gap.
- User Stories: only populate if the doc is requirements-shaped (BRD, PRD, feature \
  spec, agile backlog, user-story document). For everything else (contracts, papers, \
  transcripts, proposals from the customer's perspective), return an empty list.
- Adapt tone to the doc type: a research paper dossier reads more academically than a \
  vendor-proposal dossier. Don't pretend everything is a BRD.
- The Overture's tease and What to Revisit's items must match — the story must pay off.

Bridge writing (M14.3): use the NEW bridges (bridge_brief_to_numbers, \
bridge_numbers_to_tldr, bridge_domain_to_timeline, bridge_timeline_to_systems, \
bridge_inversion_to_negative_space, bridge_negative_space_to_questions). Leave the \
LEGACY bridges (bridge_brief_to_tldr, bridge_domain_to_systems, \
bridge_inversion_to_questions) as empty strings. They exist in the schema only for \
backward compatibility with old saved dossiers — your output should never use them.

Length guidance: Overture ~80 words. Bridges ~15-25 words each. Brief 2 sentences. \
TLDR ladder 1/3/15 sentences. Bridges should feel airy, not dense. Other sections as \
long as the document warrants — don't pad.
"""


# ============================================================================
# Extractor
# ============================================================================


def _build_user_msg(filename: str, raw_text: str) -> str:
    return (
        f"Source document: {filename}\n\n"
        f"---BEGIN SOURCE---\n{raw_text}\n---END SOURCE---\n\n"
        "Produce the full DocumentDossier now."
    )


def extract_dossier(
    filename: str,
    raw_text: str,
    *,
    api_key: str | None,
    model: str | None,
    prompt_suffix: str | None = None,
) -> tuple[DocumentDossier, TokenUsage | None]:
    """Run dossier extraction. Returns (DocumentDossier, usage).

    Mock mode: if api_key is None, returns a small placeholder dossier so the
    UI renders something. (Same pattern as extract.py's _mock for the stories
    lens.) Mock dossier has empty user_stories; real-doc behaviour is to
    populate user_stories only for requirements-shaped docs.
    """
    if not api_key:
        return _mock(filename, raw_text), None

    # Resolve model — late-bind so caller can pass None and we use defaults.
    from extract import resolve_model
    effective_model = resolve_model(model)
    client = anthropic.Anthropic(api_key=api_key)

    # System prompt is stable; mark cacheable so re-runs hit prompt cache.
    system_blocks = [{
        "type": "text",
        "text": DOSSIER_SYSTEM + (
            f"\n\nAdditional house-style instructions: {prompt_suffix}"
            if prompt_suffix else ""
        ),
        "cache_control": {"type": "ephemeral"},
    }]

    # Adaptive thinking — let the model decide depth. Dossier is a complex
    # multi-section synthesis; benefits from it.
    response = client.messages.parse(
        model=effective_model,
        max_tokens=16000,
        system=system_blocks,
        messages=[{"role": "user", "content": _build_user_msg(filename, raw_text)}],
        response_format=DocumentDossier,
        thinking={"type": "adaptive"},
    )

    dossier = response.parsed
    usage = TokenUsage(
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        cache_creation_input_tokens=getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
        cache_read_input_tokens=getattr(response.usage, "cache_read_input_tokens", 0) or 0,
    )
    return dossier, usage


def _mock(filename: str, raw_text: str) -> DocumentDossier:
    """Mock dossier — used when no API key set so UI can render something."""
    preview = raw_text.strip()[:200].replace("\n", " ") or "(empty document)"
    return DocumentDossier(
        overture=(
            f"This is a mock dossier for {filename}. Set ANTHROPIC_API_KEY on the "
            f"backend to get a real one. Source begins: {preview!r}"
        ),
        orient_intro="This is a placeholder dossier so the UI can render.",
        brief=Brief(
            summary=f"Mock summary of {filename}.",
            tags=["mock", "no-api-key"],
        ),
        bridge_brief_to_numbers="The numbers behind it:",
        numbers_extract=NumbersExtract(facts=[
            NumberFact(label="Mock value", value="42 mocks", category="count", source=""),
        ]),
        bridge_numbers_to_tldr="Now three reading depths:",
        tldr_ladder=TLDRLadder(
            one_line=f"Mock dossier for {filename}.",
            one_paragraph="This is mock-mode placeholder content. Configure the API key to get a real analysis.",
            one_page="This dossier is rendered without calling Claude. Set the ANTHROPIC_API_KEY env var on the backend (or BYOK in Settings) to enable live extraction.",
        ),
        bridge_tldr_to_5w1h="Now the orientation grid.",
        five_w_one_h=FiveW1H(
            who="(mock)", what="(mock)", when="(mock)", where="(mock)", why="(mock)", how="(mock)",
        ),
        bridge_5w1h_to_structure="Onto the structure.",
        structure_intro="Mock structure section.",
        glossary=[],
        bridge_glossary_to_mindmap="The skeleton:",
        mindmap=Mindmap(
            root=filename,
            branches=[
                MindmapBranch(
                    label="Mock branch",
                    children=[MindmapSubBranch(label="Sub-point", children=[MindmapLeaf(label="Leaf")])],
                ),
            ],
        ),
        bridge_mindmap_to_domain="Through the seven domain lenses:",
        domain=DomainBreakdown(
            business_purpose=DomainBranch(points=["Mock"]),
            stakeholders=DomainBranch(points=["Mock"]),
            process_flow=DomainBranch(points=["Mock"]),
            data=DomainBranch(points=["Mock"]),
            rules=DomainBranch(points=["Mock"]),
            metrics=DomainBranch(points=["Mock"]),
            problems_opportunities=DomainBranch(points=["Mock"]),
        ),
        bridge_domain_to_timeline="The temporal anatomy:",
        timeline=Timeline(phases=[
            TimelinePhase(label="Mock phase 1", when="Day 0", description="Configure the API key."),
            TimelinePhase(label="Mock phase 2", when="Day 1", description="Run a real extraction."),
        ]),
        bridge_timeline_to_systems="System view:",
        systems=SystemsView(entities=[], flows=[], feedback_loops=[]),
        bridge_systems_to_interrogate="Now what's underneath.",
        interrogate_intro="Mock interrogation section.",
        five_whys=[
            WhyStep(question="Why mock?", answer="Because no API key.", evidence=""),
            WhyStep(question="Why no API key?", answer="To let the UI render without paying for Claude calls.", evidence=""),
            WhyStep(question="Why does that matter?", answer="So local dev and CI can run end-to-end.", evidence=""),
            WhyStep(question="Why end-to-end matter?", answer="To catch integration bugs cheaply.", evidence=""),
            WhyStep(question="Why catch them cheaply?", answer="To ship faster with fewer regressions.", evidence=""),
        ],
        bridge_whys_to_assumptions="Assumptions:",
        assumptions=[
            Assumption(
                assumption="The reader wants to see the full UI shape, not real content.",
                risk_level="low",
                risk_explanation="If the user expects real content, mock mode confuses them.",
            ),
        ],
        bridge_assumptions_to_inversion="What could go wrong:",
        inversion=[FailureMode(scenario="The user thinks this is a real analysis.", likelihood="low")],
        bridge_inversion_to_negative_space="What's missing:",
        negative_space=NegativeSpace(items=[
            NegativeSpaceItem(missing_item="No real document content", why_it_matters="Mock mode can't show structural absences in the actual doc."),
        ]),
        bridge_negative_space_to_questions="Better questions:",
        better_questions=[
            ProbingQuestion(question="Is the API key configured?", why_it_matters="Determines whether you get real or mock output."),
        ],
        bridge_questions_to_act="What to do:",
        act_intro="Mock action section.",
        action_items=[ActionItem(
            owner="You",
            action="Set ANTHROPIC_API_KEY on the backend OR add a key in Settings.",
            when="Now",
            source="",
        )],
        decisions_made=[],
        decisions_open=["Whether to enable live mode"],
        what_to_revisit=[RevisitItem(
            item="Settings → API key",
            why="Without it the dossier stays in mock mode.",
        )],
        user_stories=[],
        closing="Tomorrow morning: configure the API key and try again with a real document.",
    )
