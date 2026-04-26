"""Jira OAuth 3LO (M6.2.d).

Atlassian Connect-style OAuth 2.0 three-legged-OAuth flow for Jira Cloud.
Polished alternative to the M6.2 API-token posture: user clicks "Connect with
Atlassian", consents in Atlassian's UI, lands back on /settings with a working
connection — no copy-pasted tokens.

This module is fully gated on env vars (`JIRA_OAUTH_CLIENT_ID` +
`JIRA_OAUTH_CLIENT_SECRET`); when unset, `is_enabled()` returns False and the
Settings UI hides the OAuth button so the API-token path remains the only
shipping flow. Production deploys add these env vars after registering an
Atlassian developer app at https://developer.atlassian.com/console/myapps/
with the scopes listed in `SCOPES`.

CSRF state: minted in `mint_state(user_id)` (returns a random token + stores
the user it belongs to with a 10-minute TTL); consumed exactly once in
`consume_state(state)` on callback. In-process dict — same scaling profile
as `services/rate_limit.py`; swap to Redis if we ever scale out.

Token lifecycle:
  * The exchange returns access_token (~1h TTL) + refresh_token (long-lived).
  * We store both encrypted alongside `expires_at` and `cloud_id`.
  * `client_for_oauth(...)` refreshes the access_token proactively when it's
    within `_REFRESH_LEEWAY_SEC` of expiry — avoids burning the first call
    on a 401 then-retrying.

Stored connection shape (config_json) for OAuth Jira:
  {
    "auth_type": "oauth",
    "access_token_encrypted": "...",
    "refresh_token_encrypted": "...",
    "access_token_expires_at": "<iso>",
    "cloud_id": "...",
    "site_url": "https://acme.atlassian.net",
    "default_project_key": null
  }

Existing API-token connections (no `auth_type` key) keep working — see
`integrations.py::_decrypt_jira_config`.
"""

from __future__ import annotations

import logging
import os
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

log = logging.getLogger("storyforge.jira_oauth")

# Atlassian OAuth endpoints (stable; see https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)
AUTHORIZE_URL = "https://auth.atlassian.com/authorize"
TOKEN_URL = "https://auth.atlassian.com/oauth/token"
ACCESSIBLE_RESOURCES_URL = "https://api.atlassian.com/oauth/token/accessible-resources"

# read+write Jira issues; offline_access is required to receive a refresh_token.
SCOPES = "read:jira-work write:jira-work read:jira-user offline_access"

HTTP_TIMEOUT = 20.0
_REFRESH_LEEWAY_SEC = 60         # refresh when within 60s of expiry
_STATE_TTL_SEC = 600             # users have 10 minutes to complete the flow
_STATES: dict[str, tuple[str, float]] = {}
_STATES_LOCK = threading.Lock()


def _client_id() -> str | None:
    return os.environ.get("JIRA_OAUTH_CLIENT_ID")


def _client_secret() -> str | None:
    return os.environ.get("JIRA_OAUTH_CLIENT_SECRET")


def is_enabled() -> bool:
    return bool(_client_id() and _client_secret())


# --- CSRF state ------------------------------------------------------------


def mint_state(user_id: str) -> str:
    """Mint a random CSRF state token bound to this user. Single-use, 10-min TTL."""
    state = secrets.token_urlsafe(24)
    with _STATES_LOCK:
        _STATES[state] = (user_id, time.time() + _STATE_TTL_SEC)
        _sweep_expired_locked()
    return state


def consume_state(state: str) -> str | None:
    """Pop the state and return the bound user_id (or None if missing/expired)."""
    if not state:
        return None
    with _STATES_LOCK:
        item = _STATES.pop(state, None)
    if not item:
        return None
    user_id, exp = item
    if time.time() > exp:
        return None
    return user_id


def _sweep_expired_locked() -> None:
    """Drop expired entries — caller holds the lock. Cheap; runs on every mint."""
    now = time.time()
    for k in [k for k, (_, exp) in _STATES.items() if exp < now]:
        _STATES.pop(k, None)


