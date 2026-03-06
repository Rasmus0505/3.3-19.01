from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class WalletAccount(Base):
    __tablename__ = "wallet_accounts"
    __table_args__ = table_args(CheckConstraint("balance_points >= 0", name="ck_wallet_balance_non_negative"))

    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), primary_key=True)
    balance_points: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    user: Mapped["User"] = relationship(back_populates="wallet_account")


class WalletLedger(Base):
    __tablename__ = "wallet_ledger"
    __table_args__ = table_args(
        CheckConstraint(
            "event_type IN ('reserve','consume','refund','manual_adjust','redeem_code')",
            name="ck_wallet_ledger_event_type",
        )
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), nullable=False, index=True)
    operator_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    delta_points: Mapped[int] = mapped_column(BigInteger, nullable=False)
    balance_after: Mapped[int] = mapped_column(BigInteger, nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey(schema_fk("lessons.id")), nullable=True, index=True)
    redeem_batch_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("redeem_code_batches.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    redeem_code_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("redeem_codes.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    redeem_code_mask: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)


class BillingModelRate(Base):
    __tablename__ = "billing_model_rates"
    __table_args__ = table_args(CheckConstraint("points_per_minute > 0", name="ck_billing_rate_positive"))

    model_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    points_per_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
    )


class RedeemCodeBatch(Base):
    __tablename__ = "redeem_code_batches"
    __table_args__ = table_args(
        CheckConstraint("face_value_points > 0", name="ck_redeem_batch_face_value_positive"),
        CheckConstraint("generated_count >= 0", name="ck_redeem_batch_generated_count_non_negative"),
        CheckConstraint("status IN ('active','paused','expired')", name="ck_redeem_batch_status"),
        CheckConstraint("daily_limit_per_user IS NULL OR daily_limit_per_user > 0", name="ck_redeem_batch_daily_limit_positive"),
        CheckConstraint("expire_at > active_from", name="ck_redeem_batch_time_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    face_value_points: Mapped[int] = mapped_column(Integer, nullable=False)
    generated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active_from: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    expire_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    daily_limit_per_user: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active", index=True)
    remark: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)


class RedeemCode(Base):
    __tablename__ = "redeem_codes"
    __table_args__ = table_args(CheckConstraint("status IN ('active','disabled','abandoned','redeemed')", name="ck_redeem_code_status"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey(schema_fk("redeem_code_batches.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code_plain: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    masked_code: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active", index=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    redeemed_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    redeemed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)


class RedeemCodeAttempt(Base):
    __tablename__ = "redeem_code_attempts"
    __table_args__ = table_args()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey(schema_fk("users.id"), ondelete="SET NULL"), nullable=True, index=True)
    batch_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("redeem_code_batches.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    code_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("redeem_codes.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    code_mask: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, index=True)
    failure_reason: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)


class AdminOperationLog(Base):
    __tablename__ = "admin_operation_logs"
    __table_args__ = table_args()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    operator_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False, default="", index=True)
    before_value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    after_value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)
