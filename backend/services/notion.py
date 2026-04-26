"""Notion REST client (M6.5).

Auth: integration token from notion.so/my-integrations. Same encrypted-
storage pattern as the other trackers. Critical UX caveat: the user
*must* explicitly share each target database with the integration via
the database's "..." menu → Add connections — without this the
integration sees no databases at all (search returns empty).

Notion's API has two awkward shapes we work around:

  1. Databases have user-defined column schemas. The title column can
     be renamed (often "Story", "Item", etc. — not always "Name"), so
     we discover the title-property name dynamically from each database
     and use it when creating pages.

  2. Notion doesn't accept markdown. The page body is a list of
     "block" objects (paragraph, heading_3, bulleted_list_item, quote)
     each carrying a rich_text array. We build these block trees
     ourselves — _build_blocks() does the work.

httpx everywhere (consistent with the other trackers; the official
notion-client SDK is ~30 KB and adds little for two endpoints).

Public surface:
  - NotionClient.list_databases() -> list[NotionDatabase]
  - NotionClient.create_page(database_id, title_prop, title, blocks) -> {id, url}
  - push_extraction(client, extraction, database_id, title_prop) -> PushToNotionResult
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import HTTPException

from db.models import Extraction
from models import NotionDatabase, PushedIssue, PushToNotionResult

log = logging.getLogger("storyforge.notion")

NOTION_API = "https://api.notion.com/v1"
NOTION_API_VERSION = "2022-06-28"   # current stable
HTTP_TIMEOUT = 25.0


class NotionClient:
    def __init__(self, token: str):
        self.token = (token or "").strip()

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Notion-Version": NOTION_API_VERSION,
            "Content-Type": "application/json",
        }

    def list_databases(self) -> list[NotionDatabase]:
        """All databases visible to the integration. Returns up to 100;
        most workspaces have far fewer integration-shared databases.

        We use POST /v1/search with an object filter rather than the
        deprecated GET /v1/databases. Each result includes the schema
        inline so we can find the title property name in one hop."""
        url = f"{NOTION_API}/search"
        try:
            r = httpx.post(
                url,
                headers=self._headers(),
                json={
                    "filter": {"value": "database", "property": "object"},
                    "page_size": 100,
                },
                timeout=HTTP_TIMEOUT,
            )
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Could not reach Notion: {e}")
        if r.status_code == 401:
            raise HTTPException(status_code=401, detail="Notion auth failed — re-enter the integration token in Settings.")
        if not r.is_success:
            raise HTTPException(status_code=502, detail=f"Notion search failed ({r.status_code}): {r.text[:200]}")
        body = r.json()
        out: list[NotionDatabase] = []
        for d in body.get("results", []):
            # Title is a list of rich_text fragments; concatenate plain_text
            # so a multi-fragment title (rare but possible) renders as one.
            title_frags = d.get("title") or []
            title = "".join(f.get("plain_text", "") for f in title_frags) or "(untitled)"
            # Find the property whose type is "title" — that's the title
            # column name we need when creating pages. Should always exist;
            # default to "Name" defensively.
            title_prop = "Name"
            for prop_name, prop in (d.get("properties") or {}).items():
                if prop.get("type") == "title":
                    title_prop = prop_name
                    break
            out.append(NotionDatabase(
                id=d["id"],
                title=title,
                title_prop=title_prop,
                url=d.get("url", ""),
            ))
        return out

    def create_page(
        self,
        *,
        database_id: str,
        title_prop: str,
        title: str,
        blocks: list[dict],
    ) -> dict[str, Any]:
        """Create a page in `database_id`. Title goes in the property named
        `title_prop` (discovered upstream); body content goes in `children`
        as a list of block objects. Returns {id, url}."""
        url = f"{NOTION_API}/pages"
        payload = {
            "parent": {"database_id": database_id},
            "properties": {
                title_prop: {
                    "title": [{"type": "text", "text": {"content": title[:2000]}}]
                }
            },
            "children": blocks[:100],   # Notion caps children at 100 per create
        }
        try:
            r = httpx.post(url, headers=self._headers(), json=payload, timeout=HTTP_TIMEOUT)
        except httpx.HTTPError as e:
            raise Exception(f"Network error: {e}")
        if r.status_code == 401:
            raise Exception("Notion auth failed (token rejected)")
        if r.status_code == 403:
            raise Exception("Notion permission denied — share the database with the integration first")
        if r.status_code == 404:
            raise Exception("Database not found or not shared with this integration")
        if not r.is_success:
            try:
                err = r.json()
                msg = err.get("message") or r.text[:200]
                raise Exception(f"Notion rejected the page: {msg}")
            except Exception:
                raise Exception(f"Notion create failed ({r.status_code}): {r.text[:200]}")
        body = r.json()
        return {"id": body["id"], "url": body.get("url", "")}


def _text(content: str, *, bold: bool = False, italic: bool = False) -> dict:
    """One rich_text fragment with optional annotations. Notion truncates
    text fragments at 2000 chars — caller should split before this if
    a single field could exceed that."""
    return {
        "type": "text",
        "text": {"content": content[:2000]},
        "annotations": {"bold": bold, "italic": italic},
    }


def _para(*frags: dict) -> dict:
    return {"type": "paragraph", "paragraph": {"rich_text": list(frags)}}


def _heading3(content: str) -> dict:
    return {"type": "heading_3", "heading_3": {"rich_text": [_text(content, bold=True)]}}


def _bullet(content: str) -> dict:
    return {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [_text(content)]}}


def _quote(content: str) -> dict:
    return {"type": "quote", "quote": {"rich_text": [_text(content, italic=True)]}}


def _build_blocks(story: dict[str, Any]) -> list[dict]:
    """Render one story as a block tree.

    Layout:
      [paragraph]  As a X, I want Y, so that Z.   (each label bold)
      [paragraph]  Source: §1.2                    (italic, only if section)
      [heading_3]  Acceptance criteria              (only if criteria)
      [bullet…]    one per criterion
      [quote]       source quote                   (only if present)
    """
    actor = story.get("actor", "")
    blocks: list[dict] = [
        _para(
            _text("As a ", bold=True),
            _text(actor),
            _text(" I want ", bold=True),
            _text(story.get("want", "")),
            _text(" so that ", bold=True),
            _text(story.get("so_that", "")),
            _text("."),
        ),
    ]
    section = story.get("section")
    if section:
        blocks.append(_para(_text(f"Source: {section}", italic=True)))
    criteria = story.get("criteria") or []
    if criteria:
        blocks.append(_heading3("Acceptance criteria"))
        for c in criteria:
            blocks.append(_bullet(c))
    quote = story.get("source_quote")
    if quote:
        blocks.append(_quote(quote))
    return blocks


def push_extraction(
    client: NotionClient,
    extraction: Extraction,
    *,
    database_id: str,
    title_prop: str,
) -> PushToNotionResult:
    """Push every story in the extraction as a Notion page. Per-story
    failures land in `failed[]` (mirrors Jira/Linear/GitHub contracts).

    `title_prop` is discovered upstream from the database schema (see
    `list_databases` — different databases use different names for the
    title column)."""
    pushed: list[PushedIssue] = []
    failed: list[dict] = []
    for s in (extraction.stories or []):
        try:
            title = f"{s.get('id', '?')}: {s.get('want', '')[:200]}"
            blocks = _build_blocks(s)
            res = client.create_page(
                database_id=database_id,
                title_prop=title_prop,
                title=title,
                blocks=blocks,
            )
            pushed.append(PushedIssue(
                story_id=s.get("id", ""),
                # Notion page IDs are UUIDs without a short identifier; use
                # "story_id → notion" so the result UI links back consistently.
                issue_key=f"{s.get('id', '?')} (Notion)",
                issue_url=res["url"],
            ))
        except Exception as e:
            log.warning("notion push failed for story %s: %s", s.get("id"), e)
            failed.append({"story_id": s.get("id", ""), "error": str(e)})
    return PushToNotionResult(pushed=pushed, failed=failed)
