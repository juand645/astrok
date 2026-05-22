import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, decode_access_token, verify_password
from app.models.user import User
from app.models.user_relation import UserRelation
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserRead

router = APIRouter()
bearer_scheme = HTTPBearer(auto_error=False)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(
        select(User).where(
            or_(
                User.username == payload.identifier,
                User.email == payload.identifier,
            )
        )
    )

    if not user or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    access_token = create_access_token(
        subject=str(user.id),
        extra_claims={"username": user.username},
    )
    return TokenResponse(access_token=access_token, user=serialize_user(user, db))


@router.get("/me", response_model=UserRead)
def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> UserRead:
    if credentials is None:
        raise_invalid_token()

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except (KeyError, ValueError, jwt.InvalidTokenError):
        raise_invalid_token()

    user = db.get(User, user_id)
    if not user or not user.active:
        raise_invalid_token()

    return serialize_user(user, db)


def serialize_user(user: User, db: Session | None = None) -> UserRead:
    professional_id: int | None = None
    if db is not None:
        relation = db.scalar(
            select(UserRelation)
            .where(
                UserRelation.client_id == user.id,
                UserRelation.active.is_(True),
            )
            .order_by(UserRelation.created_at.desc())
            .limit(1)
        )
        professional_id = relation.professional_id if relation is not None else None

    return UserRead(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        username=user.username,
        active=user.active,
        roles=[user_role.role.name for user_role in user.roles if user_role.role.active],
        professional_id=professional_id,
    )


def raise_invalid_token() -> None:
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )
