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
from db.models import Extraction, FewShotExample, GapState, Project, PromptTemplate, UsageLog, UserSettings
from db.session import get_session
from services.extractions import _mint_id
from services.few_shot import MAX_ENABLED as MAX_FEW_SHOT_ENABLED
from services.scope import in_scope
from models import (
    ExtractionPayload,
    FewShotCaptureRequest,
    FewShotExampleCreate,
    FewShotExamplePatch,
    FewShotExampleRead,
    LegacyAdoptResult,
    LegacyCount,
    PlanRead,
    PromptTemplateCreate,
    PromptTemplatePatch,
    PromptTemplateRead,
    UsageBucket,
    UsageByModel,
    UsageSummary,
    UserSettingsPatch,
    UserSettingsRead,
)
from services.byok import decrypt_secret, encrypt_secret, key_preview
from services.plans import get_plan
from services.scope import apply_scope

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
            prompt_suffix=row.prompt_suffix if row else None,
            updated_at=row.updated_at if row else None,
        )
    plaintext = decrypt_secret(row.anthropic_key_encrypted)
    # Decryption can return None if MASTER_KEY rotated. Treat that as "not set"
    # — the user has to re-enter. Don't crash the read endpoint.
    return UserSettingsRead(
        anthropic_key_set=plaintext is not None,
        anthropic_key_preview=key_preview(plaintext) if plaintext else None,
        model_default=row.model_default,
        prompt_suffix=row.prompt_suffix,
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

    if patch.prompt_suffix is not None:
        # M7.1 — empty string clears the suffix; non-empty saves it.
        # 4000-char cap mirrors the comments cap — well above any real
        # template (a "house style" doc rarely runs over 800 chars) but
        # well below blowing up token cost on every extraction.
        s = patch.prompt_suffix
        if len(s) > 4000:
            raise HTTPException(status_code=400, detail="prompt_suffix too long (max 4000 chars)")
        row.prompt_suffix = s.strip() or None

    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_read(row)


# ============================================================================
# M3.5 — plan + usage-this-period for the sidebar usage bar
# ============================================================================


@router.get("/plan", response_model=PlanRead)
def get_plan_summary(session: SessionDep, user: UserDep) -> PlanRead:
    """Lightweight plan + period-usage snapshot. Drives the sidebar usage
    bar; refetched after every successful extraction so the count stays live.

    Period semantics match `services/limits.enforce_limits`:
      - paid plans → calendar month, resets at first-of-next-month UTC
      - trial      → trial window total, resets at trial_ends_at
    """
    from datetime import timedelta as _td  # local import to avoid top clutter

    settings = session.get(UserSettings, user.user_id)
    plan_id = (settings.plan if settings else None) or "trial"
    plan = get_plan(plan_id)

    now = datetime.now(timezone.utc)
    if plan_id == "trial" and settings and settings.trial_ends_at:
        # SQLite + Postgres TIMESTAMP WITHOUT TIME ZONE return naive datetimes;
        # we always write UTC, so coerce on read.
        ends = settings.trial_ends_at
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=timezone.utc)
        period_start = ends - _td(days=14)
        period_resets_at = ends
    else:
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # First of next month — handle Dec→Jan rollover by hopping a day past month-end.
        next_month = (period_start + _td(days=32)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        period_resets_at = next_month

    used = session.exec(
        apply_scope(
            select(func.count(UsageLog.id)).where(UsageLog.ts >= period_start),
            UsageLog,
            user,
        )
    ).one()

    return PlanRead(
        plan=plan.id,
        plan_name=plan.name,
        extractions_per_period=plan.extractions_per_period,
        usage_in_period=int(used or 0),
        max_input_chars=plan.max_input_chars,
        allowed_models=list(plan.allowed_models),
        upgrade_to=plan.upgrade_to,
        trial_ends_at=settings.trial_ends_at if settings else None,
        period_resets_at=period_resets_at,
        period_label=plan.period_label,
        # M3.6 — surface LSQ subscription state for the Account billing UI
        plan_renews_at=settings.plan_renews_at if settings else None,
        plan_canceled_at=settings.plan_canceled_at if settings else None,
        has_active_subscription=bool(settings and settings.lsq_subscription_id),
    )


# ============================================================================
# M3.8 — usage summary, GDPR data export, legacy-row adoption
# ============================================================================


def _month_start(now: datetime) -> datetime:
    """First instant of the current calendar month, UTC."""
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@router.get("/usage", response_model=UsageSummary)
def get_usage(session: SessionDep, user: UserDep) -> UsageSummary:
    """Aggregated usage stats from `usage_log`, scoped to the caller's
    current context (personal or org)."""
    now = datetime.now(timezone.utc)
    month_start = _month_start(now)

    def _bucket(*, since: datetime | None) -> UsageBucket:
        stmt = apply_scope(
            select(
                func.count(UsageLog.id),
                func.coalesce(func.sum(UsageLog.input_tokens), 0),
                func.coalesce(func.sum(UsageLog.output_tokens), 0),
                func.coalesce(func.sum(UsageLog.cost_cents), 0),
            ),
            UsageLog,
            user,
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
        apply_scope(
            select(
                UsageLog.model,
                func.count(UsageLog.id),
                func.coalesce(func.sum(UsageLog.cost_cents), 0),
            ),
            UsageLog,
            user,
        )
        .group_by(UsageLog.model)
        .order_by(func.sum(UsageLog.cost_cents).desc())
    ).all()

    last_ts = session.exec(
        apply_scope(select(func.max(UsageLog.ts)), UsageLog, user)
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
    extractions = session.exec(apply_scope(select(Extraction), Extraction, user)).all()
    projects = session.exec(apply_scope(select(Project), Project, user)).all()
    usage_logs = session.exec(apply_scope(select(UsageLog), UsageLog, user)).all()
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

        # Original uploads, one folder per extraction id. Branches on storage
        # backend: R2-stored sources are downloaded once and inlined into the
        # zip; local-disk sources are added directly. Failures are non-fatal —
        # we'd rather ship a partial export than fail the whole download.
        from services import storage  # local import to keep boto3 off non-export paths
        for e in extractions:
            if not e.source_file_path:
                continue
            if storage.is_r2_path(e.source_file_path):
                try:
                    bucket_, key = storage.parse_r2_path(e.source_file_path)
                    obj = storage._client().get_object(Bucket=bucket_, Key=key)
                    body = obj["Body"].read()
                    zf.writestr(f"uploads/{e.id}/{Path(key).name}", body)
                except Exception as ex:  # noqa: BLE001
                    log.warning("R2 export fetch failed for %s: %s", e.id, ex)
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


# ============================================================================
# M7.2 — Few-shot examples (input → expected-output pairs)
# ============================================================================
#
# CRUD + a capture-from-extraction shortcut. Examples are owned by the
# calling user (no org-shared in v1; M7.2.b deferred). The active set
# (enabled=True) is capped at MAX_FEW_SHOT_ENABLED to keep token cost
# bounded; the activate path enforces the cap and returns 400 over-limit.
#
# `expected_payload` is validated against ExtractionPayload at write time
# (Pydantic does it via the FewShotExampleCreate / Patch types). We don't
# re-validate on read — the table column is JSON, and the round-trip
# through Pydantic on GET would be wasted CPU on a hot path.


def _to_few_shot_read(row: FewShotExample) -> FewShotExampleRead:
    return FewShotExampleRead(
        id=row.id,
        name=row.name,
        input_text=row.input_text,
        expected_payload=ExtractionPayload(**row.expected_payload),
        enabled=row.enabled,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _enabled_count(session: Session, user_id: str) -> int:
    return session.exec(
        select(func.count())
        .select_from(FewShotExample)
        .where(FewShotExample.user_id == user_id)
        .where(FewShotExample.enabled == True)  # noqa: E712
    ).one()


@router.get("/few-shot-examples", response_model=list[FewShotExampleRead])
def list_few_shot_examples(session: SessionDep, user: UserDep) -> list[FewShotExampleRead]:
    """List all of the user's examples (enabled + disabled), oldest first.
    The order matches what the extractor sees so the user can predict
    which examples ship with their next extraction."""
    rows = session.exec(
        select(FewShotExample)
        .where(FewShotExample.user_id == user.user_id)
        .order_by(FewShotExample.created_at.asc())
    ).all()
    return [_to_few_shot_read(r) for r in rows]


@router.post("/few-shot-examples", response_model=FewShotExampleRead, status_code=201)
def create_few_shot_example(
    payload: FewShotExampleCreate, session: SessionDep, user: UserDep
) -> FewShotExampleRead:
    """Create a new example. If `enabled=True` would push the active count
    over MAX_FEW_SHOT_ENABLED, save it disabled instead — caller gets a 400
    with a hint. Friendlier than rejecting the whole write outright."""
    if payload.enabled and _enabled_count(session, user.user_id) >= MAX_FEW_SHOT_ENABLED:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_FEW_SHOT_ENABLED} enabled examples — disable one first.",
        )
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name cannot be empty")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="name too long (max 100 chars)")

    row = FewShotExample(
        id=_mint_id("fse"),
        user_id=user.user_id,
        org_id=None,           # v1: user-scope only (M7.2.b)
        name=name,
        input_text=payload.input_text,
        expected_payload=payload.expected_payload.model_dump(),
        enabled=payload.enabled,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_few_shot_read(row)


@router.post(
    "/few-shot-examples/from-extraction",
    response_model=FewShotExampleRead, status_code=201,
)
def capture_few_shot_from_extraction(
    payload: FewShotCaptureRequest, session: SessionDep, user: UserDep
) -> FewShotExampleRead:
    """Capture the named extraction's current state as a new example.
    The PRIMARY UX path — most users won't author the JSON by hand, they'll
    extract → edit (M4.1) → click "Save as example" → done."""
    extraction = session.get(Extraction, payload.extraction_id)
    if not in_scope(extraction, user):
        raise HTTPException(status_code=404, detail="Extraction not found")

    if payload.enabled and _enabled_count(session, user.user_id) >= MAX_FEW_SHOT_ENABLED:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {MAX_FEW_SHOT_ENABLED} enabled examples — disable one first.",
        )
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name cannot be empty")

    row = FewShotExample(
        id=_mint_id("fse"),
        user_id=user.user_id,
        org_id=None,
        name=name,
        input_text=extraction.raw_text or "",
        expected_payload={
            "brief": extraction.brief or {"summary": "", "tags": []},
            "actors": extraction.actors or [],
            "stories": extraction.stories or [],
            "nfrs": extraction.nfrs or [],
            "gaps": extraction.gaps or [],
        },
        enabled=payload.enabled,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_few_shot_read(row)


@router.patch("/few-shot-examples/{example_id}", response_model=FewShotExampleRead)
def patch_few_shot_example(
    example_id: str, patch: FewShotExamplePatch, session: SessionDep, user: UserDep
) -> FewShotExampleRead:
    row = session.get(FewShotExample, example_id)
    if row is None or row.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Example not found")

    # Cap check only fires when transitioning False → True. Every other
    # patch (rename, edit body) skips it.
    if patch.enabled is True and not row.enabled:
        if _enabled_count(session, user.user_id) >= MAX_FEW_SHOT_ENABLED:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {MAX_FEW_SHOT_ENABLED} enabled examples — disable one first.",
            )

    if patch.name is not None:
        n = patch.name.strip()
        if not n:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        if len(n) > 100:
            raise HTTPException(status_code=400, detail="name too long (max 100 chars)")
        row.name = n
    if patch.input_text is not None:
        row.input_text = patch.input_text
    if patch.expected_payload is not None:
        row.expected_payload = patch.expected_payload.model_dump()
    if patch.enabled is not None:
        row.enabled = patch.enabled
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_few_shot_read(row)


@router.delete("/few-shot-examples/{example_id}", status_code=204)
def delete_few_shot_example(example_id: str, session: SessionDep, user: UserDep) -> None:
    row = session.get(FewShotExample, example_id)
    if row is None or row.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Example not found")
    session.delete(row)
    session.commit()


# ============================================================================
# M7.1.b — Multiple named prompt templates
# ============================================================================
#
# Replaces M7.1's single `user_settings.prompt_suffix` slot with multiple-
# named-templates-per-user. Resolver in services/prompts.py picks the active
# row first, falls back to org-scoped active (M7.1.c) then to legacy suffix.
#
# Activation invariant: at most one row per (user_id, org_id) is is_active=True.
# The activate path flips the previous active off in the same transaction.


def _to_template_read(row: PromptTemplate) -> PromptTemplateRead:
    return PromptTemplateRead(
        id=row.id,
        name=row.name,
        content=row.content,
        is_active=row.is_active,
        org_id=row.org_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _deactivate_others(
    session: Session, user_id: str, org_id: str | None, except_id: str | None = None
) -> None:
    """Flip the previously-active template (if any) to inactive. Scoped to
    (user_id, org_id) so org-shared and personal active states are
    independent. Caller is responsible for committing."""
    stmt = (
        select(PromptTemplate)
        .where(PromptTemplate.user_id == user_id)
        .where(PromptTemplate.is_active == True)  # noqa: E712
    )
    # NULL == NULL doesn't match in SQL; use is_() / equality split.
    if org_id is None:
        stmt = stmt.where(PromptTemplate.org_id.is_(None))   # type: ignore[union-attr]
    else:
        stmt = stmt.where(PromptTemplate.org_id == org_id)
    for row in session.exec(stmt).all():
        if except_id is not None and row.id == except_id:
            continue
        row.is_active = False
        row.updated_at = datetime.now(timezone.utc)
        session.add(row)


@router.get("/prompt-templates", response_model=list[PromptTemplateRead])
def list_prompt_templates(session: SessionDep, user: UserDep) -> list[PromptTemplateRead]:
    """List the user's templates plus any org-scoped templates visible to
    this scope. Active templates appear first, then by created_at.

    Org-scope rule (M7.1.c): a template with org_id set is visible to
    every member of that org; a template with org_id=NULL is personal."""
    user_rows = session.exec(
        select(PromptTemplate)
        .where(PromptTemplate.user_id == user.user_id)
        .where(PromptTemplate.org_id.is_(None))  # type: ignore[union-attr]
    ).all()
    org_rows: list[PromptTemplate] = []
    if user.org_id:
        org_rows = session.exec(
            select(PromptTemplate)
            .where(PromptTemplate.org_id == user.org_id)
        ).all()
    rows = list(user_rows) + list(org_rows)
    rows.sort(key=lambda r: (not r.is_active, r.created_at))
    return [_to_template_read(r) for r in rows]


@router.post("/prompt-templates", response_model=PromptTemplateRead, status_code=201)
def create_prompt_template(
    payload: PromptTemplateCreate, session: SessionDep, user: UserDep
) -> PromptTemplateRead:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name cannot be empty")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="name too long (max 100 chars)")
    if len(payload.content) > 4000:
        raise HTTPException(status_code=400, detail="content too long (max 4000 chars)")

    # M7.1.c: org_id must match the caller's active org if set. Stops a
    # user from creating templates "for" an org they're not in (or from
    # outside any org).
    if payload.org_id is not None and payload.org_id != user.org_id:
        raise HTTPException(
            status_code=400,
            detail="org_id must match your active org context.",
        )

    if payload.is_active:
        _deactivate_others(session, user.user_id, payload.org_id)

    row = PromptTemplate(
        id=_mint_id("tpl"),
        user_id=user.user_id,
        org_id=payload.org_id,
        name=name,
        content=payload.content,
        is_active=payload.is_active,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_template_read(row)


@router.patch("/prompt-templates/{template_id}", response_model=PromptTemplateRead)
def patch_prompt_template(
    template_id: str, patch: PromptTemplatePatch, session: SessionDep, user: UserDep
) -> PromptTemplateRead:
    row = session.get(PromptTemplate, template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")

    # Permission: own row, OR org-shared row in your active org. Last condition
    # is permissive — any org member can edit org-shared templates in v1.
    # Tighten to org_role=admin once we surface it.
    is_own = row.user_id == user.user_id and row.org_id is None
    is_org_visible = row.org_id is not None and row.org_id == user.org_id
    if not (is_own or is_org_visible):
        raise HTTPException(status_code=404, detail="Template not found")

    if patch.name is not None:
        n = patch.name.strip()
        if not n:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        if len(n) > 100:
            raise HTTPException(status_code=400, detail="name too long (max 100 chars)")
        row.name = n
    if patch.content is not None:
        if len(patch.content) > 4000:
            raise HTTPException(status_code=400, detail="content too long (max 4000 chars)")
        row.content = patch.content

    if patch.is_active is True and not row.is_active:
        _deactivate_others(session, row.user_id, row.org_id, except_id=row.id)
        row.is_active = True
    elif patch.is_active is False and row.is_active:
        row.is_active = False

    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _to_template_read(row)


@router.delete("/prompt-templates/{template_id}", status_code=204)
def delete_prompt_template(template_id: str, session: SessionDep, user: UserDep) -> None:
    row = session.get(PromptTemplate, template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Template not found")
    is_own = row.user_id == user.user_id and row.org_id is None
    is_org_visible = row.org_id is not None and row.org_id == user.org_id
    if not (is_own or is_org_visible):
        raise HTTPException(status_code=404, detail="Template not found")
    session.delete(row)
    session.commit()
