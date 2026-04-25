"""Pydantic API schemas (request/response shapes).

Kept separate from `db/models.py` (SQLModel storage). Conversion happens in
`services/extractions.py`. Routes return these; SQLModel types never leak.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Brief(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str
    tags: list[str] = Field(default_factory=list)


class UserStory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    actor: str
    want: str
    so_that: str
    section: str = ""
    criteria: list[str] = Field(default_factory=list)


class NonFunctional(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str
    value: str


class Gap(BaseModel):
    model_config = ConfigDict(extra="forbid")
    severity: Literal["high", "med", "low"]
    question: str
    section: str = ""
    context: str = ""


class ExtractionPayload(BaseModel):
    """Shape the model produces. Passed to messages.parse()."""
    model_config = ConfigDict(extra="forbid")
    brief: Brief
    actors: list[str]
    stories: list[UserStory]
    nfrs: list[NonFunctional]
    gaps: list[Gap]


class ExtractionResult(ExtractionPayload):
    """Inline extraction output — pre-persistence. Used internally by extract.py."""
    filename: str
    raw_text: str
    live: bool


# ============================================================================
# Persistence-aware schemas — used by /api/extractions/* endpoints (M2.2)
# ============================================================================


class ExtractionRecord(ExtractionPayload):
    """Full record returned by GET /api/extractions/{id} and POST /api/extract.

    Extends the model payload with server metadata so the frontend can list,
    open, and persist records without going back through the LLM.
    """
    id: str
    filename: str
    raw_text: str
    model_used: str
    live: bool
    project_id: str | None = None
    source_file_path: str | None = None
    created_at: datetime
    root_id: str | None = None  # M2.6 — null for v1, set for re-runs


class ExtractionSummary(BaseModel):
    """Lightweight row for GET /api/extractions — no raw_text, no full payload.

    Carries just enough for the Documents list view (counts + provenance).
    """
    model_config = ConfigDict(extra="forbid")
    id: str
    filename: str
    created_at: datetime
    model_used: str
    live: bool
    project_id: str | None = None
    root_id: str | None = None  # M2.6 — null for v1, set for re-runs
    actor_count: int
    story_count: int
    gap_count: int
    brief_summary: str = ""
    brief_tags: list[str] = Field(default_factory=list)


class ExtractionPatch(BaseModel):
    """PATCH /api/extractions/{id} body — partial update."""
    model_config = ConfigDict(extra="forbid")
    filename: str | None = None
    project_id: str | None = None  # set to "" to clear


class ExtractionImport(BaseModel):
    """POST /api/extractions/import — bulk import from localStorage migration."""
    model_config = ConfigDict(extra="forbid")
    id: str
    filename: str
    saved_at: datetime | None = None
    payload: ExtractionResult


# ----- Gap state -----


class GapStateRead(BaseModel):
    model_config = ConfigDict(extra="forbid")
    gap_idx: int
    resolved: bool = False
    ignored: bool = False
    asked_at: datetime | None = None
    updated_at: datetime


class GapStatePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resolved: bool | None = None
    ignored: bool | None = None
    asked_at: datetime | None = None  # client passes ISO; null clears


# ----- Projects -----


class ProjectRead(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    name: str
    created_at: datetime
    extraction_count: int = 0


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)


class ProjectPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=120)


# ----- User settings (M3.4.4) -----


class UserSettingsRead(BaseModel):
    """Response from GET /api/me/settings.

    Never returns the raw API key — `anthropic_key_set` + `anthropic_key_preview`
    let the UI render the "Active" badge and the masked tail (e.g. `••••XYZK`)
    without exposing the secret. The actual decryption happens server-side at
    extract time.
    """
    model_config = ConfigDict(extra="forbid")
    anthropic_key_set: bool
    anthropic_key_preview: str | None = None  # last 4 chars of the plaintext key
    model_default: str | None = None
    updated_at: datetime | None = None


class UserSettingsPatch(BaseModel):
    """PUT /api/me/settings body. None = no change. "" = clear the field."""
    model_config = ConfigDict(extra="forbid")
    anthropic_key: str | None = None
    model_default: str | None = None


# ----- Versions (M2.6) -----


class ExtractionVersion(BaseModel):
    """One entry in GET /api/extractions/{id}/versions."""
    model_config = ConfigDict(extra="forbid")
    id: str
    version: int  # 1-indexed, ordered by created_at asc
    created_at: datetime
    model_used: str
    live: bool


class ExtractionRerunRequest(BaseModel):
    """POST /api/extractions/{id}/rerun body — all fields optional."""
    model_config = ConfigDict(extra="forbid")
    # Future: per-request system prompt overrides go here.
