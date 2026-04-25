"""CRUD routes for stored extractions + per-gap state (M2.2 + M3.2 isolation)."""

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

from auth.deps import CurrentUser, current_user
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
from services.byok import resolve_user_byok
from services.extractions import (
    call_claude,
    delete_extraction,
    extraction_to_record,
    extraction_to_summary,
    gap_state_to_read,
    list_versions,
    persist_extraction,
    record_usage,
    root_id_for,
)
from services.scope import apply_scope, in_scope

log = logging.getLogger("storyforge.extractions")
router = APIRouter(prefix="/api/extractions", tags=["extractions"])

SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[CurrentUser, Depends(current_user)]

# Markdown/RST aren't in the platform mimetypes db on every host. Register
# explicitly so /source returns a stable content-type the browser can render.
mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("text/markdown", ".markdown")
mimetypes.add_type("text/x-rst", ".rst")


def _owned_extraction(session: Session, extraction_id: str, user: CurrentUser) -> Extraction:
    """Fetch an extraction, asserting it's in the caller's current scope.

    Returns 404 on miss-or-foreign (whether foreign-user in personal context
    or foreign-org in workspace context) — no existence leak across scopes.
    """
    row = session.get(Extraction, extraction_id)
    if not in_scope(row, user):
        raise HTTPException(status_code=404, detail="Extraction not found")
    return row


# ---------------- list ----------------


@router.get("", response_model=list[ExtractionSummary])
def list_extractions(
    session: SessionDep,
    user: UserDep,
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
    stmt = apply_scope(select(Extraction), Extraction, user)
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
def get_extraction(extraction_id: str, session: SessionDep, user: UserDep) -> ExtractionRecord:
    return extraction_to_record(_owned_extraction(session, extraction_id, user))


# ---------------- patch ----------------


@router.patch("/{extraction_id}", response_model=ExtractionRecord)
def patch_extraction(
    extraction_id: str, patch: ExtractionPatch, session: SessionDep, user: UserDep
) -> ExtractionRecord:
    row = _owned_extraction(session, extraction_id, user)

    if patch.filename is not None:
        name = patch.filename.strip()
        if not name:
            raise HTTPException(status_code=400, detail="filename cannot be empty")
        row.filename = name

    if patch.project_id is not None:
        # Empty string clears the link; non-empty must match a project in
        # the caller's current scope (M3.3 — same workspace).
        if patch.project_id == "":
            row.project_id = None
        else:
            proj = session.get(Project, patch.project_id)
            if not in_scope(proj, user):
                raise HTTPException(status_code=400, detail="Unknown project_id")
            row.project_id = patch.project_id

    session.add(row)
    session.commit()
    session.refresh(row)
    return extraction_to_record(row)


# ---------------- source file (M2.3.2) ----------------


@router.get("/{extraction_id}/source")
def get_source(extraction_id: str, session: SessionDep, user: UserDep) -> FileResponse:
    """Stream the original uploaded file back with its inferred mimetype.

    404 covers four cases (missing row, foreign owner, paste-mode extraction,
    file vanished) — same user-facing answer ("nothing to show").
    """
    row = _owned_extraction(session, extraction_id, user)
    if not row.source_file_path:
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
def delete_one(extraction_id: str, session: SessionDep, user: UserDep) -> None:
    if not delete_extraction(session, extraction_id, user=user):
        raise HTTPException(status_code=404, detail="Extraction not found")
    return None


# ---------------- versioning (M2.6) ----------------


@router.get("/{extraction_id}/versions", response_model=list[ExtractionVersion])
def get_versions(extraction_id: str, session: SessionDep, user: UserDep) -> list[ExtractionVersion]:
    """All versions in the chain this id belongs to that the user owns."""
    versions = list_versions(session, extraction_id, user=user)
    if not versions:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return versions


@router.post("/{extraction_id}/rerun", response_model=ExtractionRecord, status_code=201)
def rerun_extraction(
    extraction_id: str,
    session: SessionDep,
    user: UserDep,
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
    source = _owned_extraction(session, extraction_id, user)

    # M3.4.5: stored BYOK + model fall through when header omitted.
    effective_key, stored_model = resolve_user_byok(session, user.user_id, x_anthropic_key)
    effective_model = x_storyforge_model or stored_model

    result, model_used, usage = call_claude(
        filename=source.filename,
        raw_text=source.raw_text,
        api_key=effective_key,
        model=effective_model,
    )

    row = persist_extraction(
        session,
        result=result,
        model_used=model_used,
        user_id=user.user_id,
        org_id=user.org_id,
        project_id=source.project_id,
        root_id=root_id_for(source),
    )
    record_usage(
        session,
        user_id=user.user_id,
        org_id=user.org_id,
        extraction_id=row.id,
        action="rerun",
        model=model_used,
        live=result.live,
        usage=usage,
    )
    return extraction_to_record(row)


# ---------------- import (M2.4.5 migration) ----------------


@router.post("/import", response_model=ExtractionRecord, status_code=201)
def import_extraction(
    payload: ExtractionImport, session: SessionDep, user: UserDep
) -> ExtractionRecord:
    """Insert a record verbatim from a localStorage migration push.

    Idempotent on `id`: a second push of the same id returns the existing row,
    *but only if it belongs to the current user*. Cross-user id collisions
    return 409 — practically impossible (ids carry 6 random hex chars + ms
    timestamp) but worth being explicit about.
    """
    existing = session.get(Extraction, payload.id)
    if existing is not None:
        if not in_scope(existing, user):
            raise HTTPException(status_code=409, detail="Extraction id collision")
        return extraction_to_record(existing)

    row = persist_extraction(
        session,
        result=payload.payload,
        model_used="imported",
        user_id=user.user_id,
        org_id=user.org_id,
        extraction_id=payload.id,
        created_at=payload.saved_at or datetime.now(timezone.utc),
    )
    return extraction_to_record(row)


# ---------------- gap state ----------------


@router.get("/{extraction_id}/gaps", response_model=list[GapStateRead])
def list_gap_states(extraction_id: str, session: SessionDep, user: UserDep) -> list[GapStateRead]:
    _owned_extraction(session, extraction_id, user)  # 404 if foreign
    rows = session.exec(
        select(GapState).where(GapState.extraction_id == extraction_id)
    ).all()
    return [gap_state_to_read(r) for r in rows]


@router.patch("/{extraction_id}/gaps/{gap_idx}", response_model=GapStateRead)
def patch_gap_state(
    extraction_id: str,
    gap_idx: int,
    patch: GapStatePatch,
    session: SessionDep,
    user: UserDep,
) -> GapStateRead:
    extraction = _owned_extraction(session, extraction_id, user)
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
