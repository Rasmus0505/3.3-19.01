from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, table_args


class User(Base):
    __tablename__ = "users"
    __table_args__ = table_args()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)

    lessons: Mapped[list["Lesson"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    wallet_account: Mapped["WalletAccount | None"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