# --- OAuth flow ------------------------------------------------------------


def authorize_url(state: str, redirect_uri: str) -> str:
    """Build the Atlassian authorize URL the user is redirected to."""
    if not is_enabled():
        raise HTTPException(status_code=503, detail="Jira OAuth is not configured on this server.")
    qs = urlencode({
        "audience": "api.atlassian.com",
        "client_id": _client_id(),
        "scope": SCOPES,
        "redirect_uri": redirect_uri,
        "state": state,
        "response_type": "code",
        "prompt": "consent",
    })
    return f"{AUTHORIZE_URL}?{qs}"


def exchange_code(code: str, redirect_uri: str) -> dict:
    """Exchange the auth code for an access+refresh token pair."""
    if not is_enabled():
        raise HTTPException(status_code=503, detail="Jira OAuth is not configured on this server.")
    try:
        r = httpx.post(
            TOKEN_URL,
            json={
                "grant_type": "authorization_code",
                "client_id": _client_id(),
                "client_secret": _client_secret(),
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=HTTP_TIMEOUT,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Atlassian token exchange failed: {e}")
    if not r.is_success:
        raise HTTPException(
            status_code=502,
            detail=f"Atlassian rejected the auth code ({r.status_code}): {r.text[:200]}",
        )
    body = r.json()
    if "access_token" not in body:
        raise HTTPException(status_code=502, detail="Atlassian token response missing access_token")
    return {
        "access_token": body["access_token"],
        # offline_access ensures a refresh_token; defensive default for clarity.
        "refresh_token": body.get("refresh_token", ""),
        "expires_in": int(body.get("expires_in", 3600)),
    }


def refresh_access_token(refresh_token: str) -> dict:
    """Refresh an expired (or near-expiry) access token. Atlassian may rotate
    the refresh_token in the response — caller MUST persist the new one."""
    if not is_enabled():
        raise HTTPException(status_code=503, detail="Jira OAuth is not configured on this server.")
    try:
        r = httpx.post(
            TOKEN_URL,
            json={
                "grant_type": "refresh_token",
                "client_id": _client_id(),
                "client_secret": _client_secret(),
                "refresh_token": refresh_token,
            },
            timeout=HTTP_TIMEOUT,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Atlassian refresh failed: {e}")
    if not r.is_success:
        # 401/403 here typically means the refresh token was revoked — surface
        # a 401 so the route can prompt re-connect.
        raise HTTPException(
            status_code=401,
            detail=f"Atlassian refresh token rejected ({r.status_code}). Re-connect Jira in Settings.",
        )
    body = r.json()
    return {
        "access_token": body["access_token"],
        "refresh_token": body.get("refresh_token", refresh_token),
        "expires_in": int(body.get("expires_in", 3600)),
    }


def get_accessible_resources(access_token: str) -> list[dict]:
    """List the Atlassian sites this token can access. Each entry:
    `{id, url, name, scopes, avatarUrl}`. We pick the first by default;
    M6.2.d.b can offer a picker for users with multiple sites."""
    try:
        r = httpx.get(
            ACCESSIBLE_RESOURCES_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=HTTP_TIMEOUT,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"accessible-resources failed: {e}")
    if not r.is_success:
        raise HTTPException(
            status_code=502,
            detail=f"accessible-resources fetch failed ({r.status_code}): {r.text[:200]}",
        )
    return r.json() or []


# --- token persistence helpers --------------------------------------------


def expires_at_iso(expires_in: int) -> str:
    """Convert `expires_in` seconds to an absolute ISO timestamp for storage."""
    return (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()


def is_access_token_stale(expires_at_iso_str: str | None) -> bool:
    """True when the stored access_token has <= _REFRESH_LEEWAY_SEC left."""
    if not expires_at_iso_str:
        return True
    try:
        exp = datetime.fromisoformat(expires_at_iso_str)
    except ValueError:
        return True
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    leeway = timedelta(seconds=_REFRESH_LEEWAY_SEC)
    return datetime.now(timezone.utc) + leeway >= exp
