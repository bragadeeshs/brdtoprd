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

from sqlmodel import Session, select

from db.models import PromptTemplate, UserSettings

log = logging.getLogger("storyforge.prompts")


def resolve_prompt_suffix(
    session: Session | None,
    user_id: str | None,
    org_id: str | None = None,
) -> str | None:
    """Return the active prompt-suffix content, or None.

    M7.1.b — resolution order:
      1. User-scoped active PromptTemplate (highest priority)
      2. Org-scoped active PromptTemplate (M7.1.c — applies to all org members)
      3. Legacy `user_settings.prompt_suffix` (M7.1 single-slot, kept for back-compat)

    Tolerant of missing session / user_id / row → None at every step.
    """
    if not session or not user_id:
        return None

    # M7.1.b — user's active template wins
    user_active = session.exec(
        select(PromptTemplate)
        .where(PromptTemplate.user_id == user_id)
        .where(PromptTemplate.org_id.is_(None))   # type: ignore[union-attr]
        .where(PromptTemplate.is_active == True)  # noqa: E712
    ).first()
    if user_active and user_active.content:
        return user_active.content

    # M7.1.c — fall back to org-shared active template
    if org_id:
        org_active = session.exec(
            select(PromptTemplate)
            .where(PromptTemplate.org_id == org_id)
            .where(PromptTemplate.is_active == True)  # noqa: E712
        ).first()
        if org_active and org_active.content:
            return org_active.content

    # Legacy back-compat: M7.1's single-slot column
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
