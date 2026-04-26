"""API token management routes (M6.7).

Owner-only CRUD for the calling user's tokens. Tokens scope to the user
+ the active org context at create time — see `db.models.ApiToken` docstring.

  GET    /api/me/api-tokens         list (preview only — never plaintext)
  POST   /api/me/api-tokens         create + return plaintext exactly once
  DELETE /api/me/api-tokens/{id}    revoke (soft — sets revoked_at)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from auth.deps import CurrentUser, current_user
from db.models import ApiToken
from db.session import get_session
from models import (
    ApiTokenCreateRequest,
    ApiTokenCreateResponse,
    ApiTokenRead,
)
from services.api_tokens import mint_token
from services.extractions import _mint_id

log = logging.getLogger("storyforge.api_tokens")

router = APIRouter(tags=["api-tokens"])

SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[CurrentUser, Depends(current_user)]


def _to_read(row: ApiToken) -> ApiTokenRead:
    return ApiTokenRead(
        id=row.id,
        name=row.name,
        prefix=row.prefix,
        last4=row.last4,
        scope=row.scope or "rw",
        org_id=row.org_id,
        created_at=row.created_at,
        last_used_at=row.last_used_at,
        expires_at=row.expires_at,
        revoked_at=row.revoked_at,
    )


@router.get("/api/me/api-tokens", response_model=list[ApiTokenRead])
def list_tokens(session: SessionDep, user: UserDep) -> list[ApiTokenRead]:
    """List all of the caller's tokens (active + revoked). Newest first.
    Includes revoked rows so users have a complete audit trail of what
    once existed — they can clean up any bookmarked CI configs that
    still reference revoked tokens."""
    stmt = (
        select(ApiToken)
        .where(ApiToken.user_id == user.user_id)
        .order_by(ApiToken.created_at.desc())
    )
    rows = session.exec(stmt).all()
    return [_to_read(r) for r in rows]


@router.post("/api/me/api-tokens", response_model=ApiTokenCreateResponse, status_code=201)
def create_token(
    payload: ApiTokenCreateRequest,
    session: SessionDep,
    user: UserDep,
) -> ApiTokenCreateResponse:
    """Mint a new token. Plaintext is in the response ONCE — never again.
    Frontend must surface a "save this now" UX.

    The token snapshots the user's active org_id at creation, so the
    same token always acts in the scope it was created in. Switching
    Clerk org context later doesn't shift the token's scope — that
    would surprise users who scripted against an org-X token."""
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name cannot be empty")
    if len(name) > 100:
        raise HTTPException(status_code=400, detail="name too long (max 100 chars)")

    scope = (payload.scope or "rw").lower()
    if scope not in ("rw", "ro"):
        raise HTTPException(status_code=400, detail="scope must be 'rw' or 'ro'")

    minted = mint_token()
    row = ApiToken(
        id=_mint_id("tok"),
        name=name,
        prefix=minted["prefix"],
        last4=minted["last4"],
        token_hash=minted["hash"],
        user_id=user.user_id,
        org_id=user.org_id,
        scope=scope,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return ApiTokenCreateResponse(
        id=row.id,
        name=row.name,
        token=minted["plaintext"],
        prefix=row.prefix,
        last4=row.last4,
        scope=row.scope or "rw",
        org_id=row.org_id,
        created_at=row.created_at,
    )


@router.delete("/api/me/api-tokens/{token_id}", status_code=204)
def revoke_token(token_id: str, session: SessionDep, user: UserDep) -> None:
    """Soft-revoke. The row stays so it appears in the list as 'Revoked'
    — bookmarked CI configs that still send the token get a clear 401
    instead of silently working again if a new row resurrected the
    same id (impossible with random ids, but the soft-delete contract
    is cleaner regardless)."""
    row = session.get(ApiToken, token_id)
    if row is None or row.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="Token not found")
    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        session.add(row)
        session.commit()
