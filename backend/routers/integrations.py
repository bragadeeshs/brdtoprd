"""Integration connections + push routes (M6.2).

Two surfaces:
  * `/api/integrations/<kind>/connection` — CRUD on the user's saved
    creds for one integration. v1: only `kind=jira`.
  * `/api/extractions/{eid}/push/<kind>` — execute a push using the saved
    connection.

Connections are scoped per-user in v1 (`scope='user'`, `scope_id=user.user_id`).
Org-shared connections (`scope='org'`) are wired into the schema but not
yet exposed; ship in M6.2.c.

Tokens are Fernet-encrypted on write via `services.byok.encrypt_secret`
— same path the Anthropic BYOK key uses. They're never echoed back to
the client; only a `••••XYZK` preview is.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from auth.deps import CurrentUser, current_user
from db.models import Extraction, GapState, IntegrationConnection
from db.session import get_session
from models import (
    GitHubConnectionRead,
    GitHubConnectionWrite,
    GitHubLabel,
    GitHubRepo,
    JiraConnectionRead,
    JiraConnectionWrite,
    JiraProject,
    LinearConnectionRead,
    LinearConnectionWrite,
    LinearTeam,
    NotionConnectionRead,
    NotionConnectionWrite,
    NotionDatabase,
    PushToGitHubRequest,
    PushToGitHubResult,
    PushToJiraRequest,
    PushToJiraResult,
    PushToLinearRequest,
    PushToLinearResult,
    PushToNotionRequest,
    PushToNotionResult,
    PushToSlackRequest,
    PushToSlackResult,
    SlackConnectionRead,
    SlackConnectionWrite,
    SlackWebhookCreate,
    SlackWebhookRead,
)
from services.byok import decrypt_secret, encrypt_secret, key_preview
from services.github import GitHubClient, push_extraction as push_extraction_github
from services.jira import JiraClient, push_extraction as push_extraction_jira
from services.linear import LinearClient, push_extraction as push_extraction_linear
from services.notion import NotionClient, push_extraction as push_extraction_notion
from services.slack import post_gaps as slack_post_gaps
from services.scope import in_scope

log = logging.getLogger("storyforge.integrations")

router = APIRouter(tags=["integrations"])

SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[CurrentUser, Depends(current_user)]


def _get_connection_at(
    session: Session, scope: str, scope_id: str, kind: str,
) -> IntegrationConnection | None:
    """Look up the connection at an explicit (scope, scope_id, kind). PUT/
    DELETE routes use this so they target exactly the row the user picked."""
    stmt = (
        select(IntegrationConnection)
        .where(IntegrationConnection.scope == scope)
        .where(IntegrationConnection.scope_id == scope_id)
        .where(IntegrationConnection.kind == kind)
    )
    return session.exec(stmt).first()


def _resolve_connection(
    session: Session, user: CurrentUser, kind: str,
) -> tuple[IntegrationConnection | None, str | None]:
    """M6.2.c — pick the effective connection for this user.

    Resolution rule: prefer the user's personal connection; fall back to
    the org-shared one when the caller has an active org context. This way
    a user with both a personal Jira *and* a workspace-shared Jira keeps
    the personal one as the default (least surprise — they set it up
    explicitly), while a user who hasn't set one up inherits the workspace's.

    Returns `(row, "user" | "org" | None)` so callers can surface the
    effective scope to the UI without re-querying.
    """
    user_row = _get_connection_at(session, "user", user.user_id, kind)
    if user_row is not None:
        return user_row, "user"
    if user.org_id:
        org_row = _get_connection_at(session, "org", user.org_id, kind)
        if org_row is not None:
            return org_row, "org"
    return None, None


def _validate_write_scope(user: CurrentUser, scope: str | None) -> tuple[str, str]:
    """Validate a write request's `scope` field and return (scope, scope_id).

    Org writes require an active org context. Empty/None defaults to user
    scope so existing clients keep working without sending the field.
    """
    s = (scope or "user").lower()
    if s == "user":
        return "user", user.user_id
    if s == "org":
        if not user.org_id:
            raise HTTPException(
                status_code=400,
                detail="Cannot save an org-shared connection without an active workspace context. Switch to a workspace and try again.",
            )
        return "org", user.org_id
    raise HTTPException(status_code=400, detail=f"Unknown scope: {scope!r}")


# Back-compat alias — kept so older callers in this file keep working
# unchanged during the M6.2.c refactor. New callers should use the
# explicit `_resolve_connection` (resolved with org fallback) or
# `_get_connection_at` (explicit scope + id) variants.
def _get_connection(session: Session, user: CurrentUser, kind: str) -> IntegrationConnection | None:
    row, _ = _resolve_connection(session, user, kind)
    return row


def _decrypt_jira_config(row: IntegrationConnection) -> dict:
    """Pull the connection JSON, decrypt the API token in place. Returns
    `{base_url, email, api_token, default_project_key?}` ready to construct
    a JiraClient. Raises 400 if the row is malformed (defensive — a write
    that produced this shape is a bug)."""
    cfg = json.loads(row.config_json)
    enc = cfg.get("api_token_encrypted")
    token = decrypt_secret(enc) if enc else None
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Saved Jira credentials are unreadable (master key may have rotated). Reconnect in Settings.",
        )
    cfg["api_token"] = token
    cfg.pop("api_token_encrypted", None)
    return cfg


def _to_jira_read(row: IntegrationConnection) -> JiraConnectionRead:
    cfg = json.loads(row.config_json)
    enc = cfg.get("api_token_encrypted")
    plain = decrypt_secret(enc) if enc else ""
    return JiraConnectionRead(
        base_url=cfg.get("base_url", ""),
        email=cfg.get("email", ""),
        api_token_preview=key_preview(plain or ""),
        default_project_key=cfg.get("default_project_key"),
        scope=row.scope,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _upsert_connection(
    session: Session, *, scope: str, scope_id: str, kind: str, cfg: dict,
) -> IntegrationConnection:
    """M6.2.c — scope-aware upsert. Targets the (scope, scope_id, kind)
    composite PK. Used by every tracker's PUT route — replaces the inline
    upsert blocks that all looked the same before."""
    now = datetime.now(timezone.utc)
    row = _get_connection_at(session, scope, scope_id, kind)
    if row is None:
        row = IntegrationConnection(
            scope=scope, scope_id=scope_id, kind=kind,
            config_json=json.dumps(cfg),
            created_at=now, updated_at=now,
        )
    else:
        row.config_json = json.dumps(cfg)
        row.updated_at = now
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


# ---- Jira connection -------------------------------------------------------


@router.get("/api/integrations/jira/connection", response_model=JiraConnectionRead | None)
def get_jira_connection(session: SessionDep, user: UserDep):
    row, _ = _resolve_connection(session, user, "jira")
    return _to_jira_read(row) if row else None


@router.put("/api/integrations/jira/connection", response_model=JiraConnectionRead)
def put_jira_connection(payload: JiraConnectionWrite, session: SessionDep, user: UserDep):
    """Upsert. Token is encrypted before storage. Light validation on the
    base_url shape — full Jira API connectivity is verified by the Test
    button on the frontend (which calls /projects).

    M6.2.c: `payload.scope` chooses personal vs org-shared storage. Defaults
    to 'user' so older clients keep working without sending the field."""
    base_url = (payload.base_url or "").strip().rstrip("/")
    if not base_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="base_url must include http(s)://")

    cfg = {
        "base_url": base_url,
        "email": (payload.email or "").strip(),
        "api_token_encrypted": encrypt_secret((payload.api_token or "").strip()),
        "default_project_key": (payload.default_project_key or None),
    }
    scope, scope_id = _validate_write_scope(user, payload.scope)
    row = _upsert_connection(session, scope=scope, scope_id=scope_id, kind="jira", cfg=cfg)
    return _to_jira_read(row)


@router.delete("/api/integrations/jira/connection", status_code=204)
def delete_jira_connection(
    session: SessionDep, user: UserDep, scope: str = "user",
) -> None:
    """Delete the connection at the given scope. Defaults to 'user' for
    back-compat; pass `?scope=org` to remove the workspace-shared one."""
    s, sid = _validate_write_scope(user, scope)
    row = _get_connection_at(session, s, sid, "jira")
    if row is None:
        return
    session.delete(row)
    session.commit()


# ---- Jira projects (live fetch) -------------------------------------------


@router.get("/api/integrations/jira/projects", response_model=list[JiraProject])
def list_jira_projects(session: SessionDep, user: UserDep):
    """Fetch the user's Jira projects via the saved connection. Doubles as
    a "test connection" probe — 401 → token bad, 502 → URL bad / network."""
    row = _get_connection(session, user, "jira")
    if row is None:
        raise HTTPException(status_code=400, detail="No Jira connection saved. Connect in Settings.")
    cfg = _decrypt_jira_config(row)
    client = JiraClient(base_url=cfg["base_url"], email=cfg["email"], api_token=cfg["api_token"])
    return client.list_projects()


# ---- Push -----------------------------------------------------------------


@router.post("/api/extractions/{extraction_id}/push/jira", response_model=PushToJiraResult)
def push_to_jira(
    extraction_id: str,
    payload: PushToJiraRequest,
    session: SessionDep,
    user: UserDep,
) -> PushToJiraResult:
    """Push every story in the extraction as a Jira issue. Per-story
    failures land in `failed[]` so a partial success doesn't lose the
    work that did land — the user can fix the offending stories and
    push again."""
    extraction = session.get(Extraction, extraction_id)
    if not in_scope(extraction, user):
        raise HTTPException(status_code=404, detail="Extraction not found")

    row = _get_connection(session, user, "jira")
    if row is None:
        raise HTTPException(status_code=400, detail="No Jira connection saved. Connect in Settings.")
    cfg = _decrypt_jira_config(row)
    client = JiraClient(base_url=cfg["base_url"], email=cfg["email"], api_token=cfg["api_token"])

    if not (extraction.stories or []):
        raise HTTPException(status_code=400, detail="No stories to push.")

    return push_extraction_jira(
        client,
        extraction,
        project_key=payload.project_key,
        issue_type=payload.issue_type or "Story",
        create_subtasks=bool(payload.create_subtasks),
    )


# ---- Linear connection (M6.3) ---------------------------------------------


def _decrypt_linear_config(row: IntegrationConnection) -> dict:
    """Pull + decrypt the Linear API key. Same defensive pattern as the
    Jira variant — raises 400 if the saved row is unreadable so the user
    knows to reconnect."""
    cfg = json.loads(row.config_json)
    enc = cfg.get("api_key_encrypted")
    key = decrypt_secret(enc) if enc else None
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Saved Linear key is unreadable (master key may have rotated). Reconnect in Settings.",
        )
    cfg["api_key"] = key
    cfg.pop("api_key_encrypted", None)
    return cfg


def _to_linear_read(row: IntegrationConnection) -> LinearConnectionRead:
    cfg = json.loads(row.config_json)
    enc = cfg.get("api_key_encrypted")
    plain = decrypt_secret(enc) if enc else ""
    return LinearConnectionRead(
        api_key_preview=key_preview(plain or ""),
        default_team_id=cfg.get("default_team_id"),
        scope=row.scope,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/api/integrations/linear/connection", response_model=LinearConnectionRead | None)
def get_linear_connection(session: SessionDep, user: UserDep):
    row, _ = _resolve_connection(session, user, "linear")
    return _to_linear_read(row) if row else None


@router.put("/api/integrations/linear/connection", response_model=LinearConnectionRead)
def put_linear_connection(payload: LinearConnectionWrite, session: SessionDep, user: UserDep):
    """Upsert. Only one field really matters here — Linear API keys carry
    their own scope/workspace context, no URL or email needed (unlike Jira)."""
    cfg = {
        "api_key_encrypted": encrypt_secret((payload.api_key or "").strip()),
        "default_team_id": (payload.default_team_id or None),
    }
    scope, scope_id = _validate_write_scope(user, payload.scope)
    row = _upsert_connection(session, scope=scope, scope_id=scope_id, kind="linear", cfg=cfg)
    return _to_linear_read(row)


@router.delete("/api/integrations/linear/connection", status_code=204)
def delete_linear_connection(
    session: SessionDep, user: UserDep, scope: str = "user",
) -> None:
    s, sid = _validate_write_scope(user, scope)
    row = _get_connection_at(session, s, sid, "linear")
    if row is None:
        return
    session.delete(row)
    session.commit()


@router.get("/api/integrations/linear/teams", response_model=list[LinearTeam])
def list_linear_teams(session: SessionDep, user: UserDep):
    """Live fetch — doubles as a "test connection" probe. 401 → key bad."""
    row = _get_connection(session, user, "linear")
    if row is None:
        raise HTTPException(status_code=400, detail="No Linear connection saved. Connect in Settings.")
    cfg = _decrypt_linear_config(row)
    client = LinearClient(api_key=cfg["api_key"])
    return client.list_teams()


@router.post("/api/extractions/{extraction_id}/push/linear", response_model=PushToLinearResult)
def push_to_linear(
    extraction_id: str,
    payload: PushToLinearRequest,
    session: SessionDep,
    user: UserDep,
) -> PushToLinearResult:
    extraction = session.get(Extraction, extraction_id)
    if not in_scope(extraction, user):
        raise HTTPException(status_code=404, detail="Extraction not found")

    row = _get_connection(session, user, "linear")
    if row is None:
        raise HTTPException(status_code=400, detail="No Linear connection saved. Connect in Settings.")
    cfg = _decrypt_linear_config(row)
    client = LinearClient(api_key=cfg["api_key"])

    if not (extraction.stories or []):
        raise HTTPException(status_code=400, detail="No stories to push.")

    return push_extraction_linear(
        client,
        extraction,
        team_id=payload.team_id,
    )


# ---- GitHub connection (M6.4) ---------------------------------------------


def _decrypt_github_config(row: IntegrationConnection) -> dict:
    cfg = json.loads(row.config_json)
    enc = cfg.get("api_token_encrypted")
    token = decrypt_secret(enc) if enc else None
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Saved GitHub token is unreadable (master key may have rotated). Reconnect in Settings.",
        )
    cfg["api_token"] = token
    cfg.pop("api_token_encrypted", None)
    return cfg


def _to_github_read(row: IntegrationConnection) -> GitHubConnectionRead:
    cfg = json.loads(row.config_json)
    enc = cfg.get("api_token_encrypted")
    plain = decrypt_secret(enc) if enc else ""
    return GitHubConnectionRead(
        api_token_preview=key_preview(plain or ""),
        default_repo=cfg.get("default_repo"),
        scope=row.scope,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/api/integrations/github/connection", response_model=GitHubConnectionRead | None)
def get_github_connection(session: SessionDep, user: UserDep):
    row, _ = _resolve_connection(session, user, "github")
    return _to_github_read(row) if row else None


@router.put("/api/integrations/github/connection", response_model=GitHubConnectionRead)
def put_github_connection(payload: GitHubConnectionWrite, session: SessionDep, user: UserDep):
    cfg = {
        "api_token_encrypted": encrypt_secret((payload.api_token or "").strip()),
        "default_repo": (payload.default_repo or None),
    }
    scope, scope_id = _validate_write_scope(user, payload.scope)
    row = _upsert_connection(session, scope=scope, scope_id=scope_id, kind="github", cfg=cfg)
    return _to_github_read(row)


@router.delete("/api/integrations/github/connection", status_code=204)
def delete_github_connection(
    session: SessionDep, user: UserDep, scope: str = "user",
) -> None:
    s, sid = _validate_write_scope(user, scope)
    row = _get_connection_at(session, s, sid, "github")
    if row is None:
        return
    session.delete(row)
    session.commit()


@router.get("/api/integrations/github/repos", response_model=list[GitHubRepo])
def list_github_repos(session: SessionDep, user: UserDep):
    """Live fetch — doubles as the test-connection probe. M6.4.c: walks
    GitHub's pagination up to ~1000 repos sorted by recent activity."""
    row = _get_connection(session, user, "github")
    if row is None:
        raise HTTPException(status_code=400, detail="No GitHub connection saved. Connect in Settings.")
    cfg = _decrypt_github_config(row)
    client = GitHubClient(api_token=cfg["api_token"])
    return client.list_repos()


