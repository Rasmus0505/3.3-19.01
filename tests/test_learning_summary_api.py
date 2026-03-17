from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.timezone import now_shanghai_naive
from app.db import Base, create_database_engine, get_db
from app.main import create_app
from app.models import Lesson, LessonProgress, LessonSentence, User
from app.models.learning_stats import UserLearningDailyStat
from app.services.billing_service import ensure_default_billing_rates


@pytest.fixture()
def learning_summary_client(tmp_path):
    db_file = tmp_path / "learning_summary.db"
    engine = create_database_engine(f"sqlite:///{db_file}")
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)

    Base.metadata.create_all(bind=engine)

    seed = testing_session()
    try:
        ensure_default_billing_rates(seed)
        seed.commit()
    finally:
        seed.close()

    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        yield client, testing_session


def _register_and_login(client: TestClient, email: str, password: str = "123456") -> str:
    register_resp = client.post("/api/auth/register", json={"email": email, "password": password})
    assert register_resp.status_code == 200
    login_resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200
    return login_resp.json()["access_token"]


def _seed_lesson(
    session_factory,
    *,
    user_email: str,
    title: str,
    sentence_count: int,
    completed_indexes: list[int] | None = None,
    updated_at: datetime | None = None,
) -> int:
    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == user_email))
        lesson = Lesson(
            user_id=user.id,
            title=title,
            source_filename=f"{title}.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=sentence_count * 1000,
            source_duration_ms=sentence_count * 1000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        for idx in range(sentence_count):
            session.add(
                LessonSentence(
                    lesson_id=lesson.id,
                    idx=idx,
                    begin_ms=idx * 1000,
                    end_ms=(idx + 1) * 1000,
                    text_en=f"lesson {title} sentence {idx}",
                    text_zh=f"第 {idx} 句",
                    tokens_json=["lesson", title.lower(), "sentence", str(idx)],
                    audio_clip_path=None,
                )
            )
        progress = LessonProgress(
            lesson_id=lesson.id,
            user_id=user.id,
            current_sentence_idx=min(len(completed_indexes or []), max(sentence_count - 1, 0)),
            completed_indexes_json=list(completed_indexes or []),
            last_played_at_ms=0,
        )
        if updated_at is not None:
            progress.updated_at = updated_at
        session.add(progress)
        session.commit()
        return lesson.id
    finally:
        session.close()


def test_learning_summary_empty_state(learning_summary_client):
    client, _ = learning_summary_client
    token = _register_and_login(client, "summary-empty@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get("/api/lessons/progress/summary?range_days=7", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["summary"]["lesson_total"] == 0
    assert data["summary"]["completed_sentences_in_range"] == 0
    assert data["summary"]["check_attempts_in_range"] == 0
    assert data["summary"]["streak_days"] == 0
    assert data["continue_lesson"] is None
    assert data["stalled_lesson"] is None
    assert data["primary_recommendation"]["kind"] == "start-first-upload"
    assert len(data["focus_cards"]) == 4


def test_learning_summary_progress_delta_and_check_attempts(learning_summary_client):
    client, session_factory = learning_summary_client
    user_email = "summary-progress@example.com"
    token = _register_and_login(client, user_email)
    headers = {"Authorization": f"Bearer {token}"}
    lesson_id = _seed_lesson(session_factory, user_email=user_email, title="Progress", sentence_count=2, completed_indexes=[])

    first_progress = client.post(
        f"/api/lessons/{lesson_id}/progress",
        headers=headers,
        json={"current_sentence_index": 0, "completed_sentence_indexes": [0], "last_played_at_ms": 0},
    )
    assert first_progress.status_code == 200

    second_progress = client.post(
        f"/api/lessons/{lesson_id}/progress",
        headers=headers,
        json={"current_sentence_index": 0, "completed_sentence_indexes": [0], "last_played_at_ms": 0},
    )
    assert second_progress.status_code == 200

    wrong_check = client.post(
        f"/api/lessons/{lesson_id}/check",
        headers=headers,
        json={"sentence_index": 0, "user_tokens": ["wrong"]},
    )
    assert wrong_check.status_code == 200
    assert wrong_check.json()["passed"] is False

    correct_check = client.post(
        f"/api/lessons/{lesson_id}/check",
        headers=headers,
        json={"sentence_index": 0, "user_tokens": ["lesson", "progress", "sentence", "0"]},
    )
    assert correct_check.status_code == 200
    assert correct_check.json()["passed"] is True

    summary_resp = client.get("/api/lessons/progress/summary?range_days=7", headers=headers)
    assert summary_resp.status_code == 200
    summary = summary_resp.json()["summary"]
    assert summary["completed_sentences_in_range"] == 1
    assert summary["check_attempts_in_range"] == 2
    assert summary["check_passes_in_range"] == 1
    assert summary["pass_rate_in_range"] == 50.0
    assert summary["lesson_total"] == 1
    assert summary["sentence_total"] == 2
    assert summary["sentence_completed_total"] == 1


def test_learning_summary_streak_and_user_isolation(learning_summary_client):
    client, session_factory = learning_summary_client
    main_email = "summary-streak@example.com"
    other_email = "summary-other@example.com"
    token = _register_and_login(client, main_email)
    _register_and_login(client, other_email)

    now = now_shanghai_naive()
    session = session_factory()
    try:
        main_user = session.scalar(select(User).where(User.email == main_email))
        other_user = session.scalar(select(User).where(User.email == other_email))
        for offset, completed in [(2, 1), (1, 2), (0, 3)]:
            stat_date = (now - timedelta(days=offset)).date()
            session.add(
                UserLearningDailyStat(
                    user_id=main_user.id,
                    stat_date=stat_date,
                    completed_sentences=completed,
                    check_attempts=completed,
                    check_passes=completed,
                    last_learning_at=(now - timedelta(days=offset)),
                )
            )
        session.add(
            UserLearningDailyStat(
                user_id=other_user.id,
                stat_date=now.date(),
                completed_sentences=99,
                check_attempts=99,
                check_passes=99,
                last_learning_at=now,
            )
        )
        session.commit()
    finally:
        session.close()

    headers = {"Authorization": f"Bearer {token}"}
    resp = client.get("/api/lessons/progress/summary?range_days=7", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["summary"]
    assert data["streak_days"] == 3
    assert data["active_days_in_range"] == 3
    assert data["completed_sentences_in_range"] == 6
    assert data["check_attempts_in_range"] == 6
    assert data["check_passes_in_range"] == 6
    assert data["recent_learning_at"].endswith("+08:00")


def test_learning_summary_course_diagnosis_prefers_stalled_lesson(learning_summary_client):
    client, session_factory = learning_summary_client
    user_email = "summary-diagnosis@example.com"
    token = _register_and_login(client, user_email)
    headers = {"Authorization": f"Bearer {token}"}
    now = now_shanghai_naive()

    stalled_lesson_id = _seed_lesson(
        session_factory,
        user_email=user_email,
        title="Stalled",
        sentence_count=5,
        completed_indexes=[0, 1, 2, 3],
        updated_at=now - timedelta(days=5),
    )
    _seed_lesson(
        session_factory,
        user_email=user_email,
        title="Fresh",
        sentence_count=5,
        completed_indexes=[0],
        updated_at=now,
    )

    resp = client.get("/api/lessons/progress/summary?range_days=7", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["stalled_lesson"]["lesson_id"] == stalled_lesson_id
    assert data["primary_recommendation"]["kind"] == "resume-stalled"
    assert data["primary_recommendation"]["lesson_id"] == stalled_lesson_id
