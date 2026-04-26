"""Pydantic API schemas (request/response shapes).

Kept separate from `db/models.py` (SQLModel storage). Conversion happens in
`services/extractions.py`. Routes return these; SQLModel types never leak.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Brief(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str
    tags: list[str] = Field(default_factory=list)


class UserStory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    actor: str
    want: str
    so_that: str
    section: str = ""
    criteria: list[str] = Field(default_factory=list)
    # M5.1 — provenance. Verbatim snippet (or near-verbatim paraphrase when
    # the source is too messy) from raw_text that grounds this story. Empty
    # string when the model can't isolate one. The frontend uses it for
    # click-to-source scrolling (M5.2).
    source_quote: str = ""


class NonFunctional(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str
    value: str
    # M5.1 — same intent as UserStory.source_quote.
    source_quote: str = ""


class Gap(BaseModel):
    model_config = ConfigDict(extra="forbid")
    severity: Literal["high", "med", "low"]
    question: str
    section: str = ""
    context: str = ""
    # M5.1 — when the gap is grounded in a *specific* passage (vs an
    # absence-of-info gap), record the passage here. May be empty for
    # "missing info" gaps — `context` already paraphrases those.
    source_quote: str = ""


class ExtractionPayload(BaseModel):
    """Shape the model produces. Passed to messages.parse()."""
    model_config = ConfigDict(extra="forbid")
    brief: Brief
    actors: list[str]
    stories: list[UserStory]
    nfrs: list[NonFunctional]
    gaps: list[Gap]


class ExtractionResult(ExtractionPayload):
    """Inline extraction output — pre-persistence. Used internally by extract.py."""
    filename: str
    raw_text: str
    live: bool


# ============================================================================
# Persistence-aware schemas — used by /api/extractions/* endpoints (M2.2)
# ============================================================================


class ExtractionRecord(ExtractionPayload):
    """Full record returned by GET /api/extractions/{id} and POST /api/extract.

    Extends the model payload with server metadata so the frontend can list,
    open, and persist records without going back through the LLM.
    """
    id: str
    filename: str
    raw_text: str
    model_used: str
    live: bool
    project_id: str | None = None
    source_file_path: str | None = None
    created_at: datetime
    root_id: str | None = None  # M2.6 — null for v1, set for re-runs


class ExtractionSummary(BaseModel):
    """Lightweight row for GET /api/extractions — no raw_text, no full payload.

    Carries just enough for the Documents list view (counts + provenance).
    """
    model_config = ConfigDict(extra="forbid")
    id: str
    filename: str
    created_at: datetime
    model_used: str
    live: bool
    project_id: str | None = None
    root_id: str | None = None  # M2.6 — null for v1, set for re-runs
    actor_count: int
    story_count: int
    gap_count: int
    brief_summary: str = ""
    brief_tags: list[str] = Field(default_factory=list)


class ExtractionPatch(BaseModel):
    """PATCH /api/extractions/{id} body — partial update.

    M4.1: artifact fields (brief / actors / stories / nfrs / gaps) added so
    inline edits in the studio can persist without a full overwrite. Each is
    optional; a present value REPLACES the whole field (no merge — keeps the
    contract simple, and the frontend always sends the intended new shape).
    Validation reuses the same Pydantic types the extractor produces so
    junk shapes are rejected at the route boundary.
    """
    model_config = ConfigDict(extra="forbid")
    filename: str | None = None
    project_id: str | None = None  # set to "" to clear
    # M4.1 — artifact edits
    brief: Brief | None = None
    actors: list[str] | None = None
    stories: list[UserStory] | None = None
    nfrs: list[NonFunctional] | None = None
    gaps: list[Gap] | None = None


class ExtractionImport(BaseModel):
    """POST /api/extractions/import — bulk import from localStorage migration."""
    model_config = ConfigDict(extra="forbid")
    id: str
    filename: str
    saved_at: datetime | None = None
    payload: ExtractionResult


# ----- Gap state -----


class GapStateRead(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gap_idx: int
    resolved: bool = False
    ignored: bool = False
    asked_at: datetime | None = None
    updated_at: datetime


class GapStatePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resolved: bool | None = None
    ignored: bool | None = None
    asked_at: datetime | None = None  # client passes ISO; null clears


# ----- Projects -----


class ProjectRead(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    created_at: datetime
    extraction_count: int = 0


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)


class ProjectPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=120)


# ----- Usage + legacy (M3.8) -----


class UsageBucket(BaseModel):
    """Aggregate counts over some window (this_month / all_time)."""
    model_config = ConfigDict(extra="forbid")
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_cents: int = 0


class UsageByModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str
    calls: int
    cost_cents: int


class UsageSummary(BaseModel):
    """Response from GET /api/me/usage — drives the Account page usage card."""
    model_config = ConfigDict(extra="forbid")
    this_month: UsageBucket
    all_time: UsageBucket
    by_model: list[UsageByModel] = Field(default_factory=list)
    last_extraction_at: datetime | None = None


class LegacyCount(BaseModel):
    """Counts of pre-auth `user_id='local'` rows still in the DB."""
    model_config = ConfigDict(extra="forbid")
    extractions: int
    projects: int
    usage_logs: int


class LegacyAdoptResult(BaseModel):
    """Counts of rows reassigned by POST /api/me/legacy/adopt."""
    model_config = ConfigDict(extra="forbid")
    adopted_extractions: int
    adopted_projects: int
    adopted_usage_logs: int


# ----- User settings (M3.4.4) -----


class UserSettingsRead(BaseModel):
    """Response from GET /api/me/settings.

    Never returns the raw API key — `anthropic_key_set` + `anthropic_key_preview`
    let the UI render the "Active" badge and the masked tail (e.g. `••••XYZK`)
    without exposing the secret. The actual decryption happens server-side at
    extract time.
    """
    model_config = ConfigDict(extra="forbid")
    anthropic_key_set: bool
    anthropic_key_preview: str | None = None  # last 4 chars of the plaintext key
    model_default: str | None = None
    prompt_suffix: str | None = None  # M7.1 — appended to the system prompt
    updated_at: datetime | None = None


class UserSettingsPatch(BaseModel):
    """PUT /api/me/settings body. None = no change. "" = clear the field."""
    model_config = ConfigDict(extra="forbid")
    anthropic_key: str | None = None
    model_default: str | None = None
    prompt_suffix: str | None = None  # M7.1 — pass "" to clear


# ----- Plan + usage (M3.5) -----


class PlanRead(BaseModel):
    """Response from GET /api/me/plan — drives the sidebar usage bar.

    `usage_in_period` is the count of UsageLog rows since the start of the
    current billing window (calendar month for paid; trial-period start for
    trial). `period_resets_at` is when the counter resets (start of next
    month for paid; trial_ends_at for trial).
    """
    model_config = ConfigDict(extra="forbid")
    plan: str
    plan_name: str
    extractions_per_period: int
    usage_in_period: int
    max_input_chars: int
    allowed_models: list[str]
    upgrade_to: str | None
    trial_ends_at: datetime | None
    period_resets_at: datetime | None
    period_label: str
    # M3.6 — LSQ subscription state. None when on trial/expired.
    plan_renews_at: datetime | None = None
    plan_canceled_at: datetime | None = None
    has_active_subscription: bool = False


class CheckoutRequest(BaseModel):
    """POST /api/me/checkout body — frontend tells us which tier+interval
    the user picked from the paywall modal or pricing page."""
    model_config = ConfigDict(extra="forbid")
    tier: Literal["starter", "pro", "team"]
    interval: Literal["monthly", "annual"]


class CheckoutResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str  # LSQ-hosted checkout URL — frontend window.location to it


class PortalResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str  # LSQ customer-portal URL for self-serve management


# ----- Versions (M2.6) -----


class ExtractionVersion(BaseModel):
    """One entry in GET /api/extractions/{id}/versions."""
    model_config = ConfigDict(extra="forbid")
    id: str
    version: int  # 1-indexed, ordered by created_at asc
    created_at: datetime
    model_used: str
    live: bool


class ExtractionRerunRequest(BaseModel):
    """POST /api/extractions/{id}/rerun body — all fields optional."""
    model_config = ConfigDict(extra="forbid")
    # Future: per-request system prompt overrides go here.


class ExtractionRegenRequest(BaseModel):
    """POST /api/extractions/{id}/regen body (M4.4)."""
    model_config = ConfigDict(extra="forbid")
    # The section name is also a path segment; we keep it in the body so the
    # frontend doesn't need three endpoints. Validation matches services.regen
    # — only stories / nfrs / gaps are regenerable; brief + actors are short
    # enough to edit inline (M4.1).
    section: Literal["stories", "nfrs", "gaps"]


# ----- Comments (M4.5) -----


CommentTargetKind = Literal["brief", "story"]


class CommentRead(BaseModel):
    """One comment as returned by GET /api/extractions/{id}/comments."""
    model_config = ConfigDict(extra="forbid")
    id: str
    extraction_id: str
    target_kind: CommentTargetKind
    target_key: str = ""
    author_user_id: str
    author_name: str = ""
    author_email: str = ""
    body: str
    created_at: datetime
    edited_at: datetime | None = None


class CommentCreate(BaseModel):
    """POST /api/extractions/{id}/comments body."""
    model_config = ConfigDict(extra="forbid")
    target_kind: CommentTargetKind
    target_key: str = ""  # '' for brief, story.id for story
    body: str


class CommentPatch(BaseModel):
    """PATCH /api/comments/{id} body — body-only edit. Authors can edit
    their own comments; the response stamps `edited_at`."""
    model_config = ConfigDict(extra="forbid")
    body: str


# ----- Share links (M4.6) -----


class ExtractionShareRead(BaseModel):
    """Owner-side view of the active share for an extraction.

    GET returns null when no active token exists (or the only one has been
    revoked). POST returns the freshly-minted token. Token is the only
    secret here — anyone with it can read the extraction.
    """
    model_config = ConfigDict(extra="forbid")
    token: str
    extraction_id: str
    created_at: datetime
    expires_at: datetime | None = None
    revoked_at: datetime | None = None


# ----- Integrations (M6.2 — Jira) -----


class JiraConnectionRead(BaseModel):
    """Connection metadata returned to the frontend. Token is NEVER included
    in any read response — only the existence + a preview is exposed."""
    model_config = ConfigDict(extra="forbid")
    base_url: str
    email: str
    api_token_preview: str       # ••••XYZK style, computed from the stored token
    default_project_key: str | None = None
    created_at: datetime
    updated_at: datetime


class JiraConnectionWrite(BaseModel):
    """PUT body — full replacement of the saved connection. Frontend sends
    the token in the clear; backend encrypts before persisting."""
    model_config = ConfigDict(extra="forbid")
    base_url: str       # e.g. "https://acme.atlassian.net" (no trailing slash)
    email: str          # Atlassian account email
    api_token: str      # https://id.atlassian.com/manage-profile/security/api-tokens
    default_project_key: str | None = None


class JiraProject(BaseModel):
    """One Jira project as returned by /rest/api/3/project."""
    model_config = ConfigDict(extra="forbid")
    id: str
    key: str
    name: str


class PushToJiraRequest(BaseModel):
    """POST /api/extractions/{id}/push/jira body."""
    model_config = ConfigDict(extra="forbid")
    project_key: str
    issue_type: str = "Story"   # default; user can override


class PushedIssue(BaseModel):
    """One created Jira issue, returned per pushed story."""
    model_config = ConfigDict(extra="forbid")
    story_id: str
    issue_key: str
    issue_url: str


class PushToJiraResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pushed: list[PushedIssue]
    failed: list[dict]   # [{story_id, error}] — non-fatal per-story failures


# ----- Integrations (M6.3 — Linear) -----


class LinearConnectionRead(BaseModel):
    """Linear connection metadata. Token preview only — never the raw key."""
    model_config = ConfigDict(extra="forbid")
    api_key_preview: str       # ••••XYZK
    default_team_id: str | None = None
    created_at: datetime
    updated_at: datetime


class LinearConnectionWrite(BaseModel):
    """PUT body — full replacement. Token sent in clear; backend encrypts
    before persisting (same path as the Jira token + Anthropic BYOK key)."""
    model_config = ConfigDict(extra="forbid")
    api_key: str       # https://linear.app/settings/api
    default_team_id: str | None = None


class LinearTeam(BaseModel):
    """One Linear team. `key` is the short prefix Linear puts on issues
    (e.g. ENG → ENG-123). Useful for the picker label."""
    model_config = ConfigDict(extra="forbid")
    id: str            # opaque GraphQL id
    key: str           # short prefix (e.g. "ENG")
    name: str


class PushToLinearRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    team_id: str       # Linear team id (NOT the key — GraphQL id)


class PushToLinearResult(BaseModel):
    """Same shape as PushToJiraResult — the issue_key field carries
    Linear's identifier (e.g. ENG-42) which matches the Jira issue_key
    contract."""
    model_config = ConfigDict(extra="forbid")
    pushed: list[PushedIssue]
    failed: list[dict]


# ----- Integrations (M6.4 — GitHub Issues) -----


class GitHubConnectionRead(BaseModel):
    """GitHub connection metadata. PAT preview only — never the raw token."""
    model_config = ConfigDict(extra="forbid")
    api_token_preview: str       # ••••XYZK
    default_repo: str | None = None      # "owner/name" form
    created_at: datetime
    updated_at: datetime


class GitHubConnectionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_token: str       # PAT from github.com/settings/tokens (`repo` scope)
    default_repo: str | None = None


class GitHubRepo(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str       # "owner/name" — used as the picker value
    owner: str
    name: str
    private: bool = False


class PushToGitHubRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    owner: str
    repo: str


class PushToGitHubResult(BaseModel):
    """Same shape as the other push results. issue_key uses the GitHub
    convention `owner/repo#42` so it's globally unique in the result UI."""
    model_config = ConfigDict(extra="forbid")
    pushed: list[PushedIssue]
    failed: list[dict]