@router.get("/api/integrations/github/labels", response_model=list[GitHubLabel])
def list_github_labels(owner: str, repo: str, session: SessionDep, user: UserDep):
    """M6.4.b — labels defined on the picked repo, for the push modal's
    multi-select. One round-trip per repo selection (frontend caches
    per-repo so re-opening the modal is free)."""
    row = _get_connection(session, user, "github")
    if row is None:
        raise HTTPException(status_code=400, detail="No GitHub connection saved. Connect in Settings.")
    cfg = _decrypt_github_config(row)
    client = GitHubClient(api_token=cfg["api_token"])
    return client.list_labels(owner=owner, repo=repo)


@router.post("/api/extractions/{extraction_id}/push/github", response_model=PushToGitHubResult)
def push_to_github(
    extraction_id: str,
    payload: PushToGitHubRequest,
    session: SessionDep,
    user: UserDep,
) -> PushToGitHubResult:
    extraction = session.get(Extraction, extraction_id)
    if not in_scope(extraction, user):
        raise HTTPException(status_code=404, detail="Extraction not found")

    row = _get_connection(session, user, "github")
    if row is None:
        raise HTTPException(status_code=400, detail="No GitHub connection saved. Connect in Settings.")
    cfg = _decrypt_github_config(row)
    client = GitHubClient(api_token=cfg["api_token"])

    if not (extraction.stories or []):
        raise HTTPException(status_code=400, detail="No stories to push.")

    return push_extraction_github(
        client,
        extraction,
        owner=payload.owner,
        repo=payload.repo,
        labels=list(payload.labels or []),
    )


