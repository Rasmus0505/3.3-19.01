"""API 集成测试: wordbook 模块。"""
from __future__ import annotations

from app.models import Lesson, LessonSentence
from app.schemas.wordbook import WordbookEntryResponse


def _seed_lesson_with_sentence(db_session, *, user_id: int) -> Lesson:
    lesson = Lesson(
        user_id=user_id,
        title="Wordbook Lesson",
        source_filename="wordbook.mp4",
        asr_model="qwen3-asr-flash-filetrans",
        duration_ms=60000,
        media_storage="server",
        source_duration_ms=60000,
        status="ready",
    )
    db_session.add(lesson)
    db_session.flush()
    db_session.add(
        LessonSentence(
            lesson_id=lesson.id,
            idx=0,
            begin_ms=0,
            end_ms=3000,
            text_en="Hello brave world",
            text_zh="你好，勇敢的世界",
            tokens_json=["hello", "brave", "world"],
        )
    )
    db_session.flush()
    return lesson


def test_wordbook_collect_returns_review_metadata(authenticated_client, db_session, test_user):
    lesson = _seed_lesson_with_sentence(db_session, user_id=test_user.id)

    response = authenticated_client.post(
        "/api/wordbook/collect",
        json={
            "lesson_id": lesson.id,
            "sentence_index": 0,
            "entry_text": "hello",
            "entry_type": "word",
            "start_token_index": 0,
            "end_token_index": 0,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    entry = WordbookEntryResponse.model_validate(payload["entry"])
    assert entry.next_review_at is not None
    assert entry.memory_score > 0
    assert entry.review_count == 0

    listing = authenticated_client.get("/api/wordbook")
    assert listing.status_code == 200
    listing_payload = listing.json()
    assert listing_payload["due_count"] >= 1
    assert len(listing_payload["items"]) == 1


def test_wordbook_review_queue_and_review_action(authenticated_client, db_session, test_user):
    lesson = _seed_lesson_with_sentence(db_session, user_id=test_user.id)
    collect_response = authenticated_client.post(
        "/api/wordbook/collect",
        json={
            "lesson_id": lesson.id,
            "sentence_index": 0,
            "entry_text": "hello brave",
            "entry_type": "phrase",
            "start_token_index": 0,
            "end_token_index": 1,
        },
    )
    assert collect_response.status_code == 200
    entry = WordbookEntryResponse.model_validate(collect_response.json()["entry"])

    queue_response = authenticated_client.get("/api/wordbook/review-queue")
    assert queue_response.status_code == 200
    queue_payload = queue_response.json()
    assert queue_payload["total"] == 1
    queued_entry = WordbookEntryResponse.model_validate(queue_payload["items"][0])
    assert queued_entry.id == entry.id

    review_response = authenticated_client.post(
        f"/api/wordbook/{entry.id}/review",
        json={"grade": "good"},
    )
    assert review_response.status_code == 200
    review_payload = review_response.json()
    updated_entry = WordbookEntryResponse.model_validate(review_payload["entry"])
    assert updated_entry.review_count == 1
    assert updated_entry.memory_score > entry.memory_score
    assert updated_entry.next_review_at != entry.next_review_at
    assert review_payload["remaining_due"] == 0


def test_wordbook_health_returns_200(authenticated_client):
    response = authenticated_client.get("/api/wordbook/health")
    assert response.status_code == 200
