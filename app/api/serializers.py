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
    UserResponse,
)


def to_user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, created_at=to_shanghai_aware(user.created_at))


def to_sentence_response(lesson: Lesson, sentence: LessonSentence) -> LessonSentenceResponse:
    audio_url = None
    if lesson.media_storage != "client_indexeddb":
        audio_url = f"/api/lessons/{lesson.id}/sentences/{sentence.idx}/audio"
    return LessonSentenceResponse(
        idx=sentence.idx,
        begin_ms=sentence.begin_ms,
        end_ms=sentence.end_ms,
        text_en=sentence.text_en,
        text_zh=sentence.text_zh,
        tokens=sentence.tokens_json,
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
    )


def to_rate_item(rate: BillingModelRate) -> BillingRateItem:
    return BillingRateItem(
        model_name=rate.model_name,
        points_per_minute=rate.points_per_minute,
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
        updated_at=to_shanghai_aware(item.updated_at),
    )
