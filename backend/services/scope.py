"""User vs org scope helpers (M3.3).

Two scoping rules across every protected route:

  Personal context (no `org_id` in JWT):
      WHERE user_id = :uid AND org_id IS NULL

  Org context (`org_id` set in JWT):
      WHERE org_id = :org_id

Org rows are visible to *every* member of that org — that's the whole point
of a workspace. We don't filter by user_id within an org. Personal rows stay
strictly per-user and are never surfaced inside an org.

A user has *separate* personal data and per-org data. Switching active org
in the Clerk UI changes which slice the API returns; rows themselves don't
move between scopes (no auto-migration).
"""

from __future__ import annotations

from typing import Any

from auth.deps import CurrentUser


def apply_scope(stmt, model, user: CurrentUser):
    """Constrain a SQLModel/SQLAlchemy SELECT to the caller's current scope."""
    if user.org_id:
        return stmt.where(model.org_id == user.org_id)
    return stmt.where(model.user_id == user.user_id).where(model.org_id.is_(None))


def in_scope(row: Any, user: CurrentUser) -> bool:
    """Is `row` visible/mutable to the calling user under their current scope?

    Routes use this for the 404-not-403 ownership check (`_owned_*` helpers).
    Returns False for `None` so `session.get(...)` misses fold cleanly.
    """
    if row is None:
        return False
    if user.org_id:
        return getattr(row, "org_id", None) == user.org_id
    return (
        getattr(row, "user_id", None) == user.user_id
        and getattr(row, "org_id", None) is None
    )
