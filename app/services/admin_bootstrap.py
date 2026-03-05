from __future__ import annotations

import logging
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password
from app.services.billing_service import get_or_create_wallet_account


logger = logging.getLogger(__name__)

DEFAULT_ADMIN_BOOTSTRAP_PASSWORD = "123123"


def _parse_admin_emails() -> list[str]:
    raw = os.getenv("ADMIN_EMAILS", "").strip()
    if not raw:
        return []
    emails: list[str] = []
    seen: set[str] = set()
    for item in raw.split(","):
        email = item.strip().lower()
        if not email or email in seen:
            continue
        seen.add(email)
        emails.append(email)
    return emails


def _resolve_bootstrap_password() -> str:
    password = os.getenv("ADMIN_BOOTSTRAP_PASSWORD", DEFAULT_ADMIN_BOOTSTRAP_PASSWORD).strip()
    if len(password) < 6:
        logger.warning("[DEBUG] admin bootstrap password too short, fallback to default password")
        return DEFAULT_ADMIN_BOOTSTRAP_PASSWORD
    return password


def ensure_admin_users(db: Session) -> int:
    admin_emails = _parse_admin_emails()
    if not admin_emails:
        logger.info("[DEBUG] admin bootstrap skipped: ADMIN_EMAILS is empty")
        return 0

    bootstrap_password = _resolve_bootstrap_password()
    created_count = 0

    for email in admin_emails:
        exists = db.scalar(select(User).where(User.email == email))
        if exists:
            continue
        user = User(email=email, password_hash=hash_password(bootstrap_password))
        db.add(user)
        db.flush()
        get_or_create_wallet_account(db, user.id, for_update=False)
        created_count += 1
        logger.info("[DEBUG] admin bootstrap created admin user email=%s", email)

    if created_count > 0:
        db.commit()

    return created_count
