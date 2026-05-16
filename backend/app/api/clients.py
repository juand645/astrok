from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from datetime import UTC, datetime

from app.api.deps import assert_can_access_client, get_authenticated_user
from app.core.database import get_db
from app.models.plan import Plan
from app.models.user import User
from app.models.user_relation import UserRelation
from app.schemas.client import ClientDetail, ClientRead, ClientUpdate
from app.schemas.plan import PlanRead

router = APIRouter()


@router.get("/", response_model=list[ClientRead])
def list_my_clients(
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[ClientRead]:
    rows = db.execute(
        select(User, UserRelation.relation_type, UserRelation.description)
        .join(UserRelation, UserRelation.client_id == User.id)
        .where(
            UserRelation.professional_id == current_user.id,
            UserRelation.active.is_(True),
            User.active.is_(True),
        )
        .order_by(User.full_name)
    ).all()

    return [
        ClientRead(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            username=user.username,
            description=user.description,
            birth_date=user.birth_date,
            relation_type=relation_type,
            relation_description=relation_description,
        )
        for user, relation_type, relation_description in rows
    ]


@router.get("/{client_id}", response_model=ClientDetail)
def get_client_detail(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ClientDetail:
    assert_can_access_client(db, current_user, client_id)

    user = db.get(User, client_id)
    if user is None or not user.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    relation = db.scalar(
        select(UserRelation).where(
            UserRelation.client_id == client_id,
            UserRelation.professional_id == current_user.id,
            UserRelation.active.is_(True),
        )
    )

    return ClientDetail(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        description=user.description,
        birth_date=user.birth_date,
        measures=user.measures or {},
        relation_type=relation.relation_type if relation else None,
        relation_description=relation.description if relation else None,
    )


@router.patch("/{client_id}", response_model=ClientDetail)
def update_client(
    client_id: int,
    payload: ClientUpdate,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> ClientDetail:
    assert_can_access_client(db, current_user, client_id)

    user = db.get(User, client_id)
    if user is None or not user.active:
        raise HTTPException(status_code=404, detail="Client not found.")

    if payload.description is not None:
        user.description = payload.description.strip() or None
        user.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(user)

    relation = db.scalar(
        select(UserRelation).where(
            UserRelation.client_id == client_id,
            UserRelation.professional_id == current_user.id,
            UserRelation.active.is_(True),
        )
    )

    return ClientDetail(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        description=user.description,
        birth_date=user.birth_date,
        measures=user.measures or {},
        relation_type=relation.relation_type if relation else None,
        relation_description=relation.description if relation else None,
    )


@router.get("/{client_id}/plans", response_model=list[PlanRead])
def list_client_plans(
    client_id: int,
    current_user: User = Depends(get_authenticated_user),
    db: Session = Depends(get_db),
) -> list[Plan]:
    assert_can_access_client(db, current_user, client_id)

    return list(
        db.scalars(
            select(Plan)
            .where(Plan.client_id == client_id, Plan.active.is_(True))
            .order_by(Plan.created_at.desc())
        )
    )
