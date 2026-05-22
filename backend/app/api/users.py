from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password
from app.models.user import Role, User, UserRole
from app.schemas.user import UserCreate, UserRead
from app.api.auth import serialize_user

router = APIRouter()


@router.get("/", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    users = list(db.scalars(select(User).order_by(User.full_name)))
    return [serialize_user(user, db) for user in users]


@router.post("/", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    existing = db.scalar(
        select(User).where(or_(User.email == payload.email, User.username == payload.username))
    )
    if existing:
        raise HTTPException(status_code=409, detail="A user with this email or username already exists.")

    roles = list(db.scalars(select(Role).where(Role.name.in_(payload.role_names), Role.active.is_(True))))
    missing_roles = set(payload.role_names) - {role.name for role in roles}
    if missing_roles:
        raise HTTPException(
            status_code=400,
            detail=f"These roles do not exist or are inactive: {', '.join(sorted(missing_roles))}.",
        )

    user = User(
        full_name=payload.full_name,
        email=str(payload.email),
        username=payload.username,
        password_hash=hash_password(payload.password),
    )
    user.roles = [UserRole(role=role) for role in roles]
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user(user, db)
