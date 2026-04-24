"""Persistence helpers for extractions and projects (M2.2).

Two responsibilities:
  * id minting in the same `<prefix>_<base36-ts>_<rand6>` shape the frontend
    uses, so localStorage records can migrate 1:1 (M2.4.5)
  * Pydantic <-> SQLModel conversion so the route layer never touches raw rows
"""

from __future__ import annotations

import os
import re
import secrets
import shutil
from datetime import datetime, timezone
from pathlib import Path

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

UPLOAD_ROOT = Path(
    os.environ.get(
        "STORYFORGE_UPLOAD_DIR",
        str(Path(__file__).resolve().parent.parent / "uploads"),
    )
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
    source_file_path: str | None = None,
) -> Extraction:
    """Insert one Extraction row from a fresh ExtractionResult (or import)."""
    row = Extraction(
        id=extraction_id or mint_extraction_id(),
        filename=result.filename,
        raw_text=result.raw_text,
        model_used=model_used,
        live=result.live,
        project_id=project_id,
        source_file_path=source_file_path,
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
    """Delete extraction + cascade its gap states + remove uploaded source.

    Returns True if it existed.
    """
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
    # Best-effort upload cleanup. Fail silently — losing the file isn't worth
    # blocking the delete, and the row is already gone.
    remove_upload_dir(extraction_id)
    return True


# ---------- uploads (M2.3) ----------

# Strip path separators, control chars, and leading dots. Keep dots in extensions.
_UNSAFE_NAME = re.compile(r"[^A-Za-z0-9._\- ]")


def _safe_filename(filename: str) -> str:
    """Sanitize a user-supplied filename for on-disk storage.

    Strips path separators and control chars; collapses to "uploaded" when the
    result would be empty. The raw filename is still echoed back to the user
    via `Extraction.filename`; this is purely for the path on disk.
    """
    base = Path(filename).name  # drops any "../" the client might send
    cleaned = _UNSAFE_NAME.sub("_", base).strip(" .") or "uploaded"
    return cleaned[:200]  # keep paths under most filesystem limits


def upload_dir_for(extraction_id: str) -> Path:
    """Resolve the per-extraction upload directory, ensuring it stays under root."""
    candidate = (UPLOAD_ROOT / extraction_id).resolve()
    root = UPLOAD_ROOT.resolve()
    # Defensive: extraction_id is server-minted (`ext_<base36>_<rand6>`), but
    # belt-and-braces against a path-traversal id sneaking in via /import.
    if not str(candidate).startswith(str(root) + os.sep) and candidate != root:
        raise ValueError(f"refusing to write outside upload root: {candidate}")
    return candidate


def save_upload(extraction_id: str, filename: str, data: bytes) -> str:
    """Write bytes to `<UPLOAD_ROOT>/<extraction_id>/<safe_filename>`.

    Returns the absolute path (which is what `Extraction.source_file_path` stores).
    Overwrites any existing file at the same path — re-running an extraction with
    the same filename shouldn't double-store.
    """
    safe = _safe_filename(filename)
    target_dir = upload_dir_for(extraction_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / safe
    target.write_bytes(data)
    return str(target)


def remove_upload_dir(extraction_id: str) -> None:
    """Recursively remove the per-extraction upload directory if it exists."""
    try:
        target = upload_dir_for(extraction_id)
    except ValueError:
        return
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)


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
