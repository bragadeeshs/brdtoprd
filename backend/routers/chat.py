"""M14.4 — chat router. Per-extraction conversation thread.

Routes:
  GET  /api/extractions/{id}/chat  → list messages (full thread, ordered)
  POST /api/extractions/{id}/chat  → send message; persists user msg,
                                     streams assistant reply via SSE,
                                     persists assistant msg on `complete`
  DELETE /api/extractions/{id}/chat → clear thread

Auth: same `_protected_deps` chain as the rest of /api (current_user,
token scope, rate limit, welcome check). Ownership: only the user who
owns the extraction can read/write its chat — enforced via `_owned_extraction`
helper from services/extractions.
"""
from __future__ import annotations

import json
import logging
import secrets
import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from auth.deps import CurrentUser, current_user
from db.models import ChatMessage, Extraction
from db.session import get_session
from services.chat import chat_stream
from services.byok import resolve_user_byok

log = logging.getLogger("storyforge.chat")

router = APIRouter(prefix="/api/extractions", tags=["chat"])


# ---- request/response shapes ------------------------------------------------


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    role: str
    content: str
    created_at: datetime


class ChatSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content: str


# ---- ownership helper -------------------------------------------------------


def _owned_extraction(session: Session, extraction_id: str, user: CurrentUser) -> Extraction:
    """Raise 404 if the extraction doesn't exist or doesn't belong to the
    calling user / org. Mirrors the helper in routers/extractions but kept
    local to avoid a circular import."""
    row = session.get(Extraction, extraction_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Extraction not found")
    if row.user_id != user.user_id:
        # Allow same-org access if both are in the same org context.
        if not (row.org_id and row.org_id == user.org_id):
            raise HTTPException(status_code=404, detail="Extraction not found")
    return row


def _mint_id() -> str:
    """Mint a chat message id — same pattern as extraction ids."""
    ts = format(int(time.time() * 1000), "x")
    rand = secrets.token_hex(3)
    return f"chat_{ts}_{rand}"


# ---- routes ----------------------------------------------------------------


@router.get("/{extraction_id}/chat", response_model=list[ChatMessageRead])
def list_chat_messages(
    extraction_id: str,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[CurrentUser, Depends(current_user)],
) -> list[ChatMessageRead]:
    _owned_extraction(session, extraction_id, user)
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.extraction_id == extraction_id)
        .where(ChatMessage.user_id == user.user_id)
        .order_by(ChatMessage.created_at)
    )
    rows = session.exec(stmt).all()
    return [
        ChatMessageRead(id=r.id, role=r.role, content=r.content, created_at=r.created_at)
        for r in rows
    ]


@router.post("/{extraction_id}/chat")
async def send_chat_message(
    extraction_id: str,
    body: ChatSendRequest,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[CurrentUser, Depends(current_user)],
):
    """Persist user message, stream assistant reply, persist assistant on complete."""
    extraction = _owned_extraction(session, extraction_id, user)
    user_message = (body.content or "").strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Empty message")
    if len(user_message) > 8000:
        raise HTTPException(status_code=400, detail="Message too long (max 8000 chars)")

    # Resolve BYOK / model. Same pattern as /api/extract.
    api_key, _stored_model = resolve_user_byok(session, user.user_id, None)

    # Pull conversation history BEFORE persisting the new user message so
    # `history` matches the API contract (history is the prior turns; new
    # message is the current ask).
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.extraction_id == extraction_id)
        .where(ChatMessage.user_id == user.user_id)
        .order_by(ChatMessage.created_at)
    )
    history_rows = session.exec(stmt).all()
    history = [{"role": r.role, "content": r.content} for r in history_rows]

    # Persist the user message immediately so a reload mid-stream doesn't
    # lose it.
    user_msg_row = ChatMessage(
        id=_mint_id(),
        extraction_id=extraction_id,
        user_id=user.user_id,
        role="user",
        content=user_message,
    )
    session.add(user_msg_row)
    session.commit()

    # Snapshot the values the generator needs so we don't hold a closure
    # over the request-scoped session (which FastAPI tears down before
    # Starlette iterates the stream — same pattern as /api/extract/stream).
    _user_id = user.user_id
    _api_key = api_key
    _extraction_id = extraction_id

    def event_gen():
        from db.session import engine as _engine
        from sqlmodel import Session as _Session

        # Re-fetch the extraction inside a fresh session — the request-
        # scoped session is gone by now.
        with _Session(_engine) as s:
            ext = s.get(Extraction, _extraction_id)

            yield _sse("start", {"id": user_msg_row.id})
            try:
                for ev in chat_stream(
                    extraction=ext,
                    history=history,
                    user_message=user_message,
                    api_key=_api_key,
                ):
                    if ev["type"] == "text":
                        yield _sse("text", {"delta": ev["delta"]})
                    elif ev["type"] == "error":
                        yield _sse("error", {"status": ev["status"], "detail": ev["detail"]})
                        return
                    elif ev["type"] == "complete":
                        # Persist the assistant message.
                        asst_row = ChatMessage(
                            id=_mint_id(),
                            extraction_id=_extraction_id,
                            user_id=_user_id,
                            role="assistant",
                            content=ev["content"],
                            model_used=ev["model_used"],
                            input_tokens=ev["input_tokens"],
                            output_tokens=ev["output_tokens"],
                        )
                        s.add(asst_row)
                        s.commit()
                        s.refresh(asst_row)
                        yield _sse("complete", {
                            "id": asst_row.id,
                            "role": "assistant",
                            "content": ev["content"],
                            "created_at": asst_row.created_at.isoformat(),
                            "model_used": ev["model_used"],
                            "input_tokens": ev["input_tokens"],
                            "output_tokens": ev["output_tokens"],
                        })
            except Exception as e:
                log.exception("chat generator crashed")
                yield _sse("error", {"status": 500, "detail": f"Chat failed: {e}"})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


@router.delete("/{extraction_id}/chat", status_code=204)
def clear_chat(
    extraction_id: str,
    session: Annotated[Session, Depends(get_session)],
    user: Annotated[CurrentUser, Depends(current_user)],
):
    _owned_extraction(session, extraction_id, user)
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.extraction_id == extraction_id)
        .where(ChatMessage.user_id == user.user_id)
    )
    rows = session.exec(stmt).all()
    for r in rows:
        session.delete(r)
    session.commit()
    return None


def _sse(event: str, data: dict) -> str:
    """Format an SSE frame. Mirrors main.py's helper."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
