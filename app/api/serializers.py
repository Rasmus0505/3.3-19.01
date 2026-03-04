from __future__ import annotations

from app.core.timezone import to_shanghai_aware
from app.models import BillingModelRate, Lesson, LessonSentence, User
from app.schemas import BillingRateItem, LessonDetailResponse, LessonItemResponse, LessonSentenceResponse, UserResponse


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
        updated_at=to_shanghai_aware(rate.updated_at),
    )
