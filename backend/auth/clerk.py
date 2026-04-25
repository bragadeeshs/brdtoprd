"""Clerk session-token verification (M3.1.5).

Verifies Clerk-issued JWTs locally against the app's JWKS — no per-request
round-trip to Clerk's API. The JWKS is fetched on first use and cached by
PyJWKClient (1 h default), so steady-state cost is zero network calls.

We deliberately avoid the `clerk-backend-api` SDK here. The piece we need —
JWKS verification with one issuer — is ~30 lines of `pyjwt`. Adding the SDK
ties us to its release cadence for what is effectively a stable RFC.

Issuer derivation: Clerk's publishable key encodes the frontend hostname as
base64 (with a trailing `$`). For `pk_test_<base64>` -> issuer is
`https://<host>`. Same algorithm Clerk's own SDKs use — this isn't undocumented.
"""

from __future__ import annotations

import base64
import logging
import os
import ssl
from functools import lru_cache

import certifi
import jwt
from jwt import InvalidTokenError, PyJWKClient

log = logging.getLogger("storyforge.auth.clerk")


def _derive_issuer_from_pk(pk: str) -> str:
    """`pk_test_<base64-host-with-$>` -> `https://<host>`.

    Mirrors what Clerk's frontend SDK does to know which hosted UI to point at.
    """
    parts = pk.split("_", 2)
    if len(parts) != 3 or parts[0] != "pk":
        raise ValueError(f"unrecognised CLERK_PUBLISHABLE_KEY format: {pk[:8]}...")
    encoded = parts[2]
    pad = "=" * ((4 - len(encoded) % 4) % 4)
    decoded = base64.b64decode(encoded + pad).decode("utf-8")
    host = decoded.rstrip("$")
    return f"https://{host}"


@lru_cache(maxsize=1)
def _config() -> tuple[str, PyJWKClient]:
    pk = os.environ.get("CLERK_PUBLISHABLE_KEY")
    if not pk:
        raise RuntimeError(
            "CLERK_PUBLISHABLE_KEY missing from backend/.env — required to derive Clerk issuer"
        )
    issuer = _derive_issuer_from_pk(pk)
    jwks_url = f"{issuer}/.well-known/jwks.json"
    log.info("Clerk auth configured: issuer=%s", issuer)
    # PyJWKClient handles JWKS fetch + caching + key rotation automatically.
    # Pass an explicit SSL context backed by certifi's CA bundle — Python on
    # macOS (python.org installer, homebrew, pyenv) often ships without the
    # system CA store wired up, which would otherwise blow up here with
    # "[SSL: CERTIFICATE_VERIFY_FAILED] unable to get local issuer certificate".
    ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    return issuer, PyJWKClient(
        jwks_url,
        cache_keys=True,
        lifespan=3600,
        ssl_context=ssl_ctx,
    )


class ClerkAuthError(Exception):
    """Raised when a token can't be verified. Caller maps to HTTP 401."""


def verify_session_token(token: str) -> dict:
    """Verify a Clerk session JWT, return its claims dict.

    Raises ClerkAuthError on any failure (signature, expiry, issuer mismatch).
    Claims of interest: `sub` (user_id), `org_id`, `org_role`, `exp`.
    """
    issuer, jwks_client = _config()
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token).key
        # Clerk doesn't set `aud` by default — disable audience verification
        # explicitly so PyJWT doesn't complain about a missing claim.
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False},
        )
        return claims
    except InvalidTokenError as e:
        raise ClerkAuthError(f"invalid Clerk token: {e}") from e
    except Exception as e:  # JWKS fetch failure, etc.
        log.warning("clerk verify_session_token unexpected error: %s", e)
        raise ClerkAuthError(f"clerk verification failed: {e}") from e
