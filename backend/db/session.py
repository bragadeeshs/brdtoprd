"""SQLite engine + FastAPI session dependency (M2.1.4).

Synchronous SQLModel sessions today; async (aiosqlite) can be layered in
later if route latency starts mattering. For our workload — one DB write per
extraction — sync is fine.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

# Import models so SQLModel.metadata sees them before create_all runs.
from . import models  # noqa: F401

log = logging.getLogger("storyforge.db")

DB_PATH = Path(os.environ.get("STORYFORGE_DB", str(Path(__file__).resolve().parent.parent / "storyforge.db")))
DB_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False because FastAPI runs sync routes on its threadpool;
# the engine pool may hand a connection to a different thread than the one
# that opened it.
engine = create_engine(
    DB_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


def init_db() -> None:
    """Create all tables. Idempotent — safe to call on every startup."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    log.info("DB ready at %s — tables: %s", DB_PATH, sorted(SQLModel.metadata.tables.keys()))


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a session that auto-closes after the request."""
    with Session(engine) as session:
        yield session
