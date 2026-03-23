from __future__ import annotations

from decimal import Decimal

from app.core.timezone import to_shanghai_aware
from app.models import BillingModelRate, FasterWhisperSetting, Lesson, LessonSentence, SubtitleSetting, User
from app.models.billing import cents_to_rate_yuan, normalize_rate_yuan, rate_yuan_to_compat_cents
from app.schemas import (
    AdminSubtitleSettingsItem,
    BillingRateItem,
    FasterWhisperSettingsItem,
    LessonCatalogItemResponse,
    LessonCatalogProgressSummaryResponse,
    LessonDetailResponse,
    LessonItemResponse,
    LessonSentenceResponse,
    PublicSubtitleSettings,
    SubtitleCacheSeedResponse,
    UserResponse,
)
from app.services.asr_model_registry import get_asr_display_meta
from app.services.lesson_builder import normalize_learning_english_text, tokenize_learning_sentence


def _quantize_rate_yuan(value: object, *, fallback_cents: int = 0) -> Decimal:
    if value not in (None, ""):
        return normalize_rate_yuan(value)
    return cents_to_rate_yuan(int(fallback_cents or 0))


def _compat_cents_from_yuan(value: Decimal) -> int:
    return rate_yuan_to_compat_cents(value)


def _rate_display_meta(model_name: str) -> tuple[str, str]:
    normalized = str(model_name or "").strip()
    display_name, runtime_kind = get_asr_display_meta(normalized)
    if normalized in {"faster-whisper-medium", "qwen3-asr-flash-filetrans"}:
        return display_name, runtime_kind
    if normalized == "qwen-mt-flash":
        return "翻译成本参考", "internal"
    return normalized or "未命名模型", "cloud"


def to_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        is_admin=bool(getattr(user, "is_admin", False)),
        created_at=to_shanghai_aware(user.created_at),
    )


def to_sentence_response(lesson: Lesson, sentence: LessonSentence) -> LessonSentenceResponse:
    audio_url = None
    if lesson.media_storage != "client_indexeddb":
        audio_url = f"/api/lessons/{lesson.id}/sentences/{sentence.idx}/audio"
    normalized_text_en = normalize_learning_english_text(sentence.text_en)
    return LessonSentenceResponse(
        idx=sentence.idx,
        begin_ms=sentence.begin_ms,
        end_ms=sentence.end_ms,
        text_en=normalized_text_en,
        text_zh=sentence.text_zh,
        tokens=tokenize_learning_sentence(normalized_text_en),
        audio_url=audio_url,
    )


def to_runtime_sentence_response(sentence: dict, *, audio_url: str | None = None) -> LessonSentenceResponse:
    normalized_text_en = normalize_learning_english_text(str(sentence.get("text_en") or sentence.get("text") or ""))
    tokens = sentence.get("tokens")
    if not isinstance(tokens, list):
        tokens = tokenize_learning_sentence(normalized_text_en)
    return LessonSentenceResponse(
        idx=int(sentence.get("idx", 0)),
        begin_ms=int(sentence.get("begin_ms", 0)),
        end_ms=int(sentence.get("end_ms", 0)),
        text_en=normalized_text_en,
        text_zh=str(sentence.get("text_zh") or ""),
        tokens=[str(item) for item in tokens],
        audio_url=audio_url,
    )


def to_lesson_item_response(lesson: Lesson) -> LessonItemResponse:
    return LessonItemResponse(
        id=lesson.id,
        title=lesson.title,
        source_filename=lesson.source_filename,
        asr_model=lesson.asr_model,
        duration_ms=lesson.duration_ms,
        media_storage=lesson.media_storage,
        source_duration_ms=lesson.source_duration_ms,
        status=lesson.status,
        created_at=to_shanghai_aware(lesson.created_at),
    )


def to_lesson_catalog_item_response(
    lesson: Lesson,
    *,
    sentence_count: int = 0,
    progress_summary: dict | None = None,
) -> LessonCatalogItemResponse:
    base = to_lesson_item_response(lesson)
    payload = None
    if isinstance(progress_summary, dict):
        payload = LessonCatalogProgressSummaryResponse(
            current_sentence_index=int(progress_summary.get("current_sentence_index", 0) or 0),
            completed_sentence_count=int(progress_summary.get("completed_sentence_count", 0) or 0),
            last_played_at_ms=int(progress_summary.get("last_played_at_ms", 0) or 0),
            updated_at=to_shanghai_aware(progress_summary.get("updated_at")) if progress_summary.get("updated_at") else None,
        )
    return LessonCatalogItemResponse(
        id=base.id,
        title=base.title,
        source_filename=base.source_filename,
        asr_model=base.asr_model,
        duration_ms=base.duration_ms,
        media_storage=base.media_storage,
        source_duration_ms=base.source_duration_ms,
        status=base.status,
        created_at=base.created_at,
        sentence_count=max(0, int(sentence_count or 0)),
        progress_summary=payload,
    )


