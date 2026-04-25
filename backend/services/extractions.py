"""Persistence helpers for extractions and projects (M2.2).

Two responsibilities:
  * id minting in the same `<prefix>_<base36-ts>_<rand6>` shape the frontend
    uses, so localStorage records can migrate 1:1 (M2.4.5)
  * Pydantic <-> SQLModel conversion so the route layer never touches raw rows
"""

from __future__ import annotations

import logging
import os
import re
import secrets
import shutil
from datetime import datetime, timezone
from pathlib import Path

import anthropic
from fastapi import HTTPException
from sqlmodel import Session, select

from db.models import Extraction, GapState, Project, UsageLog
from extract import extract_requirements, resolve_model
from models import (
    ExtractionPayload,
    ExtractionRecord,
    ExtractionResult,
    ExtractionSummary,
    ExtractionVersion,
    GapStateRead,
    ProjectRead,
)
from services.cost import TokenUsage, compute_cost_cents

log = logging.getLogger("storyforge.services")

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
        root_id=row.root_id,
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
        root_id=row.root_id,
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
    user_id: str = "local",
    org_id: str | None = None,
    project_id: str | None = None,
    extraction_id: str | None = None,
    created_at: datetime | None = None,
    source_file_path: str | None = None,
    root_id: str | None = None,
) -> Extraction:
    """Insert one Extraction row from a fresh ExtractionResult (or import).

    `org_id` is the *workspace* the row belongs to (M3.3) — None for personal-
    context calls. `user_id` records the *creator* either way.
    """
    row = Extraction(
        id=extraction_id or mint_extraction_id(),
        filename=result.filename,
        raw_text=result.raw_text,
        model_used=model_used,
        live=result.live,
        user_id=user_id,
        org_id=org_id,
        project_id=project_id,
        source_file_path=source_file_path,
        root_id=root_id,
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


# ---------- versioning (M2.6) ----------


def root_id_for(row: Extraction) -> str:
    """The id of the original v1 in this row's version chain.

    For a v1 row (root), returns its own id. For a re-run, returns `root_id`.
    Centralised so callers don't have to reproduce the null-check each time.
    """
    return row.root_id or row.id


def list_versions(session: Session, extraction_id: str, *, user) -> list[ExtractionVersion]:
    """All versions of the doc this id belongs to that the caller can see.

    Scope rules from `services.scope.in_scope` apply: in personal context the
    chain is filtered to (user_id, org_id IS NULL); in org context to org_id.
    Returns [] both for missing id and for foreign owner — same response, no
    existence leak.
    """
    from services.scope import apply_scope, in_scope  # local import to avoid cycle

    anchor = session.get(Extraction, extraction_id)
    if not in_scope(anchor, user):
        return []
    root = root_id_for(anchor)
    stmt = (
        apply_scope(select(Extraction), Extraction, user)
        .where((Extraction.id == root) | (Extraction.root_id == root))
        .order_by(Extraction.created_at.asc())
    )
    rows = session.exec(stmt).all()
    return [
        ExtractionVersion(
            id=r.id,
            version=i + 1,
            created_at=r.created_at,
            model_used=r.model_used,
            live=r.live,
        )
        for i, r in enumerate(rows)
    ]


def delete_extraction(session: Session, extraction_id: str, *, user) -> bool:
    """Delete extraction + cascade its gap states + remove uploaded source.

    Returns True if the row existed AND was in the caller's current scope
    (M3.3: user vs org). 404 vs 403 stays indistinguishable.
    """
    from services.scope import in_scope  # local import to avoid cycle

    row = session.get(Extraction, extraction_id)
    if not in_scope(row, user):
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


# ---------- LLM call wrapper ----------


def call_claude(
    *,
    filename: str,
    raw_text: str,
    api_key: str | None,
    model: str | None,
) -> tuple[ExtractionResult, str, TokenUsage | None]:
    """Run extraction and translate Anthropic errors into HTTPExceptions.

    Returns `(result, model_used, usage)`. `model_used` is "mock" when no key
    was set; `usage` is None for mock calls and populated otherwise so callers
    can persist UsageLog rows (M3.0 instrumentation).
    """
    try:
        result, usage = extract_requirements(filename, raw_text, api_key=api_key, model=model)
    except anthropic.AuthenticationError:
        log.warning("anthropic authentication failed")
        detail = (
            "Invalid Anthropic API key from request. Update the key in Settings."
            if api_key
            else "Invalid ANTHROPIC_API_KEY in server env. Check backend/.env and restart."
        )
        raise HTTPException(status_code=401, detail=detail)
    except anthropic.RateLimitError as e:
        retry_after = e.response.headers.get("retry-after", "60") if e.response else "60"
        log.warning("anthropic rate limit hit; retry after %ss", retry_after)
        raise HTTPException(
            status_code=429,
            detail=f"Anthropic rate limit hit. Retry after ~{retry_after}s.",
        )
    except anthropic.BadRequestError as e:
        log.warning("anthropic bad request: %s", e.message)
        raise HTTPException(status_code=400, detail=f"Claude rejected the request: {e.message}")
    except anthropic.APIConnectionError:
        log.exception("anthropic connection error")
        raise HTTPException(status_code=503, detail="Could not reach Anthropic API. Check your network.")
    except anthropic.APIStatusError as e:
        log.exception("anthropic API error %s", e.status_code)
        raise HTTPException(
            status_code=502,
            detail=f"Anthropic API error ({e.status_code}): {e.message}",
        )
    except Exception as e:
        log.exception("extraction failed")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")

    model_used = resolve_model(model) if result.live else "mock"
    return result, model_used, usage


def record_usage(
    session: Session,
    *,
    user_id: str,
    org_id: str | None,
    extraction_id: str | None,
    action: str,
    model: str,
    live: bool,
    usage: TokenUsage | None,
) -> None:
    """Insert a UsageLog row. Mock calls are still logged (cost=0) so call
    counts stay accurate. `org_id` records the workspace context — None for
    personal-context calls — so org-level billing is one query."""
    if usage is None:
        usage = TokenUsage()
    row = UsageLog(
        user_id=user_id,
        org_id=org_id,
        extraction_id=extraction_id,
        action=action,
        model=model,
        live=live,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_creation_input_tokens=usage.cache_creation_input_tokens,
        cache_read_input_tokens=usage.cache_read_input_tokens,
        cost_cents=compute_cost_cents(model, usage),
    )
    session.add(row)
    session.commit()


# ---------- projects ----------


def project_to_read(row: Project, *, extraction_count: int = 0) -> ProjectRead:
    return ProjectRead(
        id=row.id,
        name=row.name,
        created_at=row.created_at,
        extraction_count=extraction_count,
    )


def count_extractions_for_project(session: Session, project_id: str, *, user) -> int:
    """Count extractions in a project visible under the caller's scope."""
    from services.scope import apply_scope  # local import to avoid cycle

    stmt = apply_scope(select(Extraction.id), Extraction, user).where(
        Extraction.project_id == project_id
    )
    return len(session.exec(stmt).all())
