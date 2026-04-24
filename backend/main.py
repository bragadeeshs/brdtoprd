import io
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv

# Load backend/.env BEFORE importing extract (which reads ANTHROPIC_API_KEY)
load_dotenv(Path(__file__).parent / ".env")

import anthropic
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pypdf import PdfReader
from docx import Document
from sqlmodel import Session

from auth.deps import CurrentUser, current_user
from db.session import get_session, init_db
from models import ExtractionRecord
from routers import extractions as extractions_router
from routers import projects as projects_router
from services.extractions import (
    call_claude,
    extraction_to_record,
    mint_extraction_id,
    persist_extraction,
    record_usage,
    save_upload,
)

MAX_BYTES = 10 * 1024 * 1024  # 10 MB
SUPPORTED_EXT = {".pdf", ".docx", ".txt", ".md", ".markdown", ".rst"}

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("storyforge")

@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="StoryForge backend", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router-level auth: every route under /api/extractions and /api/projects
# requires a verified Clerk session. /api/health stays public for infra probes.
app.include_router(extractions_router.router, dependencies=[Depends(current_user)])
app.include_router(projects_router.router, dependencies=[Depends(current_user)])


def _parse_pdf(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return "\n\n".join((page.extract_text() or "") for page in reader.pages).strip()


def _parse_docx(data: bytes) -> str:
    """Extract paragraph + table cell text from a .docx file."""
    doc = Document(io.BytesIO(data))
    parts: list[str] = []
    # Paragraphs in document body order. python-docx doesn't iterate tables and
    # paragraphs in mixed order out of the box, so do paragraphs first, then
    # tables — good enough for BRDs which are mostly prose with occasional tables.
    for para in doc.paragraphs:
        text = para.text.strip()
        if text:
            parts.append(text)
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                parts.append(row_text)
    return "\n\n".join(parts).strip()


def _parse_file(filename: str, data: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return _parse_pdf(data)
    if lower.endswith(".docx"):
        return _parse_docx(data)
    # Default: treat as text. errors='replace' so a stray binary byte doesn't 500.
    return data.decode("utf-8", errors="replace")


@app.get("/api/health")
def health():
    return {"ok": True, "live": bool(os.environ.get("ANTHROPIC_API_KEY"))}


@app.post("/api/test-key")
def test_key(
    _user: Annotated[CurrentUser, Depends(current_user)],
    x_anthropic_key: str | None = Header(default=None, alias="X-Anthropic-Key"),
):
    """Validate an Anthropic API key by making a tiny authenticated call.

    Used by the Settings page "Test connection" button. Falls back to the
    server's env key when no header is provided. Cost: one models.list call,
    no token usage.
    """
    key = x_anthropic_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="No API key provided.")
    try:
        client = anthropic.Anthropic(api_key=key)
        models = client.models.list()
        count = len(getattr(models, "data", []) or [])
        return {"ok": True, "models_visible": count, "source": "byok" if x_anthropic_key else "env"}
    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid API key.")
    except anthropic.PermissionDeniedError:
        raise HTTPException(status_code=403, detail="Key lacks required permissions.")
    except anthropic.APIConnectionError:
        raise HTTPException(status_code=503, detail="Could not reach Anthropic.")
    except anthropic.APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"Anthropic error ({e.status_code}): {e.message}")
    except Exception as e:
        log.exception("test_key failed")
        raise HTTPException(status_code=500, detail=f"Test failed: {e}")


@app.post("/api/extract", response_model=ExtractionRecord)
async def extract(
    session: Annotated[Session, Depends(get_session)],
    _user: Annotated[CurrentUser, Depends(current_user)],
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    filename: str | None = Form(default=None),
    project_id: str | None = Form(default=None),
    x_anthropic_key: str | None = Header(default=None, alias="X-Anthropic-Key"),
    x_storyforge_model: str | None = Header(default=None, alias="X-Storyforge-Model"),
) -> ExtractionRecord:
    if file is None and not text:
        raise HTTPException(status_code=400, detail="Provide either a file or text.")

    upload_bytes: bytes | None = None
    if file is not None:
        data = await file.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File over {MAX_BYTES // (1024 * 1024)} MB limit.",
            )
        ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
        if ext and ext not in SUPPORTED_EXT:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type {ext}. Supported: {', '.join(sorted(SUPPORTED_EXT))}",
            )
        try:
            raw_text = _parse_file(file.filename or "uploaded", data)
        except Exception as e:
            log.exception("file parse failed")
            raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")
        source_name = file.filename or "uploaded"
        upload_bytes = data
    else:
        raw_text = text or ""
        source_name = filename or "pasted_text.txt"

    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="No readable text in the input.")

    # Anthropic errors are translated to HTTPExceptions inside `call_claude`,
    # so we let them propagate uncaught.
    result, model_used, usage = call_claude(
        filename=source_name,
        raw_text=raw_text,
        api_key=x_anthropic_key,
        model=x_storyforge_model,
    )

    # Mint the id up front so the upload path can reference it before the
    # row exists. If the disk write fails, we 500 without persisting — no
    # orphaned row pointing at a missing file.
    extraction_id = mint_extraction_id()
    source_path: str | None = None
    if upload_bytes is not None:
        try:
            source_path = save_upload(extraction_id, source_name, upload_bytes)
        except OSError as e:
            log.exception("upload save failed")
            raise HTTPException(status_code=500, detail=f"Could not store uploaded file: {e}")

    row = persist_extraction(
        session,
        result=result,
        model_used=model_used,
        project_id=project_id or None,
        extraction_id=extraction_id,
        source_file_path=source_path,
    )
    record_usage(
        session,
        extraction_id=row.id,
        action="extract",
        model=model_used,
        live=result.live,
        usage=usage,
    )
    return extraction_to_record(row)


# Mount built frontend last so /api/* routes take precedence. Only mounts when
# the static dir exists — dev mode (Vite on :5173 proxying to us) skips this.
_static_dir = os.environ.get("STATIC_DIR", "static")
if os.path.isdir(_static_dir):
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
    log.info("serving built frontend from %s", _static_dir)