# ----- Integrations (M6.6 — Slack) -----


class SlackConnectionRead(BaseModel):
    """Slack webhook metadata. URL is partially redacted in the preview
    (only the trailing /XXXX shown) — it's a secret in the same way an
    API token is."""
    model_config = ConfigDict(extra="forbid")
    webhook_url_preview: str         # https://hooks.slack.com/…/••••XYZK
    channel_label: str | None = None  # cosmetic — "we send to #dev-team"
    created_at: datetime
    updated_at: datetime


class SlackConnectionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    webhook_url: str         # https://hooks.slack.com/services/T../B../...
    channel_label: str | None = None


class PushToSlackRequest(BaseModel):
    """POST body — `include_resolved` lets the user re-send everything for
    posterity (default: only unresolved gaps)."""
    model_config = ConfigDict(extra="forbid")
    include_resolved: bool = False


class PushToSlackResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    posted_gap_count: int


# ----- Integrations (M6.5 — Notion) -----


class NotionConnectionRead(BaseModel):
    """Notion connection metadata. Token preview only — never the raw token."""
    model_config = ConfigDict(extra="forbid")
    token_preview: str       # ••••XYZK
    default_database_id: str | None = None
    created_at: datetime
    updated_at: datetime


class NotionConnectionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str       # secret_… from notion.so/my-integrations
    default_database_id: str | None = None


