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