# ---- Slack connection (M6.6) ----------------------------------------------


def _decrypt_slack_config(row: IntegrationConnection) -> dict:
    cfg = json.loads(row.config_json)
    enc = cfg.get("webhook_url_encrypted")
    url = decrypt_secret(enc) if enc else None
    if not url:
        raise HTTPException(
            status_code=400,
            detail="Saved Slack webhook is unreadable (master key may have rotated). Reconnect in Settings.",
        )
    cfg["webhook_url"] = url
    cfg.pop("webhook_url_encrypted", None)
    return cfg


def _slack_url_preview(url: str) -> str:
    """Show prefix + ••••<last 4 of trailing token>. Slack webhook URLs
    look like .../services/T../B../<long secret>; the secret is the only
    thing worth hiding."""
    if not url:
        return ""
    tail = url.rstrip("/").split("/")[-1]
    masked = "•••• " + (tail[-4:] if len(tail) >= 4 else tail)
    return f"https://hooks.slack.com/…/{masked}"


def _to_slack_read(row: IntegrationConnection) -> SlackConnectionRead:
    cfg = json.loads(row.config_json)
    enc = cfg.get("webhook_url_encrypted")
    plain = decrypt_secret(enc) if enc else ""
    return SlackConnectionRead(
        webhook_url_preview=_slack_url_preview(plain or ""),
        channel_label=cfg.get("channel_label"),
        scope=row.scope,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/api/integrations/slack/connection", response_model=SlackConnectionRead | None)
def get_slack_connection(session: SessionDep, user: UserDep):
    row, _ = _resolve_connection(session, user, "slack")
    return _to_slack_read(row) if row else None


@router.put("/api/integrations/slack/connection", response_model=SlackConnectionRead)
def put_slack_connection(payload: SlackConnectionWrite, session: SessionDep, user: UserDep):
    """Upsert. Light shape validation — Slack webhook URLs always start
    with `https://hooks.slack.com/services/`. Reject anything else early
    so a typo doesn't burn the first push attempt."""
    url = (payload.webhook_url or "").strip()
    if not url.startswith("https://hooks.slack.com/services/"):
        raise HTTPException(
            status_code=400,
            detail="Webhook URL must start with https://hooks.slack.com/services/",
        )

    cfg = {
        "webhook_url_encrypted": encrypt_secret(url),
        "channel_label": (payload.channel_label or None),
    }
    scope, scope_id = _validate_write_scope(user, payload.scope)
    row = _upsert_connection(session, scope=scope, scope_id=scope_id, kind="slack", cfg=cfg)
    return _to_slack_read(row)


@router.delete("/api/integrations/slack/connection", status_code=204)
def delete_slack_connection(
    session: SessionDep, user: UserDep, scope: str = "user",
) -> None:
    s, sid = _validate_write_scope(user, scope)
    row = _get_connection_at(session, s, sid, "slack")
    if row is None:
        return
    session.delete(row)
    session.commit()


# ---- Slack additional webhooks (M6.6.b) ------------------------------------


def _slack_destinations(row: IntegrationConnection) -> list[dict]:
    """Return all destinations on this Slack connection (M6.6.b).

    Shape: `[{id, name, webhook_url, channel_label, is_primary}]` with the
    primary first when present, then each named additional in insertion
    order. Used by `_resolve_slack_webhook` (push) and the list endpoint
    (settings UI).
    """
    cfg = json.loads(row.config_json)
    out: list[dict] = []
    primary_enc = cfg.get("webhook_url_encrypted")
    if primary_enc:
        out.append({
            "id": "__primary__",
            "name": cfg.get("channel_label") or "Primary",
            "webhook_url": decrypt_secret(primary_enc),
            "channel_label": cfg.get("channel_label"),
            "is_primary": True,
        })
    for w in (cfg.get("additional") or []):
        url_enc = w.get("url_encrypted")
        if not url_enc:
            continue
        out.append({
            "id": w["id"],
            "name": w.get("name") or "(unnamed)",
            "webhook_url": decrypt_secret(url_enc),
            "channel_label": w.get("label"),
            "is_primary": False,
        })
    return out


def _resolve_slack_webhook(row: IntegrationConnection, webhook_id: str | None) -> dict:
    """Pick which destination a push targets. None or empty → primary."""
    dests = _slack_destinations(row)
    if not dests:
        raise HTTPException(status_code=400, detail="No Slack destinations configured. Add one in Settings.")
    if not webhook_id:
        # Default: primary if present, else first additional.
        return dests[0]
    for d in dests:
        if d["id"] == webhook_id:
            return d
    raise HTTPException(status_code=404, detail=f"Unknown Slack webhook: {webhook_id}")


@router.get("/api/integrations/slack/webhooks", response_model=list[SlackWebhookRead])
def list_slack_webhooks(session: SessionDep, user: UserDep):
    """List every destination on the active Slack connection (M6.6.b).

    Returns previews only — webhook URLs are never echoed back. Empty list
    when no Slack connection saved (the route returns 200 + [] rather than
    400 so the UI can render a "no destinations yet" state without a
    second probe)."""
    row = _get_connection(session, user, "slack")
    if row is None:
        return []
    return [
        SlackWebhookRead(
            id=d["id"],
            name=d["name"],
            webhook_url_preview=_slack_url_preview(d["webhook_url"]),
            channel_label=d.get("channel_label"),
            is_primary=d["is_primary"],
        )
        for d in _slack_destinations(row)
    ]


@router.post("/api/integrations/slack/webhooks", response_model=SlackWebhookRead)
def add_slack_webhook(payload: SlackWebhookCreate, session: SessionDep, user: UserDep):
    """Add a named additional destination to the active Slack connection.

    Requires the connection to exist (the primary webhook from the existing
    /connection PUT). Returns 400 with a helpful message otherwise so the UI
    can route the user back to the main form first."""
    row = _get_connection(session, user, "slack")
    if row is None:
        raise HTTPException(
            status_code=400,
            detail="Set a primary Slack webhook first via the connection form, then add additional destinations.",
        )
    url = (payload.webhook_url or "").strip()
    if not url.startswith("https://hooks.slack.com/services/"):
        raise HTTPException(
            status_code=400,
            detail="Webhook URL must start with https://hooks.slack.com/services/",
        )
    cfg = json.loads(row.config_json)
    additional = list(cfg.get("additional") or [])
    # Cap — keeps the picker UI sensible. 25 destinations covers any real
    # team; beyond that the picker becomes a long-list problem worth its
    # own UX (search, grouping).
    if len(additional) >= 25:
        raise HTTPException(status_code=400, detail="Maximum 25 additional destinations reached.")

    import secrets as _secrets
    new_id = f"wh_{format(int(datetime.now(timezone.utc).timestamp() * 1000), 'x')}_{_secrets.token_hex(3)}"
    additional.append({
        "id": new_id,
        "name": payload.name.strip(),
        "url_encrypted": encrypt_secret(url),
        "label": (payload.channel_label or None),
    })
    cfg["additional"] = additional
    row.config_json = json.dumps(cfg)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)

    return SlackWebhookRead(
        id=new_id,
        name=payload.name.strip(),
        webhook_url_preview=_slack_url_preview(url),
        channel_label=payload.channel_label,
        is_primary=False,
    )


