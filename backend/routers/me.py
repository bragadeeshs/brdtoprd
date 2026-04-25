"""Per-user settings — `/api/me/*` (M3.4.4).

Today: BYOK Anthropic key + model preference. Future homes for usage summary,
profile mirror from Clerk, etc. Naming: `me` (not `users`) because everything
under here is implicitly the calling user — no path params needed.
"""

from __future__ import annotations

import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlmodel import Session, select

from auth.deps import CurrentUser, current_user
from db.models import Extraction, GapState, Project, UsageLog, UserSettings
from db.session import get_session
from models import (
    LegacyAdoptResult,
    LegacyCount,
    UsageBucket,
    UsageByModel,
    UsageSummary,
    UserSettingsPatch,
    UserSettingsRead,
)
from services.byok import decrypt_secret, encrypt_secret, key_preview

log = logging.getLogger("storyforge.me")

router = APIRouter(prefix="/api/me", tags=["me"])

SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[CurrentUser, Depends(current_user)]


def _to_read(row: UserSettings | None) -> UserSettingsRead:
    if row is None or not row.anthropic_key_encrypted:
        return UserSettingsRead(
            anthropic_key_set=False,
            anthropic_key_preview=None,
            model_default=row.model_default if row else None,
            updated_at=row.updated_at if row else None,
        )
    plaintext = decrypt_secret(row.anthropic_key_encrypted)
    # Decryption can return None if MASTER_KEY rotated. Treat that as "not set"
    # — the user has to re-enter. Don't crash the read endpoint.
    return UserSettingsRead(
        anthropic_key_set=plaintext is not None,
        anthropic_key_preview=key_preview(plaintext) if plaintext else None,
        model_default=row.model_default,
        updated_at=row.updated_at,
    )


@router.get("/settings", response_model=UserSettingsRead)
def get_settings(session: SessionDep, user: UserDep) -> UserSettingsRead:
    return _to_read(session.get(UserSettings, user.user_id))


@router.put("/settings", response_model=UserSettingsRead)
def put_settings(
    patch: UserSettingsPatch, session: SessionDep, user: UserDep
) -> UserSettingsRead:
    """Update saved settings. Field semantics:

    - `None` → no change (omitted-from-body case)
    - `""`   → clear (set NULL on the DB column)
    - any other string → set (encrypted via Fernet for the API key)
    """
    row = session.get(UserSettings, user.user_id)
    if row is None:
        row = UserSettings(user_id=user.user_id)

    if patch.anthropic_key is not None:
        if patch.anthropic_key == "":
            row.anthropic_key_encrypted = None
        else:
            # Strip whitespace — users often paste with trailing newline/space.
            cleaned = patch.anthropic_key.strip()
            if not cleaned:
                raise HTTPException(status_code=400, detail="anthropic_key cannot be whitespace")
            row.anthropic_key_encrypted = encrypt_secret(cleaned)

    if patch.model_default is not None:
        row.model_default = patch.model_default.strip() or None

    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


# ============================================================================
# M3.8 — usage summary, GDPR data export, legacy-row adoption
# ============================================================================


def _month_start(now: datetime) -> datetime:
    """First instant of the current calendar month, UTC."""
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@router.get("/usage", response_model=UsageSummary)
def get_usage(session: SessionDep, user: UserDep) -> UsageSummary:
    """Aggregated usage stats from `usage_log`. Drives the Account-page card."""
    now = datetime.now(timezone.utc)
    month_start = _month_start(now)

    def _bucket(*, since: datetime | None) -> UsageBucket:
        stmt = (
            select(
                func.count(UsageLog.id),
                func.coalesce(func.sum(UsageLog.input_tokens), 0),
                func.coalesce(func.sum(UsageLog.output_tokens), 0),
                func.coalesce(func.sum(UsageLog.cost_cents), 0),
            )
            .where(UsageLog.user_id == user.user_id)
        )
        if since is not None:
            stmt = stmt.where(UsageLog.ts >= since)
        row = session.exec(stmt).one()
        return UsageBucket(
            calls=int(row[0] or 0),
            input_tokens=int(row[1] or 0),
            output_tokens=int(row[2] or 0),
            cost_cents=int(row[3] or 0),
        )

    by_model_rows = session.exec(
        select(
            UsageLog.model,
            func.count(UsageLog.id),
            func.coalesce(func.sum(UsageLog.cost_cents), 0),
        )
        .where(UsageLog.user_id == user.user_id)
        .group_by(UsageLog.model)
        .order_by(func.sum(UsageLog.cost_cents).desc())
    ).all()

    last_ts = session.exec(
        select(func.max(UsageLog.ts)).where(UsageLog.user_id == user.user_id)
    ).one()

    return UsageSummary(
        this_month=_bucket(since=month_start),
        all_time=_bucket(since=None),
        by_model=[
            UsageByModel(model=r[0], calls=int(r[1] or 0), cost_cents=int(r[2] or 0))
            for r in by_model_rows
        ],
        last_extraction_at=last_ts,
    )


# ----- legacy adoption (M3.2 cleanup) -----


