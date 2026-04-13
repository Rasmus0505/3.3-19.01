from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mock_user():
    user = MagicMock()
    user.id = 1
    return user


@pytest.fixture
def client(mock_user):
    from app.main import create_app
    from app.api.deps.auth import get_current_user

    app = create_app(enable_lifespan=False)
    app.dependency_overrides[get_current_user] = lambda: mock_user
    with TestClient(app) as tc:
        yield tc
    app.dependency_overrides.clear()


def _usage():
    return MagicMock(prompt_tokens=120, completion_tokens=80, reasoning_tokens=0, total_tokens=200)


def test_generate_reading_course_returns_structured_course(client):
    payload = {
        "title": "Reading Classroom",
        "teacher": {"name": "Coach Mira", "persona": "Guides the learner clearly.", "tone": "focused"},
        "intro": {
            "title": "进入课堂",
            "hook": "Start from meaning.",
            "teacher_opening": "We read the adapted text first.",
            "objectives": ["Understand the article", "Review difficult language"],
        },
        "warmup": {
            "title": "预热",
            "preview": "Watch the key words.",
            "keywords": [{"word": "climate", "reason": "central concept", "tip": "link it to the topic"}],
            "check_in": "Which word matters most?",
        },
        "close_reading": {
            "title": "精读",
            "segments": [
                {"heading": "Part 1", "focus": "main idea", "teacher_note": "read for gist", "question": "What happens first?"},
                {"heading": "Part 2", "focus": "supporting detail", "teacher_note": "track evidence", "question": "What supports the idea?"},
                {"heading": "Part 3", "focus": "conclusion", "teacher_note": "look at the final claim", "question": "How does it end?"},
            ],
        },
        "explanation": {
            "title": "难点",
            "points": [{"label": "climate", "explanation": "Topic word", "example": "climate change"}],
        },
        "quiz": {
            "title": "检查",
            "instructions": "Answer briefly.",
            "questions": [
                {
                    "type": "mcq",
                    "question": "What is the lesson focus?",
                    "options": ["Reading", "Cooking", "Driving", "Painting"],
                    "answer": "Reading",
                }
            ],
        },
        "output": {
            "title": "输出",
            "prompt": "Write 3 sentences.",
            "guidance": "Use one keyword.",
            "checklist": ["main idea", "detail"],
        },
        "wrap_up": {
            "title": "收束",
            "takeaways": ["Meaning first"],
            "teacher_closing": "Good work.",
            "next_step": "Review one segment aloud.",
        },
    }

    with patch("app.api.routers.llm.ensure_default_billing_rates"), \
         patch("app.api.routers.llm.get_model_rate", return_value=MagicMock(points_per_1k_tokens=5)), \
         patch("app.api.routers.llm_reading_course._require_api_key", return_value="fake-key"), \
         patch("app.api.routers.llm.call_deepseek", return_value=(str(payload).replace("'", '"'), _usage())), \
         patch("app.api.routers.llm.consume_points"):
        response = client.post(
            "/api/llm/reading-course/generate",
            json={
                "article_id": "article-1",
                "article_title": "Climate Story",
                "original_text": "Sentence one. Sentence two. Sentence three. Sentence four.",
                "rewritten_text": "Sentence one. Sentence two. Sentence three. Sentence four.",
                "target_level": "B1",
                "valid_i1_words": ["climate"],
                "valid_above_i1_words": ["sustainable"],
                "word_levels": {"climate": "B1"},
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["course"]["mode"] == "reading_classroom_v1"
    assert data["course"]["article_title"] == "Reading Classroom"
    assert len(data["course"]["scenes"]) == 7
    assert data["course"]["scenes"][2]["type"] == "close_reading"


def test_generate_reading_course_falls_back_when_llm_fails(client):
    with patch("app.api.routers.llm.ensure_default_billing_rates"), \
         patch("app.api.routers.llm_reading_course._require_api_key", return_value="fake-key"), \
         patch("app.api.routers.llm.call_deepseek", side_effect=RuntimeError("boom")):
        response = client.post(
            "/api/llm/reading-course/generate",
            json={
                "article_id": "article-2",
                "article_title": "Fallback Story",
                "original_text": "Sentence one. Sentence two. Sentence three.",
                "rewritten_text": "Sentence one. Sentence two. Sentence three.",
                "target_level": "B1",
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["course"]["mode"] == "reading_classroom_v1"
    assert data["course"]["teacher"]["name"] == "Coach Mira"
