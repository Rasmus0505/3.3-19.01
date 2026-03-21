from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class User(Base):
    __tablename__ = "users"
    __table_args__ = table_args()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    lessons: Mapped[list["Lesson"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    wallet_account: Mapped["WalletAccount | None"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    login_events: Mapped[list["UserLoginEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class UserLoginEvent(Base):
    __tablename__ = "user_login_events"
    __table_args__ = table_args()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id"), ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False, default="login", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)

    user: Mapped["User"] = relationship(back_populates="login_events")
