"""
LLMUsageLog — unified token usage log for ASR / MT / LLM calls.
Stores actual cost (input/output separate), user charge, and gross profit.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class LLMUsageLog(Base):
    __tablename__ = "llm_usage_logs"
    __table_args__ = table_args(
        CheckConstraint("category IN ('llm','mt','asr')", name="ck_llm_usage_category"),
        CheckConstraint("prompt_tokens >= 0", name="ck_llm_usage_prompt_non_negative"),
        CheckConstraint("completion_tokens >= 0", name="ck_llm_usage_completion_non_negative"),
        CheckConstraint("total_tokens >= 0", name="ck_llm_usage_total_non_negative"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id"), ondelete="CASCADE"), nullable=False, index=True)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(16), nullable=False, default="llm", index=True)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reasoning_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    input_cost_cents: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    charge_cents: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    gross_profit_cents: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    enable_thinking: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    input_text_preview: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("lessons.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)

    user: Mapped["User"] = relationship(back_populates="llm_usage_logs")
    lesson: Mapped["Lesson | None"] = relationship(back_populates="llm_usage_logs")

    @property
    def profit_per_request(self) -> int:
        return int(self.gross_profit_cents or 0)
