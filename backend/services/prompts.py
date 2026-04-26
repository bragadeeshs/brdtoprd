"""Prompt assembly helpers (M7.1).

Tiny module with one job: read the user's saved prompt suffix and join
it with a base system prompt. Centralised so all three Claude call sites
(extract.py / services.streaming / services.regen) build the system
prompt identically.

The suffix is appended *after* the base prompt with a clear separator,
so the user's instructions take precedence over the defaults at the
model's reading order. We don't try to validate or sanitize the suffix
— it's the user's prompt, not ours, and over-engineering "safe" prompt
joining usually breaks legitimate use cases.
"""

from __future__ import annotations

import logging

from sqlmodel import Session

from db.models import UserSettings

log = logging.getLogger("storyforge.prompts")


def resolve_prompt_suffix(session: Session | None, user_id: str | None) -> str | None:
    """Return the user's saved prompt suffix, or None. Tolerant of:
      - Missing session (some test paths) → None
      - Missing user_id (mock mode in tests) → None
      - Missing UserSettings row → None (treat as "no suffix")
    """
    if not session or not user_id:
        return None
    row = session.get(UserSettings, user_id)
    if row is None or not row.prompt_suffix:
        return None
    return row.prompt_suffix


def join_system_prompt(base: str, suffix: str | None) -> str:
    """Append the user's suffix to the base system prompt with a clear
    separator. Returns the base unchanged when there's no suffix.

    Order matters: the suffix comes LAST so the model encounters the
    user's overrides after the defaults — important when the suffix
    contradicts a default rule (e.g. "use job-story format instead")."""
    if not suffix:
        return base
    return base + "\n\n# User-defined overrides\n\n" + suffix
