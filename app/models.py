from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    lessons: Mapped[list["Lesson"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    wallet_account: Mapped["WalletAccount | None"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")


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

    user: Mapped[User] = relationship(back_populates="lessons")
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


class WalletAccount(Base):
    __tablename__ = "wallet_accounts"
    __table_args__ = (CheckConstraint("balance_points >= 0", name="ck_wallet_balance_non_negative"),)

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    balance_points: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="wallet_account")


class WalletLedger(Base):
    __tablename__ = "wallet_ledger"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('reserve','consume','refund','manual_adjust')",
            name="ck_wallet_ledger_event_type",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    operator_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    delta_points: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_after: Mapped[int] = mapped_column(BigInteger, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("lessons.id"), nullable=True, index=True)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class BillingModelRate(Base):
    __tablename__ = "billing_model_rates"
    __table_args__ = (CheckConstraint("points_per_minute > 0", name="ck_billing_rate_positive"),)

    model_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    points_per_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