def to_lesson_detail_response(lesson: Lesson, sentences: list[LessonSentence]) -> LessonDetailResponse:
    base = to_lesson_item_response(lesson)
    subtitle_cache_seed_payload = getattr(lesson, "subtitle_cache_seed", None)
    subtitle_cache_seed = None
    if isinstance(subtitle_cache_seed_payload, dict):
        subtitle_cache_seed = SubtitleCacheSeedResponse(
            semantic_split_enabled=bool(subtitle_cache_seed_payload.get("semantic_split_enabled")),
            split_mode=str(subtitle_cache_seed_payload.get("split_mode") or ""),
            source_word_count=int(subtitle_cache_seed_payload.get("source_word_count", 0)),
            strategy_version=int(subtitle_cache_seed_payload.get("strategy_version", 1)),
            asr_payload=dict(subtitle_cache_seed_payload.get("asr_payload") or {}),
            sentences=[
                to_runtime_sentence_response(item)
                for item in list(subtitle_cache_seed_payload.get("sentences") or [])
                if isinstance(item, dict)
            ],
        )
    return LessonDetailResponse(
        id=base.id,
        title=base.title,
        source_filename=base.source_filename,
        asr_model=base.asr_model,
        duration_ms=base.duration_ms,
        media_storage=base.media_storage,
        source_duration_ms=base.source_duration_ms,
        status=base.status,
        created_at=base.created_at,
        sentences=[to_sentence_response(lesson, item) for item in sentences],
        subtitle_cache_seed=subtitle_cache_seed,
    )


def to_rate_item(rate: BillingModelRate) -> BillingRateItem:
    display_name, runtime_kind = _rate_display_meta(rate.model_name)
    price_per_minute_yuan = _quantize_rate_yuan(
        getattr(rate, "price_per_minute_yuan", None),
        fallback_cents=int(getattr(rate, "price_per_minute_cents", 0) or getattr(rate, "points_per_minute", 0) or 0),
    )
    cost_per_minute_yuan = _quantize_rate_yuan(
        getattr(rate, "cost_per_minute_yuan", None),
        fallback_cents=int(getattr(rate, "cost_per_minute_cents", 0) or 0),
    )
    gross_profit_per_minute_yuan = normalize_rate_yuan(price_per_minute_yuan - cost_per_minute_yuan)
    price_per_minute_cents = _compat_cents_from_yuan(price_per_minute_yuan)
    cost_per_minute_cents = _compat_cents_from_yuan(cost_per_minute_yuan)
    return BillingRateItem(
        model_name=rate.model_name,
        display_name=display_name,
        price_per_minute_yuan=price_per_minute_yuan,
        cost_per_minute_yuan=cost_per_minute_yuan,
        gross_profit_per_minute_yuan=gross_profit_per_minute_yuan,
        price_per_minute_cents=price_per_minute_cents,
        points_per_minute=price_per_minute_cents,
        points_per_1k_tokens=int(getattr(rate, "points_per_1k_tokens", 0) or 0),
        cost_per_minute_cents=cost_per_minute_cents,
        gross_profit_per_minute_cents=price_per_minute_cents - cost_per_minute_cents,
        billing_unit=str(getattr(rate, "billing_unit", "minute") or "minute"),
        is_active=rate.is_active,
        parallel_enabled=bool(rate.parallel_enabled),
        parallel_threshold_seconds=int(rate.parallel_threshold_seconds),
        segment_seconds=int(rate.segment_seconds),
        max_concurrency=int(rate.max_concurrency),
        runtime_kind=runtime_kind,
        updated_at=to_shanghai_aware(rate.updated_at),
    )


def to_public_subtitle_settings(item: SubtitleSetting) -> PublicSubtitleSettings:
    return PublicSubtitleSettings(
        semantic_split_default_enabled=bool(item.semantic_split_default_enabled),
        default_asr_model=str(getattr(item, "default_asr_model", "") or ""),
    )


def to_admin_subtitle_settings_item(item: SubtitleSetting) -> AdminSubtitleSettingsItem:
    return AdminSubtitleSettingsItem(
        semantic_split_default_enabled=bool(item.semantic_split_default_enabled),
        default_asr_model=str(getattr(item, "default_asr_model", "") or ""),
        subtitle_split_enabled=bool(item.subtitle_split_enabled),
        subtitle_split_target_words=int(item.subtitle_split_target_words),
        subtitle_split_max_words=int(item.subtitle_split_max_words),
        semantic_split_max_words_threshold=int(item.semantic_split_max_words_threshold),
        semantic_split_timeout_seconds=int(item.semantic_split_timeout_seconds),
        translation_batch_max_chars=max(1, min(12000, int(getattr(item, "translation_batch_max_chars", 2600) or 2600))),
        updated_at=to_shanghai_aware(item.updated_at),
    )


def to_faster_whisper_settings_item(item: FasterWhisperSetting) -> FasterWhisperSettingsItem:
    return FasterWhisperSettingsItem(
        device=str(getattr(item, "device", "") or ""),
        compute_type=str(getattr(item, "compute_type", "") or ""),
        cpu_threads=int(getattr(item, "cpu_threads", 4) or 4),
        num_workers=int(getattr(item, "num_workers", 2) or 2),
        beam_size=int(getattr(item, "beam_size", 5) or 5),
        vad_filter=bool(getattr(item, "vad_filter", True)),
        condition_on_previous_text=bool(getattr(item, "condition_on_previous_text", False)),
        updated_at=to_shanghai_aware(item.updated_at),
    )
