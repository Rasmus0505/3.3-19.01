from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class AsrRecord(Base):
    __tablename__ = "asr_records"
    __table_args__ = table_args(Index("ix_asr_records_user_id_created_at", "user_id", "created_at"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id"), ondelete="CASCADE"), nullable=False, index=True)
    asr_model: Mapped[str] = mapped_column(String(100), nullable=False)
    output_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="per_file")
    include_timestamps: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    include_filename_headers: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    record_status: Mapped[str] = mapped_column(String(32), nullable=False, default="succeeded")
    file_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_elapsed_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    preview_text: Mapped[str] = mapped_column(String(600), nullable=False, default="")
    merged_text: Mapped[str] = mapped_column(String, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    items: Mapped[list[AsrRecordItem]] = relationship(back_populates="record", cascade="all, delete-orphan", order_by="AsrRecordItem.file_index")


class AsrRecordItem(Base):
    __tablename__ = "asr_record_items"
    __table_args__ = table_args(UniqueConstraint("record_id", "file_index", name="uq_asr_record_item_record_index"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    record_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("asr_records.id"), ondelete="CASCADE"), nullable=False, index=True)
    file_index: Mapped[int] = mapped_column(Integer, nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="succeeded")
    error_code: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    error_message: Mapped[str] = mapped_column(String(1200), nullable=False, default="")
    preview_text: Mapped[str] = mapped_column(String(600), nullable=False, default="")
    transcript_text: Mapped[str] = mapped_column(String, nullable=False, default="")
    rendered_text: Mapped[str] = mapped_column(String, nullable=False, default="")
    elapsed_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    segments_json: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)

    record: Mapped[AsrRecord] = relationship(back_populates="items")
