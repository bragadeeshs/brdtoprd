"""GitHub Issues REST client (M6.4).

Auth: Personal Access Token (PAT) generated at github.com/settings/tokens
with the `repo` scope. The token is stored encrypted server-side via
`services/byok.encrypt_secret` — same pattern as Anthropic + Jira + Linear.

Why REST and not GraphQL: REST has been issue-creation-stable for a decade,
the v3 docs are exhaustive, and our two operations (list repos + create
issue) are one-liners. GraphQL would add a query string + an extra
serialization layer for no real benefit.

httpx everywhere (consistent with the rest of the codebase). The official
PyGithub SDK pulls in lots of object-graph machinery we don't need.

Public surface:
  - GitHubClient.list_repos() -> list[GitHubRepo]
  - GitHubClient.create_issue(owner, repo, title, body) -> {number, url}
  - push_extraction(client, extraction, owner, repo) -> PushToGitHubResult
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import HTTPException

from db.models import Extraction
from models import GitHubRepo, PushedIssue, PushToGitHubResult

log = logging.getLogger("storyforge.github")

GITHUB_API = "https://api.github.com"
HTTP_TIMEOUT = 20.0


class GitHubClient:
    def __init__(self, api_token: str):
        self.api_token = (api_token or "").strip()

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def list_repos(self) -> list[GitHubRepo]:
        """First 100 repos visible to the token, sorted by recent activity.
        Pagination beyond 100 isn't a v1 concern — the picker UX would need
        search anyway, and most users push to repos they touched recently."""
        url = f"{GITHUB_API}/user/repos?per_page=100&sort=updated&type=all"
        try:
            r = httpx.get(url, headers=self._headers(), timeout=HTTP_TIMEOUT)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Could not reach GitHub: {e}")
        if r.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub auth failed — re-enter the PAT in Settings.")
        if not r.is_success:
            raise HTTPException(status_code=502, detail=f"GitHub repos fetch failed ({r.status_code}): {r.text[:200]}")
        items = r.json()
        return [
            GitHubRepo(
                full_name=p["full_name"],
                owner=p["owner"]["login"],
                name=p["name"],
                private=p.get("private", False),
            )
            for p in items
        ]

    def create_issue(
        self,
        *,
        owner: str,
        repo: str,
        title: str,
        body_md: str,
    ) -> dict[str, Any]:
        """Create one issue. GitHub accepts markdown directly in `body` (no
        conversion needed — same as Linear, unlike Jira's ADF). Returns
        {number, url}.

        We intentionally don't apply labels in v1: a label has to exist on
        the repo first, and listing labels per push would double the API
        round-trip count. Add labels via M6.4.b once we have a "label
        picker" UX worth the extra call.
        """
        url = f"{GITHUB_API}/repos/{owner}/{repo}/issues"
        payload = {"title": title[:256], "body": body_md}
        try:
            r = httpx.post(url, headers=self._headers(), json=payload, timeout=HTTP_TIMEOUT)
        except httpx.HTTPError as e:
            raise Exception(f"Network error: {e}")
        if r.status_code == 401:
            raise Exception("GitHub auth failed (token rejected)")
        if r.status_code == 403:
            raise Exception("GitHub permission denied — token may need the `repo` scope, or repo issues may be disabled")
        if r.status_code == 404:
            raise Exception(f"Repo not found or no issue-write access: {owner}/{repo}")
        if r.status_code == 410:
            raise Exception("Issues are disabled on this repo")
        if not r.is_success:
            try:
                err = r.json()
                msg = err.get("message") or r.text[:200]
                raise Exception(f"GitHub rejected the issue: {msg}")
            except Exception:
                raise Exception(f"GitHub create failed ({r.status_code}): {r.text[:200]}")
        body = r.json()
        return {"number": body["number"], "url": body["html_url"]}


def _build_story_description(story: dict[str, Any]) -> str:
    """Markdown body for one GitHub issue. Same shape as Linear's (markdown
    accepted directly — no ADF conversion). Criteria render as a GitHub
    task-list with `- [ ]` so reviewers can tick them off in the issue UI."""
    parts = []
    actor = story.get("actor", "")
    parts.append(f"**As a** {actor}, **I want** {story.get('want', '')}, **so that** {story.get('so_that', '')}.")
    if story.get("section"):
        parts.append(f"\n_Source: {story['section']}_")
    parts.append("")
    criteria = story.get("criteria") or []
    if criteria:
        parts.append("**Acceptance criteria:**")
        for c in criteria:
            # GitHub task-list syntax — renders as a clickable checkbox.
            parts.append(f"- [ ] {c}")
    if story.get("source_quote"):
        parts.append("")
        parts.append(f"> {story['source_quote']}")
    return "\n".join(parts)


def push_extraction(
    client: GitHubClient,
    extraction: Extraction,
    *,
    owner: str,
    repo: str,
) -> PushToGitHubResult:
    """Push every story as a GitHub issue. Per-story failures land in
    `failed[]` (mirrors Jira/Linear push contracts) so a partial success
    keeps the work that landed."""
    pushed: list[PushedIssue] = []
    failed: list[dict] = []
    for s in (extraction.stories or []):
        try:
            title = f"{s.get('id', '?')}: {s.get('want', '')[:200]}"
            body = _build_story_description(s)
            res = client.create_issue(owner=owner, repo=repo, title=title, body_md=body)
            pushed.append(PushedIssue(
                story_id=s.get("id", ""),
                # Use "owner/repo#N" so the displayed key is unambiguous in
                # the result UI (vs just "#N" which loses the repo context).
                issue_key=f"{owner}/{repo}#{res['number']}",
                issue_url=res["url"],
            ))
        except Exception as e:
            log.warning("github push failed for story %s: %s", s.get("id"), e)
            failed.append({"story_id": s.get("id", ""), "error": str(e)})
    return PushToGitHubResult(pushed=pushed, failed=failed)
