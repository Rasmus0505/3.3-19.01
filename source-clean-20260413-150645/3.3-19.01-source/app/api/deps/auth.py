from __future__ import annotations

import logging

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security import decode_token

logger = logging.getLogger(__name__)

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
        # #region agent log
        try:
            import datetime as _dt, json
            with open("D:/3.3-19.01/debug-f10f46.log", "a", encoding="utf-8") as _log:
                _log.write(json.dumps({
                    "sessionId": "f10f46",
                    "location": "auth.py:get_current_user:auth_failed",
                    "message": "get_current_user raised 401",
                    "data": {
                        "exc_type": type(exc).__name__,
                        "exc_msg": str(exc)[:200],
                        "token_preview": credentials.credentials[:30] + "..." if credentials.credentials else "(empty)",
                        "bearer_present": bool(credentials.credentials),
                    },
                    "timestamp": int(_dt.datetime.now().timestamp() * 1000),
                    "runId": "run1",
                    "hypothesisId": "A",
                }) + "\n")
        except Exception:
            pass
        # #endregion
        raise HTTPException(status_code=401, detail="无效或过期的访问令牌") from exc

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    if not bool(getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=403, detail="无管理员权限")
    return current_user
