"""Per-user settings — `/api/me/*` (M3.4.4).

Today: BYOK Anthropic key + model preference. Future homes for usage summary,
profile mirror from Clerk, etc. Naming: `me` (not `users`) because everything
under here is implicitly the calling user — no path params needed.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from auth.deps import CurrentUser, current_user
from db.models import UserSettings
from db.session import get_session
from models import UserSettingsPatch, UserSettingsRead
from services.byok import decrypt_secret, encrypt_secret, key_preview

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
