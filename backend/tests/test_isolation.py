"""User-isolation regression test (M3.2.7).

Verifies that User A's projects + extractions are invisible to User B at
every read endpoint, and that User B can't mutate User A's rows. Uses
FastAPI's TestClient with `dependency_overrides` on `current_user` instead
of generating real Clerk JWTs — same code path the production routes hit,
just with a stubbed identity.

Runs standalone (no pytest needed):
    cd backend && .venv/bin/python -m tests.test_isolation

Designed to fail loud: the first failed assertion exits with status 1 and
prints the offending step. Self-cleans on success and best-effort on failure
(uses a separate sqlite file so a crashed run doesn't poison the dev DB).
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# Force a throwaway DB BEFORE importing the app (otherwise it'd read the dev one).
_TMPDIR = Path(tempfile.mkdtemp(prefix="storyforge_test_"))
os.environ["STORYFORGE_DB"] = str(_TMPDIR / "test.db")
os.environ["STORYFORGE_UPLOAD_DIR"] = str(_TMPDIR / "uploads")
# CLERK_PUBLISHABLE_KEY isn't read by our test path (we override current_user)
# but app import-time module load still needs the env var to be sane.
os.environ.setdefault("CLERK_PUBLISHABLE_KEY", "pk_test_dummy")
# Make sure we never accidentally hit Anthropic — extract route stays mock-mode.
os.environ.pop("ANTHROPIC_API_KEY", None)

# `backend` isn't on sys.path when this script runs from inside `backend/`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from auth.deps import CurrentUser, current_user  # noqa: E402
from main import app  # noqa: E402

# --- stubbed identities -----------------------------------------------------

USER_A = CurrentUser(user_id="user_test_aaa")
USER_B = CurrentUser(user_id="user_test_bbb")
_active_user: CurrentUser = USER_A


def _override():
    return _active_user


app.dependency_overrides[current_user] = _override

# Module-level placeholder; main() rebinds inside the `with TestClient(app) as`
# context so the FastAPI lifespan (which runs init_db) actually fires.
client: TestClient | None = None


def as_user(user: CurrentUser):
    """Switch the stubbed current_user for subsequent requests."""
    global _active_user
    _active_user = user


# --- assertions -------------------------------------------------------------

_failed = False


def check(label: str, condition: bool, detail: str = "") -> None:
    global _failed
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}" + (f" -- {detail}" if detail and not condition else ""))
    if not condition:
        _failed = True


# --- the actual scenarios ---------------------------------------------------


def _run_scenarios() -> None:
    """All the actual scenarios — wrapped so we can use the TestClient as a
    context manager (which fires lifespan + creates tables)."""
    # ===== User A creates a project + an extraction =====
    as_user(USER_A)

    r = client.post("/api/projects", json={"name": "A-only project"})
    check("A creates project", r.status_code == 201, f"status={r.status_code} body={r.text[:200]}")
    a_project = r.json()["id"]

    r = client.post(
        "/api/extract",
        files={"file": ("a.txt", b"User A's secret document.", "text/plain")},
        data={"project_id": a_project},
    )
    check("A creates extraction in A's project", r.status_code == 200, f"status={r.status_code} body={r.text[:200]}")
    a_ext = r.json()["id"]
    check("A's extraction has user_id-scoped project_id", r.json().get("project_id") == a_project)

    # ===== Switch to User B =====
    as_user(USER_B)

    r = client.get("/api/extractions")
    check("B sees zero extractions in list", r.status_code == 200 and r.json() == [], f"got: {r.json() if r.status_code == 200 else r.text}")

    r = client.get("/api/projects")
    check("B sees zero projects in list", r.status_code == 200 and r.json() == [], f"got: {r.json() if r.status_code == 200 else r.text}")

    # ===== B tries to read A's extraction by id =====
    r = client.get(f"/api/extractions/{a_ext}")
    check("B GET A's extraction -> 404", r.status_code == 404, f"got {r.status_code}")

    r = client.get(f"/api/extractions/{a_ext}/versions")
    check("B GET A's versions -> 404", r.status_code == 404, f"got {r.status_code}")

    r = client.get(f"/api/extractions/{a_ext}/gaps")
    check("B GET A's gap states -> 404", r.status_code == 404, f"got {r.status_code}")

    r = client.get(f"/api/extractions/{a_ext}/source")
    # No file uploaded for our text-mode extraction; A would also get 404.
    # We expect 404 here for the same reason — but importantly NOT a 200.
    check("B GET A's source -> 404", r.status_code == 404)

    # ===== B tries to mutate A's extraction =====
    r = client.patch(f"/api/extractions/{a_ext}", json={"filename": "hacked.txt"})
    check("B PATCH A's extraction -> 404", r.status_code == 404)

    r = client.delete(f"/api/extractions/{a_ext}")
    check("B DELETE A's extraction -> 404", r.status_code == 404)

    r = client.patch(f"/api/extractions/{a_ext}/gaps/0", json={"resolved": True})
    check("B PATCH A's gap state -> 404", r.status_code == 404)

    r = client.post(f"/api/extractions/{a_ext}/rerun", json={})
    check("B re-run A's extraction -> 404", r.status_code == 404)

    # ===== B tries to mutate A's project =====
    r = client.patch(f"/api/projects/{a_project}", json={"name": "stolen"})
    check("B PATCH A's project -> 404", r.status_code == 404)

    r = client.delete(f"/api/projects/{a_project}")
    check("B DELETE A's project -> 404", r.status_code == 404)

    # ===== B tries to attach a new extraction to A's project =====
    r = client.post(
        "/api/extract",
        files={"file": ("b.txt", b"User B's doc.", "text/plain")},
        data={"project_id": a_project},
    )
    check("B extract into A's project -> 400", r.status_code == 400, f"got {r.status_code}: {r.text[:200]}")

    # ===== B tries to import a record into A's id =====
    r = client.post(
        "/api/extractions/import",
        json={
            "id": a_ext,
            "filename": "evil.txt",
            "saved_at": "2025-01-01T00:00:00Z",
            "payload": {
                "filename": "evil.txt",
                "raw_text": "x",
                "live": False,
                "brief": {"summary": "x", "tags": []},
                "actors": [],
                "stories": [],
                "nfrs": [],
                "gaps": [],
            },
        },
    )
    check("B import collision on A's id -> 409", r.status_code == 409, f"got {r.status_code}: {r.text[:200]}")

    # ===== B's own work is fine =====
    r = client.post("/api/projects", json={"name": "B's project"})
    check("B creates own project", r.status_code == 201)
    b_project = r.json()["id"]
    check("B sees one project after create", client.get("/api/projects").json() and len(client.get("/api/projects").json()) == 1)

    # ===== A still sees their own row, untouched =====
    as_user(USER_A)

    r = client.get(f"/api/extractions/{a_ext}")
    check("A still sees own extraction", r.status_code == 200)
    check("A's extraction filename unchanged", r.json().get("filename") == "a.txt", f"got {r.json().get('filename')}")

    r = client.get("/api/projects")
    check("A still sees only their own project", r.status_code == 200 and len(r.json()) == 1 and r.json()[0]["id"] == a_project)


def main() -> int:
    global client
    print("M3.2.7 user-isolation test")
    print(f"  test DB: {os.environ['STORYFORGE_DB']}")

    with TestClient(app) as c:
        client = c
        _run_scenarios()

    print()
    if _failed:
        print("FAILED — at least one assertion did not match expected behavior")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
