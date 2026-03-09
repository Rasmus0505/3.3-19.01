from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.billing import BillingRateItem


class AdminUserItem(BaseModel):
    id: int
    email: str
    created_at: datetime
    balance_points: int


class AdminUsersResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[AdminUserItem]


class AdminUserDeleteResponse(BaseModel):
    ok: bool = True
    user_id: int
    email: str
    deleted_lessons: int
    deleted_ledger_rows: int
    cleared_operator_refs: int
    file_cleanup_failed_dirs: list[str]


class WalletAdjustRequest(BaseModel):
    delta_points: int
    reason: str = Field(min_length=1, max_length=500)


class WalletAdjustResponse(BaseModel):
    ok: bool = True
    user_id: int
    balance_points: int


class WalletLedgerItem(BaseModel):
    id: int
    user_id: int
    user_email: str
    operator_user_id: int | None
    event_type: str
    delta_points: int
    balance_after: int
    model_name: str | None
    duration_ms: int | None
    lesson_id: int | None
    redeem_batch_id: int | None
    redeem_code_id: int | None
    redeem_code_mask: str | None
    note: str
    created_at: datetime


class AdminWalletLogsResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[WalletLedgerItem]


class AdminBillingRateUpdateRequest(BaseModel):
    points_per_minute: int = Field(ge=0)
    points_per_1k_tokens: int = Field(ge=0)
    billing_unit: str = Field(min_length=1, max_length=32)
    is_active: bool
    parallel_enabled: bool
    parallel_threshold_seconds: int = Field(gt=0, le=24 * 60 * 60)
    segment_seconds: int = Field(gt=0, le=2 * 60 * 60)
    max_concurrency: int = Field(gt=0, le=64)


class AdminBillingRatesResponse(BaseModel):
    ok: bool = True
    rates: list[BillingRateItem]


class AdminTranslationLogItem(BaseModel):
    id: int
    user_email: str
    task_id: str | None
    lesson_id: int | None
    sentence_idx: int
    attempt_no: int
    provider: str
    model_name: str
    base_url: str
    input_text_preview: str
    provider_request_id: str | None
    status_code: int | None
    finish_reason: str | None
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    success: bool
    error_code: str | None
    error_message: str
    started_at: datetime
    finished_at: datetime
    created_at: datetime


class AdminTranslationLogsResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[AdminTranslationLogItem]


class AdminSubtitleSettingsItem(BaseModel):
    semantic_split_default_enabled: bool
    subtitle_split_enabled: bool
    subtitle_split_target_words: int
    subtitle_split_max_words: int
    semantic_split_max_words_threshold: int
    semantic_split_model: str
    semantic_split_timeout_seconds: int
    translation_batch_max_chars: int
    updated_at: datetime


class AdminSubtitleSettingsUpdateRequest(BaseModel):
    semantic_split_default_enabled: bool
    subtitle_split_enabled: bool
    subtitle_split_target_words: int = Field(gt=0, le=200)
    subtitle_split_max_words: int = Field(gt=0, le=300)
    semantic_split_max_words_threshold: int = Field(gt=0, le=300)
    semantic_split_model: str = Field(min_length=1, max_length=100)
    semantic_split_timeout_seconds: int = Field(gt=0, le=300)
    translation_batch_max_chars: int | None = Field(default=None, gt=0, le=12000)


class AdminSubtitleSettingsResponse(BaseModel):
    ok: bool = True
    settings: AdminSubtitleSettingsItem


class AdminRedeemBatchCreateRequest(BaseModel):
    batch_name: str = Field(min_length=1, max_length=120)
    face_value_points: int = Field(gt=0)
    generate_quantity: int = Field(gt=0, le=5000)
    active_from: datetime | None = None
    expire_at: datetime | None = None
    daily_limit_per_user: int | None = Field(default=None, gt=0)
    remark: str = Field(default="", max_length=1000)


class AdminRedeemBatchCopyRequest(BaseModel):
    generate_quantity: int = Field(gt=0, le=5000)


class AdminRedeemBatchItem(BaseModel):
    id: int
    batch_name: str
    face_value_points: int
    generated_count: int
    redeemed_count: int
    remaining_count: int
    redeem_rate: float
    total_issued_points: int
    total_redeemed_points: int
    status: str
    active_from: datetime
    expire_at: datetime
    daily_limit_per_user: int | None
    effective_daily_limit: int
    remark: str
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime


class AdminRedeemBatchListResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[AdminRedeemBatchItem]


class AdminRedeemBatchCreateResponse(BaseModel):
    ok: bool = True
    batch: AdminRedeemBatchItem
    generated_codes: list[str]


class AdminRedeemBatchActionResponse(BaseModel):
    ok: bool = True
    batch: AdminRedeemBatchItem


class AdminRedeemCodeItem(BaseModel):
    id: int
    batch_id: int
    batch_name: str
    code_mask: str
    status: str
    effective_status: str
    face_value_points: int
    redeemed_user_email: str | None
    redeemed_at: datetime | None
    created_by_user_id: int | None
    created_at: datetime


class AdminRedeemCodeListResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[AdminRedeemCodeItem]


class AdminRedeemCodeStatusActionResponse(BaseModel):
    ok: bool = True
    code_id: int
    status: str
    effective_status: str


class AdminRedeemCodeBulkDisableRequest(BaseModel):
    code_ids: list[int] = Field(default_factory=list)
    batch_id: int | None = None


class AdminRedeemCodeBulkDisableResponse(BaseModel):
    ok: bool = True
    changed_count: int


class AdminRedeemCodeExportRequest(BaseModel):
    batch_id: int | None = None
    confirm_text: str = Field(min_length=1, max_length=32)


class AdminRedeemAuditItem(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None
    batch_id: int | None
    batch_name: str | None
    code_id: int | None
    code_mask: str
    success: bool
    failure_reason: str
    created_at: datetime


class AdminRedeemAuditListResponse(BaseModel):
    ok: bool = True
    page: int
    page_size: int
    total: int
    items: list[AdminRedeemAuditItem]


class AdminRedeemAuditExportRequest(BaseModel):
    confirm_text: str = Field(min_length=1, max_length=32)
    batch_id: int | None = None
    user_email: str = ""
    date_from: datetime | None = None
    date_to: datetime | None = None
