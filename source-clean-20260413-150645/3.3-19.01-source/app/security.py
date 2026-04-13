from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt


JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me").strip()
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "15"))

PBKDF2_ROUNDS = 120_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        algo, rounds_text, salt_b64, digest_b64 = password_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        rounds = int(rounds_text)
        salt = base64.b64decode(salt_b64.encode())
        expected = base64.b64decode(digest_b64.encode())
    except Exception:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, rounds)
    return hmac.compare_digest(actual, expected)


def _build_token(subject: str, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: int) -> str:
    return _build_token(str(user_id), "access", timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(user_id: int) -> str:
    return _build_token(str(user_id), "refresh", timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
