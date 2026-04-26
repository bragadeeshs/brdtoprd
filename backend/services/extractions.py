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
from sqlalchemy import update
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
    # Capture the source path BEFORE deleting the row — once the session
    # commits, we lose the field. Cleanup happens after commit so a slow R2
    # delete can't block the DB transaction.
    source_path = row.source_file_path
    # Manually delete gap states — no SA cascade configured (kept the schema simple)
    states = session.exec(
        select(GapState).where(GapState.extraction_id == extraction_id)
    ).all()
    for s in states:
        session.delete(s)
    # Detach usage_log rows so they outlive the extraction. This preserves
    # the cost record by design — losing the extraction shouldn't make
    # you think you spent less than you did. Postgres enforces FKs strictly
    # (unlike SQLite default) so we must NULL the FK before DELETE'ing the
    # extraction or `usage_log_extraction_id_fkey` would fire.
    session.exec(
        update(UsageLog)
        .where(UsageLog.extraction_id == extraction_id)
        .values(extraction_id=None)
    )
    session.delete(row)
    session.commit()
    # Best-effort upload cleanup — both R2 and local cases handled by
    # `remove_upload(path)`. Fail silently; row is already gone.
    remove_upload(source_path)
    # Belt-and-braces: also clean any local-disk per-extraction directory in
    # case the legacy layout existed in parallel (no-op in pure R2 mode).
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
    """Persist an uploaded source file. Returns the value to store in
    `Extraction.source_file_path`.

    M3.9: when `R2_BUCKET` is set, upload to Cloudflare R2 and return
    `r2://<bucket>/<key>`. Otherwise (dev / unset), write to local disk under
    `<UPLOAD_ROOT>/<extraction_id>/<safe_filename>` and return the absolute
    path.
    """
    from services import storage  # local import to avoid cycle

    safe = _safe_filename(filename)

    if storage.is_enabled():
        # Key layout: <extraction_id>/<safe_name>. extraction_id is server-
        # minted (`ext_<base36-ts>_<rand6>`) so it's globally unique and
        # safe to use as a path component. content_type guess is best-effort.
        import mimetypes
        content_type, _ = mimetypes.guess_type(filename)
        key = f"{extraction_id}/{safe}"
        return storage.upload_bytes(key, data, content_type=content_type)

    target_dir = upload_dir_for(extraction_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / safe
    target.write_bytes(data)
    return str(target)


def remove_upload(source_file_path: str | None) -> None:
    """Best-effort cleanup of a persisted source file.

    Branches on the value's shape: R2-style paths go through the storage
    helper, local-style paths fall back to recursive directory removal of
    the per-extraction folder.
    """
    if not source_file_path:
        return
    from services import storage  # local import to avoid cycle

    if storage.is_r2_path(source_file_path):
        storage.delete_path(source_file_path)
        return

    # Local-disk legacy: remove the parent directory (one extraction → one dir).
    try:
        parent = Path(source_file_path).resolve().parent
        if parent.exists() and parent.is_dir():
            shutil.rmtree(parent, ignore_errors=True)
    except Exception as e:  # noqa: BLE001
        log.warning("local upload cleanup failed for %s: %s", source_file_path, e)


def remove_upload_dir(extraction_id: str) -> None:
    """Legacy local-disk cleanup by extraction_id. Kept for callers that
    don't have the source_file_path to hand. R2 cleanup is path-driven and
    must go through `remove_upload(path)`."""
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
    prompt_suffix: str | None = None,
    few_shot_examples: list | None = None,
) -> tuple[ExtractionResult, str, TokenUsage | None]:
    """Run extraction and translate Anthropic errors into HTTPExceptions.

    Returns `(result, model_used, usage)`. `model_used` is "mock" when no key
    was set; `usage` is None for mock calls and populated otherwise so callers
    can persist UsageLog rows (M3.0 instrumentation).

    M7.1: `prompt_suffix` is the user's saved system-prompt override.
    M7.2: `few_shot_examples` is the user's enabled FewShotExample rows.
    Both threaded through to `extract_requirements`; routes resolve them via
    `services.prompts.resolve_prompt_suffix` + `services.few_shot.resolve_enabled_examples`.
    """
    try:
        result, usage = extract_requirements(
            filename, raw_text,
            api_key=api_key, model=model,
            prompt_suffix=prompt_suffix,
            few_shot_examples=few_shot_examples,
        )
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
    cost_cents = compute_cost_cents(model, usage)
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
        cost_cents=cost_cents,
    )
    session.add(row)
    session.commit()
    # M0.3.3 — emit a structured log line per Claude call so usage shows up
    # alongside access logs in Render's pipeline (and Sentry breadcrumbs).
    # Cents → dollars for human-readable scanning. user_id intentionally
    # omitted (PII-ish + the rid in the JSON formatter is enough for trace).
    log.info(
        "usage action=%s model=%s live=%s in=%d out=%d cache_w=%d cache_r=%d cost_usd=%.4f extraction_id=%s",
        action, model, live,
        usage.input_tokens, usage.output_tokens,
        usage.cache_creation_input_tokens, usage.cache_read_input_tokens,
        cost_cents / 100.0,
        extraction_id or "-",
    )


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
