from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.timezone import now_shanghai_naive
from app.db import Base, schema_fk, table_args


class WalletAccount(Base):
    __tablename__ = "wallet_accounts"
    __table_args__ = table_args()

    user_id: Mapped[int] = mapped_column(ForeignKey(schema_fk("users.id")), primary_key=True)
    balance_amount_cents: Mapped[int] = mapped_column("balance_points", BigInteger, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)

    user: Mapped["User"] = relationship(back_populates="wallet_account")

    @property
    def balance_points(self) -> int:
        return int(self.balance_amount_cents or 0)

    @balance_points.setter
    def balance_points(self, value: int) -> None:
        self.balance_amount_cents = int(value or 0)


class WalletLedger(Base):
    __tablename__ = "wallet_ledger"
    __table_args__ = table_args(
        CheckConstraint(
            "event_type IN ('reserve','consume','refund','manual_adjust','redeem_code','consume_translate','refund_translate')",
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
    delta_amount_cents: Mapped[int] = mapped_column("delta_points", BigInteger, nullable=False)
    balance_after_amount_cents: Mapped[int] = mapped_column("balance_after", BigInteger, nullable=False)
    amount_unit: Mapped[str] = mapped_column(String(16), default="cents", nullable=False)
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

    @property
    def delta_points(self) -> int:
        return int(self.delta_amount_cents or 0)

    @delta_points.setter
    def delta_points(self, value: int) -> None:
        self.delta_amount_cents = int(value or 0)

    @property
    def balance_after(self) -> int:
        return int(self.balance_after_amount_cents or 0)

    @balance_after.setter
    def balance_after(self, value: int) -> None:
        self.balance_after_amount_cents = int(value or 0)


class BillingModelRate(Base):
    __tablename__ = "billing_model_rates"
    __table_args__ = table_args(
        CheckConstraint("points_per_minute >= 0", name="ck_billing_rate_positive"),
        CheckConstraint("points_per_1k_tokens >= 0", name="ck_billing_rate_token_non_negative"),
        CheckConstraint("cost_per_minute_cents >= 0", name="ck_billing_rate_cost_non_negative"),
        CheckConstraint("parallel_threshold_seconds > 0", name="ck_billing_parallel_threshold_positive"),
        CheckConstraint("segment_seconds > 0", name="ck_billing_segment_seconds_positive"),
        CheckConstraint("max_concurrency > 0", name="ck_billing_max_concurrency_positive"),
    )

    model_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    price_per_minute_cents: Mapped[int] = mapped_column("points_per_minute", Integer, nullable=False)
    cost_per_1k_tokens_cents: Mapped[int] = mapped_column("points_per_1k_tokens", Integer, default=0, nullable=False)
    cost_per_minute_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    billing_unit: Mapped[str] = mapped_column(String(32), default="minute", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    parallel_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    parallel_threshold_seconds: Mapped[int] = mapped_column(Integer, default=900, nullable=False)
    segment_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    max_concurrency: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
    )

    @property
    def points_per_minute(self) -> int:
        return int(self.price_per_minute_cents or 0)

    @points_per_minute.setter
    def points_per_minute(self, value: int) -> None:
        self.price_per_minute_cents = int(value or 0)

    @property
    def points_per_1k_tokens(self) -> int:
        return int(self.cost_per_1k_tokens_cents or 0)

    @points_per_1k_tokens.setter
    def points_per_1k_tokens(self, value: int) -> None:
        self.cost_per_1k_tokens_cents = int(value or 0)

    @property
    def gross_profit_per_minute_cents(self) -> int:
        return int(self.price_per_minute_cents or 0) - int(self.cost_per_minute_cents or 0)


class SubtitleSetting(Base):
    __tablename__ = "subtitle_settings"
    __table_args__ = table_args(
        CheckConstraint("subtitle_split_target_words > 0", name="ck_subtitle_split_target_words_positive"),
        CheckConstraint("subtitle_split_max_words > 0", name="ck_subtitle_split_max_words_positive"),
        CheckConstraint("semantic_split_max_words_threshold > 0", name="ck_semantic_split_threshold_positive"),
        CheckConstraint("semantic_split_timeout_seconds > 0", name="ck_semantic_split_timeout_positive"),
        CheckConstraint(
            "translation_batch_max_chars > 0 AND translation_batch_max_chars <= 12000",
            name="ck_translation_batch_chars_range",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    semantic_split_default_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_asr_model: Mapped[str] = mapped_column(String(100), default="qwen3-asr-flash-filetrans", nullable=False)
    subtitle_split_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    subtitle_split_target_words: Mapped[int] = mapped_column(Integer, default=18, nullable=False)
    subtitle_split_max_words: Mapped[int] = mapped_column(Integer, default=28, nullable=False)
    semantic_split_max_words_threshold: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    semantic_split_timeout_seconds: Mapped[int] = mapped_column(Integer, default=40, nullable=False)
    translation_batch_max_chars: Mapped[int] = mapped_column(Integer, default=2600, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
    )


class SenseVoiceSetting(Base):
    __tablename__ = "sensevoice_settings"
    __table_args__ = table_args(
        CheckConstraint("vad_max_single_segment_time > 0", name="ck_sensevoice_vad_max_segment_positive"),
        CheckConstraint("batch_size_s > 0", name="ck_sensevoice_batch_size_positive"),
        CheckConstraint("merge_length_s > 0", name="ck_sensevoice_merge_length_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    model_dir: Mapped[str] = mapped_column(String(255), default="iic/SenseVoiceSmall", nullable=False)
    trust_remote_code: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    remote_code: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    device: Mapped[str] = mapped_column(String(64), default="cuda:0", nullable=False)
    language: Mapped[str] = mapped_column(String(32), default="auto", nullable=False)
    vad_model: Mapped[str] = mapped_column(String(100), default="fsmn-vad", nullable=False)
    vad_max_single_segment_time: Mapped[int] = mapped_column(Integer, default=30000, nullable=False)
    use_itn: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    batch_size_s: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    merge_vad: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    merge_length_s: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    ban_emo_unk: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
    )


class FasterWhisperSetting(Base):
    __tablename__ = "faster_whisper_settings"
    __table_args__ = table_args(
        CheckConstraint("cpu_threads > 0", name="ck_faster_whisper_cpu_threads_positive"),
        CheckConstraint("num_workers > 0", name="ck_faster_whisper_num_workers_positive"),
        CheckConstraint("beam_size > 0", name="ck_faster_whisper_beam_size_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    device: Mapped[str] = mapped_column(String(32), default="auto", nullable=False)
    compute_type: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    cpu_threads: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    num_workers: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    beam_size: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    vad_filter: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    condition_on_previous_text: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, onupdate=now_shanghai_naive, nullable=False)
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(schema_fk("users.id"), ondelete="SET NULL"),
        nullable=True,
    )


class TranslationRequestLog(Base):
    __tablename__ = "translation_request_logs"
    __table_args__ = table_args(
        CheckConstraint("attempt_no > 0", name="ck_translation_request_attempt_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    task_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey(schema_fk("lessons.id"), ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey(schema_fk("users.id"), ondelete="SET NULL"), nullable=True, index=True)
    sentence_idx: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    attempt_no: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False, default="dashscope_compatible")
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    base_url: Mapped[str] = mapped_column(String(255), nullable=False)
    input_text_preview: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    provider_request_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    finish_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    raw_request_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    raw_response_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    raw_error_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    finished_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_shanghai_naive, nullable=False, index=True)


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
    face_value_amount_cents: Mapped[int] = mapped_column("face_value_points", Integer, nullable=False)
    face_value_unit: Mapped[str] = mapped_column(String(16), default="cents", nullable=False)
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

    @property
    def face_value_points(self) -> int:
        return int(self.face_value_amount_cents or 0)

    @face_value_points.setter
    def face_value_points(self, value: int) -> None:
        self.face_value_amount_cents = int(value or 0)


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