@router.delete("/api/integrations/slack/webhooks/{webhook_id}", status_code=204)
def delete_slack_webhook(webhook_id: str, session: SessionDep, user: UserDep) -> None:
    """Remove one named additional destination. Cannot remove `__primary__`
    (that goes through the existing /connection DELETE so the UX stays
    coherent — primary delete = full disconnect)."""
    if webhook_id == "__primary__":
        raise HTTPException(
            status_code=400,
            detail="To remove the primary webhook, use Disconnect in the connection form.",
        )
    row = _get_connection(session, user, "slack")
    if row is None:
        return
    cfg = json.loads(row.config_json)
    before = list(cfg.get("additional") or [])
    after = [w for w in before if w.get("id") != webhook_id]
    if len(after) == len(before):
        return
    cfg["additional"] = after
    row.config_json = json.dumps(cfg)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()


@router.post("/api/extractions/{extraction_id}/push/slack", response_model=PushToSlackResult)
def push_to_slack(
    extraction_id: str,
    payload: PushToSlackRequest,
    session: SessionDep,
    user: UserDep,
) -> PushToSlackResult:
    extraction = session.get(Extraction, extraction_id)
    if not in_scope(extraction, user):
        raise HTTPException(status_code=404, detail="Extraction not found")

    row = _get_connection(session, user, "slack")
    if row is None:
        raise HTTPException(status_code=400, detail="No Slack connection saved. Connect in Settings.")
    # M6.6.b — resolve destination based on payload.webhook_id; defaults to
    # primary when omitted so legacy clients keep working.
    dest = _resolve_slack_webhook(row, payload.webhook_id)

    # Pull the resolved-gap indexes from gap_state so we can filter them
    # out of the post (default — user can override with include_resolved=true).
    resolved_indexes: set[int] = set()
    if not payload.include_resolved:
        from sqlmodel import select as sql_select
        rows = session.exec(
            sql_select(GapState).where(GapState.extraction_id == extraction_id)
        ).all()
        resolved_indexes = {gs.gap_idx for gs in rows if gs.resolved}

    posted = slack_post_gaps(
        webhook_url=dest["webhook_url"],
        extraction=extraction,
        include_resolved=payload.include_resolved,
        gap_resolved_indexes=resolved_indexes,
    )
    return PushToSlackResult(posted_gap_count=posted)


