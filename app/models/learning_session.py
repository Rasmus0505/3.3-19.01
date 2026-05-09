from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args

if TYPE_CHECKING:
    from app.models import Lesson, User


class LearningSession(Base):
    __tablename__ = "learning_sessions"
    __table_args__ = table_args(
        Index("ix_learning_sessions_user_started_at", "user_id", "started_at"),
        Index("ix_learning_sessions_user_status", "user_id", "status"),
        Index("ix_learning_sessions_lesson_status", "lesson_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), nullable=False, index=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("lessons.id")), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    effective_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    paused_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="active", nullable=False)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    manual_pause_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    auto_pause_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    title_snapshot: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    user: Mapped[User] = relationship()
    lesson: Mapped[Lesson] = relationship()
