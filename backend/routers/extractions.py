"""CRUD routes for stored extractions + per-gap state (M2.2)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from db.models import Extraction, GapState, Project
from db.session import get_session
from models import (
    ExtractionImport,
    ExtractionPatch,
    ExtractionRecord,
    ExtractionSummary,
    GapStatePatch,
    GapStateRead,
)
from services.extractions import (
    delete_extraction,
    extraction_to_record,
    extraction_to_summary,
    gap_state_to_read,
    persist_extraction,
)

log = logging.getLogger("storyforge.extractions")
router = APIRouter(prefix="/api/extractions", tags=["extractions"])

SessionDep = Annotated[Session, Depends(get_session)]


# ---------------- list ----------------


@router.get("", response_model=list[ExtractionSummary])
def list_extractions(
    session: SessionDep,
    q: str | None = Query(default=None, description="Substring filter on filename"),
    project_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[ExtractionSummary]:
    """List extractions, newest first. Lightweight rows for the Documents view."""
    stmt = select(Extraction)
    if project_id:
        stmt = stmt.where(Extraction.project_id == project_id)
    if q:
        stmt = stmt.where(Extraction.filename.contains(q))
    stmt = stmt.order_by(Extraction.created_at.desc()).offset(offset).limit(limit)
    rows = session.exec(stmt).all()
    return [extraction_to_summary(r) for r in rows]


# ---------------- detail ----------------


@router.get("/{extraction_id}", response_model=ExtractionRecord)
def get_extraction(extraction_id: str, session: SessionDep) -> ExtractionRecord:
    row = session.get(Extraction, extraction_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return extraction_to_record(row)


# ---------------- patch ----------------


@router.patch("/{extraction_id}", response_model=ExtractionRecord)
def patch_extraction(
    extraction_id: str, patch: ExtractionPatch, session: SessionDep
) -> ExtractionRecord:
    row = session.get(Extraction, extraction_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Extraction not found")

    if patch.filename is not None:
        name = patch.filename.strip()
        if not name:
            raise HTTPException(status_code=400, detail="filename cannot be empty")
        row.filename = name

    if patch.project_id is not None:
        # Empty string clears the link; non-empty must match an existing project.
        if patch.project_id == "":
            row.project_id = None
        else:
            if session.get(Project, patch.project_id) is None:
                raise HTTPException(status_code=400, detail="Unknown project_id")
            row.project_id = patch.project_id

    session.add(row)
    session.commit()
    session.refresh(row)
    return extraction_to_record(row)


# ---------------- delete ----------------


@router.delete("/{extraction_id}", status_code=204)
def delete_one(extraction_id: str, session: SessionDep) -> None:
    if not delete_extraction(session, extraction_id):
        raise HTTPException(status_code=404, detail="Extraction not found")
    return None


# ---------------- import (M2.4.5 migration) ----------------


@router.post("/import", response_model=ExtractionRecord, status_code=201)
def import_extraction(payload: ExtractionImport, session: SessionDep) -> ExtractionRecord:
    """Insert a record verbatim from a localStorage migration push.

    Preserves the client's id and timestamp so the migration is idempotent —
    a second push of the same record returns the existing row.
    """
    existing = session.get(Extraction, payload.id)
    if existing is not None:
        # Idempotent: already migrated, just return what we have.
        return extraction_to_record(existing)

    # Frontend records may not carry model_used; default to "imported" so we
    # don't lie about provenance.
    row = persist_extraction(
        session,
        result=payload.payload,
        model_used="imported",
        extraction_id=payload.id,
        created_at=payload.saved_at or datetime.now(timezone.utc),
    )
    return extraction_to_record(row)


# ---------------- gap state ----------------


@router.get("/{extraction_id}/gaps", response_model=list[GapStateRead])
def list_gap_states(extraction_id: str, session: SessionDep) -> list[GapStateRead]:
    if session.get(Extraction, extraction_id) is None:
        raise HTTPException(status_code=404, detail="Extraction not found")
    rows = session.exec(
        select(GapState).where(GapState.extraction_id == extraction_id)
    ).all()
    return [gap_state_to_read(r) for r in rows]


@router.patch("/{extraction_id}/gaps/{gap_idx}", response_model=GapStateRead)
def patch_gap_state(
    extraction_id: str, gap_idx: int, patch: GapStatePatch, session: SessionDep
) -> GapStateRead:
    extraction = session.get(Extraction, extraction_id)
    if extraction is None:
        raise HTTPException(status_code=404, detail="Extraction not found")
    if gap_idx < 0 or gap_idx >= len(extraction.gaps or []):
        raise HTTPException(status_code=400, detail="gap_idx out of range")

    row = session.get(GapState, (extraction_id, gap_idx))
    if row is None:
        row = GapState(extraction_id=extraction_id, gap_idx=gap_idx)

    if patch.resolved is not None:
        row.resolved = patch.resolved
    if patch.ignored is not None:
        row.ignored = patch.ignored
    if patch.asked_at is not None:
        row.asked_at = patch.asked_at
    row.updated_at = datetime.now(timezone.utc)

    session.add(row)
    session.commit()
    session.refresh(row)
    return gap_state_to_read(row)
