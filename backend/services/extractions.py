"""Persistence helpers for extractions and projects (M2.2).

Two responsibilities:
  * id minting in the same `<prefix>_<base36-ts>_<rand6>` shape the frontend
    uses, so localStorage records can migrate 1:1 (M2.4.5)
  * Pydantic <-> SQLModel conversion so the route layer never touches raw rows
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlmodel import Session, select

from db.models import Extraction, GapState, Project
from models import (
    ExtractionPayload,
    ExtractionRecord,
    ExtractionResult,
    ExtractionSummary,
    GapStateRead,
    ProjectRead,
)


# ---------- ids ----------


def _mint_id(prefix: str) -> str:
    """`<prefix>_<base36-ts>_<rand6>` — matches the JS uuid() in lib/store.js."""
    ts = format(int(datetime.now(timezone.utc).timestamp() * 1000), "x")
    rand = secrets.token_hex(3)  # 6 hex chars
    return f"{prefix}_{ts}_{rand}"


def mint_extraction_id() -> str:
    return _mint_id("ext")


def mint_project_id() -> str:
    return _mint_id("proj")


# ---------- conversions ----------


def extraction_to_record(row: Extraction) -> ExtractionRecord:
    """SQLModel row -> API response shape."""
    return ExtractionRecord(
        id=row.id,
        filename=row.filename,
        raw_text=row.raw_text,
        model_used=row.model_used,
        live=row.live,
        project_id=row.project_id,
        source_file_path=row.source_file_path,
        created_at=row.created_at,
        brief=row.brief,
        actors=row.actors,
        stories=row.stories,
        nfrs=row.nfrs,
        gaps=row.gaps,
    )


def extraction_to_summary(row: Extraction) -> ExtractionSummary:
    """SQLModel row -> lightweight list-row shape (no raw_text, no full payload)."""
    brief = row.brief or {}
    return ExtractionSummary(
        id=row.id,
        filename=row.filename,
        created_at=row.created_at,
        model_used=row.model_used,
        live=row.live,
        project_id=row.project_id,
        actor_count=len(row.actors or []),
        story_count=len(row.stories or []),
        gap_count=len(row.gaps or []),
        brief_summary=str(brief.get("summary") or ""),
        brief_tags=list(brief.get("tags") or []),
    )


def gap_state_to_read(row: GapState) -> GapStateRead:
    return GapStateRead(
        gap_idx=row.gap_idx,
        resolved=row.resolved,
        ignored=row.ignored,
        asked_at=row.asked_at,
        updated_at=row.updated_at,
    )


# ---------- writes ----------


def persist_extraction(
    session: Session,
    *,
    result: ExtractionResult,
    model_used: str,
    project_id: str | None = None,
    extraction_id: str | None = None,
    created_at: datetime | None = None,
) -> Extraction:
    """Insert one Extraction row from a fresh ExtractionResult (or import)."""
    row = Extraction(
        id=extraction_id or mint_extraction_id(),
        filename=result.filename,
        raw_text=result.raw_text,
        model_used=model_used,
        live=result.live,
        project_id=project_id,
        created_at=created_at or datetime.now(timezone.utc),
        brief=result.brief.model_dump(),
        actors=list(result.actors),
        stories=[s.model_dump() for s in result.stories],
        nfrs=[n.model_dump() for n in result.nfrs],
        gaps=[g.model_dump() for g in result.gaps],
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def delete_extraction(session: Session, extraction_id: str) -> bool:
    """Delete extraction + cascade its gap states. Returns True if it existed."""
    row = session.get(Extraction, extraction_id)
    if row is None:
        return False
    # Manually delete gap states — no SA cascade configured (kept the schema simple)
    states = session.exec(
        select(GapState).where(GapState.extraction_id == extraction_id)
    ).all()
    for s in states:
        session.delete(s)
    session.delete(row)
    session.commit()
    return True


# ---------- projects ----------


def project_to_read(row: Project, *, extraction_count: int = 0) -> ProjectRead:
    return ProjectRead(
        id=row.id,
        name=row.name,
        created_at=row.created_at,
        extraction_count=extraction_count,
    )


def count_extractions_for_project(session: Session, project_id: str) -> int:
    return len(
        session.exec(
            select(Extraction.id).where(Extraction.project_id == project_id)
        ).all()
    )
