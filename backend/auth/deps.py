"""FastAPI auth dependency (M3.1.6 + M3.1.7).

`current_user` is the canonical dependency every protected route uses. Routes
that only need to gate on auth (don't read the user) declare it via
`dependencies=[Depends(current_user)]`. Routes that need the user_id/org_id
parametrise as `user: CurrentUser = Depends(current_user)`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Header, HTTPException

from .clerk import ClerkAuthError, verify_session_token

log = logging.getLogger("storyforge.auth.deps")


@dataclass(frozen=True)
class CurrentUser:
    """Snapshot of the verified Clerk session, normalised for our routes."""

    user_id: str
    org_id: str | None = None
    org_role: str | None = None


def current_user(
    authorization: str | None = Header(default=None),
) -> CurrentUser:
    """Extract + verify a Clerk JWT from the `Authorization: Bearer <jwt>` header."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token")
    try:
        claims = verify_session_token(token)
    except ClerkAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub claim")
    return CurrentUser(
        user_id=sub,
        org_id=claims.get("org_id"),
        org_role=claims.get("org_role"),
    )
