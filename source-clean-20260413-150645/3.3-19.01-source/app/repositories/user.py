from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import User, UserLoginEvent
from app.models.billing import WalletAccount
from app.repositories.base import Repository

if TYPE_CHECKING:
    pass


_USERNAME_INNER_WHITESPACE_RE = re.compile(r"\s+")


def _normalize_username_parts(value: str) -> tuple[str, str]:
    normalized_value = unicodedata.normalize("NFKC", str(value or ""))
    display_value = _USERNAME_INNER_WHITESPACE_RE.sub(" ", normalized_value).strip()
    return display_value, display_value.casefold()


def canonicalize_username(value: str) -> str:
    return _normalize_username_parts(value)[0]


def normalize_username(value: str) -> str:
    return _normalize_username_parts(value)[1]


class UserRepository(Repository[User]):
    """Repository for User model operations."""

    def __init__(self, session: Session):
        super().__init__(User, session)

    def get_by_email(self, email: str) -> Optional[User]:
        return self.session.scalar(select(User).where(User.email == email))

    def get_by_normalized_username(self, username: str) -> Optional[User]:
        normalized = normalize_username(username)
        if not normalized:
            return None
        return self.session.scalar(select(User).where(User.username_normalized == normalized))

    def get_admin_users(self) -> List[User]:
        return list(self.session.scalars(select(User).where(User.is_admin == True).order_by(User.id.asc())))

    def update_last_login(self, user_id: int) -> Optional[User]:
        user = self.get(user_id)
        if user:
            user.last_login_at = datetime.now()
            self.session.add(user)
            self.session.flush()
        return user

    def get_user_with_wallet(self, user_id: int) -> Optional[Tuple[User, Optional[WalletAccount]]]:
        user = self.session.scalar(
            select(User).options(joinedload(User.wallet_account)).where(User.id == user_id)
        )
        if user:
            return (user, user.wallet_account)
        return None

    def get_user_login_events(self, user_id: int, skip: int = 0, limit: int = 50) -> List[UserLoginEvent]:
        return list(
            self.session.scalars(
                select(UserLoginEvent)
                .where(UserLoginEvent.user_id == user_id)
                .order_by(UserLoginEvent.created_at.desc())
                .offset(skip)
                .limit(limit)
            )
        )

    def create_login_event(self, user_id: int, event_type: str = "login") -> UserLoginEvent:
        event = UserLoginEvent(user_id=user_id, event_type=event_type)
        self.session.add(event)
        self.session.flush()
        return event

    def update_username(self, user_id: int, username: str) -> Optional[User]:
        user = self.get(user_id)
        if not user:
            return None
        user.username = canonicalize_username(username)
        user.username_normalized = normalize_username(username)
        self.session.add(user)
        self.session.flush()
        return user

    def update_cefr_level(self, user_id: int, cefr_level: str | None) -> Optional[User]:
        user = self.get(user_id)
        if not user:
            return None
        user.cefr_level = cefr_level
        self.session.add(user)
        self.session.flush()
        return user
