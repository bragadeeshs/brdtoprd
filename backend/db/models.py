"""SQLModel database schema for StoryForge (M2.1).

Three tables:

  * Extraction — one row per Claude extraction run. Structured payload
    (brief / actors / stories / nfrs / gaps) stored as JSON columns rather
    than normalized into separate tables; we don't query into those fields,
    we render them as a unit.
  * Project — optional grouping of extractions; M2.5 wires the UI.
  * GapState — per-gap user actions (resolved / ignored / asked) keyed by
    extraction id + gap index. Mirrors the localStorage shape used today by
    [lib/store.js](frontend/src/lib/store.js).

The Pydantic API schemas in `backend/models.py` stay separate (API contract
vs storage). Conversion happens at the route layer in M2.2.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, Relationship, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Project(SQLModel, table=True):
    """A user-defined grouping for extractions."""

    __tablename__ = "project"

    id: str = Field(primary_key=True)  # `proj_<base36-ts>_<rand6>`
    name: str = Field(index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    # M3.2 isolation. Existing pre-M3.2 rows retain user_id="local"; routes
    # filter by current_user.user_id so a real user never sees orphan local data.
    user_id: str = Field(default="local", index=True)
    # M3.3 workspaces. NULL when the row was created in personal context;
    # set to Clerk's `org_xxx` when created inside an organization. Routes
    # scope by org_id when the caller has an active org context, else by
    # (user_id, org_id IS NULL).
    org_id: str | None = Field(default=None, index=True)


class Extraction(SQLModel, table=True):
    """One Claude extraction run, with its structured payload."""

    __tablename__ = "extraction"

    # Mirrors the `ext_<base36-ts>_<rand6>` shape the frontend already mints —
    # so localStorage records can be migrated 1:1 in M2.4.5.
    id: str = Field(primary_key=True)

    filename: str = Field(index=True)
    raw_text: str

    # Provenance
    model_used: str
    live: bool = Field(default=False)
    project_id: str | None = Field(default=None, foreign_key="project.id", index=True)

    # M2.3 / M3.9 — single source-file path (kept for back-compat; new rows
    # since M7.5.b populate `source_file_paths` instead). Either an absolute
    # local-disk path or `r2://<bucket>/<key>` for R2-stored uploads.
    source_file_path: str | None = Field(default=None)
    # M7.5.b — list of source-file paths for multi-doc extractions. JSON
    # column. Empty list / null for single-doc rows (use source_file_path
    # instead). Resolution rule on read: prefer source_file_paths when
    # non-empty; else fall back to [source_file_path] when set; else [].
    source_file_paths: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"),
    )

    # M2.6 versioning. The original ("v1") has root_id=NULL; every re-run
    # of that document carries root_id=<original.id>. This is a *star* not a
    # chain — siblings don't link to each other — which keeps "list all
    # versions" a single query.
    root_id: str | None = Field(default=None, foreign_key="extraction.id", index=True)

    # M3.2 isolation — see note on Project.user_id.
    user_id: str = Field(default="local", index=True)
    # M3.3 workspaces — see note on Project.org_id.
    org_id: str | None = Field(default=None, index=True)

    created_at: datetime = Field(default_factory=_utcnow, index=True)

    # Structured payload as JSON columns. dict / list typing here is just for
    # call-site ergonomics — the column itself is JSON in SQLite.
    brief: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    actors: list[str] = Field(sa_column=Column(JSON, nullable=False))
    stories: list[dict[str, Any]] = Field(sa_column=Column(JSON, nullable=False))
    nfrs: list[dict[str, Any]] = Field(sa_column=Column(JSON, nullable=False))
    gaps: list[dict[str, Any]] = Field(sa_column=Column(JSON, nullable=False))

    # M14.1 — lens dispatcher. 'stories' (default for back-compat) uses the
    # brief/actors/stories/nfrs/gaps columns above. Other lenses ('dossier',
    # future ones) leave those empty and put their structured output into
    # lens_payload. Frontend dispatches the renderer on this column.
    lens: str = Field(default="stories", index=True)
    lens_payload: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSON, nullable=True),
    )


class ChatMessage(SQLModel, table=True):
    """One message in the chat thread for an extraction (M14.4).

    Per-extraction chat: each Lucid dossier becomes a workspace where the
    user can ask follow-up questions about the document. Conversation
    persists per-(user, extraction) so coming back tomorrow keeps the
    thread. Scope by user_id (not extraction.user_id directly) so shared
    extractions could later carry private chats per viewer; for now they
    match.
    """
    __tablename__ = "chat_message"
    id: str = Field(primary_key=True)
    extraction_id: str = Field(foreign_key="extraction.id", index=True)
    user_id: str = Field(index=True)
    role: str  # 'user' | 'assistant'
    content: str
    model_used: str | None = Field(default=None)  # only set on assistant rows
    input_tokens: int | None = Field(default=None)
    output_tokens: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow, index=True)


class PromptTemplate(SQLModel, table=True):
    """Named prompt-suffix template (M7.1.b).

    Replaces M7.1's single `user_settings.prompt_suffix` slot with
    multiple-named-templates-per-user. The legacy column stays as a
    fallback so existing users don't lose their saved suffix; once they
    interact with Settings post-M7.1.b, the resolver migrates it to a
    "Default" PromptTemplate row and clears the legacy field.

    Active selection: at most one row per `(user_id, org_id)` has
    `is_active=True`. Activating a template flips the previous active
    one to false in the same transaction. Resolver picks the user-
    scoped active row first; if none, falls back to the org-scoped
    active row (M7.1.c); if none, falls back to legacy suffix.

    Cap: no hard cap on stored count (cheap), but only one is active at
    a time so token cost is the same as M7.1's single-suffix model.
    """

    __tablename__ = "prompt_template"

    id: str = Field(primary_key=True)         # `tpl_<base36-ts>_<rand6>`
    user_id: str = Field(index=True)
    org_id: str | None = Field(default=None, index=True)
    name: str
    content: str
    is_active: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class FewShotExample(SQLModel, table=True):
    """User-curated input → expected-output pair for in-context learning (M7.2).

    Prepended to the extraction prompt as prior conversation turns so Claude
    can see what "good output" looks like for this user's house style. Power-
    user feature — most users won't author these by hand; they'll capture
    them via the "Save as example" button after editing an extraction's
    output to their liking.

    Capped at 3 enabled examples per user (token-cost discipline — each
    example adds ~3K-8K input tokens to every extraction). Disabled examples
    don't ship to Claude but stay in the table for easy re-enable.

    `expected_payload` is the full ExtractionPayload JSON (brief / actors /
    stories / nfrs / gaps). Stored as a JSON column so we don't have to
    re-validate on every read; route layer validates against the Pydantic
    type on write.

    org_id is reserved for M7.2.b org-shared examples; v1 is user-scope only.
    """

    __tablename__ = "few_shot_example"

    id: str = Field(primary_key=True)         # `fse_<base36-ts>_<rand6>`
    user_id: str = Field(index=True)
    org_id: str | None = Field(default=None, index=True)
    name: str
    input_text: str
    expected_payload: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    enabled: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class ApiToken(SQLModel, table=True):
    """Long-lived API tokens for programmatic access (M6.7).

    Authenticates the same `current_user` dependency as Clerk JWTs — the
    `auth.deps` resolver inspects the Bearer header, dispatches by prefix
    (`sk_*` → token lookup; otherwise → JWT verify), and produces a
    `CurrentUser` either way. So plan limits (M3.5), scope filtering
    (M3.3) etc. all work transparently with API tokens.

    Storage:
      * `token_hash` is SHA-256(plaintext) — we NEVER store the plaintext.
        Plaintext is shown to the user exactly once at creation and lost.
      * `prefix` (e.g. "sk_live_") and `last4` are kept clear so the
        Settings UI can render `sk_live_…••••XYZK` previews without
        decrypting anything.
      * `org_id` snapshots the user's active org context at token-create
        time. The token always acts in that scope (personal vs org-X);
        deferred (M6.7.b) is a "switch scope" operation post-creation.

    Lifecycle: tokens never auto-expire in v1 (`expires_at` reserved for
    future "expire in 90 days" UX). Soft-revoke via `revoked_at` so
    bookmarked tokens fail closed instead of accidentally re-activating
    if the row gets resurrected.
    """

    __tablename__ = "api_token"

    id: str = Field(primary_key=True)        # `tok_<base36-ts>_<rand6>` — public id for Settings UI
    name: str                                 # user-given label, e.g. "production-pipeline"
    prefix: str                               # e.g. "sk_live_" — for preview; cosmetic
    last4: str                                # last 4 chars of plaintext — for preview
    token_hash: str = Field(index=True)       # SHA-256 of plaintext, hex; lookup key on auth
    user_id: str = Field(index=True)
    org_id: str | None = Field(default=None, index=True)
    # M6.7.b — token scope. 'rw' (default, full read/write parity with Clerk
    # sessions) or 'ro' (GET/HEAD/OPTIONS only — non-safe methods return 403
    # via `enforce_token_scope` in main.py). Stamped at create time and
    # immutable; rotate to a new token to change scope.
    scope: str = Field(default="rw")
    created_at: datetime = Field(default_factory=_utcnow)
    last_used_at: datetime | None = Field(default=None)
    expires_at: datetime | None = Field(default=None)
    revoked_at: datetime | None = Field(default=None)


class IntegrationConnection(SQLModel, table=True):
    """Per-user (or per-org) credentials for a third-party integration (M6.2+).

    One row per (scope, kind). Composite primary key on (scope_id, kind) so
    a user can have at most one connection per integration type — keeps the
    UX simple ("connect Jira" → one button, not a list).

    `scope_id` is `user_id` for personal connections or `org_id` for shared
    org connections — disambiguated by `scope` ('user' | 'org'). v1 ships
    user-only; org sharing is M6.2.c.

    `config_json` is opaque per-integration JSON (varies by `kind`). For
    `kind='jira'` it's `{base_url, email, api_token_encrypted, default_project_key?}`.
    The token is Fernet-encrypted via `services/byok.encrypt_secret` —
    same path the Anthropic BYOK key uses. Routes never echo the token
    back to the client (only the connection metadata).
    """

    __tablename__ = "integration_connection"

    scope: str = Field(primary_key=True)        # 'user' | 'org'
    scope_id: str = Field(primary_key=True)     # user_id or org_id
    kind: str = Field(primary_key=True)         # 'jira' | future: 'linear', 'github', ...
    config_json: str                            # JSON string; per-kind shape
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class ExtractionShare(SQLModel, table=True):
    """Public read-only share token for an extraction (M4.6).

    One active token per extraction at a time — POST /share rotates the
    existing one (revokes old + creates new). Token IS the primary key
    (opaque base64-urlsafe ~22 chars from secrets.token_urlsafe) so the
    public lookup is one indexed-PK fetch.

    Revocation: set `revoked_at`. We don't delete because a) audit value,
    b) the same token shouldn't reappear after a rotation cycle (keeps
    bookmarked URLs from accidentally resurrecting access). Expiry is
    optional (`expires_at` nullable) — v1 ships with no UI for it but the
    column is here for the future "share for 7 days" flow.
    """

    __tablename__ = "extraction_share"

    token: str = Field(primary_key=True)
    extraction_id: str = Field(foreign_key="extraction.id", index=True)
    created_by_user_id: str = Field(index=True)
    created_at: datetime = Field(default_factory=_utcnow)
    expires_at: datetime | None = Field(default=None)
    revoked_at: datetime | None = Field(default=None)


class Comment(SQLModel, table=True):
    """User comment on one artifact within an extraction (M4.5).

    `target_kind` + `target_key` together identify what the comment is on:
      - ('brief', '')       → the brief block (singleton)
      - ('story', 'US-03')  → that specific user story by stable id

    NFRs and gaps are NOT supported yet — they lack stable ids, so anchoring
    by array index would silently shift on delete/reorder. Add when those
    artifacts get stable ids (post-M4).

    Author is denormalized at write time (`author_name`, `author_email` from
    a Clerk lookup) so the read path doesn't need a network hop per comment.
    Edits update `author_name` only on the next write — keeps the UI honest
    that names can drift over time.

    Scope inherits from the parent extraction:
      - `org_id` mirrors the extraction's org_id (NULL for personal)
      - List endpoint filters via the same scope rules as extractions (M3.3)
    """

    __tablename__ = "comment"

    id: str = Field(primary_key=True)  # `cmt_<base36-ts>_<rand6>`
    extraction_id: str = Field(foreign_key="extraction.id", index=True)
    target_kind: str = Field(index=True)  # 'brief' | 'story' (extensible)
    target_key: str = Field(default="")    # '' for brief, story.id for story
    author_user_id: str = Field(index=True)
    author_name: str = Field(default="")
    author_email: str = Field(default="")
    body: str
    org_id: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=_utcnow, index=True)
    edited_at: datetime | None = Field(default=None)


class ExtractionView(SQLModel, table=True):
    """Per-(user, extraction) last-seen timestamp for unread comment tracking (M4.5.3.b).

    Replaces the M4.5.3 localStorage-only solution so unread counts are
    consistent across devices + share-link viewers. One row per
    (user_id, extraction_id) pair; updated whenever the user explicitly
    marks the extraction as read (Sidebar "N new" pill click) or — in
    the future — passively after a stable view dwell.

    `last_seen_at` defaults to row-creation time. The unread count for a
    given extraction is `count(comments where created_at > last_seen_at)`,
    computed in the route layer (`services/extractions.py`).
    """

    __tablename__ = "extraction_view"

    user_id: str = Field(primary_key=True)
    extraction_id: str = Field(primary_key=True, foreign_key="extraction.id")
    last_seen_at: datetime = Field(default_factory=_utcnow)


class GapState(SQLModel, table=True):
    """Per-gap user state (resolved / ignored / asked).

    Composite primary key on (extraction_id, gap_idx) — gaps don't have stable
    ids in the model output, so the index in the source extraction is the key.
    Mirrors the shape used today by `setGapState` in lib/store.js.
    """

    __tablename__ = "gap_state"

    extraction_id: str = Field(primary_key=True, foreign_key="extraction.id")
    gap_idx: int = Field(primary_key=True)
    resolved: bool = Field(default=False)
    ignored: bool = Field(default=False)
    asked_at: datetime | None = Field(default=None)
    updated_at: datetime = Field(default_factory=_utcnow)


# ============================================================================
# M3.0 — schema groundwork for auth + billing. Both default user_id="local"
# until M3.1 (Clerk) wires real users; existing rows then get reassigned.
# ============================================================================


class UserSettings(SQLModel, table=True):
    """One row per user storing their encrypted Anthropic key + model default.

    Replaces the localStorage `storyforge:settings` blob in M3.4. Stored
    ciphertext goes through `services/byok.encrypt_secret`; decryption happens
    in the route handler per request.
    """

    __tablename__ = "user_settings"

    user_id: str = Field(primary_key=True, default="local")
    anthropic_key_encrypted: str | None = Field(default=None)
    model_default: str | None = Field(default=None)
    # M3.7 first-touch detection. Set to the timestamp we *enqueued* a
    # welcome email — once non-null we never send again. Stored even on
    # send failure to prevent retry storms; missing one welcome is cheaper
    # than spamming users on every request after a transient Resend error.
    welcome_sent_at: datetime | None = Field(default=None)
    # M3.5 — billing plan ('trial' / 'starter' / 'pro' / 'team' / 'expired').
    # Set to 'trial' by `welcome_check` on first authed touch. Driven by
    # Stripe webhooks (M3.6) once subscriptions are live. NULL only on
    # legacy pre-M3.5 rows; routes treat NULL as 'trial' for safety.
    plan: str | None = Field(default=None, index=True)
    # End of the 14-day trial window. Set when plan is first set to 'trial';
    # cleared (or ignored) when plan transitions to a paid tier. Used by the
    # gate to throw a "trial_expired" paywall once we pass it.
    trial_ends_at: datetime | None = Field(default=None)
    # M3.6 — Lemon Squeezy linkage. Customer is persistent across subs (one
    # per user); subscription is the *current* active sub (one at a time —
    # we don't support multiple stacked subs in v1). Both nullable for users
    # who haven't subscribed yet.
    lsq_customer_id: str | None = Field(default=None, index=True)
    lsq_subscription_id: str | None = Field(default=None, index=True)
    # Renewal date from LSQ; lets the Account page show "renews on …".
    plan_renews_at: datetime | None = Field(default=None)
    # Set when user clicks "cancel" — sub stays active until renews_at.
    plan_canceled_at: datetime | None = Field(default=None)
    # M7.1 — custom system-prompt suffix appended to the default extraction
    # prompt. Lets power users enforce house-style ("use job-story format",
    # "tag PCI NFRs as severity=high", etc.). NULL = use default prompt only.
    # Capped at 4000 chars in the route layer; see services/prompts.py for
    # how it's joined into the final prompt.
    prompt_suffix: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class UsageLog(SQLModel, table=True):
    """One row per LLM call. Source of truth for free-tier limits + billing.

    `extraction_id` is nullable so we can also log usage for non-extraction
    calls later (chat, regen, etc.). `cost_cents` is integer to keep SUM()s
    free of floating-point drift.
    """

    __tablename__ = "usage_log"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(default="local", index=True)
    # M3.3 — usage attributes to a workspace when the call was made in org
    # context, so org-level billing aggregation is one query (not a join via
    # extraction). NULL for personal-context calls.
    org_id: str | None = Field(default=None, index=True)
    extraction_id: str | None = Field(default=None, foreign_key="extraction.id", index=True)
    action: str = Field(default="extract")  # extract | rerun | future actions
    model: str
    live: bool = Field(default=True)  # False for mock-mode calls (cost=0)
    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    cache_creation_input_tokens: int = Field(default=0)
    cache_read_input_tokens: int = Field(default=0)
    cost_cents: int = Field(default=0)
    ts: datetime = Field(default_factory=_utcnow, index=True)
