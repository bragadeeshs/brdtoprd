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
    """Create all tables + apply tiny additive migrations. Idempotent.

    `create_all` only adds *new* tables — it doesn't ALTER existing ones. For
    each additive column we ship in dev (M2.6 introduced `extraction.root_id`),
    we run a guarded ALTER TABLE so existing SQLite databases keep working.
    Real migrations land with alembic at M3.2 (Postgres cutover).
    """
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
    _apply_soft_migrations()
    log.info("DB ready at %s — tables: %s", DB_PATH, sorted(SQLModel.metadata.tables.keys()))


def _apply_soft_migrations() -> None:
    """Add columns SQLModel.metadata.create_all won't touch on existing tables."""
    with engine.connect() as conn:
        ext_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(extraction)").fetchall()}
        if "root_id" not in ext_cols:
            log.info("migrating: adding extraction.root_id (M2.6)")
            conn.exec_driver_sql("ALTER TABLE extraction ADD COLUMN root_id VARCHAR")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_extraction_root_id ON extraction (root_id)")
            conn.commit()
        if "user_id" not in ext_cols:
            log.info("migrating: adding extraction.user_id (M3.2)")
            # Default 'local' so existing rows match the pre-auth dev convention.
            # NOT NULL because routes always join/filter on this column.
            conn.exec_driver_sql("ALTER TABLE extraction ADD COLUMN user_id VARCHAR NOT NULL DEFAULT 'local'")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_extraction_user_id ON extraction (user_id)")
            conn.commit()

        proj_cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(project)").fetchall()}
        if "user_id" not in proj_cols:
            log.info("migrating: adding project.user_id (M3.2)")
            conn.exec_driver_sql("ALTER TABLE project ADD COLUMN user_id VARCHAR NOT NULL DEFAULT 'local'")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_project_user_id ON project (user_id)")
            conn.commit()


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a session that auto-closes after the request."""
    with Session(engine) as session:
        yield session
