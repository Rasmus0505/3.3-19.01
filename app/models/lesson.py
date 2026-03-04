from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    asr_model: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="ready", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="lessons")
    sentences: Mapped[list["LessonSentence"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")
    progress_records: Mapped[list["LessonProgress"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")
    media_assets: Mapped[list["MediaAsset"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")


class LessonSentence(Base):
    __tablename__ = "lesson_sentences"
    __table_args__ = (UniqueConstraint("lesson_id", "idx", name="uq_lesson_sentence_idx"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), nullable=False, index=True)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    begin_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    text_en: Mapped[str] = mapped_column(String, nullable=False)
    text_zh: Mapped[str] = mapped_column(String, default="", nullable=False)
    tokens_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    audio_clip_path: Mapped[str] = mapped_column(String(500), nullable=False)

    lesson: Mapped[Lesson] = relationship(back_populates="sentences")


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (UniqueConstraint("lesson_id", "user_id", name="uq_lesson_progress_user"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    current_sentence_idx: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_indexes_json: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=False)
    last_played_at_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    lesson: Mapped[Lesson] = relationship(back_populates="progress_records")


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), nullable=False, index=True)
    original_path: Mapped[str] = mapped_column(String(500), nullable=False)
    opus_path: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    lesson: Mapped[Lesson] = relationship(back_populates="media_assets")
