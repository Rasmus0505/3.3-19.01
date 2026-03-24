"""pytest fixtures: 课程相关。"""
from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from app.models import Lesson, LessonSentence
from tests.fixtures.auth import test_user


@pytest.fixture(scope="function")
def test_lesson(db_session: Session, test_user) -> Lesson:
    """创建测试课程（关联 test_user）。"""
    lesson = Lesson(
        user_id=test_user.id,
        title="Test Lesson",
        source_filename="test_video.mp4",
        asr_model="faster-whisper",
        duration_ms=60000,
        media_storage="server",
        source_duration_ms=60000,
        status="ready",
    )
    db_session.add(lesson)
    db_session.flush()
    return lesson


@pytest.fixture(scope="function")
def test_lesson_with_sentences(db_session: Session, test_lesson: Lesson) -> Lesson:
    """创建带句子的测试课程。"""
    sentences = [
        LessonSentence(
            lesson_id=test_lesson.id,
            idx=i,
            begin_ms=i * 3000,
            end_ms=(i + 1) * 3000,
            text=f"Hello sentence {i}.",
            translation=f"第 {i} 句的翻译。",
        )
        for i in range(5)
    ]
    for s in sentences:
        db_session.add(s)
    db_session.flush()
    return test_lesson


@pytest.fixture(scope="function")
def test_sentence(db_session: Session, test_lesson: Lesson) -> LessonSentence:
    """创建单个测试句子。"""
    sentence = LessonSentence(
        lesson_id=test_lesson.id,
        idx=0,
        begin_ms=0,
        end_ms=3000,
        text="Hello world.",
        translation="你好世界。",
    )
    db_session.add(sentence)
    db_session.flush()
    return sentence
