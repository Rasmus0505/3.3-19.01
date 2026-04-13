from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class SOEResult(Base):
    __tablename__ = "soe_results"
    __table_args__ = table_args()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    lesson_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("lessons.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sentence_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("lesson_sentences.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    ref_text: Mapped[str] = mapped_column(Text, nullable=False)
    user_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    total_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    pronunciation_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    fluency_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    completeness_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    audio_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    voice_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw_response_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 结构化单词评测结果（含音素详情），与 raw_response_json 互为冗余存储
    word_results_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=now_shanghai_naive, nullable=False, index=True
    )