@router.get("/legacy", response_model=LegacyCount)
def count_legacy(session: SessionDep, user: UserDep) -> LegacyCount:
    """Count `user_id='local'` rows still in the DB. UI uses this to decide
    whether to show the 'adopt my orphan dev data' button."""
    return LegacyCount(
        extractions=int(session.exec(
            select(func.count(Extraction.id)).where(Extraction.user_id == "local")
        ).one() or 0),
        projects=int(session.exec(
            select(func.count(Project.id)).where(Project.user_id == "local")
        ).one() or 0),
        usage_logs=int(session.exec(
            select(func.count(UsageLog.id)).where(UsageLog.user_id == "local")
        ).one() or 0),
    )


@router.post("/legacy/adopt", response_model=LegacyAdoptResult)
def adopt_legacy(session: SessionDep, user: UserDep) -> LegacyAdoptResult:
    """Reassign every `user_id='local'` row to the calling user. One-shot —
    once you've adopted, there's nothing left for anyone else to claim.

    Caveat the UI surfaces: this is a free-for-all by design. If two users
    both have legacy data they want, only the first one to click wins. In
    practice 'local' rows only exist on dev installs that ran pre-M3.2.
    """
    extractions = session.exec(
        select(Extraction).where(Extraction.user_id == "local")
    ).all()
    for e in extractions:
        e.user_id = user.user_id
        session.add(e)

    projects = session.exec(
        select(Project).where(Project.user_id == "local")
    ).all()
    for p in projects:
        p.user_id = user.user_id
        session.add(p)

    usage_logs = session.exec(
        select(UsageLog).where(UsageLog.user_id == "local")
    ).all()
    for u in usage_logs:
        u.user_id = user.user_id
        session.add(u)

    session.commit()
    log.info(
        "user %s adopted %d extractions / %d projects / %d usage_logs from 'local'",
        user.user_id, len(extractions), len(projects), len(usage_logs),
    )
    return LegacyAdoptResult(
        adopted_extractions=len(extractions),
        adopted_projects=len(projects),
        adopted_usage_logs=len(usage_logs),
    )


# ----- GDPR export (M3.8.3) -----


def _serialise(row) -> dict:
    """SQLModel row → JSON-safe dict (datetimes ISO-stringified)."""
    out = {}
    for k, v in row.model_dump().items():
        out[k] = v.isoformat() if isinstance(v, datetime) else v
    return out


@router.get("/export")
def export_user_data(session: SessionDep, user: UserDep) -> StreamingResponse:
    """Build an in-memory ZIP of everything we have for this user, stream it back.

    Layout:
      storyforge-export-<user_id>-<date>.zip
        ├── extractions.json
        ├── projects.json
        ├── usage_log.json
        ├── gap_state.json
        ├── user_settings.json   (encrypted key kept opaque — not decrypted on export)
        ├── README.md
        └── uploads/<extraction_id>/<filename>   (only if a source file was saved)
    """
    extractions = session.exec(
        select(Extraction).where(Extraction.user_id == user.user_id)
    ).all()
    projects = session.exec(
        select(Project).where(Project.user_id == user.user_id)
    ).all()
    usage_logs = session.exec(
        select(UsageLog).where(UsageLog.user_id == user.user_id)
    ).all()
    extraction_ids = [e.id for e in extractions]
    gap_states = (
        session.exec(
            select(GapState).where(GapState.extraction_id.in_(extraction_ids))
        ).all()
        if extraction_ids
        else []
    )
    settings_row = session.get(UserSettings, user.user_id)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("extractions.json", json.dumps([_serialise(e) for e in extractions], indent=2))
        zf.writestr("projects.json", json.dumps([_serialise(p) for p in projects], indent=2))
        zf.writestr("usage_log.json", json.dumps([_serialise(u) for u in usage_logs], indent=2))
        zf.writestr("gap_state.json", json.dumps([_serialise(g) for g in gap_states], indent=2))
        if settings_row is not None:
            zf.writestr("user_settings.json", json.dumps(_serialise(settings_row), indent=2))
        zf.writestr(
            "README.md",
            f"# StoryForge data export\n\n"
            f"Exported: {datetime.now(timezone.utc).isoformat()}\n"
            f"User id: {user.user_id}\n"
            f"Counts: {len(extractions)} extractions · {len(projects)} projects · "
            f"{len(usage_logs)} usage rows · {len(gap_states)} gap states\n\n"
            f"Files:\n"
            f"- `extractions.json` — full payload (brief / actors / stories / nfrs / gaps) per row\n"
            f"- `projects.json` — projects you created\n"
            f"- `usage_log.json` — every Claude call billed to you, with token + cost\n"
            f"- `gap_state.json` — your resolve/ignore/asked-at marks on individual gaps\n"
            f"- `user_settings.json` — model preference. The Anthropic key is shown as ciphertext "
            f"because we never decrypt it for export — it stays opaque outside the running server.\n"
            f"- `uploads/` — original uploaded source files (PDF/.docx/.txt) that backed each extraction\n",
        )

        # Original uploads, one folder per extraction id.
        for e in extractions:
            if not e.source_file_path:
                continue
            p = Path(e.source_file_path)
            if not p.exists():
                continue
            zf.write(p, arcname=f"uploads/{e.id}/{p.name}")

    buf.seek(0)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fname = f"storyforge-export-{user.user_id}-{today}.zip"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )
