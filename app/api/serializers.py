from __future__ import annotations

from app.core.timezone import to_shanghai_aware
from app.models import BillingModelRate, Lesson, LessonSentence, SubtitleSetting, User
from app.schemas import (
    AdminSubtitleSettingsItem,
    BillingRateItem,
    LessonDetailResponse,
    LessonItemResponse,
    LessonSentenceResponse,
    PublicSubtitleSettings,
    SubtitleCacheSeedResponse,
    UserResponse,
)
from app.services.lesson_builder import normalize_learning_english_text, tokenize_learning_sentence


def to_user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, created_at=to_shanghai_aware(user.created_at))


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
    return BillingRateItem(
        model_name=rate.model_name,
        points_per_minute=rate.points_per_minute,
        points_per_1k_tokens=int(getattr(rate, "points_per_1k_tokens", 0) or 0),
        billing_unit=str(getattr(rate, "billing_unit", "minute") or "minute"),
        is_active=rate.is_active,
        parallel_enabled=bool(rate.parallel_enabled),
        parallel_threshold_seconds=int(rate.parallel_threshold_seconds),
        segment_seconds=int(rate.segment_seconds),
        max_concurrency=int(rate.max_concurrency),
        updated_at=to_shanghai_aware(rate.updated_at),
    )


def to_public_subtitle_settings(item: SubtitleSetting) -> PublicSubtitleSettings:
    return PublicSubtitleSettings(semantic_split_default_enabled=bool(item.semantic_split_default_enabled))


def to_admin_subtitle_settings_item(item: SubtitleSetting) -> AdminSubtitleSettingsItem:
    return AdminSubtitleSettingsItem(
        semantic_split_default_enabled=bool(item.semantic_split_default_enabled),
        subtitle_split_enabled=bool(item.subtitle_split_enabled),
        subtitle_split_target_words=int(item.subtitle_split_target_words),
        subtitle_split_max_words=int(item.subtitle_split_max_words),
        semantic_split_max_words_threshold=int(item.semantic_split_max_words_threshold),
        semantic_split_model=str(item.semantic_split_model),
        semantic_split_timeout_seconds=int(item.semantic_split_timeout_seconds),
        translation_batch_max_chars=max(1, min(12000, int(getattr(item, "translation_batch_max_chars", 2600) or 2600))),
        updated_at=to_shanghai_aware(item.updated_at),
    )