# ---- Notion connection (M6.5) ---------------------------------------------


def _decrypt_notion_config(row: IntegrationConnection) -> dict:
    cfg = json.loads(row.config_json)
    enc = cfg.get("token_encrypted")
    token = decrypt_secret(enc) if enc else None
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Saved Notion token is unreadable (master key may have rotated). Reconnect in Settings.",
        )
    cfg["token"] = token
    cfg.pop("token_encrypted", None)
    return cfg


def _to_notion_read(row: IntegrationConnection) -> NotionConnectionRead:
    cfg = json.loads(row.config_json)
    enc = cfg.get("token_encrypted")
    plain = decrypt_secret(enc) if enc else ""
    return NotionConnectionRead(
        token_preview=key_preview(plain or ""),
        default_database_id=cfg.get("default_database_id"),
        scope=row.scope,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/api/integrations/notion/connection", response_model=NotionConnectionRead | None)
def get_notion_connection(session: SessionDep, user: UserDep):
    row, _ = _resolve_connection(session, user, "notion")
    return _to_notion_read(row) if row else None


@router.put("/api/integrations/notion/connection", response_model=NotionConnectionRead)
def put_notion_connection(payload: NotionConnectionWrite, session: SessionDep, user: UserDep):
    cfg = {
        "token_encrypted": encrypt_secret((payload.token or "").strip()),
        "default_database_id": (payload.default_database_id or None),
    }
    scope, scope_id = _validate_write_scope(user, payload.scope)
    row = _upsert_connection(session, scope=scope, scope_id=scope_id, kind="notion", cfg=cfg)
    return _to_notion_read(row)


@router.delete("/api/integrations/notion/connection", status_code=204)
def delete_notion_connection(
    session: SessionDep, user: UserDep, scope: str = "user",
) -> None:
    s, sid = _validate_write_scope(user, scope)
    row = _get_connection_at(session, s, sid, "notion")
    if row is None:
        return
    session.delete(row)
    session.commit()


@router.get("/api/integrations/notion/databases", response_model=list[NotionDatabase])
def list_notion_databases(session: SessionDep, user: UserDep):
    """Live fetch — also test-connection probe. Notion-specific gotcha:
    if the integration hasn't been explicitly shared with any database
    via Notion's "..." menu, this returns an empty list. The frontend
    surfaces a doc link in that empty state."""
    row = _get_connection(session, user, "notion")
    if row is None:
        raise HTTPException(status_code=400, detail="No Notion connection saved. Connect in Settings.")
    cfg = _decrypt_notion_config(row)
    client = NotionClient(token=cfg["token"])
    return client.list_databases()


@router.post("/api/extractions/{extraction_id}/push/notion", response_model=PushToNotionResult)
def push_to_notion(
    extraction_id: str,
    payload: PushToNotionRequest,
    session: SessionDep,
    user: UserDep,
) -> PushToNotionResult:
    extraction = session.get(Extraction, extraction_id)
    if not in_scope(extraction, user):
        raise HTTPException(status_code=404, detail="Extraction not found")

    row = _get_connection(session, user, "notion")
    if row is None:
        raise HTTPException(status_code=400, detail="No Notion connection saved. Connect in Settings.")
    cfg = _decrypt_notion_config(row)
    client = NotionClient(token=cfg["token"])

    if not (extraction.stories or []):
        raise HTTPException(status_code=400, detail="No stories to push.")

    return push_extraction_notion(
        client,
        extraction,
        database_id=payload.database_id,
        title_prop=payload.title_prop,
    )
