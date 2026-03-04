from __future__ import annotations

import os

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security import decode_token


bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise ValueError("invalid token type")
        user_id = int(payload.get("sub"))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="无效或过期的访问令牌") from exc

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    raw = os.getenv("ADMIN_EMAILS", "").strip()
    admin_emails = {x.strip().lower() for x in raw.split(",") if x.strip()}
    if current_user.email.lower() not in admin_emails:
        raise HTTPException(status_code=403, detail="无管理员权限")
    return current_user
