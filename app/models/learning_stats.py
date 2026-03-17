from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class UserLearningDailyStat(Base):
    __tablename__ = "user_learning_daily_stats"
    __table_args__ = table_args(
        UniqueConstraint("user_id", "stat_date", name="uq_user_learning_daily_stats_user_date"),
        Index("ix_user_learning_daily_stats_user_date", "user_id", "stat_date"),
        Index("ix_user_learning_daily_stats_last_learning_at", "last_learning_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id"), ondelete="CASCADE"), nullable=False, index=True)
    stat_date: Mapped[date] = mapped_column(Date, nullable=False)
    completed_sentences: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    check_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    check_passes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_learning_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)
