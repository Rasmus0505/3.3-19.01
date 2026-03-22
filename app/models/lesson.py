from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = table_args(Index("ix_lessons_user_id_created_at", "user_id", "created_at"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    asr_model: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    media_storage: Mapped[str] = mapped_column(String(32), default="server", nullable=False)
    source_duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="ready", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)

    user: Mapped["User"] = relationship(back_populates="lessons")
    sentences: Mapped[list["LessonSentence"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")
    progress_records: Mapped[list["LessonProgress"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")
    media_assets: Mapped[list["MediaAsset"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")


class LessonSentence(Base):
    __tablename__ = "lesson_sentences"
    __table_args__ = table_args(UniqueConstraint("lesson_id", "idx", name="uq_lesson_sentence_idx"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("lessons.id")), nullable=False, index=True)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    begin_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    text_en: Mapped[str] = mapped_column(String, nullable=False)
    text_zh: Mapped[str] = mapped_column(String, default="", nullable=False)
    tokens_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    audio_clip_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    lesson: Mapped[Lesson] = relationship(back_populates="sentences")


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = table_args(UniqueConstraint("lesson_id", "user_id", name="uq_lesson_progress_user"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("lessons.id")), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), nullable=False, index=True)
    current_sentence_idx: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_indexes_json: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    last_played_at_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    lesson: Mapped[Lesson] = relationship(back_populates="progress_records")


class LessonGenerationTask(Base):
    __tablename__ = "lesson_generation_tasks"
    __table_args__ = table_args()

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), nullable=False, index=True)
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey(schema_fk("lessons.id")), nullable=True, index=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    asr_model: Mapped[str] = mapped_column(String(100), nullable=False)
    semantic_split_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    overall_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_text: Mapped[str] = mapped_column(String(255), default="等待处理", nullable=False)
    stages_json: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    counters_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    translation_debug_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    failure_debug_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    asr_raw_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    subtitle_cache_seed_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    message: Mapped[str] = mapped_column(String(1200), default="", nullable=False)
    resume_available: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resume_stage: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    work_dir: Mapped[str] = mapped_column(String(500), nullable=False)
    source_path: Mapped[str] = mapped_column(String(500), nullable=False)
    artifacts_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    artifact_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    raw_debug_purged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    lesson: Mapped[Lesson | None] = relationship()


class MediaAsset(Base):
    __tablename__ = "media_assets"
    __table_args__ = table_args()

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("lessons.id")), nullable=False, index=True)
    original_path: Mapped[str] = mapped_column(String(500), nullable=False)
    opus_path: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)

    lesson: Mapped[Lesson] = relationship(back_populates="media_assets")


class WordbookEntry(Base):
    __tablename__ = "wordbook_entries"
    __table_args__ = table_args(
        UniqueConstraint("user_id", "normalized_text", "entry_type", name="uq_wordbook_entry_user_text_type"),
        Index("ix_wordbook_entries_user_status_collected_at", "user_id", "status", "latest_collected_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), nullable=False, index=True)
    latest_lesson_id: Mapped[int | None] = mapped_column(ForeignKey(schema_fk("lessons.id")), nullable=True, index=True)
    entry_text: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_text: Mapped[str] = mapped_column(String(255), nullable=False)
    entry_type: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False, index=True)
    latest_sentence_idx: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latest_sentence_en: Mapped[str] = mapped_column(String(1200), nullable=False, default="")
    latest_sentence_zh: Mapped[str] = mapped_column(String(1200), nullable=False, default="")
    latest_collected_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    latest_lesson: Mapped[Lesson | None] = relationship(foreign_keys=[latest_lesson_id])
    source_links: Mapped[list["WordbookEntrySource"]] = relationship(back_populates="entry", cascade="all, delete-orphan")


class WordbookEntrySource(Base):
    __tablename__ = "wordbook_entry_sources"
    __table_args__ = table_args(
        UniqueConstraint("entry_id", "lesson_id", "sentence_idx", name="uq_wordbook_entry_source_context"),
        Index("ix_wordbook_entry_sources_entry_collected_at", "entry_id", "last_collected_at"),
        Index("ix_wordbook_entry_sources_lesson_id", "lesson_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("wordbook_entries.id")), nullable=False, index=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("lessons.id")), nullable=False)
    sentence_idx: Mapped[int] = mapped_column(Integer, nullable=False)
    sentence_en: Mapped[str] = mapped_column(String(1200), nullable=False, default="")
    sentence_zh: Mapped[str] = mapped_column(String(1200), nullable=False, default="")
    first_collected_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    last_collected_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)

    entry: Mapped[WordbookEntry] = relationship(back_populates="source_links")
    lesson: Mapped[Lesson] = relationship()
