"""Few-shot example assembly (M7.2).

Resolves the user's enabled examples and formats them as prior conversation
turns to prepend to an extraction request. Two output shapes:

  - `as_parse_messages(examples)` — for `extract.py` which uses
    `messages.parse(output_format=ExtractionPayload)`. Assistant turns are
    plain JSON strings of the expected payload; messages.parse accepts that
    shape and aligns with its own structured-output logic.

  - `as_tool_messages(examples, tool_name)` — for the streaming tool-use
    path (`services/streaming.py`). Assistant turns become `tool_use`
    blocks with the expected payload as `input`; immediately followed by a
    `tool_result` user turn (Anthropic requires every tool_use to be
    paired with a tool_result before the next user turn).

Cap: hard limit of 3 enabled examples per user. Each example adds
~3K-8K input tokens; three is the cost-quality sweet spot for our use
case (extraction is already a long prompt).

Public surface:
  - resolve_enabled_examples(session, user_id) -> list[FewShotExample]
  - as_parse_messages(examples, build_user_msg)
  - as_tool_messages(examples, build_user_msg, *, tool_name)
"""

from __future__ import annotations

import json
import logging
from typing import Callable

from sqlmodel import Session, select

from db.models import FewShotExample

log = logging.getLogger("storyforge.few_shot")

MAX_ENABLED = 3   # token-cost cap


def resolve_enabled_examples(session: Session | None, user_id: str | None) -> list[FewShotExample]:
    """Return up to MAX_ENABLED enabled examples for this user, oldest first
    (so the order is stable across edits — newer examples don't bump older
    ones out unpredictably). Tolerant of missing session/user_id (test paths
    sometimes lack them) → empty list."""
    if not session or not user_id:
        return []
    rows = session.exec(
        select(FewShotExample)
        .where(FewShotExample.user_id == user_id)
        .where(FewShotExample.enabled == True)  # noqa: E712 — SQLAlchemy bool comparison
        .order_by(FewShotExample.created_at.asc())
        .limit(MAX_ENABLED)
    ).all()
    return list(rows)


def as_parse_messages(
    examples: list[FewShotExample],
    build_user_msg: Callable[[str, str], str],
) -> list[dict]:
    """Format examples as prior turns for the messages.parse path.

    Each example becomes:
      user: <build_user_msg("example.txt", input_text)>
      assistant: <expected_payload as pretty JSON string>

    Returns a list of message dicts ready to splice in BEFORE the real user
    turn. Empty input → empty list (caller doesn't have to guard)."""
    out: list[dict] = []
    for ex in examples:
        out.append({
            "role": "user",
            "content": build_user_msg(f"example_{ex.name[:30]}.txt", ex.input_text),
        })
        # Pretty JSON helps Claude lock onto the structure visually; the
        # extra whitespace doesn't add many tokens at our payload sizes.
        out.append({
            "role": "assistant",
            "content": json.dumps(ex.expected_payload, indent=2),
        })
    return out


def as_tool_messages(
    examples: list[FewShotExample],
    build_user_msg: Callable[[str, str], str],
    *,
    tool_name: str,
) -> list[dict]:
    """Format examples for the tool-use streaming path.

    Each example becomes three turns:
      user:        the source-doc prompt (built via callback)
      assistant:   tool_use block carrying expected_payload as `input`
      user:        tool_result acknowledging the prior tool_use

    The trailing tool_result is REQUIRED by Anthropic's message validation
    — a tool_use turn with no following tool_result rejects with 400.
    The result content is just a confirmation string; Claude doesn't read
    it (this is a synthetic "demonstration" turn)."""
    out: list[dict] = []
    for i, ex in enumerate(examples):
        tool_use_id = f"demo_{i:02d}"
        out.append({
            "role": "user",
            "content": build_user_msg(f"example_{ex.name[:30]}.txt", ex.input_text),
        })
        out.append({
            "role": "assistant",
            "content": [
                {
                    "type": "tool_use",
                    "id": tool_use_id,
                    "name": tool_name,
                    "input": ex.expected_payload,
                }
            ],
        })
        out.append({
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": "Demonstration acknowledged.",
                }
            ],
        })
    return out
