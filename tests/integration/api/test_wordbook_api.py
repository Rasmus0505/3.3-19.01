"""API 集成测试: wordbook 模块。"""
from __future__ import annotations

from app.models import Lesson, LessonSentence, User, WordbookEntry
from app.schemas.wordbook import WordbookEntryResponse
from app.security import hash_password
from app.repositories.user import canonicalize_username, normalize_username
from app.services.wordbook_review_scheduler import build_initial_review_state


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
    assert entry.start_token_index == 0
    assert entry.end_token_index == 0

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


def test_wordbook_review_preview_returns_intervals(authenticated_client, db_session, test_user):
    lesson = _seed_lesson_with_sentence(db_session, user_id=test_user.id)
    collect_response = authenticated_client.post(
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
    assert collect_response.status_code == 200
    entry = WordbookEntryResponse.model_validate(collect_response.json()["entry"])
    assert entry.start_token_index == 0
    assert entry.end_token_index == 0

    preview_response = authenticated_client.get(f"/api/wordbook/review-preview/{entry.id}")
    assert preview_response.status_code == 200
    payload = preview_response.json()
    assert payload["entry_id"] == entry.id
    assert [item["grade"] for item in payload["grades"]] == ["again", "hard", "good", "easy"]


def test_wordbook_due_count_excludes_mastered_entries(authenticated_client, db_session, test_user):
    lesson = _seed_lesson_with_sentence(db_session, user_id=test_user.id)
    collect_response = authenticated_client.post(
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
    assert collect_response.status_code == 200
    entry = WordbookEntryResponse.model_validate(collect_response.json()["entry"])

    update_response = authenticated_client.patch(f"/api/wordbook/{entry.id}", json={"status": "mastered"})
    assert update_response.status_code == 200

    listing = authenticated_client.get("/api/wordbook")
    assert listing.status_code == 200
    assert listing.json()["due_count"] == 0

    queue = authenticated_client.get("/api/wordbook/review-queue")
    assert queue.status_code == 200
    assert queue.json()["total"] == 0


def test_wordbook_batch_move_accepts_target_lesson_id(authenticated_client, db_session, test_user):
    source_lesson = _seed_lesson_with_sentence(db_session, user_id=test_user.id)
    target_lesson = Lesson(
        user_id=test_user.id,
        title="Target Lesson",
        source_filename="target.mp4",
        asr_model="qwen3-asr-flash-filetrans",
        duration_ms=60000,
        media_storage="server",
        source_duration_ms=60000,
        status="ready",
    )
    db_session.add(target_lesson)
    db_session.flush()

    collect_response = authenticated_client.post(
        "/api/wordbook/collect",
        json={
            "lesson_id": source_lesson.id,
            "sentence_index": 0,
            "entry_text": "hello",
            "entry_type": "word",
            "start_token_index": 0,
            "end_token_index": 0,
        },
    )
    assert collect_response.status_code == 200
    entry = WordbookEntryResponse.model_validate(collect_response.json()["entry"])

    move_response = authenticated_client.patch(
        "/api/wordbook/batch-move",
        json={"entry_ids": [entry.id], "target_lesson_id": target_lesson.id},
    )
    assert move_response.status_code == 200
    assert move_response.json()["moved_count"] == 1

    listing = authenticated_client.get("/api/wordbook")
    assert listing.status_code == 200
    updated_entry = WordbookEntryResponse.model_validate(listing.json()["items"][0])
    assert updated_entry.source_lesson_id == target_lesson.id


def test_wordbook_batch_delete_is_scoped_to_current_user(authenticated_client, db_session, test_user):
    other_user = User(
        email="other-wordbook@example.com",
        username=canonicalize_username("Other Wordbook User"),
        username_normalized=normalize_username("Other Wordbook User"),
        password_hash=hash_password("testpassword123"),
        is_admin=False,
    )
    db_session.add(other_user)
    db_session.flush()

    review_state = build_initial_review_state()
    foreign_entry = WordbookEntry(
        user_id=other_user.id,
        latest_lesson_id=None,
        entry_text="foreign",
        normalized_text="foreign",
        entry_type="word",
        status=review_state.status,
        latest_sentence_idx=0,
        latest_sentence_en="foreign",
        latest_sentence_zh="外部",
        latest_collected_at=review_state.next_review_at,
        next_review_at=review_state.next_review_at,
        last_reviewed_at=review_state.last_reviewed_at,
        review_count=review_state.review_count,
        wrong_count=review_state.wrong_count,
        memory_score=review_state.memory_score,
    )
    db_session.add(foreign_entry)
    db_session.commit()

    delete_response = authenticated_client.post(
        "/api/wordbook/batch-delete",
        json={"entry_ids": [foreign_entry.id]},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted_count"] == 0

    still_exists = db_session.get(WordbookEntry, foreign_entry.id)
    assert still_exists is not None
    assert still_exists.user_id == other_user.id


def test_wordbook_health_returns_200(authenticated_client):
    response = authenticated_client.get("/api/wordbook/health")
    assert response.status_code == 200
