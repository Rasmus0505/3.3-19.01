from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.serializers import to_user_response
from app.core.errors import error_response
from app.db import get_db
from app.models import User
from app.schemas import AuthRequest, AuthResponse, ErrorResponse, LogoutResponse, RefreshRequest
from app.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.services.billing_service import get_or_create_wallet_account


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, responses={400: {"model": ErrorResponse}})
def register(payload: AuthRequest, db: Session = Depends(get_db)):
    exists = db.scalar(select(User).where(User.email == payload.email.lower()))
    if exists:
        return error_response(400, "EMAIL_EXISTS", "邮箱已注册")
    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    get_or_create_wallet_account(db, user.id, for_update=False)
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
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        return error_response(401, "INVALID_CREDENTIALS", "邮箱或密码错误")
    return AuthResponse(
        ok=True,
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=to_user_response(user),
    )


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
