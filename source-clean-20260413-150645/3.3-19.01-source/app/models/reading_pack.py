"""ReadingPack model — persists reading pack data generated from the reading pipeline."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class ReadingPack(Base):
    __tablename__ = "reading_packs"
    __table_args__ = table_args(
        UniqueConstraint("user_id", "article_id", name="uq_reading_pack_user_article"),
        Index("ix_reading_packs_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), nullable=False)
    article_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    original_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    rewritten_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    target_level: Mapped[str] = mapped_column(String(10), default="B1", nullable=False)
    flow_status: Mapped[str] = mapped_column(String(32), default="idle", nullable=False)

    # Complex data stored as JSON
    mappings_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    word_levels_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    valid_i1_words_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    valid_above_i1_words_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    removed_words_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    diagnostic_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    quiz_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    vocab_cards_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    course_data_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    user: Mapped["User"] = relationship(back_populates="reading_packs")