class NotionDatabase(BaseModel):
    """One Notion database visible to the integration. `title_prop` is the
    name of the title column (varies — users often rename "Name" to
    "Story", "Item", etc.) — discovered server-side and shipped to the
    frontend so the picker can submit it back unchanged on push."""
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    title_prop: str
    url: str = ""


class PushToNotionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    database_id: str
    title_prop: str       # echoed back from the picker so backend doesn't re-fetch


class PushToNotionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pushed: list[PushedIssue]
    failed: list[dict]


# ----- API tokens (M6.7) -----


class ApiTokenCreateRequest(BaseModel):
    """POST /api/me/api-tokens body. Just a label."""
    model_config = ConfigDict(extra="forbid")
    name: str   # e.g. "production-pipeline", "zapier-bot"


class ApiTokenCreateResponse(BaseModel):
    """The ONLY response that ever carries the plaintext token. Frontend
    must surface a "save this now — you won't see it again" UX."""
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    token: str          # plaintext — shown exactly once
    prefix: str
    last4: str
    org_id: str | None = None
    created_at: datetime


class PromptTemplateRead(BaseModel):
    """Returned by GET / POST / PATCH /api/me/prompt-templates."""
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    content: str
    is_active: bool
    org_id: str | None = None      # M7.1.c — null = user-scoped (v1 default)
    created_at: datetime
    updated_at: datetime


