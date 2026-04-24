"""Project CRUD (M2.2.7) — groups for extractions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from db.models import Extraction, Project
from db.session import get_session
from models import ProjectCreate, ProjectPatch, ProjectRead
from services.extractions import (
    count_extractions_for_project,
    mint_project_id,
    project_to_read,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])

SessionDep = Annotated[Session, Depends(get_session)]


@router.get("", response_model=list[ProjectRead])
def list_projects(session: SessionDep) -> list[ProjectRead]:
    rows = session.exec(select(Project).order_by(Project.created_at.desc())).all()
    out: list[ProjectRead] = []
    for r in rows:
        out.append(project_to_read(r, extraction_count=count_extractions_for_project(session, r.id)))
    return out


@router.post("", response_model=ProjectRead, status_code=201)
def create_project(payload: ProjectCreate, session: SessionDep) -> ProjectRead:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name cannot be empty")
    row = Project(id=mint_project_id(), name=name, created_at=datetime.now(timezone.utc))
    session.add(row)
    session.commit()
    session.refresh(row)
    return project_to_read(row, extraction_count=0)


@router.patch("/{project_id}", response_model=ProjectRead)
def patch_project(project_id: str, patch: ProjectPatch, session: SessionDep) -> ProjectRead:
    row = session.get(Project, project_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if patch.name is not None:
        name = patch.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        row.name = name
    session.add(row)
    session.commit()
    session.refresh(row)
    return project_to_read(row, extraction_count=count_extractions_for_project(session, row.id))


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, session: SessionDep) -> None:
    row = session.get(Project, project_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    # Detach extractions (don't delete them) — losing the project shouldn't lose work.
    extractions = session.exec(
        select(Extraction).where(Extraction.project_id == project_id)
    ).all()
    for e in extractions:
        e.project_id = None
        session.add(e)
    session.delete(row)
    session.commit()
    return None
