"""Symmetric encryption for stored secrets (M3.0 — landed early ahead of M3.4).

Today this is exercised only by tests — `UserSettings.anthropic_key_encrypted`
is the next consumer. Wired now so when M3.4 routes land, the crypto path is
already proven.

Operational notes:
  * `STORYFORGE_MASTER_KEY` must be a Fernet-encoded 32-byte key (44 chars,
    URL-safe base64). Generate one with `python -c "from cryptography.fernet
    import Fernet; print(Fernet.generate_key().decode())"`.
  * Rotating the key invalidates every previously-stored ciphertext; M3.4
    will re-encrypt on access if we add `MultiFernet` later.
  * In dev mode (no env var) we generate an *ephemeral* key and warn — every
    process restart loses encrypted secrets. Acceptable for local hacking.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from sqlmodel import Session

from db.models import UserSettings

log = logging.getLogger("storyforge.byok")

ENV_KEY = "STORYFORGE_MASTER_KEY"


def _resolve_key() -> bytes:
    raw = os.environ.get(ENV_KEY)
    if raw:
        return raw.encode()
    # Dev fallback. Stash on os.environ so subsequent calls in the same
    # process see the same key (otherwise every call would mint a new one
    # and decryption would fail immediately).
    new = Fernet.generate_key().decode()
    os.environ[ENV_KEY] = new
    log.warning(
        "%s not set — generated ephemeral key. Set in backend/.env to persist "
        "encrypted secrets across restarts.",
        ENV_KEY,
    )
    return new.encode()


@lru_cache(maxsize=1)
def _cipher() -> Fernet:
    return Fernet(_resolve_key())


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a UTF-8 string. Returns base64 ciphertext (also UTF-8)."""
    return _cipher().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str | None:
    """Decrypt a string produced by `encrypt_secret`. Returns None if the key
    has rotated or the ciphertext is corrupt — caller decides how to react."""
    try:
        return _cipher().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        log.warning("decrypt_secret: InvalidToken — key may have rotated")
        return None


def key_preview(plaintext: str) -> str:
    """Public-safe redaction for UI display: `••••<last 4>`. Empty for short keys."""
    if not plaintext or len(plaintext) < 4:
        return ""
    return "••••" + plaintext[-4:]


def resolve_user_byok(
    session: Session, user_id: str, header_override: str | None = None
) -> tuple[str | None, str | None]:
    """Pick the effective Anthropic key + model for a request.

    Returns `(api_key, model)`, either of which may be None — extract.py then
    falls back to env (`ANTHROPIC_API_KEY`, `STORYFORGE_MODEL`) and finally
    its built-in default.

    Precedence:
      api_key:  request header > stored UserSettings (decrypted)
      model:    request header (handled by caller) > stored UserSettings

    The header takes priority so a user can paste a key into "Test connection"
    and validate it without saving. Once saved, headers can be omitted entirely.
    """
    if header_override:
        # Header path also returns the stored model_default if available, so
        # users with both header-key + saved model_default get the saved model.
        row = session.get(UserSettings, user_id)
        return header_override, (row.model_default if row else None)

    row = session.get(UserSettings, user_id)
    if row is None:
        return None, None
    api_key = decrypt_secret(row.anthropic_key_encrypted) if row.anthropic_key_encrypted else None
    return api_key, row.model_default
