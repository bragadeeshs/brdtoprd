"""Project CRUD (M2.2.7) — groups for extractions. M3.2 user-scoped."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from auth.deps import CurrentUser, current_user
from db.models import Extraction, Project
from db.session import get_session
from models import ProjectCreate, ProjectPatch, ProjectRead
from services.extractions import (
    count_extractions_for_project,
    mint_project_id,
    project_to_read,
)
from services.scope import apply_scope, in_scope

router = APIRouter(prefix="/api/projects", tags=["projects"])

SessionDep = Annotated[Session, Depends(get_session)]
UserDep = Annotated[CurrentUser, Depends(current_user)]


def _owned_project(session: Session, project_id: str, user: CurrentUser) -> Project:
    """Fetch a project, asserting it's in the caller's current scope (M3.3)."""
    row = session.get(Project, project_id)
    if not in_scope(row, user):
        raise HTTPException(status_code=404, detail="Project not found")
    return row


@router.get("", response_model=list[ProjectRead])
def list_projects(session: SessionDep, user: UserDep) -> list[ProjectRead]:
    stmt = apply_scope(select(Project), Project, user).order_by(Project.created_at.desc())
    rows = session.exec(stmt).all()
    return [
        project_to_read(
            r,
            extraction_count=count_extractions_for_project(session, r.id, user=user),
        )
        for r in rows
    ]


@router.post("", response_model=ProjectRead, status_code=201)
def create_project(payload: ProjectCreate, session: SessionDep, user: UserDep) -> ProjectRead:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name cannot be empty")
    row = Project(
        id=mint_project_id(),
        name=name,
        user_id=user.user_id,
        org_id=user.org_id,
        created_at=datetime.now(timezone.utc),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return project_to_read(row, extraction_count=0)


@router.patch("/{project_id}", response_model=ProjectRead)
def patch_project(
    project_id: str, patch: ProjectPatch, session: SessionDep, user: UserDep
) -> ProjectRead:
    row = _owned_project(session, project_id, user)
    if patch.name is not None:
        name = patch.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        row.name = name
    session.add(row)
    session.commit()
    session.refresh(row)
    return project_to_read(
        row,
        extraction_count=count_extractions_for_project(session, row.id, user=user),
    )


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, session: SessionDep, user: UserDep) -> None:
    row = _owned_project(session, project_id, user)
    # Detach in-scope extractions (don't delete — losing the project shouldn't
    # lose work). Out-of-scope extractions can't reference this project anyway
    # because PATCH validates project ownership against the caller's scope.
    extractions = session.exec(
        apply_scope(select(Extraction), Extraction, user).where(
            Extraction.project_id == project_id
        )
    ).all()
    for e in extractions:
        e.project_id = None
        session.add(e)
    session.delete(row)
    session.commit()
    return None
