"""CRUD routes for stored extractions + per-gap state (M2.2)."""

from __future__ import annotations

import logging
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import func, or_
from sqlmodel import Session, select

from db.models import Extraction, GapState, Project
from db.session import get_session
from models import (
    ExtractionImport,
    ExtractionPatch,
    ExtractionRecord,
    ExtractionRerunRequest,
    ExtractionSummary,
    ExtractionVersion,
    GapStatePatch,
    GapStateRead,
)
from services.extractions import (
    call_claude,
    delete_extraction,
    extraction_to_record,
    extraction_to_summary,
    gap_state_to_read,
    list_versions,
    persist_extraction,
    root_id_for,
)

log = logging.getLogger("storyforge.extractions")
router = APIRouter(prefix="/api/extractions", tags=["extractions"])

SessionDep = Annotated[Session, Depends(get_session)]

# Markdown/RST aren't in the platform mimetypes db on every host. Register
# explicitly so /source returns a stable content-type the browser can render.
mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("text/markdown", ".markdown")
mimetypes.add_type("text/x-rst", ".rst")


# ---------------- list ----------------


@router.get("", response_model=list[ExtractionSummary])
def list_extractions(
    session: SessionDep,
    q: str | None = Query(default=None, description="Substring match on filename or brief.summary (case-insensitive)"),
    project_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[ExtractionSummary]:
    """List extractions, newest first. Lightweight rows for the Documents view.

    Search is case-insensitive substring across filename + the brief's summary
    (extracted via SQLite's `json_extract`). Tag search is intentionally left
    out — JSON-array LIKE in SQLite is fiddly; we'll add proper tag indexing
    if it shows up in usage.
    """
    stmt = select(Extraction)
    if project_id:
        stmt = stmt.where(Extraction.project_id == project_id)
    if q:
        needle = f"%{q.strip().lower()}%"
        summary_expr = func.json_extract(Extraction.brief, "$.summary")
        stmt = stmt.where(
            or_(
                func.lower(Extraction.filename).like(needle),
                func.lower(summary_expr).like(needle),
            )
        )
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


# ---------------- source file (M2.3.2) ----------------


@router.get("/{extraction_id}/source")
def get_source(extraction_id: str, session: SessionDep) -> FileResponse:
    """Stream the original uploaded file back with its inferred mimetype.

    404 covers three real cases: row missing, paste-mode extraction (no upload),
    or upload file deleted out from under us. We don't differentiate — the
    user-facing answer is the same ("nothing to show").
    """
    row = session.get(Extraction, extraction_id)
    if row is None or not row.source_file_path:
        raise HTTPException(status_code=404, detail="No source file for this extraction")
    path = Path(row.source_file_path)
    if not path.exists():
        log.warning("source_file_path missing on disk: %s", path)
        raise HTTPException(status_code=404, detail="Source file is missing on disk")
    media_type, _ = mimetypes.guess_type(row.filename)
    return FileResponse(
        path,
        media_type=media_type or "application/octet-stream",
        filename=row.filename,
    )


# ---------------- delete ----------------


@router.delete("/{extraction_id}", status_code=204)
def delete_one(extraction_id: str, session: SessionDep) -> None:
    if not delete_extraction(session, extraction_id):
        raise HTTPException(status_code=404, detail="Extraction not found")
    return None


# ---------------- versioning (M2.6) ----------------


@router.get("/{extraction_id}/versions", response_model=list[ExtractionVersion])
def get_versions(extraction_id: str, session: SessionDep) -> list[ExtractionVersion]:
    """All versions in the chain this id belongs to. 1-indexed, oldest first."""
    versions = list_versions(session, extraction_id)
    if not versions:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return versions


@router.post("/{extraction_id}/rerun", response_model=ExtractionRecord, status_code=201)
def rerun_extraction(
    extraction_id: str,
    session: SessionDep,
    _payload: ExtractionRerunRequest | None = None,
    x_anthropic_key: str | None = Header(default=None, alias="X-Anthropic-Key"),
    x_storyforge_model: str | None = Header(default=None, alias="X-Storyforge-Model"),
) -> ExtractionRecord:
    """Re-extract the same source document, creating a new linked version.

    The new row inherits filename, raw_text, and project_id from the source,
    but uses the current request's API key + model — so users can re-run with
    a different model and compare. `root_id` always points at the v1 (star
    topology), so a re-run of a re-run still rolls up to the same root.
    """
    source = session.get(Extraction, extraction_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Extraction not found")

    result, model_used = call_claude(
        filename=source.filename,
        raw_text=source.raw_text,
        api_key=x_anthropic_key,
        model=x_storyforge_model,
    )

    row = persist_extraction(
        session,
        result=result,
        model_used=model_used,
        project_id=source.project_id,
        root_id=root_id_for(source),
    )
    return extraction_to_record(row)


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
