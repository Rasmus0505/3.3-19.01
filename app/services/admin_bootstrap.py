from __future__ import annotations

import os

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_admin_bootstrap_password, is_admin_bootstrap_password_strong, is_production_environment
from app.models import User
from app.security import hash_password
from app.services.billing_service import get_or_create_wallet_account


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


def _resolve_bootstrap_password(*, require_explicit: bool) -> str | None:
    password = get_admin_bootstrap_password()
    if not password:
        if require_explicit:
            raise RuntimeError("ADMIN_BOOTSTRAP_PASSWORD is required when creating bootstrap admin users")
        return None
    if not is_admin_bootstrap_password_strong(password):
        raise RuntimeError("ADMIN_BOOTSTRAP_PASSWORD must be a strong secret phrase with at least 12 characters")
    return password


def get_admin_bootstrap_status() -> dict[str, object]:
    admin_emails = _parse_admin_emails()
    password = get_admin_bootstrap_password()
    return {
        "admin_emails": list(admin_emails),
        "admin_emails_configured": bool(admin_emails),
        "bootstrap_password_configured": bool(password),
        "bootstrap_password_strong": is_admin_bootstrap_password_strong(password),
        "bootstrap_mode": "env_init_only",
        "production_mode": is_production_environment(),
    }


def count_admin_users(db: Session) -> int:
    return int(db.scalar(select(func.count(User.id)).where(User.is_admin.is_(True))) or 0)


def ensure_admin_users(db: Session) -> int:
    admin_emails = _parse_admin_emails()
    if not admin_emails:
        return 0

    existing_users = {
        user.email: user
        for user in db.scalars(select(User).where(User.email.in_(admin_emails))).all()
    }
    missing_emails = [email for email in admin_emails if email not in existing_users]
    bootstrap_password = _resolve_bootstrap_password(require_explicit=bool(missing_emails))

    created_count = 0
    changed = False

    for email in admin_emails:
        exists = existing_users.get(email)
        if exists:
            if not bool(exists.is_admin):
                exists.is_admin = True
                db.add(exists)
                changed = True
                created_count += 1
            continue
        user = User(
            email=email,
            password_hash=hash_password(str(bootstrap_password or "")),
            is_admin=True,
        )
        db.add(user)
        db.flush()
        get_or_create_wallet_account(db, user.id, for_update=False)
        existing_users[email] = user
        created_count += 1
        changed = True

    if changed:
        db.commit()

    return created_count
