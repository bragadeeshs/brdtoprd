"""DB engine + FastAPI session dependency.

Two engines, one config:
  * `DATABASE_URL` set  → Postgres (M3.2 — currently Supabase). Use the
    `postgresql+psycopg://...` form so SQLAlchemy picks psycopg3, not the
    legacy psycopg2 default.
  * Unset              → SQLite at `STORYFORGE_DB` (default `backend/storyforge.db`).
                         Dev fallback; survives across machines if you copy the file.

Synchronous SQLModel sessions either way. Async (asyncpg / aiosqlite) is a
later optimisation if route latency starts mattering — sync handles our
"one DB write per extraction" workload comfortably.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.engine import URL, make_url
from sqlmodel import Session, SQLModel, create_engine

# Import models so SQLModel.metadata sees them before create_all runs.
from . import models  # noqa: F401

log = logging.getLogger("storyforge.db")


def _resolve_db_url() -> URL:
    raw = os.environ.get("DATABASE_URL")
    if raw:
        # SQLAlchemy 2.x defaults `postgresql://` to psycopg2; force psycopg3.
        if raw.startswith("postgresql://"):
            raw = "postgresql+psycopg://" + raw[len("postgresql://"):]
        return make_url(raw)
    # SQLite fallback. Path is repo-local so two devs can share a `.db` file
    # without env-var coordination.
    db_path = Path(
        os.environ.get(
            "STORYFORGE_DB",
            str(Path(__file__).resolve().parent.parent / "storyforge.db"),
        )
    )
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return make_url(f"sqlite:///{db_path}")


DB_URL: URL = _resolve_db_url()
IS_SQLITE = DB_URL.get_dialect().name == "sqlite"

# SQLite needs check_same_thread=False because FastAPI runs sync routes on
# its threadpool; the engine pool may hand a connection to a different
# thread than the one that opened it. Postgres has no such constraint.
_connect_args: dict = {"check_same_thread": False} if IS_SQLITE else {}

engine = create_engine(DB_URL, echo=False, connect_args=_connect_args, pool_pre_ping=not IS_SQLITE)


def init_db() -> None:
    """Create all tables + apply tiny additive migrations. Idempotent.

    `create_all` is safe to call on every startup — it only creates *missing*
    tables. For columns added to existing tables we run guarded ALTERs (see
    `_apply_soft_migrations`). Works on both SQLite and Postgres now (M3.3
    needed it on the live Supabase instance) — proper Alembic still pending
    when a non-additive change lands (M3.2.5).
    """
    SQLModel.metadata.create_all(engine)
    _apply_soft_migrations()
    log.info(
        "DB ready (%s) — tables: %s",
        DB_URL.render_as_string(hide_password=True),
        sorted(SQLModel.metadata.tables.keys()),
    )


def _columns(table: str) -> set[str]:
    """Portable column inspection — works on SQLite + Postgres."""
    return {col["name"] for col in inspect(engine).get_columns(table)}


def _apply_soft_migrations() -> None:
    """Idempotent ALTER TABLEs for columns added after the initial schema.

    Each clause is guarded by an introspection check so it's a no-op once the
    column exists. Both SQLite and Postgres support `ALTER TABLE ... ADD
    COLUMN <name> <type> [DEFAULT ...] [NOT NULL]` for additive changes,
    which is all we ship through this path.
    """
    with engine.connect() as conn:
        # ---- extraction ----
        ext_cols = _columns("extraction")
        if "root_id" not in ext_cols:
            log.info("migrating: adding extraction.root_id (M2.6)")
            conn.exec_driver_sql("ALTER TABLE extraction ADD COLUMN root_id VARCHAR")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_extraction_root_id ON extraction (root_id)")
            conn.commit()
        if "user_id" not in ext_cols:
            log.info("migrating: adding extraction.user_id (M3.2)")
            conn.exec_driver_sql("ALTER TABLE extraction ADD COLUMN user_id VARCHAR NOT NULL DEFAULT 'local'")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_extraction_user_id ON extraction (user_id)")
            conn.commit()
        if "org_id" not in ext_cols:
            log.info("migrating: adding extraction.org_id (M3.3)")
            conn.exec_driver_sql("ALTER TABLE extraction ADD COLUMN org_id VARCHAR")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_extraction_org_id ON extraction (org_id)")
            conn.commit()

        # ---- project ----
        proj_cols = _columns("project")
        if "user_id" not in proj_cols:
            log.info("migrating: adding project.user_id (M3.2)")
            conn.exec_driver_sql("ALTER TABLE project ADD COLUMN user_id VARCHAR NOT NULL DEFAULT 'local'")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_project_user_id ON project (user_id)")
            conn.commit()
        if "org_id" not in proj_cols:
            log.info("migrating: adding project.org_id (M3.3)")
            conn.exec_driver_sql("ALTER TABLE project ADD COLUMN org_id VARCHAR")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_project_org_id ON project (org_id)")
            conn.commit()

        # ---- usage_log ----
        usage_cols = _columns("usage_log")
        if "org_id" not in usage_cols:
            log.info("migrating: adding usage_log.org_id (M3.3)")
            conn.exec_driver_sql("ALTER TABLE usage_log ADD COLUMN org_id VARCHAR")
            conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_usage_log_org_id ON usage_log (org_id)")
            conn.commit()


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency: yields a session that auto-closes after the request."""
    with Session(engine) as session:
        yield session
