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

    # M2.3 will populate this; the file lives at `uploads/<id>/<filename>`.
    source_file_path: str | None = Field(default=None)

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