class PromptTemplateCreate(BaseModel):
    """POST body. `is_active=True` flips the previous active template off."""
    model_config = ConfigDict(extra="forbid")
    name: str
    content: str
    is_active: bool = False
    org_id: str | None = None      # M7.1.c — must match caller's active org if set


class PromptTemplatePatch(BaseModel):
    """PATCH body — any field optional."""
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    content: str | None = None
    is_active: bool | None = None


class FewShotExampleRead(BaseModel):
    """Returned by GET / POST / PATCH /api/me/few-shot-examples."""
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    input_text: str
    expected_payload: ExtractionPayload   # validated; same shape extractor produces
    enabled: bool
    created_at: datetime
    updated_at: datetime


class FewShotExampleCreate(BaseModel):
    """POST body. Either author-by-hand (input_text + expected_payload) or
    capture-from-extraction (input_text + expected_payload from the named
    extraction's current state — handled by a separate route)."""
    model_config = ConfigDict(extra="forbid")
    name: str
    input_text: str
    expected_payload: ExtractionPayload   # validates the JSON shape on write
    enabled: bool = True


class FewShotExamplePatch(BaseModel):
    """PATCH body — any field is optional."""
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    input_text: str | None = None
    expected_payload: ExtractionPayload | None = None
    enabled: bool | None = None


class FewShotCaptureRequest(BaseModel):
    """POST /api/me/few-shot-examples/from-extraction body. The extraction id
    is in the URL; just need a name + initial enabled flag."""
    model_config = ConfigDict(extra="forbid")
    extraction_id: str
    name: str
    enabled: bool = True


class ApiTokenRead(BaseModel):
    """List + read shape — preview only, never the plaintext."""
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    prefix: str
    last4: str
    org_id: str | None = None
    created_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
