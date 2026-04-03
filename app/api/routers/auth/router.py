from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.serializers import to_user_response
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.repositories.user import UserRepository, canonicalize_username, normalize_username
from app.schemas import AuthRequest, AuthResponse, ErrorResponse, LogoutResponse, ProfileUpdateRequest, RefreshRequest, RegisterRequest, UserResponse
from app.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.services.billing_service import get_or_create_wallet_account
from app.services.user_activity import ensure_user_activity_schema, record_user_login_event


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, responses={400: {"model": ErrorResponse}})
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    ensure_user_activity_schema(db)
    user_repo = UserRepository(db)
    exists = db.scalar(select(User).where(User.email == payload.email.lower()))
    if exists:
        return error_response(400, "EMAIL_EXISTS", "邮箱已注册")
    username = canonicalize_username(payload.username)
    username_normalized = normalize_username(payload.username)
    if not username_normalized:
        return error_response(400, "USERNAME_REQUIRED", "用户名不能为空")
    username_exists = user_repo.get_by_normalized_username(payload.username)
    if username_exists:
        return error_response(400, "USERNAME_EXISTS", "用户名已被占用")
    user = User(
        email=payload.email.lower(),
        username=username,
        username_normalized=username_normalized,
        password_hash=hash_password(payload.password),
        is_admin=False,
    )
    db.add(user)
    db.flush()
    get_or_create_wallet_account(db, user.id, for_update=False)
    record_user_login_event(db, user_id=user.id, event_type="register")
    db.commit()
    db.refresh(user)
    return AuthResponse(
        ok=True,
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=to_user_response(user),
    )


@router.post("/login", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
def login(payload: AuthRequest, db: Session = Depends(get_db)):
    ensure_user_activity_schema(db)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        return error_response(401, "INVALID_CREDENTIALS", "邮箱或密码错误")
    record_user_login_event(db, user_id=user.id, event_type="login")
    db.commit()
    db.refresh(user)
    return AuthResponse(
        ok=True,
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=to_user_response(user),
    )


@router.get("/me", response_model=UserResponse, responses={401: {"model": ErrorResponse}})
def current_user_profile(current_user: User = Depends(get_current_user)) -> UserResponse:
    return to_user_response(current_user)


@router.patch("/profile", response_model=UserResponse, responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}})
def update_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    user_repo = UserRepository(db)
    username = canonicalize_username(payload.username)
    username_normalized = normalize_username(payload.username)
    if not username_normalized:
        return error_response(400, "USERNAME_REQUIRED", "用户名不能为空")
    existing_user = user_repo.get_by_normalized_username(payload.username)
    if existing_user and existing_user.id != current_user.id:
        return error_response(400, "USERNAME_EXISTS", "用户名已被占用")
    updated_user = user_repo.update_username(current_user.id, username)
    if not updated_user:
        return error_response(404, "USER_NOT_FOUND", "用户不存在")
    if payload.cefr_level is not None:
        user_repo.update_cefr_level(current_user.id, payload.cefr_level)
    db.commit()
    refreshed_user = db.get(User, current_user.id)
    if not refreshed_user:
        return error_response(404, "USER_NOT_FOUND", "用户不存在")
    db.refresh(refreshed_user)
    return to_user_response(refreshed_user)


@router.post("/refresh", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise ValueError("invalid token type")
        user_id = int(decoded.get("sub"))
    except Exception:
        return error_response(401, "INVALID_REFRESH_TOKEN", "无效或过期的刷新令牌")

    user = db.get(User, user_id)
    if not user:
        return error_response(401, "INVALID_REFRESH_TOKEN", "用户不存在")
    return AuthResponse(
        ok=True,
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=to_user_response(user),
    )


@router.post("/logout", response_model=LogoutResponse)
def logout() -> LogoutResponse:
    return LogoutResponse(ok=True, message="已退出登录")
