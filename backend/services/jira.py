"""Jira REST client (M6.2).

Atlassian Cloud REST API v3, basic auth (email + API token). The token is
issued by the user at https://id.atlassian.com/manage-profile/security/api-tokens
and stored encrypted server-side via `services/byok.encrypt_secret` — same
pattern as the Anthropic BYOK key.

We use httpx (already a dep transitively) instead of the `atlassian-python-api`
SDK for the same reason we skip SDKs for Lemon Squeezy + Resend: simpler
mocks, predictable failure modes, no extra package weight.

Public surface:
  - JiraClient.list_projects() -> list[JiraProject]
  - JiraClient.create_issue(project_key, issue_type, summary, description) -> {key, url}
  - push_extraction(client, extraction, project_key, issue_type) -> PushToJiraResult

All HTTP errors translate to HTTPException at the route layer; this module
raises bare Exception with the upstream message so callers can choose how
to surface it (per-story failure vs whole-batch abort).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import HTTPException

from db.models import Extraction
from models import JiraProject, PushToJiraResult, PushedIssue

log = logging.getLogger("storyforge.jira")

# Sane HTTP timeout so a slow Atlassian instance doesn't pile up uvicorn
# workers. 20s covers most real Atlassian Cloud calls (median ~500ms).
HTTP_TIMEOUT = 20.0


class JiraClient:
    """Jira REST client with two auth modes.

    M6.2 (API token): construct with `base_url + email + api_token`. Uses
    HTTP Basic auth; `base_url` is the user's Atlassian site (e.g.
    `https://acme.atlassian.net`).

    M6.2.d (OAuth 3LO): construct with `cloud_id + access_token + site_url`.
    `base_url` is `https://api.atlassian.com/ex/jira/{cloud_id}` (Atlassian's
    OAuth proxy); auth is `Bearer <access_token>`. `site_url` is the user-
    facing host used for issue links (e.g. `https://acme.atlassian.net/browse/X-1`).
    """

    def __init__(
        self,
        base_url: str,
        email: str | None = None,
        api_token: str | None = None,
        *,
        access_token: str | None = None,
        site_url: str | None = None,
    ):
        # Strip trailing slash so URL building is predictable.
        self.base_url = (base_url or "").rstrip("/")
        # site_url is the user-facing Atlassian site for clickable issue links.
        # API-token mode: same as base_url. OAuth mode: passed explicitly
        # (base_url is the OAuth proxy host, which doesn't render issues).
        self.site_url = (site_url or self.base_url).rstrip("/")
        self.access_token = access_token
        if access_token:
            self.auth = None
        else:
            self.auth = (email or "", api_token or "")

    def _headers(self) -> dict:
        h = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.access_token:
            h["Authorization"] = f"Bearer {self.access_token}"
        return h

    def list_projects(self) -> list[JiraProject]:
        """Return up to 50 projects visible to the connected user. Pagination
        beyond 50 isn't a v1 concern — picker UX would need search anyway."""
        url = f"{self.base_url}/rest/api/3/project/search?maxResults=50"
        try:
            r = httpx.get(url, auth=self.auth, headers=self._headers(), timeout=HTTP_TIMEOUT)  # auth=None is fine
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Could not reach Jira: {e}")
        if r.status_code == 401:
            raise HTTPException(status_code=401, detail="Jira auth failed — check email + API token in Settings.")
        if not r.is_success:
            raise HTTPException(status_code=502, detail=f"Jira projects fetch failed ({r.status_code}): {r.text[:200]}")
        body = r.json()
        # `/project/search` returns {values: [...]}; older `/project` returns a bare list.
        items = body.get("values", body) if isinstance(body, dict) else body
        return [JiraProject(id=p["id"], key=p["key"], name=p["name"]) for p in items]

    def create_issue(
        self,
        *,
        project_key: str,
        issue_type: str,
        summary: str,
        description_md: str,
        parent_key: str | None = None,
    ) -> dict[str, str]:
        """Create one issue. Returns {key, url}.

        Description goes in via the Atlassian Document Format (ADF) — Jira
        Cloud no longer accepts plain markdown on v3. We build the simplest
        ADF wrapper (one paragraph node) and let the markdown render as
        plain text. Lossy but works without an MD→ADF conversion library;
        criteria render as `* item` lines.

        M6.2.b: when `parent_key` is set, the issue is created as a sub-task
        of that parent — Jira requires `fields.parent.key` for any issue
        whose type is a sub-task variant. The caller is responsible for
        passing the correct sub-task issue type name (`subtask_type_name`
        from `subtask_type_for_project`).
        """
        url = f"{self.base_url}/rest/api/3/issue"
        fields: dict = {
            "project": {"key": project_key},
            "issuetype": {"name": issue_type},
            "summary": summary[:255],   # Jira hard cap on summary
            "description": _md_to_adf(description_md),
        }
        if parent_key:
            fields["parent"] = {"key": parent_key}
        payload = {"fields": fields}
        try:
            r = httpx.post(url, auth=self.auth, headers=self._headers(), json=payload, timeout=HTTP_TIMEOUT)
        except httpx.HTTPError as e:
            raise Exception(f"Network error: {e}")
        if r.status_code == 401:
            raise Exception("Jira auth failed (token rejected)")
        if r.status_code == 403:
            raise Exception("Jira permission denied (insufficient project access)")
        if not r.is_success:
            # Try to extract Jira's structured error for a useful message.
            try:
                err = r.json()
                msg = err.get("errorMessages") or list(err.get("errors", {}).values()) or [r.text[:200]]
                raise Exception(f"Jira rejected the issue: {' / '.join(msg)}")
            except Exception:
                raise Exception(f"Jira create failed ({r.status_code}): {r.text[:200]}")
        body = r.json()
        key = body["key"]
        # Issue links go to the user-facing Atlassian site, not the OAuth proxy.
        return {"key": key, "url": f"{self.site_url}/browse/{key}"}

    def subtask_type_for_project(self, project_key: str) -> str | None:
        """Find the project's sub-task issue-type name (M6.2.b).

        The conventional name is "Sub-task" but Jira admins can rename it
        ("Subtask", "SubTask", "Sub Task" — every flavour exists). We list
        the project's issue-types via `/rest/api/3/issue/createmeta` and
        return the first one with `subtask=true`. Returns None when the
        project doesn't have any sub-task type configured (some
        company-managed projects strip them).
        """
        url = (
            f"{self.base_url}/rest/api/3/issue/createmeta"
            f"?projectKeys={project_key}&expand=projects.issuetypes"
        )
        try:
            r = httpx.get(url, auth=self.auth, headers=self._headers(), timeout=HTTP_TIMEOUT)
        except httpx.HTTPError as e:
            log.warning("createmeta fetch failed for %s: %s", project_key, e)
            return None
        if not r.is_success:
            log.warning("createmeta returned %s for %s", r.status_code, project_key)
            return None
        try:
            projects = r.json().get("projects", []) or []
            if not projects:
                return None
            for it in projects[0].get("issuetypes", []) or []:
                if it.get("subtask"):
                    return it.get("name")
        except Exception as e:  # noqa: BLE001
            log.warning("createmeta parse failed: %s", e)
        return None


def _md_to_adf(md: str) -> dict:
    """Minimal markdown → Atlassian Document Format. Lines split on
    newlines; lines starting with `- ` or `* ` become bullet items;
    everything else is a paragraph. Good enough for a story description
    with a criteria checklist. NOT a general-purpose MD parser."""
    lines = (md or "").split("\n")
    content: list[dict] = []
    bullet_buffer: list[dict] = []

    def flush_bullets():
        if not bullet_buffer:
            return
        content.append({"type": "bulletList", "content": list(bullet_buffer)})
        bullet_buffer.clear()

    for line in lines:
        stripped = line.strip()
        if stripped.startswith(("- ", "* ")):
            text = stripped[2:].strip()
            bullet_buffer.append({
                "type": "listItem",
                "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]
            })
        elif stripped:
            flush_bullets()
            content.append({
                "type": "paragraph",
                "content": [{"type": "text", "text": stripped}],
            })
        # Blank lines: just a paragraph break — flush bullets so a new list can start.
        elif bullet_buffer:
            flush_bullets()

    flush_bullets()
    return {"version": 1, "type": "doc", "content": content or [
        # Jira rejects an empty doc; ship a no-op paragraph instead.
        {"type": "paragraph", "content": []}
    ]}


def _build_story_description(story: dict[str, Any]) -> str:
    """Markdown for one story. Renders `As a / I want / so that`, criteria
    as a bullet list, plus the source quote when present."""
    parts = []
    actor = story.get("actor", "")
    parts.append(f"As a {actor}, I want {story.get('want', '')}, so that {story.get('so_that', '')}.")
    if story.get("section"):
        parts.append(f"Source: {story['section']}")
    parts.append("")
    criteria = story.get("criteria") or []
    if criteria:
        parts.append("Acceptance criteria:")
        for c in criteria:
            parts.append(f"- {c}")
    if story.get("source_quote"):
        parts.append("")
        parts.append(f"Source quote: \"{story['source_quote']}\"")
    return "\n".join(parts)


def push_extraction(
    client: JiraClient,
    extraction: Extraction,
    *,
    project_key: str,
    issue_type: str = "Story",
    create_subtasks: bool = False,
) -> PushToJiraResult:
    """Push every story in the extraction as a Jira issue. Per-story
    failures are recorded in `failed[]` rather than aborting the batch —
    if 7/10 stories land cleanly and 3 hit a missing custom-field error,
    the user gets the 7 plus a per-row failure list to fix the 3.

    M6.2.b: when `create_subtasks=True`, each acceptance criterion becomes
    its own sub-task linked to the parent story. Sub-task creation
    failures are logged into `failed[]` with the parent's story_id +
    a "[criterion N] " prefix on the error so the user can tell which
    sub-task fell over without losing the parent it belongs to. Sub-task
    type is discovered once per push via `subtask_type_for_project` —
    None disables sub-tasks for that project (with a single failed[]
    note explaining why).
    """
    pushed: list[PushedIssue] = []
    failed: list[dict] = []
    stories = extraction.stories or []

    # M6.2.b — discover the project's sub-task type once. Skip the lookup
    # when the caller didn't ask for sub-tasks.
    subtask_type: str | None = None
    if create_subtasks and stories:
        subtask_type = client.subtask_type_for_project(project_key)
        if subtask_type is None:
            failed.append({
                "story_id": "",
                "error": "Sub-tasks were requested but the project has no sub-task issue type. Stories pushed without criterion sub-tasks.",
            })

    for s in stories:
        try:
            summary = f"{s.get('id', '?')}: {s.get('want', '')[:200]}"
            description = _build_story_description(s)
            res = client.create_issue(
                project_key=project_key,
                issue_type=issue_type,
                summary=summary,
                description_md=description,
            )
            pushed.append(PushedIssue(
                story_id=s.get("id", ""),
                issue_key=res["key"],
                issue_url=res["url"],
            ))
        except Exception as e:
            log.warning("jira push failed for story %s: %s", s.get("id"), e)
            failed.append({"story_id": s.get("id", ""), "error": str(e)})
            continue   # skip sub-tasks if the parent failed

        # M6.2.b — sub-task per criterion. The parent has to exist first
        # (we just created it), and Jira won't accept a sub-task without
        # `parent.key`, so this loop runs strictly after the parent push.
        if subtask_type and s.get("criteria"):
            for i, criterion in enumerate(s["criteria"], start=1):
                if not (criterion or "").strip():
                    continue
                try:
                    client.create_issue(
                        project_key=project_key,
                        issue_type=subtask_type,
                        summary=criterion[:255],
                        description_md=f"Acceptance criterion #{i} for {res['key']}.",
                        parent_key=res["key"],
                    )
                except Exception as e:
                    log.warning("jira subtask push failed for %s/criterion %d: %s", res["key"], i, e)
                    failed.append({
                        "story_id": s.get("id", ""),
                        "error": f"[criterion {i}] {e}",
                    })

    return PushToJiraResult(pushed=pushed, failed=failed)
