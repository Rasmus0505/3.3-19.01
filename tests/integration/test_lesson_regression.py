from __future__ import annotations

import json
import io
import os
import re
import threading
import time
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import event, select, text
from sqlalchemy.orm import Session, sessionmaker

from fastapi.testclient import TestClient

from app.core.config import MEDIA_STORAGE_ROOT_DIR
from app.db import Base, create_database_engine, get_db
from app.infra.translation_qwen_mt import TranslationError
from app.main import create_app
from app.models import (
    Lesson,
    LessonGenerationTask,
    LessonProgress,
    LessonSentence,
    MediaAsset,
    SubtitleSetting,
    TranslationRequestLog,
    User,
    WalletLedger,
    WordbookEntry,
    WordbookEntrySource,
)
from app.services.billing_service import (
    ensure_default_billing_rates,
    get_or_create_wallet_account,
)
from app.services.lesson_builder import (
    normalize_learning_english_text,
    tokenize_learning_sentence,
)
from app.services.lesson_service import LessonService
from app.services.query_cache import clear_query_caches

from .conftest import _register_and_login, _seed_wallet_balance, _enable_upload_task_prereqs, _enable_local_asr_model, FASTER_WHISPER_ASR_MODEL
from ._regression_helpers import translation_batch_result as _translation_batch_result, word_entry as _word_entry

QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"

def test_lesson_catalog_returns_paginated_items_search_and_cache(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="lesson-catalog-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == "lesson-catalog-user@example.com"))
        assert user is not None

        lesson_alpha = Lesson(
            user_id=user.id,
            title="Alpha Lesson",
            source_filename="alpha.mp3",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=3100,
            source_duration_ms=3100,
            status="ready",
            created_at=datetime(2026, 3, 9, 9, 0, 0),
        )
        lesson_beta = Lesson(
            user_id=user.id,
            title="Beta Lesson",
            source_filename="beta.mp3",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=4200,
            source_duration_ms=4200,
            status="ready",
            created_at=datetime(2026, 3, 10, 9, 0, 0),
        )
        lesson_gamma = Lesson(
            user_id=user.id,
            title="Gamma Lesson",
            source_filename="gamma.mp3",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=5300,
            source_duration_ms=5300,
            status="ready",
            created_at=datetime(2026, 3, 11, 9, 0, 0),
        )
        session.add_all([lesson_alpha, lesson_beta, lesson_gamma])
        session.flush()

        session.add_all(
            [
                LessonSentence(lesson_id=lesson_alpha.id, idx=0, begin_ms=0, end_ms=1000, text_en="alpha one", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_alpha.id, idx=1, begin_ms=1000, end_ms=2000, text_en="alpha two", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_beta.id, idx=0, begin_ms=0, end_ms=1000, text_en="beta one", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_gamma.id, idx=0, begin_ms=0, end_ms=1000, text_en="gamma one", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_gamma.id, idx=1, begin_ms=1000, end_ms=2000, text_en="gamma two", text_zh="", tokens_json=[]),
                LessonSentence(lesson_id=lesson_gamma.id, idx=2, begin_ms=2000, end_ms=3000, text_en="gamma three", text_zh="", tokens_json=[]),
            ]
        )
        session.add(
            LessonProgress(
                lesson_id=lesson_gamma.id,
                user_id=user.id,
                current_sentence_idx=1,
                completed_indexes_json=[0],
                last_played_at_ms=1800,
            )
        )
        session.commit()
    finally:
        session.close()

    import app.services.lesson_query_service as lesson_query_service

    call_count = 0
    original = lesson_query_service.list_lesson_catalog_for_user

    def counted(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(lesson_query_service, "list_lesson_catalog_for_user", counted)

    first = client.get("/api/lessons/catalog", headers=headers, params={"page": 1, "page_size": 2})
    assert first.status_code == 200
    first_data = first.json()
    assert first_data["ok"] is True
    assert first_data["total"] == 3
    assert first_data["has_more"] is True
    assert len(first_data["items"]) == 2
    assert first_data["items"][0]["title"] == "Gamma Lesson"
    assert first_data["items"][0]["sentence_count"] == 3
    assert first_data["items"][0]["progress_summary"]["current_sentence_index"] == 1
    assert first_data["items"][0]["progress_summary"]["completed_sentence_count"] == 1

    second = client.get("/api/lessons/catalog", headers=headers, params={"page": 1, "page_size": 2})
    assert second.status_code == 200
    assert call_count == 1

    search = client.get("/api/lessons/catalog", headers=headers, params={"page": 1, "page_size": 20, "q": "beta"})
    assert search.status_code == 200
    search_data = search.json()
    assert search_data["total"] == 1
    assert search_data["items"][0]["title"] == "Beta Lesson"
    assert call_count == 2

    rename = client.patch(
        f"/api/lessons/{first_data['items'][0]['id']}",
        headers=headers,
        json={"title": "Gamma Lesson Renamed"},
    )
    assert rename.status_code == 200

    third = client.get("/api/lessons/catalog", headers=headers, params={"page": 1, "page_size": 2})
    assert third.status_code == 200
    assert call_count == 3
    assert third.json()["items"][0]["title"] == "Gamma Lesson Renamed"




def test_lesson_catalog_keeps_desktop_import_titles_in_canonical_summary(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="desktop-import-catalog@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == "desktop-import-catalog@example.com"))
        assert user is not None

        lesson = Lesson(
            user_id=user.id,
            title="Memo 导入标题",
            source_filename="memo-import.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=3600,
            source_duration_ms=3600,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1500,
                text_en="imported sentence",
                text_zh="导入句子",
                tokens_json=["imported", "sentence"],
            )
        )
        session.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=user.id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        session.commit()
    finally:
        session.close()

    resp = client.get("/api/lessons/catalog", headers=headers)
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["items"][0]["title"] == "Memo 导入标题"
    assert "source_type" not in payload["items"][0]
    assert payload["items"][0]["progress_summary"]["current_sentence_index"] == 0




def test_lesson_task_resume_reuses_failed_task_artifacts(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="resume-task@example.com")

    import threading as py_threading

    from app.api.routers import lessons as lessons_router
    from app.services import lesson_command_service as lesson_command_service_module

    class ImmediateThread(py_threading.Thread):
        def start(self):
            if getattr(self, "_target", None) is lessons_router._run_lesson_generation_task:
                self.run()
                return
            super().start()

    attempts = {"count": 0}

    def fake_generate_from_saved_file(*, dashscope_file_id, source_filename, req_dir, owner_id, asr_model, db, progress_callback=None, task_id=None, semantic_split_enabled=None):
        attempts["count"] += 1
        progress_callback(
            {
                "stage_key": "convert_audio",
                "stage_status": "completed",
                "overall_percent": 20,
                "current_text": "转换音频格式完成",
                "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            }
        )
        if attempts["count"] == 1:
            (req_dir / "lesson_input.opus").write_bytes(b"opus")
            (req_dir / "asr_result.json").write_text(json.dumps({"asr_payload": {"transcripts": []}, "usage_seconds": 1, "progress_counters": {"asr_done": 2, "asr_estimated": 2, "segment_done": 2, "segment_total": 2}}, ensure_ascii=False), encoding="utf-8")
            progress_callback(
                {
                    "stage_key": "translate_zh",
                    "stage_status": "running",
                    "overall_percent": 72,
                    "current_text": "翻译字幕 1/2",
                    "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 1, "translate_total": 2, "segment_done": 2, "segment_total": 2},
                }
            )
            raise RuntimeError("translate failed")

        lesson = Lesson(
            user_id=owner_id,
            title=Path(source_filename).stem,
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(LessonSentence(lesson_id=lesson.id, idx=0, begin_ms=0, end_ms=1000, text_en="hello", text_zh="你好", tokens_json=["hello"], audio_clip_path=None))
        db.add(LessonProgress(lesson_id=lesson.id, user_id=owner_id, current_sentence_idx=0, completed_indexes_json=[], last_played_at_ms=0))
        db.commit()
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": False,
            "split_mode": "asr_sentences",
            "source_word_count": 1,
            "strategy_version": 2,
            "asr_payload": {"transcripts": []},
            "sentences": [{"idx": 0, "begin_ms": 0, "end_ms": 1000, "text_en": "hello", "text_zh": "你好", "tokens": ["hello"], "audio_url": None}],
        }
        return lesson

    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == "resume-task@example.com"))
        assert user is not None
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.commit()
    finally:
        session.close()

    monkeypatch.setattr(lessons_router.threading, "Thread", ImmediateThread)
    monkeypatch.setattr(lessons_router.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)
    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/resume.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    failed_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert failed_task.status_code == 200
    failed_payload = failed_task.json()
    assert failed_payload["status"] == "failed"
    assert failed_payload["resume_available"] is True
    assert failed_payload["resume_stage"] == "translate_zh"
    assert failed_payload["artifact_expires_at"]
    assert failed_payload["result_kind"] == ""
    assert failed_payload["result_label"] == ""
    assert failed_payload["result_message"] == ""
    assert failed_payload["failure_debug"]["failed_stage"] == "translate_zh"
    assert failed_payload["failure_debug"]["exception_type"] == "RuntimeError"
    assert "translate failed" in failed_payload["failure_debug"]["detail_excerpt"]
    assert "RuntimeError: translate failed" in failed_payload["failure_debug"]["traceback_excerpt"]
    assert failed_payload["failure_debug"]["last_progress_text"] == "翻译字幕 1/2"

    resume_resp = client.post(f"/api/lessons/tasks/{task_id}/resume", headers={"Authorization": f"Bearer {token}"})
    assert resume_resp.status_code == 200
    assert resume_resp.json()["ok"] is True

    succeeded_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert succeeded_task.status_code == 200
    success_payload = succeeded_task.json()
    assert success_payload["status"] == "succeeded"
    assert success_payload["resume_available"] is False
    assert success_payload["lesson"]["title"] == "resume"
    assert attempts["count"] == 2




def test_wordbook_collect_dedupes_and_filters_by_source_course(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="wordbook-owner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "wordbook-owner@example.com").one()
        owner_user_id = user.id
        lesson_primary = Lesson(
            user_id=user.id,
            title="Primary Context",
            source_filename="primary.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2400,
            source_duration_ms=2400,
            status="ready",
        )
        lesson_secondary = Lesson(
            user_id=user.id,
            title="Secondary Context",
            source_filename="secondary.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2800,
            source_duration_ms=2800,
            status="ready",
        )
        session.add_all([lesson_primary, lesson_secondary])
        session.flush()
        session.add_all(
            [
                LessonSentence(
                    lesson_id=lesson_primary.id,
                    idx=0,
                    begin_ms=0,
                    end_ms=1200,
                    text_en="hello world again",
                    text_zh="你好 世界 再次",
                    tokens_json=["hello", "world", "again"],
                    audio_clip_path=None,
                ),
                LessonSentence(
                    lesson_id=lesson_secondary.id,
                    idx=0,
                    begin_ms=0,
                    end_ms=1200,
                    text_en="hello world again",
                    text_zh="新的 你好 世界 再次",
                    tokens_json=["hello", "world", "again"],
                    audio_clip_path=None,
                ),
            ]
        )
        session.commit()
        primary_id = lesson_primary.id
        secondary_id = lesson_secondary.id
    finally:
        session.close()

    first_collect = client.post(
        "/api/wordbook/collect",
        headers=headers,
        json={
            "lesson_id": primary_id,
            "sentence_index": 0,
            "entry_text": "hello",
            "entry_type": "word",
            "start_token_index": 0,
            "end_token_index": 0,
        },
    )
    assert first_collect.status_code == 200
    assert first_collect.json()["created"] is True

    duplicate_collect = client.post(
        "/api/wordbook/collect",
        headers=headers,
        json={
            "lesson_id": secondary_id,
            "sentence_index": 0,
            "entry_text": "hello",
            "entry_type": "word",
            "start_token_index": 0,
            "end_token_index": 0,
        },
    )
    assert duplicate_collect.status_code == 200
    duplicate_data = duplicate_collect.json()
    assert duplicate_data["created"] is False
    assert duplicate_data["updated_context"] is True
    assert duplicate_data["entry"]["source_lesson_id"] == secondary_id
    assert duplicate_data["entry"]["latest_sentence_zh"] == "新的 你好 世界 再次"

    phrase_collect = client.post(
        "/api/wordbook/collect",
        headers=headers,
        json={
            "lesson_id": primary_id,
            "sentence_index": 0,
            "entry_text": "hello world",
            "entry_type": "phrase",
            "start_token_index": 0,
            "end_token_index": 1,
        },
    )
    assert phrase_collect.status_code == 200
    assert phrase_collect.json()["created"] is True

    list_resp = client.get("/api/wordbook", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["status"] == "active"
    assert list_data["sort"] == "recent"
    assert list_data["total"] == 2
    assert {item["title"] for item in list_data["available_lessons"]} == {"Primary Context", "Secondary Context"}

    word_item = next(item for item in list_data["items"] if item["entry_type"] == "word")
    phrase_item = next(item for item in list_data["items"] if item["entry_type"] == "phrase")
    assert word_item["source_count"] == 2
    assert word_item["source_lesson_title"] == "Secondary Context"
    assert phrase_item["source_count"] == 1

    filtered_resp = client.get("/api/wordbook", headers=headers, params={"source_lesson_id": secondary_id})
    assert filtered_resp.status_code == 200
    filtered_data = filtered_resp.json()
    assert filtered_data["total"] == 1
    assert filtered_data["items"][0]["entry_type"] == "word"

    session = session_factory()
    try:
        entries = session.query(WordbookEntry).filter(WordbookEntry.user_id == owner_user_id).all()
        sources = session.query(WordbookEntrySource).all()
        assert len(entries) == 2
        assert len(sources) == 3
    finally:
        session.close()




def test_wordbook_collect_rejects_invalid_fragment_missing_sentence_and_foreign_lesson(test_client):
    client, session_factory, _ = test_client
    owner_token = _register_and_login(client, email="wordbook-invalid-owner@example.com")
    other_token = _register_and_login(client, email="wordbook-invalid-other@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "wordbook-invalid-owner@example.com").one()
        lesson = Lesson(
            user_id=owner.id,
            title="Validation Lesson",
            source_filename="validation.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2000,
            source_duration_ms=2000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1200,
                text_en="hello world again",
                text_zh="你好 世界 再次",
                tokens_json=["hello", "world", "again"],
                audio_clip_path=None,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    invalid_fragment = client.post(
        "/api/wordbook/collect",
        headers=owner_headers,
        json={
            "lesson_id": lesson_id,
            "sentence_index": 0,
            "entry_text": "hello again",
            "entry_type": "phrase",
            "start_token_index": 0,
            "end_token_index": 2,
        },
    )
    assert invalid_fragment.status_code == 400

    missing_sentence = client.post(
        "/api/wordbook/collect",
        headers=owner_headers,
        json={
            "lesson_id": lesson_id,
            "sentence_index": 9,
            "entry_text": "hello",
            "entry_type": "word",
            "start_token_index": 0,
            "end_token_index": 0,
        },
    )
    assert missing_sentence.status_code == 404

    foreign_lesson = client.post(
        "/api/wordbook/collect",
        headers=other_headers,
        json={
            "lesson_id": lesson_id,
            "sentence_index": 0,
            "entry_text": "hello",
            "entry_type": "word",
            "start_token_index": 0,
            "end_token_index": 0,
        },
    )
    assert foreign_lesson.status_code == 404




def test_wordbook_update_status_and_delete_entry(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="wordbook-status@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "wordbook-status@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="Status Lesson",
            source_filename="status.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1800,
            source_duration_ms=1800,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=900,
                text_en="alpha beta",
                text_zh="阿尔法 贝塔",
                tokens_json=["alpha", "beta"],
                audio_clip_path=None,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    collect_resp = client.post(
        "/api/wordbook/collect",
        headers=headers,
        json={
            "lesson_id": lesson_id,
            "sentence_index": 0,
            "entry_text": "alpha",
            "entry_type": "word",
            "start_token_index": 0,
            "end_token_index": 0,
        },
    )
    assert collect_resp.status_code == 200
    entry_id = collect_resp.json()["entry"]["id"]

    mastered_resp = client.patch(f"/api/wordbook/{entry_id}", headers=headers, json={"status": "mastered"})
    assert mastered_resp.status_code == 200
    assert mastered_resp.json()["entry"]["status"] == "mastered"

    active_list = client.get("/api/wordbook", headers=headers)
    assert active_list.status_code == 200
    assert active_list.json()["total"] == 0

    mastered_list = client.get("/api/wordbook", headers=headers, params={"status": "mastered"})
    assert mastered_list.status_code == 200
    assert mastered_list.json()["total"] == 1

    restore_resp = client.patch(f"/api/wordbook/{entry_id}", headers=headers, json={"status": "active"})
    assert restore_resp.status_code == 200
    assert restore_resp.json()["entry"]["status"] == "active"

    delete_resp = client.delete(f"/api/wordbook/{entry_id}", headers=headers)
    assert delete_resp.status_code == 200
    assert delete_resp.json()["entry_id"] == entry_id

    session = session_factory()
    try:
        assert session.query(WordbookEntry).filter(WordbookEntry.id == entry_id).one_or_none() is None
        assert session.query(WordbookEntrySource).filter(WordbookEntrySource.entry_id == entry_id).count() == 0
    finally:
        session.close()




def test_lesson_task_reports_translation_parse_failure_with_explicit_error(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="translation-parse-task@example.com")

    import threading as py_threading

    from app.api.routers import lessons as lessons_router
    from app.services import lesson_command_service as lesson_command_service_module

    class ImmediateThread(py_threading.Thread):
        def start(self):
            if getattr(self, "_target", None) is lessons_router._run_lesson_generation_task:
                self.run()
                return
            super().start()

    def fake_generate_from_saved_file(*, dashscope_file_id, source_filename, req_dir, owner_id, asr_model, db, progress_callback=None, task_id=None, semantic_split_enabled=None):
        progress_callback(
            {
                "stage_key": "convert_audio",
                "stage_status": "completed",
                "overall_percent": 20,
                "current_text": "转换音频格式完成",
                "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            }
        )
        progress_callback(
            {
                "stage_key": "asr_transcribe",
                "stage_status": "completed",
                "overall_percent": 60,
                "current_text": "识别字幕 3/3",
                "counters": {"asr_done": 3, "asr_estimated": 3, "translate_done": 0, "translate_total": 0, "segment_done": 3, "segment_total": 3},
            }
        )
        progress_callback(
            {
                "stage_key": "translate_zh",
                "stage_status": "running",
                "overall_percent": 60,
                "current_text": "翻译字幕 0/3",
                "counters": {"asr_done": 3, "asr_estimated": 3, "translate_done": 0, "translate_total": 3, "segment_done": 3, "segment_total": 3},
            }
        )
        error = TranslationError("翻译响应 JSON 非法控制字符")
        error.code = "TRANSLATION_RESPONSE_INVALID"
        error.message = "翻译结果解析失败"
        error.detail = "翻译响应 JSON 非法控制字符：Invalid control character at line 21 column 27"
        raise error

    session = session_factory()
    try:
        user = session.scalar(select(User).where(User.email == "translation-parse-task@example.com"))
        assert user is not None
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.commit()
    finally:
        session.close()

    monkeypatch.setattr(lessons_router.threading, "Thread", ImmediateThread)
    monkeypatch.setattr(lessons_router.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)
    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/translation-parse.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    failed_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert failed_task.status_code == 200
    failed_payload = failed_task.json()
    assert failed_payload["status"] == "failed"
    assert failed_payload["error_code"] == "TRANSLATION_RESPONSE_INVALID"
    assert failed_payload["message"] == "翻译结果解析失败"
    assert failed_payload["resume_available"] is True
    assert failed_payload["resume_stage"] == "translate_zh"
    assert failed_payload["failure_debug"]["failed_stage"] == "translate_zh"
    assert failed_payload["failure_debug"]["exception_type"] == "TranslationError"
    assert "非法控制字符" in failed_payload["failure_debug"]["detail_excerpt"]
    assert failed_payload["failure_debug"]["last_progress_text"] == "翻译字幕 0/3"




def test_lesson_task_pause_and_resume_from_safe_point(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="pause-task@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.services import lesson_command_service as lesson_command_service_module
    from app.services.lesson_task_manager import get_task_control_action

    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)
    _seed_wallet_balance(session_factory, email="pause-task@example.com")

    started = threading.Event()
    attempts = {"count": 0}

    def fake_generate_from_saved_file(*, source_filename, owner_id, asr_model, db, progress_callback=None, task_id=None, **kwargs):
        attempts["count"] += 1
        if progress_callback:
            progress_callback(
                {
                    "stage_key": "convert_audio",
                    "stage_status": "completed",
                    "overall_percent": 20,
                    "current_text": "转换音频格式完成",
                    "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
                }
            )
            progress_callback(
                {
                    "stage_key": "asr_transcribe",
                    "stage_status": "completed",
                    "overall_percent": 60,
                    "current_text": "识别字幕 2/2",
                    "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 0, "translate_total": 0, "segment_done": 2, "segment_total": 2},
                }
            )
            progress_callback(
                {
                    "stage_key": "build_lesson",
                    "stage_status": "completed",
                    "overall_percent": 68,
                    "current_text": "生成课程结构完成",
                    "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 0, "translate_total": 0, "segment_done": 2, "segment_total": 2},
                }
            )
        if attempts["count"] == 1:
            started.set()
            deadline = time.time() + 3
            while get_task_control_action(str(task_id or ""), session_factory=session_factory) != "pause":
                if time.time() >= deadline:
                    raise AssertionError("pause request was not observed")
                time.sleep(0.02)
            progress_callback(
                {
                    "stage_key": "translate_zh",
                    "stage_status": "running",
                    "overall_percent": 72,
                    "current_text": "翻译字幕 1/2",
                    "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 1, "translate_total": 2, "segment_done": 2, "segment_total": 2},
                }
            )
            raise AssertionError("pause control should interrupt generation")

        progress_callback(
            {
                "stage_key": "translate_zh",
                "stage_status": "completed",
                "overall_percent": 90,
                "current_text": "翻译字幕 2/2",
                "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 2, "translate_total": 2, "segment_done": 2, "segment_total": 2},
            }
        )
        progress_callback(
            {
                "stage_key": "write_lesson",
                "stage_status": "completed",
                "overall_percent": 100,
                "current_text": "课程生成完成",
                "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 2, "translate_total": 2, "segment_done": 2, "segment_total": 2},
            }
        )
        lesson = Lesson(
            user_id=owner_id,
            title=Path(source_filename).stem,
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(LessonSentence(lesson_id=lesson.id, idx=0, begin_ms=0, end_ms=1000, text_en="hello", text_zh="你好", tokens_json=["hello"], audio_clip_path=None))
        db.add(LessonProgress(lesson_id=lesson.id, user_id=owner_id, current_sentence_idx=0, completed_indexes_json=[], last_played_at_ms=0))
        db.commit()
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": False,
            "split_mode": "asr_sentences",
            "source_word_count": 1,
            "strategy_version": 2,
            "asr_payload": {"transcripts": []},
            "sentences": [{"idx": 0, "begin_ms": 0, "end_ms": 1000, "text_en": "hello", "text_zh": "你好", "tokens": ["hello"], "audio_url": None}],
        }
        return lesson

    monkeypatch.setattr(lesson_command_service_module.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/pause.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]
    assert started.wait(2)

    running_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert running_resp.status_code == 200
    running_payload = running_resp.json()
    assert running_payload["status"] == "running"
    assert running_payload["can_pause"] is True
    assert running_payload["can_terminate"] is True

    pause_resp = client.post(f"/api/lessons/tasks/{task_id}/pause", headers=headers)
    assert pause_resp.status_code == 200
    assert pause_resp.json()["status"] == "pausing"

    paused_payload = None
    deadline = time.time() + 3
    while time.time() < deadline:
      paused_check = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
      assert paused_check.status_code == 200
      candidate = paused_check.json()
      if candidate["status"] == "paused":
          paused_payload = candidate
          break
      time.sleep(0.05)
    assert paused_payload is not None
    assert paused_payload["resume_available"] is True
    assert paused_payload["resume_stage"] == "translate_zh"
    assert paused_payload["paused_at"]
    assert paused_payload["control_action"] == ""
    assert paused_payload["can_pause"] is False
    assert paused_payload["can_terminate"] is False

    resume_resp = client.post(f"/api/lessons/tasks/{task_id}/resume", headers=headers)
    assert resume_resp.status_code == 200
    assert resume_resp.json()["ok"] is True

    success_payload = None
    deadline = time.time() + 3
    while time.time() < deadline:
        success_check = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
        assert success_check.status_code == 200
        candidate = success_check.json()
        if candidate["status"] == "succeeded":
            success_payload = candidate
            break
        time.sleep(0.05)
    assert success_payload is not None
    assert success_payload["lesson"]["title"] == "pause"
    assert attempts["count"] == 2




def test_lesson_task_terminate_marks_task_as_terminated(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="terminate-task@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.services import lesson_command_service as lesson_command_service_module
    from app.services.lesson_task_manager import get_task_control_action

    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)
    _seed_wallet_balance(session_factory, email="terminate-task@example.com")

    started = threading.Event()

    def fake_generate_from_saved_file(*, progress_callback=None, task_id=None, **kwargs):
        if progress_callback:
            progress_callback(
                {
                    "stage_key": "convert_audio",
                    "stage_status": "completed",
                    "overall_percent": 20,
                    "current_text": "转换音频格式完成",
                    "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
                }
            )
        started.set()
        deadline = time.time() + 3
        while get_task_control_action(str(task_id or ""), session_factory=session_factory) != "terminate":
            if time.time() >= deadline:
                raise AssertionError("terminate request was not observed")
            time.sleep(0.02)
        progress_callback(
            {
                "stage_key": "translate_zh",
                "stage_status": "running",
                "overall_percent": 72,
                "current_text": "翻译字幕 1/2",
                "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 1, "translate_total": 2, "segment_done": 2, "segment_total": 2},
            }
        )
        raise AssertionError("terminate control should interrupt generation")

    monkeypatch.setattr(lesson_command_service_module.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/terminate.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]
    assert started.wait(2)

    terminate_resp = client.post(f"/api/lessons/tasks/{task_id}/terminate", headers=headers)
    assert terminate_resp.status_code == 200
    assert terminate_resp.json()["status"] == "terminating"

    terminated_payload = None
    deadline = time.time() + 3
    while time.time() < deadline:
        terminated_check = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
        assert terminated_check.status_code == 200
        candidate = terminated_check.json()
        if candidate["status"] == "terminated":
            terminated_payload = candidate
            break
        time.sleep(0.05)
    assert terminated_payload is not None
    assert terminated_payload["resume_available"] is False
    assert terminated_payload["terminated_at"]
    assert terminated_payload["can_pause"] is False
    assert terminated_payload["can_terminate"] is False
    assert "终止" in terminated_payload["current_text"]

    resume_resp = client.post(f"/api/lessons/tasks/{task_id}/resume", headers=headers)
    assert resume_resp.status_code == 400
    assert resume_resp.json()["error_code"] == "TASK_RESUME_UNAVAILABLE"




def test_terminate_active_lesson_tasks_only_targets_current_user(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="terminate-active@example.com")
    other_token = _register_and_login(client, email="terminate-active-other@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    from app.services import lesson_command_service as lesson_command_service_module
    from app.services.lesson_task_manager import get_task_control_action

    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)
    _seed_wallet_balance(session_factory, email="terminate-active@example.com")
    _seed_wallet_balance(session_factory, email="terminate-active-other@example.com")

    started_ids: set[str] = set()
    started_all = threading.Event()

    def fake_generate_from_saved_file(*, progress_callback=None, task_id=None, **kwargs):
        if progress_callback:
            progress_callback(
                {
                    "stage_key": "convert_audio",
                    "stage_status": "completed",
                    "overall_percent": 20,
                    "current_text": "转换音频格式完成",
                    "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
                }
            )
        normalized_task_id = str(task_id or "")
        started_ids.add(normalized_task_id)
        if len(started_ids) >= 3:
            started_all.set()
        deadline = time.time() + 5
        while get_task_control_action(normalized_task_id, session_factory=session_factory) != "terminate":
            if time.time() >= deadline:
                raise AssertionError(f"terminate request was not observed for {normalized_task_id}")
            time.sleep(0.02)
        progress_callback(
            {
                "stage_key": "translate_zh",
                "stage_status": "running",
                "overall_percent": 72,
                "current_text": "翻译字幕 1/2",
                "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 1, "translate_total": 2, "segment_done": 2, "segment_total": 2},
            }
        )
        raise AssertionError("terminate control should interrupt generation")

    monkeypatch.setattr(lesson_command_service_module.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)

    def create_task(current_headers, filename):
        response = client.post(
            "/api/lessons/tasks",
            headers=current_headers,
            data={
                "asr_model": QWEN_ASR_MODEL,
                "semantic_split_enabled": "false",
                "dashscope_file_id": f"uploads/test/{filename}",
            },
        )
        assert response.status_code == 200
        return str(response.json()["task_id"])

    task_id_1 = create_task(headers, "terminate-active-1.mp4")
    task_id_2 = create_task(headers, "terminate-active-2.mp4")
    other_task_id = create_task(other_headers, "terminate-active-3.mp4")

    assert started_all.wait(3)

    terminate_resp = client.post("/api/lessons/tasks/terminate-active", headers=headers)
    assert terminate_resp.status_code == 200
    terminate_payload = terminate_resp.json()
    assert terminate_payload["ok"] is True
    assert terminate_payload["requested_count"] == 2
    assert set(terminate_payload["requested_task_ids"]) == {task_id_1, task_id_2}

    def wait_for_status(task_id, current_headers, expected_status):
        deadline = time.time() + 3
        while time.time() < deadline:
            check = client.get(f"/api/lessons/tasks/{task_id}", headers=current_headers)
            assert check.status_code == 200
            payload = check.json()
            if payload["status"] == expected_status:
                return payload
            time.sleep(0.05)
        raise AssertionError(f"task {task_id} did not reach status {expected_status}")

    terminated_1 = wait_for_status(task_id_1, headers, "terminated")
    terminated_2 = wait_for_status(task_id_2, headers, "terminated")
    assert terminated_1["terminated_at"]
    assert terminated_2["terminated_at"]

    other_check = client.get(f"/api/lessons/tasks/{other_task_id}", headers=other_headers)
    assert other_check.status_code == 200
    assert other_check.json()["status"] in {"pending", "running"}

    other_terminate_resp = client.post("/api/lessons/tasks/terminate-active", headers=other_headers)
    assert other_terminate_resp.status_code == 200
    assert other_terminate_resp.json()["requested_task_ids"] == [other_task_id]
    wait_for_status(other_task_id, other_headers, "terminated")




def test_lesson_task_resume_marks_missing_artifacts_as_non_resumable(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="resume-missing@example.com")

    import threading as py_threading

    from app.api.routers import lessons as lessons_router
    from app.services import lesson_command_service as lesson_command_service_module

    class ImmediateThread(py_threading.Thread):
        def start(self):
            if getattr(self, "_target", None) is lessons_router._run_lesson_generation_task:
                self.run()
                return
            super().start()

    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)
    _seed_wallet_balance(session_factory, email="resume-missing@example.com")

    def fake_generate_from_saved_file(*, req_dir, progress_callback=None, **kwargs):
        progress_callback(
            {
                "stage_key": "convert_audio",
                "stage_status": "completed",
                "overall_percent": 20,
                "current_text": "转换音频格式完成",
                "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            }
        )
        (req_dir / "lesson_input.opus").write_bytes(b"opus")
        (req_dir / "asr_result.json").write_text(json.dumps({"asr_payload": {"transcripts": []}}, ensure_ascii=False), encoding="utf-8")
        progress_callback(
            {
                "stage_key": "translate_zh",
                "stage_status": "running",
                "overall_percent": 72,
                "current_text": "翻译字幕 1/2",
                "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 1, "translate_total": 2, "segment_done": 2, "segment_total": 2},
            }
        )
        raise RuntimeError("temporary failure")

    monkeypatch.setattr(lessons_router.threading, "Thread", ImmediateThread)
    monkeypatch.setattr(lessons_router.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/resume-missing.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    session = session_factory()
    try:
        task = session.query(LessonGenerationTask).filter(LessonGenerationTask.task_id == task_id).one()
        Path(task.source_path).unlink()
    finally:
        session.close()

    resume_resp = client.post(f"/api/lessons/tasks/{task_id}/resume", headers={"Authorization": f"Bearer {token}"})
    assert resume_resp.status_code == 400
    assert resume_resp.json()["error_code"] == "TASK_ARTIFACT_MISSING"

    failed_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert failed_task.status_code == 200
    failed_payload = failed_task.json()
    assert failed_payload["resume_available"] is False
    assert failed_payload["failure_debug"]["exception_type"] == "FileNotFoundError"
    assert "resume artifacts missing" in failed_payload["failure_debug"]["detail_excerpt"]




def test_lesson_task_resume_restarts_failed_task_when_resume_unavailable(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="restart-task@example.com")

    import threading as py_threading

    from app.api.routers import lessons as lessons_router
    from app.services import lesson_command_service as lesson_command_service_module

    class ImmediateThread(py_threading.Thread):
        def start(self):
            if getattr(self, "_target", None) is lessons_router._run_lesson_generation_task:
                self.run()
                return
            super().start()

    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)
    _seed_wallet_balance(session_factory, email="restart-task@example.com")

    attempts = {"count": 0}

    def fake_generate_from_saved_file(*, source_filename, req_dir, owner_id, asr_model, db, progress_callback=None, **kwargs):
        attempts["count"] += 1
        progress_callback(
            {
                "stage_key": "convert_audio",
                "stage_status": "completed",
                "overall_percent": 20,
                "current_text": "转换音频格式完成",
                "counters": {"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0, "segment_done": 0, "segment_total": 0},
            }
        )
        if attempts["count"] == 1:
            (req_dir / "lesson_input.opus").write_bytes(b"opus")
            (req_dir / "asr_result.json").write_text(
                json.dumps(
                    {"asr_payload": {"transcripts": []}, "usage_seconds": 1, "progress_counters": {"asr_done": 2, "asr_estimated": 2, "segment_done": 2, "segment_total": 2}},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            progress_callback(
                {
                    "stage_key": "translate_zh",
                    "stage_status": "running",
                    "overall_percent": 72,
                    "current_text": "翻译字幕 1/2",
                    "counters": {"asr_done": 2, "asr_estimated": 2, "translate_done": 1, "translate_total": 2, "segment_done": 2, "segment_total": 2},
                }
            )
            raise RuntimeError("restart failure")

        lesson = Lesson(
            user_id=owner_id,
            title=Path(source_filename).stem,
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(LessonSentence(lesson_id=lesson.id, idx=0, begin_ms=0, end_ms=1000, text_en="hello", text_zh="你好", tokens_json=["hello"], audio_clip_path=None))
        db.add(LessonProgress(lesson_id=lesson.id, user_id=owner_id, current_sentence_idx=0, completed_indexes_json=[], last_played_at_ms=0))
        db.commit()
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": False,
            "split_mode": "asr_sentences",
            "source_word_count": 1,
            "strategy_version": 2,
            "asr_payload": {"transcripts": []},
            "sentences": [{"idx": 0, "begin_ms": 0, "end_ms": 1000, "text_en": "hello", "text_zh": "你好", "tokens": ["hello"], "audio_url": None}],
        }
        return lesson

    monkeypatch.setattr(lessons_router.threading, "Thread", ImmediateThread)
    monkeypatch.setattr(lessons_router.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers={"Authorization": f"Bearer {token}"},
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/restart.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    first_failed_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert first_failed_task.status_code == 200
    first_failed_payload = first_failed_task.json()
    assert first_failed_payload["status"] == "failed"
    assert first_failed_payload["resume_available"] is True

    session = session_factory()
    try:
        task = session.query(LessonGenerationTask).filter(LessonGenerationTask.task_id == task_id).one()
        task.resume_available = False
        task.resume_stage = ""
        session.commit()
    finally:
        session.close()

    restart_resp = client.post(f"/api/lessons/tasks/{task_id}/resume", headers={"Authorization": f"Bearer {token}"})
    assert restart_resp.status_code == 200
    assert restart_resp.json()["ok"] is True

    succeeded_task = client.get(f"/api/lessons/tasks/{task_id}", headers={"Authorization": f"Bearer {token}"})
    assert succeeded_task.status_code == 200
    success_payload = succeeded_task.json()
    assert success_payload["status"] == "succeeded"
    assert success_payload["lesson"]["title"] == "restart"
    assert attempts["count"] == 2




def test_lessons_progress_and_check(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="learner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "learner@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="demo",
            source_filename="demo.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=10000,
            media_storage="server",
            source_duration_ms=10000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="hello world",
                text_zh="你好 世界",
                tokens_json=["hello", "world"],
                audio_clip_path="/tmp/not_exists.opus",
            )
        )
        session.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=user.id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    get_progress = client.get(f"/api/lessons/{lesson_id}/progress", headers=headers)
    assert get_progress.status_code == 200

    update_progress = client.post(
        f"/api/lessons/{lesson_id}/progress",
        headers=headers,
        json={"current_sentence_index": 0, "completed_sentence_indexes": [0], "last_played_at_ms": 500},
    )
    assert update_progress.status_code == 200

    check = client.post(
        f"/api/lessons/{lesson_id}/check",
        headers=headers,
        json={"sentence_index": 0, "user_tokens": ["hello", "world"]},
    )
    assert check.status_code == 200
    assert check.json()["passed"] is True

    summary = client.get("/api/lessons/progress/summary", headers=headers)
    assert summary.status_code == 404




def test_legacy_lesson_detail_and_check_spell_usd_amounts(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="legacy-money@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "legacy-money@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="legacy money",
            source_filename="legacy_money.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="$40?",
                text_zh="40美元？",
                tokens_json=["$40"],
                audio_clip_path=None,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    detail_resp = client.get(f"/api/lessons/{lesson_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    assert detail_data["sentences"][0]["text_en"] == "forty dollars?"
    assert detail_data["sentences"][0]["tokens"] == ["forty", "dollars"]

    check_resp = client.post(
        f"/api/lessons/{lesson_id}/check",
        headers=headers,
        json={"sentence_index": 0, "user_tokens": ["forty", "dollars"]},
    )
    assert check_resp.status_code == 200
    check_data = check_resp.json()
    assert check_data["passed"] is True
    assert check_data["expected_tokens"] == ["forty", "dollars"]




def test_lesson_rename_and_delete_endpoints(test_client):
    client, session_factory, _ = test_client
    owner_token = _register_and_login(client, email="rename-owner@example.com")
    other_token = _register_and_login(client, email="rename-other@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "rename-owner@example.com").one()
        lesson = Lesson(
            user_id=owner.id,
            title="old title",
            source_filename="rename.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=3000,
            media_storage="client_indexeddb",
            source_duration_ms=3000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        lesson_id = lesson.id
        session.commit()
    finally:
        session.close()

    rename_ok = client.patch(f"/api/lessons/{lesson_id}", headers=owner_headers, json={"title": "  New Lesson Title  "})
    assert rename_ok.status_code == 200
    assert rename_ok.json()["title"] == "New Lesson Title"

    rename_empty = client.patch(f"/api/lessons/{lesson_id}", headers=owner_headers, json={"title": "   "})
    assert rename_empty.status_code == 400
    assert rename_empty.json()["error_code"] == "INVALID_TITLE"

    rename_too_long = client.patch(f"/api/lessons/{lesson_id}", headers=owner_headers, json={"title": "x" * 256})
    assert rename_too_long.status_code == 400
    assert rename_too_long.json()["error_code"] == "INVALID_TITLE"

    delete_cross_user = client.delete(f"/api/lessons/{lesson_id}", headers=other_headers)
    assert delete_cross_user.status_code == 404

    delete_ok = client.delete(f"/api/lessons/{lesson_id}", headers=owner_headers)
    assert delete_ok.status_code == 200
    assert delete_ok.json()["ok"] is True
    assert delete_ok.json()["lesson_id"] == lesson_id

    get_deleted = client.get(f"/api/lessons/{lesson_id}", headers=owner_headers)
    assert get_deleted.status_code == 404




def test_delete_lesson_clears_wallet_ledger_reference(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="delete-ledger-owner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "delete-ledger-owner@example.com").one()
        lesson = Lesson(
            user_id=owner.id,
            title="ledger linked lesson",
            source_filename="ledger.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=2000,
            media_storage="client_indexeddb",
            source_duration_ms=2000,
            status="ready",
        )
        session.add(lesson)
        session.flush()

        ledger = WalletLedger(
            user_id=owner.id,
            operator_user_id=None,
            event_type="consume",
            delta_points=0,
            balance_after=0,
            model_name="qwen3-asr-flash-filetrans",
            duration_ms=lesson.duration_ms,
            lesson_id=lesson.id,
            note="regression: lesson delete should clear reference",
        )
        session.add(ledger)
        session.flush()
        lesson_id = lesson.id
        ledger_id = ledger.id
        session.commit()
    finally:
        session.close()

    delete_ok = client.delete(f"/api/lessons/{lesson_id}", headers=headers)
    assert delete_ok.status_code == 200
    assert delete_ok.json()["ok"] is True
    assert delete_ok.json()["lesson_id"] == lesson_id

    verify = session_factory()
    try:
        ledger_after = verify.query(WalletLedger).filter(WalletLedger.id == ledger_id).one()
        assert ledger_after.lesson_id is None
    finally:
        verify.close()




def test_delete_lesson_clears_generation_task_reference_under_sqlite_foreign_keys(tmp_path):
    clear_query_caches()
    db_file = tmp_path / "delete_lesson_task_fk.db"
    engine = create_database_engine(f"sqlite:///{db_file}")

    @event.listens_for(engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session, future=True)
    Base.metadata.create_all(bind=engine)

    seed = TestingSessionLocal()
    try:
        ensure_default_billing_rates(seed)
    finally:
        seed.close()

    app = create_app(enable_lifespan=False)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as client:
        token = _register_and_login(client, email="delete-task-owner@example.com")
        headers = {"Authorization": f"Bearer {token}"}

        session = TestingSessionLocal()
        try:
            owner = session.query(User).filter(User.email == "delete-task-owner@example.com").one()
            lesson = Lesson(
                user_id=owner.id,
                title="task linked lesson",
                source_filename="task.mp4",
                asr_model="qwen3-asr-flash-filetrans",
                duration_ms=2000,
                media_storage="client_indexeddb",
                source_duration_ms=2000,
                status="ready",
            )
            session.add(lesson)
            session.flush()

            task = LessonGenerationTask(
                task_id="delete-lesson-linked-task",
                owner_user_id=owner.id,
                lesson_id=lesson.id,
                source_filename="task.mp4",
                asr_model="qwen3-asr-flash-filetrans",
                semantic_split_enabled=False,
                status="succeeded",
                overall_percent=100,
                current_text="done",
                stages_json=[],
                counters_json={},
                work_dir="tmp/task",
                source_path="tmp/task/source.mp4",
                artifacts_json={},
            )
            session.add(task)
            session.flush()
            lesson_id = lesson.id
            task_row_id = task.id
            session.commit()
        finally:
            session.close()

        delete_ok = client.delete(f"/api/lessons/{lesson_id}", headers=headers)
        assert delete_ok.status_code == 200
        assert delete_ok.json()["ok"] is True
        assert delete_ok.json()["lesson_id"] == lesson_id

        health_resp = client.get("/health")
        assert health_resp.status_code == 200

        verify = TestingSessionLocal()
        try:
            task_after = verify.query(LessonGenerationTask).filter(LessonGenerationTask.id == task_row_id).one()
            assert task_after.lesson_id is None
            assert verify.get(Lesson, lesson_id) is None
        finally:
            verify.close()

    clear_query_caches()
    engine.dispose()




def test_bulk_delete_lessons_by_ids_keeps_other_users_data(test_client):
    client, session_factory, _ = test_client
    owner_token = _register_and_login(client, email="bulk-delete-owner@example.com")
    other_token = _register_and_login(client, email="bulk-delete-other@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "bulk-delete-owner@example.com").one()
        other = session.query(User).filter(User.email == "bulk-delete-other@example.com").one()
        owner_lessons = [
            Lesson(
                user_id=owner.id,
                title=f"owner lesson {index}",
                source_filename=f"owner-{index}.mp4",
                asr_model=QWEN_ASR_MODEL,
                duration_ms=1000 + index,
                media_storage="client_indexeddb",
                source_duration_ms=1000 + index,
                status="ready",
            )
            for index in range(1, 4)
        ]
        other_lesson = Lesson(
            user_id=other.id,
            title="other lesson",
            source_filename="other.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2000,
            media_storage="client_indexeddb",
            source_duration_ms=2000,
            status="ready",
        )
        session.add_all([*owner_lessons, other_lesson])
        session.flush()
        owner_delete_ids = [owner_lessons[0].id, owner_lessons[2].id]
        other_lesson_id = other_lesson.id
        session.commit()
    finally:
        session.close()

    resp = client.post(
        "/api/lessons/bulk-delete",
        headers=owner_headers,
        json={"lesson_ids": owner_delete_ids, "delete_all": False},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert sorted(payload["deleted_ids"]) == sorted(owner_delete_ids)
    assert payload["deleted_count"] == 2
    assert payload["failed_ids"] == []

    for lesson_id in owner_delete_ids:
        deleted_resp = client.get(f"/api/lessons/{lesson_id}", headers=owner_headers)
        assert deleted_resp.status_code == 404

    other_resp = client.get(f"/api/lessons/{other_lesson_id}", headers=other_headers)
    assert other_resp.status_code == 200




def test_bulk_delete_all_lessons_only_removes_current_user_history(test_client):
    client, session_factory, _ = test_client
    owner_token = _register_and_login(client, email="bulk-delete-all-owner@example.com")
    other_token = _register_and_login(client, email="bulk-delete-all-other@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    other_headers = {"Authorization": f"Bearer {other_token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "bulk-delete-all-owner@example.com").one()
        other = session.query(User).filter(User.email == "bulk-delete-all-other@example.com").one()
        owner_lessons = [
            Lesson(
                user_id=owner.id,
                title=f"delete all owner {index}",
                source_filename=f"delete-all-owner-{index}.mp4",
                asr_model=QWEN_ASR_MODEL,
                duration_ms=1500 + index,
                media_storage="client_indexeddb",
                source_duration_ms=1500 + index,
                status="ready",
            )
            for index in range(1, 3)
        ]
        other_lesson = Lesson(
            user_id=other.id,
            title="delete all other",
            source_filename="delete-all-other.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2400,
            media_storage="client_indexeddb",
            source_duration_ms=2400,
            status="ready",
        )
        session.add_all([*owner_lessons, other_lesson])
        session.flush()
        owner_lesson_ids = [lesson.id for lesson in owner_lessons]
        other_lesson_id = other_lesson.id
        session.commit()
    finally:
        session.close()

    resp = client.post(
        "/api/lessons/bulk-delete",
        headers=owner_headers,
        json={"lesson_ids": [], "delete_all": True},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert sorted(payload["deleted_ids"]) == sorted(owner_lesson_ids)
    assert payload["deleted_count"] == len(owner_lesson_ids)
    assert payload["failed_ids"] == []

    catalog_resp = client.get("/api/lessons/catalog", headers=owner_headers, params={"page": 1, "page_size": 20})
    assert catalog_resp.status_code == 200
    assert catalog_resp.json()["total"] == 0

    other_resp = client.get(f"/api/lessons/{other_lesson_id}", headers=other_headers)
    assert other_resp.status_code == 200




def test_bulk_delete_all_lessons_respects_excluded_ids(test_client):
    client, session_factory, _ = test_client
    owner_token = _register_and_login(client, email="bulk-delete-excluded-owner@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    session = session_factory()
    try:
        owner = session.query(User).filter(User.email == "bulk-delete-excluded-owner@example.com").one()
        owner_lessons = [
            Lesson(
                user_id=owner.id,
                title=f"delete excluded owner {index}",
                source_filename=f"delete-excluded-owner-{index}.mp4",
                asr_model=QWEN_ASR_MODEL,
                duration_ms=1600 + index,
                media_storage="client_indexeddb",
                source_duration_ms=1600 + index,
                status="ready",
            )
            for index in range(1, 5)
        ]
        session.add_all(owner_lessons)
        session.flush()
        excluded_ids = [owner_lessons[1].id, owner_lessons[3].id]
        expected_deleted_ids = [lesson.id for lesson in owner_lessons if lesson.id not in excluded_ids]
        session.commit()
    finally:
        session.close()

    resp = client.post(
        "/api/lessons/bulk-delete",
        headers=owner_headers,
        json={"lesson_ids": [], "excluded_lesson_ids": excluded_ids, "delete_all": True},
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["ok"] is True
    assert sorted(payload["deleted_ids"]) == sorted(expected_deleted_ids)
    assert payload["deleted_count"] == len(expected_deleted_ids)
    assert payload["failed_ids"] == []

    for lesson_id in expected_deleted_ids:
        deleted_resp = client.get(f"/api/lessons/{lesson_id}", headers=owner_headers)
        assert deleted_resp.status_code == 404

    for lesson_id in excluded_ids:
        kept_resp = client.get(f"/api/lessons/{lesson_id}", headers=owner_headers)
        assert kept_resp.status_code == 200




def test_create_lesson_endpoint_with_stubbed_service(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="creator@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router
    monkeypatch.setattr(lesson_router, "BASE_TMP_DIR", tmp_path)

    captured = {}

    def fake_generate(upload_file, req_dir, owner_id, asr_model, db, progress_callback=None, semantic_split_enabled=None):
        captured["semantic_split_enabled"] = semantic_split_enabled
        lesson = Lesson(
            user_id=owner_id,
            title="fake lesson",
            source_filename="fake.mp4",
            asr_model=asr_model,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1234,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=900,
                text_en="hello",
                text_zh="你好",
                tokens_json=["hello"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        db.commit()
        db.refresh(lesson)
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 2,
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 300), _word_entry("world", 300, 900)]}]},
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 900,
                    "text_en": "hello",
                    "text_zh": "你好",
                    "tokens": ["hello"],
                    "audio_url": None,
                }
            ],
        }
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_upload", fake_generate)

    files = {"video_file": ("demo.mp4", io.BytesIO(b"dummy"), "video/mp4")}
    data = {"asr_model": QWEN_ASR_MODEL, "semantic_split_enabled": "true"}
    resp = client.post("/api/lessons", headers=headers, files=files, data=data)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["lesson"]["title"] == "fake lesson"
    assert body["lesson"]["media_storage"] == "client_indexeddb"
    assert body["lesson"]["source_duration_ms"] == 1234
    assert body["lesson"]["sentences"][0]["audio_url"] is None
    assert body["lesson"]["subtitle_cache_seed"]["semantic_split_enabled"] is True
    assert body["lesson"]["subtitle_cache_seed"]["split_mode"] == "word_level_split+semantic"
    assert body["lesson"]["subtitle_cache_seed"]["asr_payload"]["transcripts"][0]["words"][0]["text"] == "hello"
    assert captured["semantic_split_enabled"] is True




def test_lesson_media_prefers_source_filename_content_type(test_client, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="media-learner@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    media_root = Path(MEDIA_STORAGE_ROOT_DIR)
    media_root.mkdir(parents=True, exist_ok=True)
    media_path = media_root / f"stored_media_without_ext_{tmp_path.name}"
    media_path.write_bytes(b"fake-video-binary")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "media-learner@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="media mime test",
            source_filename="lesson-video.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=5000,
            media_storage="server",
            source_duration_ms=5000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            MediaAsset(
                lesson_id=lesson.id,
                original_path=str(media_path),
                opus_path=str(media_path),
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    resp = client.get(f"/api/lessons/{lesson_id}/media", headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("video/mp4")




def test_lesson_media_rejects_path_outside_controlled_root(test_client, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="media-outside@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    outside_path = tmp_path / "outside_media.mp4"
    outside_path.write_bytes(b"fake-video-binary")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "media-outside@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="media invalid path",
            source_filename="lesson-video.mp4",
            asr_model="qwen3-asr-flash-filetrans",
            duration_ms=5000,
            media_storage="server",
            source_duration_ms=5000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            MediaAsset(
                lesson_id=lesson.id,
                original_path=str(outside_path),
                opus_path=str(outside_path),
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    resp = client.get(f"/api/lessons/{lesson_id}/media", headers=headers)
    assert resp.status_code == 404
    assert resp.json()["error_code"] == "MEDIA_PATH_INVALID"




def test_local_media_mode_requires_client_binding(test_client):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="local-media@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "local-media@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="local-only",
            source_filename="local.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2000,
            media_storage="client_indexeddb",
            source_duration_ms=2000,
            status="ready",
        )
        session.add(lesson)
        session.flush()
        session.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="hello world",
                text_zh="你好 世界",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        session.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=user.id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    detail_resp = client.get(f"/api/lessons/{lesson_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail_data = detail_resp.json()
    assert detail_data["media_storage"] == "client_indexeddb"
    assert detail_data["source_duration_ms"] == 2000
    assert detail_data["sentences"][0]["audio_url"] is None

    media_resp = client.get(f"/api/lessons/{lesson_id}/media", headers=headers)
    assert media_resp.status_code == 409
    assert media_resp.json()["error_code"] == "LOCAL_MEDIA_REQUIRED"

    clip_resp = client.get(f"/api/lessons/{lesson_id}/sentences/0/audio", headers=headers)
    assert clip_resp.status_code == 409
    assert clip_resp.json()["error_code"] == "LOCAL_MEDIA_REQUIRED"




def test_dashscope_file_id_create_lesson_task_and_poll_success(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="task-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router
    from app.services import lesson_command_service as lesson_command_service_module

    monkeypatch.setattr(lesson_router, "BASE_TMP_DIR", tmp_path)
    monkeypatch.setattr(lesson_router, "SessionLocal", session_factory)
    monkeypatch.setattr(lesson_command_service_module, "BASE_TMP_DIR", tmp_path)
    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)
    monkeypatch.setattr(lesson_router, "extract_audio_for_asr", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("local conversion should be skipped for dashscope_file_id tasks")))
    _seed_wallet_balance(session_factory, email="task-user@example.com")

    class InlineThread:
        def __init__(self, *, target, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = kwargs or {}

        def start(self):
            self._target(**self._kwargs)

    monkeypatch.setattr(lesson_router.threading, "Thread", InlineThread)

    captured = {}

    def fake_generate_from_saved_file(
        *,
        dashscope_file_id,
        source_filename,
        req_dir,
        owner_id,
        asr_model,
        db,
        progress_callback=None,
        task_id=None,
        semantic_split_enabled=None,
    ):
        captured["dashscope_file_id"] = dashscope_file_id
        captured["source_filename"] = source_filename
        captured["semantic_split_enabled"] = semantic_split_enabled
        captured["task_id"] = task_id
        if progress_callback:
            progress_callback({"stage_key": "convert_audio", "stage_status": "completed", "overall_percent": 20, "current_text": "转换音频格式完成"})
            progress_callback({"stage_key": "asr_transcribe", "stage_status": "completed", "overall_percent": 60, "current_text": "转写字幕 3/约3", "counters": {"asr_done": 3, "asr_estimated": 3}})
            progress_callback(
                {
                    "stage_key": "translate_zh",
                    "stage_status": "completed",
                    "overall_percent": 90,
                    "current_text": "翻译字幕 3/3",
                    "counters": {"translate_done": 3, "translate_total": 3},
                    "translation_debug": {
                        "total_sentences": 3,
                        "failed_sentences": 1,
                        "request_count": 3,
                        "success_request_count": 2,
                        "usage": {"prompt_tokens": 30, "completion_tokens": 12, "total_tokens": 42, "charged_points": 1},
                        "latest_error_summary": "第2句失败：REQUEST_FAILED rate limit",
                    },
                }
            )
            progress_callback({"stage_key": "write_lesson", "stage_status": "completed", "overall_percent": 100, "current_text": "课程生成完成"})

        lesson = Lesson(
            user_id=owner_id,
            title="task lesson",
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1200,
            media_storage="client_indexeddb",
            source_duration_ms=1200,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=900,
                text_en="hello world",
                text_zh="你好世界",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        db.commit()
        db.refresh(lesson)
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 2,
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 300), _word_entry("world", 300, 900)]}]},
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 900,
                    "text_en": "hello",
                    "text_zh": "你好",
                    "tokens": ["hello"],
                    "audio_url": None,
                }
            ],
        }
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/task.mp4",
        },
    )
    assert create_resp.status_code == 200
    assert captured["dashscope_file_id"] == "uploads/test/task.mp4"
    assert captured["source_filename"] == "task.mp4"
    assert captured["semantic_split_enabled"] is False
    task_id = create_resp.json()["task_id"]
    assert captured["task_id"] == task_id

    poll_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert poll_resp.status_code == 200
    payload = poll_resp.json()
    assert payload["status"] == "succeeded"
    assert payload["overall_percent"] == 100
    assert payload["lesson"]["title"] == "task lesson"
    assert payload["subtitle_cache_seed"]["semantic_split_enabled"] is True
    assert payload["lesson"]["subtitle_cache_seed"]["split_mode"] == "word_level_split+semantic"
    assert payload["counters"]["translate_done"] == 3
    assert payload["translation_debug"]["failed_sentences"] == 1
    assert payload["translation_debug"]["request_count"] == 3
    assert payload["translation_debug"]["usage"]["total_tokens"] == 42
    assert payload["translation_debug"]["latest_error_summary"] == "第2句失败：REQUEST_FAILED rate limit"
    assert all(item["status"] == "completed" for item in payload["stages"])

    verify_session = session_factory()
    try:
        task_row = verify_session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task_row is not None
        assert task_row.source_filename == "task.mp4"
        assert task_row.source_path
        assert Path(task_row.source_path).name == "dashscope_file_id.txt"
        assert task_row.artifacts_json["dashscope_file_id"] == "uploads/test/task.mp4"
    finally:
        verify_session.close()




def test_dashscope_file_id_task_preserves_original_source_filename(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="task-unicode-source@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router
    from app.services import lesson_command_service as lesson_command_service_module

    monkeypatch.setattr(lesson_router, "BASE_TMP_DIR", tmp_path)
    monkeypatch.setattr(lesson_router, "SessionLocal", session_factory)
    monkeypatch.setattr(lesson_command_service_module, "BASE_TMP_DIR", tmp_path)
    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)
    _seed_wallet_balance(session_factory, email="task-unicode-source@example.com")

    class InlineThread:
        def __init__(self, *, target, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = kwargs or {}

        def start(self):
            self._target(**self._kwargs)

    monkeypatch.setattr(lesson_router.threading, "Thread", InlineThread)

    captured = {}

    def fake_generate_from_saved_file(
        *,
        dashscope_file_id,
        source_filename,
        req_dir,
        owner_id,
        asr_model,
        db,
        progress_callback=None,
        task_id=None,
        semantic_split_enabled=None,
    ):
        captured["dashscope_file_id"] = dashscope_file_id
        captured["source_filename"] = source_filename
        captured["task_id"] = task_id
        _ = (req_dir, asr_model, semantic_split_enabled)
        if progress_callback:
            progress_callback({"stage_key": "write_lesson", "stage_status": "completed", "overall_percent": 100, "current_text": "课程生成完成"})

        lesson = Lesson(
            user_id=owner_id,
            title="unicode source lesson",
            source_filename=source_filename,
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1000,
            media_storage="client_indexeddb",
            source_duration_ms=1000,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="hello world",
                text_zh="你好世界",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        db.commit()
        db.refresh(lesson)
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": False,
            "split_mode": "asr_sentences",
            "source_word_count": 2,
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 300), _word_entry("world", 300, 1000)]}]},
            "sentences": [],
        }
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "dashscope-instant/d168822c2c877c2c15ca5fec1333412d/2026-03-27/f68f066a-e429-4b22-9645-ff3a765bca1c/upload-a1b2c3d4.mp4",
            "source_filename": "测试.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    poll_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert poll_resp.status_code == 200
    assert poll_resp.json()["status"] == "succeeded"
    assert captured["dashscope_file_id"].endswith("/upload-a1b2c3d4.mp4")
    assert captured["source_filename"] == "测试.mp4"

    verify_session = session_factory()
    try:
        task_row = verify_session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task_row is not None
        assert task_row.source_filename == "测试.mp4"
        assert task_row.artifacts_json["dashscope_file_id"].endswith("/upload-a1b2c3d4.mp4")
    finally:
        verify_session.close()





def test_dashscope_403_file_access_retry_task_hides_first_failure_and_skips_fallback(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="dashscope-403-task@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.services import lesson_command_service as lesson_command_service_module
    from app.services import lesson_service as lesson_service_module

    signed_url_calls: list[str] = []
    transcribe_calls: list[str] = []
    fallback_calls: list[str] = []

    monkeypatch.setattr(lesson_command_service_module, "BASE_TMP_DIR", tmp_path)
    _seed_wallet_balance(session_factory, email="dashscope-403-task@example.com")

    class InlineThread:
        def __init__(self, *, target, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = kwargs or {}

        def start(self):
            self._target(**self._kwargs)

    monkeypatch.setattr(lesson_command_service_module.threading, "Thread", InlineThread)

    def fail_saved_file(*_args, **_kwargs):
        fallback_calls.append("saved_file")
        raise AssertionError("dashscope 403 retry should not route into saved-file fallback")

    def fail_local_payload(*_args, **_kwargs):
        fallback_calls.append("local_asr")
        raise AssertionError("dashscope 403 retry should not route into local-asr fallback")

    monkeypatch.setattr(lesson_command_service_module.LessonService, "generate_from_saved_file", staticmethod(fail_saved_file))
    monkeypatch.setattr(lesson_command_service_module.LessonService, "generate_from_local_asr_payload", staticmethod(fail_local_payload))

    def fake_get_file_signed_url(file_id: str) -> str:
        signed_url_calls.append(file_id)
        return f"https://signed.example.com/{len(signed_url_calls)}"

    retry_failure = lesson_service_module.AsrError(
        "ASR_TASK_FAILED",
        "ASR 任务失败",
        json.dumps(
            {
                "task_status": "FAILED",
                "subtask_code": "FILE_403_FORBIDDEN",
                "subtask_message": "provider denied signed url",
            },
            ensure_ascii=False,
        ),
    )

    def fake_transcribe_signed_url(signed_url: str, **_kwargs):
        transcribe_calls.append(signed_url)
        if len(transcribe_calls) == 1:
            raise retry_failure
        return {
            "usage_seconds": 1,
            "asr_result_json": {
                "transcripts": [
                    {
                        "text": "hello world",
                        "sentences": [{"text": "hello world", "begin_time": 0, "end_time": 1000}],
                    }
                ]
            },
        }

    monkeypatch.setattr("app.infra.dashscope_storage.get_file_signed_url", fake_get_file_signed_url)
    monkeypatch.setattr(lesson_service_module, "transcribe_signed_url", fake_transcribe_signed_url)
    monkeypatch.setattr(lesson_service_module, "persist_lesson_workspace_summary", lambda **_kwargs: None)
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "build_subtitle_variant",
        staticmethod(
            lambda **_kwargs: {
                "sentences": [
                    {
                        "idx": 0,
                        "begin_ms": 0,
                        "end_ms": 1000,
                        "text_en": "hello world",
                        "text_zh": "你好世界",
                        "tokens": ["hello", "world"],
                        "audio_url": None,
                    }
                ],
                "translation_usage": {"total_tokens": 0},
                "translate_failed_count": 0,
                "translation_request_count": 1,
                "translation_success_request_count": 1,
                "latest_translate_error_summary": "",
            }
        ),
    )
    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "build_subtitle_cache_seed",
        staticmethod(
            lambda *, asr_payload, variant: {
                "semantic_split_enabled": False,
                "split_mode": "asr_sentences",
                "source_word_count": 2,
                "strategy_version": 2,
                "asr_payload": asr_payload,
                "sentences": list(variant["sentences"]),
            }
        ),
    )

    def fake_build_one_lesson(lesson, *, owner_id, asr_payload, variant, db, **_kwargs):
        lesson.user_id = owner_id
        lesson.title = "dashscope retry success"
        lesson.source_filename = "dashscope_403.mp4"
        lesson.asr_model = QWEN_ASR_MODEL
        lesson.duration_ms = 1000
        lesson.media_storage = "client_indexeddb"
        lesson.source_duration_ms = 1000
        lesson.status = "ready"
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=1000,
                text_en="hello world",
                text_zh="你好世界",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        _ = (asr_payload, variant)
        return SimpleNamespace(errors=[])

    monkeypatch.setattr(
        lesson_service_module.LessonService,
        "_build_one_lesson",
        staticmethod(fake_build_one_lesson),
        raising=False,
    )

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/dashscope_403.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    poll_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert poll_resp.status_code == 200
    payload = poll_resp.json()
    assert payload["status"] == "succeeded"
    assert payload["error_code"] == ""
    assert payload["failure_debug"] is None
    assert payload["lesson"]["title"] == "dashscope retry success"
    assert payload["lesson"]["source_filename"] == "dashscope_403.mp4"
    assert payload["lesson"]["subtitle_cache_seed"]["split_mode"] == "asr_sentences"
    assert all(item["status"] == "completed" for item in payload["stages"])
    assert payload["message"] != "ASR 任务失败"
    assert signed_url_calls == [
        "uploads/test/dashscope_403.mp4",
        "uploads/test/dashscope_403.mp4",
    ]
    assert transcribe_calls == [
        "https://signed.example.com/1",
        "https://signed.example.com/2",
    ]
    assert fallback_calls == []

    verify_session = session_factory()
    try:
        task_row = verify_session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task_row is not None
        assert task_row.error_code == ""
        assert task_row.failure_debug_json is None
        db_artifacts = json.loads(
            verify_session.execute(
                text("SELECT artifacts_json FROM lesson_generation_tasks WHERE task_id = :task_id"),
                {"task_id": task_id},
            ).scalar_one()
        )
        assert db_artifacts["dashscope_file_id"] == "uploads/test/dashscope_403.mp4"
        assert db_artifacts["dashscope_recovery"] == {
            "dashscope_file_id": "uploads/test/dashscope_403.mp4",
            "first_failure_stage": "asr_transcribe",
            "first_failure_code": "ASR_TASK_FAILED",
            "first_failure_message": "provider denied signed url",
            "retry_attempted": True,
            "retry_outcome": "succeeded",
            "final_outcome": "recovered",
        }
    finally:
        verify_session.close()




def test_generate_from_dashscope_file_id_uses_builtin_lesson_builder(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="dashscope-builder@example.com")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "dashscope-builder@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        from app.services import lesson_service as lesson_service_module

        req_dir = tmp_path / "req_dashscope_builder"
        req_dir.mkdir(parents=True, exist_ok=True)

        monkeypatch.setattr("app.infra.dashscope_storage.get_file_signed_url", lambda _file_id: "https://signed.example.com/direct")
        monkeypatch.setattr(
            lesson_service_module,
            "transcribe_signed_url",
            lambda _signed_url, **_kwargs: {
                "usage_seconds": 1,
                "asr_result_json": {
                    "transcripts": [
                        {
                            "text": "hello world",
                            "sentences": [{"text": "hello world", "begin_time": 0, "end_time": 1000}],
                        }
                    ]
                },
            },
        )
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "build_subtitle_variant",
            staticmethod(
                lambda **_kwargs: {
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 1000,
                            "text_en": "hello world",
                            "text_zh": "你好世界",
                            "tokens": ["hello", "world"],
                            "audio_url": None,
                        }
                    ],
                    "translation_attempt_records": [
                        {
                            "sentence_idx": 0,
                            "attempt_no": 1,
                            "provider": "dashscope_compatible",
                            "model_name": "qwen-mt-flash",
                            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                            "input_text_preview": "hello world",
                            "provider_request_id": "req_dashscope_builder",
                            "status_code": 200,
                            "finish_reason": "stop",
                            "prompt_tokens": 40,
                            "completion_tokens": 20,
                            "total_tokens": 60,
                            "success": True,
                            "error_code": "",
                            "error_message": "",
                            "started_at": datetime.utcnow(),
                            "finished_at": datetime.utcnow(),
                        }
                    ],
                    "translation_usage": {"total_tokens": 60},
                    "translate_failed_count": 0,
                    "translation_request_count": 1,
                    "translation_success_request_count": 1,
                    "latest_translate_error_summary": "",
                }
            ),
        )

        lesson = LessonService.generate_from_dashscope_file_id(
            dashscope_file_id="uploads/test/direct.mp4",
            source_filename="direct.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            task_id="task_dashscope_builder",
            semantic_split_enabled=False,
        )

        stored = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc()).all()
        translation_log = session.query(TranslationRequestLog).filter(TranslationRequestLog.task_id == "task_dashscope_builder").one()
        mt_ledger = (
            session.query(WalletLedger)
            .filter(WalletLedger.lesson_id == lesson.id, WalletLedger.event_type == "consume_translate")
            .one()
        )
        workspace_summary = lesson.workspace_summary

        assert lesson.id > 0
        assert lesson.title == "direct"
        assert lesson.source_filename == "direct.mp4"
        assert lesson.asr_model == QWEN_ASR_MODEL
        assert lesson.status == "ready"
        assert lesson.duration_ms == 1000
        assert lesson.source_duration_ms == 1000
        assert len(stored) == 1
        assert stored[0].text_en == "hello world"
        assert stored[0].text_zh == "你好世界"
        assert translation_log.lesson_id == lesson.id
        assert translation_log.total_tokens == 60
        assert mt_ledger.model_name == "qwen-mt-flash"
        assert mt_ledger.delta_points == -1
        assert workspace_summary["scope"] == "lesson"
        assert workspace_summary["task_id"] == "task_dashscope_builder"
        assert workspace_summary["lesson_id"] == lesson.id
        assert workspace_summary["source"]["input_mode"] == "upload"
        assert workspace_summary["source"]["runtime_kind"] == "cloud_api"
        assert workspace_summary["latest_subtitle_snapshot"]["items"][0]["text_en"] == "hello world"
        assert Path(workspace_summary["summary_path"]).exists()
    finally:
        session.close()




def test_dashscope_403_file_access_retry_failure_persists_recovery_debug(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="dashscope-403-failed@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.services import lesson_command_service as lesson_command_service_module

    monkeypatch.setattr(lesson_command_service_module, "BASE_TMP_DIR", tmp_path)
    _seed_wallet_balance(session_factory, email="dashscope-403-failed@example.com")

    class InlineThread:
        def __init__(self, *, target, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = kwargs or {}

        def start(self):
            self._target(**self._kwargs)

    monkeypatch.setattr(lesson_command_service_module.threading, "Thread", InlineThread)

    recovery_payload = {
        "dashscope_file_id": "uploads/test/exhausted.mp4",
        "first_failure_stage": "asr_transcribe",
        "first_failure_code": "ASR_TASK_FAILED",
        "first_failure_message": "provider denied signed url",
        "retry_attempted": True,
        "retry_outcome": "failed",
        "final_outcome": "cloud_file_access_failed",
    }

    def fake_generate_from_dashscope_file_id(**_kwargs):
        raise lesson_command_service_module.AsrError(
            "DASHSCOPE_FILE_ACCESS_FORBIDDEN",
            "DashScope 云端文件访问失败",
            json.dumps(recovery_payload, ensure_ascii=False),
        )

    monkeypatch.setattr(
        lesson_command_service_module.LessonService,
        "generate_from_dashscope_file_id",
        staticmethod(fake_generate_from_dashscope_file_id),
    )

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/exhausted.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    poll_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert poll_resp.status_code == 200
    payload = poll_resp.json()
    assert payload["status"] == "failed"
    assert payload["error_code"] == "DASHSCOPE_FILE_ACCESS_FORBIDDEN"
    assert payload["failure_debug"]["dashscope_recovery"] == recovery_payload

    verify_session = session_factory()
    try:
        task_row = verify_session.scalar(select(LessonGenerationTask).where(LessonGenerationTask.task_id == task_id))
        assert task_row is not None
        assert task_row.error_code == "DASHSCOPE_FILE_ACCESS_FORBIDDEN"
        db_row = verify_session.execute(
            text(
                "SELECT artifacts_json, failure_debug_json FROM lesson_generation_tasks WHERE task_id = :task_id"
            ),
            {"task_id": task_id},
        ).mappings().one()
        assert json.loads(db_row["failure_debug_json"])["dashscope_recovery"] == recovery_payload
        assert json.loads(db_row["artifacts_json"])["dashscope_recovery"] == recovery_payload
    finally:
        verify_session.close()




def test_lesson_task_admission_control_queues_and_rejects_across_entrypoints(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="task-queue@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.services import lesson_command_service as lesson_command_service_module

    hold_event = threading.Event()
    started_sources: list[str] = []

    monkeypatch.setattr(lesson_command_service_module, "BASE_TMP_DIR", tmp_path)
    monkeypatch.setattr(lesson_command_service_module, "LESSON_TASK_MAX_ACTIVE", 1)
    monkeypatch.setattr(lesson_command_service_module, "LESSON_TASK_MAX_QUEUED", 1)
    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)
    _enable_local_asr_model(monkeypatch)
    _seed_wallet_balance(session_factory, email="task-queue@example.com")

    def fake_generate_from_saved_file(
        *,
        dashscope_file_id,
        source_filename,
        req_dir,
        owner_id,
        asr_model,
        db,
        progress_callback=None,
        task_id=None,
        semantic_split_enabled=None,
    ):
        _ = (dashscope_file_id, req_dir, task_id, semantic_split_enabled)
        started_sources.append(source_filename)
        if progress_callback:
            progress_callback(
                {
                    "stage_key": "convert_audio",
                    "stage_status": "running",
                    "overall_percent": 10,
                    "current_text": "processing",
                }
            )
        if source_filename.startswith("hold"):
            assert hold_event.wait(timeout=5), "hold task did not release in time"
        if progress_callback:
            progress_callback(
                {
                    "stage_key": "write_lesson",
                    "stage_status": "completed",
                    "overall_percent": 100,
                    "current_text": "课程生成完成",
                }
            )

        lesson = Lesson(
            user_id=owner_id,
            title=source_filename,
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1200,
            media_storage="client_indexeddb",
            source_duration_ms=1200,
            status="ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=900,
                text_en="hello world",
                text_zh="你好世界",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        db.commit()
        db.refresh(lesson)
        return lesson

    monkeypatch.setattr(lesson_command_service_module.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)

    first_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/hold.mp4",
        },
    )
    assert first_resp.status_code == 200
    first_payload = first_resp.json()
    assert first_payload["admission"]["state"] == "admitted"
    assert first_payload["queued"] is False

    second_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/queued.mp4",
        },
    )
    assert second_resp.status_code == 200
    second_payload = second_resp.json()
    assert second_payload["admission"]["state"] == "queued"
    assert second_payload["queued"] is True
    queued_task_id = second_payload["task_id"]

    assert started_sources == ["hold.mp4"]

    queued_task_resp = client.get(f"/api/lessons/tasks/{queued_task_id}", headers=headers)
    assert queued_task_resp.status_code == 200
    queued_task_payload = queued_task_resp.json()
    assert queued_task_payload["status"] == "pending"
    assert queued_task_payload["admission"]["state"] == "queued"
    assert "排队" in queued_task_payload["current_text"]

    local_asr_busy_resp = client.post(
        "/api/lessons/tasks/local-asr",
        headers=headers,
        json={
            "asr_model": FASTER_WHISPER_ASR_MODEL,
            "source_filename": "busy.wav",
            "source_duration_ms": 12_000,
            "asr_payload": {
                "transcripts": [
                    {
                        "sentences": [
                            {"text": "Hello world", "begin_time": 0, "end_time": 1400},
                        ]
                    }
                ]
            },
        },
    )
    assert local_asr_busy_resp.status_code == 429
    busy_payload = local_asr_busy_resp.json()
    assert busy_payload["error_code"] == "LESSON_TASK_BUSY"
    assert busy_payload["detail"]["state"] == "rejected"
    assert busy_payload["detail"]["active_task_count"] == 1
    assert busy_payload["detail"]["queued_task_count"] == 1

    hold_event.set()

    final_payload = None
    deadline = time.time() + 5
    while time.time() < deadline:
        poll_resp = client.get(f"/api/lessons/tasks/{queued_task_id}", headers=headers)
        assert poll_resp.status_code == 200
        candidate = poll_resp.json()
        if candidate["status"] == "succeeded":
            final_payload = candidate
            break
        time.sleep(0.05)

    assert final_payload is not None
    assert started_sources == ["hold.mp4", "queued.mp4"]
    assert final_payload["lesson"]["title"] == "queued.mp4"




def test_lesson_task_partial_success_and_debug_report(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="task-partial-success@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    from app.api.routers import lessons as lesson_router
    from app.services import lesson_command_service as lesson_command_service_module

    monkeypatch.setattr(lesson_router, "BASE_TMP_DIR", tmp_path)
    monkeypatch.setattr(lesson_router, "SessionLocal", session_factory)
    monkeypatch.setattr(lesson_command_service_module, "probe_audio_duration_ms", lambda _path: 1_000)
    _seed_wallet_balance(session_factory, email="task-partial-success@example.com")

    class InlineThread:
        def __init__(self, *, target, kwargs=None, daemon=None):
            self._target = target
            self._kwargs = kwargs or {}

        def start(self):
            self._target(**self._kwargs)

    monkeypatch.setattr(lesson_router.threading, "Thread", InlineThread)

    def fake_generate_from_saved_file(
        *,
        dashscope_file_id,
        source_filename,
        req_dir,
        owner_id,
        asr_model,
        db,
        progress_callback=None,
        task_id=None,
        semantic_split_enabled=None,
    ):
        if progress_callback:
            progress_callback({"stage_key": "convert_audio", "stage_status": "completed", "overall_percent": 15, "current_text": "抽音频完成"})
            progress_callback({"stage_key": "asr_transcribe", "stage_status": "completed", "overall_percent": 45, "current_text": "识别字幕 3/3", "counters": {"asr_done": 3, "asr_estimated": 3}})
            progress_callback({"stage_key": "build_lesson", "stage_status": "completed", "overall_percent": 60, "current_text": "生成课程结构完成"})
            progress_callback(
                {
                    "stage_key": "translate_zh",
                    "stage_status": "completed",
                    "overall_percent": 85,
                    "current_text": "翻译阶段部分失败，已保留原文字幕",
                    "counters": {"translate_done": 2, "translate_total": 3},
                    "translation_debug": {
                        "total_sentences": 3,
                        "failed_sentences": 1,
                        "request_count": 2,
                        "success_request_count": 1,
                        "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30, "charged_points": 1},
                        "latest_error_summary": "第2句失败：REQUEST_FAILED rate limit",
                    },
                }
            )

        lesson = Lesson(
            user_id=owner_id,
            title="partial lesson",
            source_filename=source_filename,
            asr_model=asr_model,
            duration_ms=1200,
            media_storage="client_indexeddb",
            source_duration_ms=1200,
            status="partial_ready",
        )
        db.add(lesson)
        db.flush()
        db.add(
            LessonSentence(
                lesson_id=lesson.id,
                idx=0,
                begin_ms=0,
                end_ms=900,
                text_en="hello world",
                text_zh="",
                tokens_json=["hello", "world"],
                audio_clip_path=None,
            )
        )
        db.add(
            LessonProgress(
                lesson_id=lesson.id,
                user_id=owner_id,
                current_sentence_idx=0,
                completed_indexes_json=[],
                last_played_at_ms=0,
            )
        )
        db.commit()
        db.refresh(lesson)
        lesson.subtitle_cache_seed = {
            "semantic_split_enabled": False,
            "split_mode": "word_level_split",
            "source_word_count": 2,
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 300), _word_entry("world", 300, 900)]}]},
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 900,
                    "text_en": "hello world",
                    "text_zh": "",
                    "tokens": ["hello", "world"],
                    "audio_url": None,
                }
            ],
        }
        lesson.translation_debug = {
            "total_sentences": 3,
            "failed_sentences": 1,
            "request_count": 2,
            "success_request_count": 1,
            "usage": {"prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30, "charged_points": 1},
            "latest_error_summary": "第2句失败：REQUEST_FAILED rate limit",
        }
        lesson.task_result_meta = {
            "result_kind": "asr_only",
            "result_message": "课程已生成，翻译失败，可先使用原文字幕学习。",
            "partial_failure_stage": "translate_zh",
            "partial_failure_code": "TRANSLATION_PARTIAL",
            "partial_failure_message": "第2句失败：REQUEST_FAILED rate limit",
        }
        return lesson

    monkeypatch.setattr(lesson_router.LessonService, "generate_from_dashscope_file_id", fake_generate_from_saved_file)

    create_resp = client.post(
        "/api/lessons/tasks",
        headers=headers,
        data={
            "asr_model": QWEN_ASR_MODEL,
            "semantic_split_enabled": "false",
            "dashscope_file_id": "uploads/test/partial.mp4",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["task_id"]

    poll_resp = client.get(f"/api/lessons/tasks/{task_id}", headers=headers)
    assert poll_resp.status_code == 200
    payload = poll_resp.json()
    assert payload["status"] == "succeeded"
    assert payload["completion_kind"] == "partial"
    assert payload["result_kind"] == "asr_only"
    assert payload["result_message"] == "课程已生成，翻译失败，可先使用原文字幕学习。"
    assert payload["partial_failure_stage"] == "translate_zh"
    assert payload["partial_failure_code"] == "TRANSLATION_PARTIAL"
    assert payload["partial_failure_message"] == "第2句失败：REQUEST_FAILED rate limit"
    assert payload["lesson"]["status"] == "partial_ready"

    report_resp = client.get(f"/api/lessons/tasks/{task_id}/debug-report", headers=headers)
    assert report_resp.status_code == 200
    report_payload = report_resp.json()
    assert report_payload["completion_kind"] == "partial"
    assert "task_id" in report_payload["report_text"]
    assert "TRANSLATION_PARTIAL" in report_payload["report_text"]
    assert "translate_zh" in report_payload["report_text"]




def test_generate_from_saved_file_records_mt_usage_and_consume(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="billing-user@example.com")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "billing-user@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        from app.services import lesson_service as lesson_service_module

        req_dir = tmp_path / "req"
        req_dir.mkdir(parents=True, exist_ok=True)
        source_path = tmp_path / "source.mp4"
        source_path.write_bytes(b"video")

        monkeypatch.setattr(lesson_service_module, "extract_audio_for_asr", lambda _src, dst: dst.write_bytes(b"opus"))
        monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda _path: 60_000)
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "_transcribe_with_optional_parallel",
            staticmethod(lambda **kwargs: {"asr_payload": {"transcripts": [{"sentences": []}]}, "usage_seconds": 60}),
        )
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "build_subtitle_variant",
            staticmethod(
                lambda **kwargs: {
                    "semantic_split_enabled": False,
                    "split_mode": "word_level_split",
                    "source_word_count": 2,
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 900,
                            "text_en": "hello world",
                            "text_zh": "你好世界",
                            "tokens": ["hello", "world"],
                        }
                    ],
                    "translate_failed_count": 0,
                    "translation_attempt_records": [
                        {
                            "sentence_idx": 0,
                            "attempt_no": 1,
                            "provider": "dashscope_compatible",
                            "model_name": "qwen-mt-flash",
                            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                            "input_text_preview": "hello world",
                            "provider_request_id": "req_test",
                            "status_code": 200,
                            "finish_reason": "stop",
                            "prompt_tokens": 40,
                            "completion_tokens": 20,
                            "total_tokens": 60,
                            "success": True,
                            "error_code": "",
                            "error_message": "",
                            "started_at": datetime.utcnow(),
                            "finished_at": datetime.utcnow(),
                        }
                    ],
                    "translation_request_count": 1,
                    "translation_success_request_count": 1,
                    "translation_usage": {"prompt_tokens": 40, "completion_tokens": 20, "total_tokens": 60, "charged_points": 0},
                    "latest_translate_error_summary": "",
                }
            ),
        )

        lesson = LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="source.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            task_id="task_billing_test",
            semantic_split_enabled=False,
        )

        mt_ledger = (
            session.query(WalletLedger)
            .filter(WalletLedger.lesson_id == lesson.id, WalletLedger.event_type == "consume_translate")
            .one()
        )
        assert mt_ledger.model_name == "qwen-mt-flash"
        assert mt_ledger.delta_points == -1

        translation_log = session.query(TranslationRequestLog).filter(TranslationRequestLog.task_id == "task_billing_test").one()
        assert translation_log.lesson_id == lesson.id
        assert translation_log.success is True
        assert translation_log.total_tokens == 60
    finally:
        session.close()




def test_generate_from_saved_file_ignores_translation_log_persist_failure(test_client, monkeypatch, tmp_path):
    client, session_factory, _ = test_client
    _register_and_login(client, email="billing-user-log-fail@example.com")

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "billing-user-log-fail@example.com").one()
        account = get_or_create_wallet_account(session, user.id, for_update=True)
        account.balance_points = 500
        session.add(account)
        session.commit()

        from app.services import lesson_service as lesson_service_module

        req_dir = tmp_path / "req_log_fail"
        req_dir.mkdir(parents=True, exist_ok=True)
        source_path = tmp_path / "source_log_fail.mp4"
        source_path.write_bytes(b"video")

        monkeypatch.setattr(lesson_service_module, "extract_audio_for_asr", lambda _src, dst: dst.write_bytes(b"opus"))
        monkeypatch.setattr(lesson_service_module, "probe_audio_duration_ms", lambda _path: 60_000)
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "_transcribe_with_optional_parallel",
            staticmethod(lambda **kwargs: {"asr_payload": {"transcripts": [{"sentences": []}]}, "usage_seconds": 60}),
        )
        monkeypatch.setattr(
            lesson_service_module.LessonService,
            "build_subtitle_variant",
            staticmethod(
                lambda **kwargs: {
                    "semantic_split_enabled": False,
                    "split_mode": "word_level_split",
                    "source_word_count": 2,
                    "sentences": [
                        {
                            "idx": 0,
                            "begin_ms": 0,
                            "end_ms": 900,
                            "text_en": "hello world",
                            "text_zh": "你好世界",
                            "tokens": ["hello", "world"],
                        }
                    ],
                    "translate_failed_count": 0,
                    "translation_attempt_records": [
                        {
                            "sentence_idx": 0,
                            "attempt_no": 1,
                            "provider": "dashscope_compatible",
                            "model_name": "qwen-mt-flash",
                            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                            "input_text_preview": "hello world",
                            "provider_request_id": "req_test",
                            "status_code": 200,
                            "finish_reason": "stop",
                            "prompt_tokens": 40,
                            "completion_tokens": 20,
                            "total_tokens": 60,
                            "success": True,
                            "error_code": "",
                            "error_message": "",
                            "started_at": datetime.utcnow(),
                            "finished_at": datetime.utcnow(),
                        }
                    ],
                    "translation_request_count": 1,
                    "translation_success_request_count": 1,
                    "translation_usage": {"prompt_tokens": 40, "completion_tokens": 20, "total_tokens": 60, "charged_points": 0},
                    "latest_translate_error_summary": "",
                }
            ),
        )
        monkeypatch.setattr(
            lesson_service_module,
            "append_translation_request_logs",
            lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("translation log insert failed")),
        )

        lesson = LessonService.generate_from_saved_file(
            source_path=source_path,
            source_filename="source_log_fail.mp4",
            req_dir=req_dir,
            owner_id=user.id,
            asr_model=QWEN_ASR_MODEL,
            db=session,
            task_id="task_billing_log_fail",
            semantic_split_enabled=False,
        )

        assert lesson.id > 0
        lesson_sentences = session.query(LessonSentence).filter(LessonSentence.lesson_id == lesson.id).all()
        assert len(lesson_sentences) == 1
        translation_logs = session.query(TranslationRequestLog).filter(TranslationRequestLog.task_id == "task_billing_log_fail").all()
        assert translation_logs == []
    finally:
        session.close()




def test_regenerate_lesson_subtitle_variant_endpoint(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="variant-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "variant-user@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="variant lesson",
            source_filename="variant.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1600,
            media_storage="client_indexeddb",
            source_duration_ms=1600,
            status="ready",
        )
        session.add(lesson)
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    from app.api.routers import lessons as lesson_router

    captured = {}

    def fake_build_subtitle_variant(*, asr_payload, db, task_id=None, semantic_split_enabled=None, before_translate_callback=None, translation_progress_callback=None):
        captured["asr_payload"] = asr_payload
        captured["semantic_split_enabled"] = semantic_split_enabled
        captured["task_id"] = task_id
        return {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 3,
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 1200,
                    "text_en": "hello world again",
                    "text_zh": "你好世界再次",
                    "tokens": ["hello", "world", "again"],
                    "audio_url": None,
                }
            ],
            "translate_failed_count": 0,
        }

    monkeypatch.setattr(lesson_router.LessonService, "build_subtitle_variant", fake_build_subtitle_variant)

    resp = client.post(
        f"/api/lessons/{lesson_id}/subtitle-variants",
        headers=headers,
        json={
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 400)]}]},
            "semantic_split_enabled": True,
        },
    )
    assert resp.status_code == 410
    body = resp.json()
    assert body["ok"] is False
    assert body["error_code"] == "SUBTITLE_VARIANTS_DISABLED"
    assert captured == {}




def test_regenerate_lesson_subtitle_variant_returns_asr_sentences_when_semantic_disabled(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="variant-plain-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "variant-plain-user@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="plain variant lesson",
            source_filename="plain-variant.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=2200,
            media_storage="client_indexeddb",
            source_duration_ms=2200,
            status="ready",
        )
        session.add(lesson)
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    from app.services import lesson_service as lesson_service_module

    monkeypatch.setattr(
        lesson_service_module,
        "translate_sentences_to_zh",
        lambda texts, api_key, progress_callback=None: _translation_batch_result([f"中:{text}" for text in texts]),
    )

    resp = client.post(
        f"/api/lessons/{lesson_id}/subtitle-variants",
        headers=headers,
        json={
            "asr_payload": {
                "transcripts": [
                    {
                        "sentences": [
                            {"text": "Hello there", "begin_time": 0, "end_time": 900},
                            {"text": "General Kenobi", "begin_time": 900, "end_time": 1900},
                        ],
                        "words": [
                            _word_entry("Hello", 0, 300),
                            _word_entry("there", 300, 900),
                            _word_entry("General", 900, 1400),
                            _word_entry("Kenobi", 1400, 1900),
                        ],
                    }
                ]
            },
            "semantic_split_enabled": False,
        },
    )
    assert resp.status_code == 410
    body = resp.json()
    assert body["ok"] is False
    assert body["error_code"] == "SUBTITLE_VARIANTS_DISABLED"




def test_build_subtitle_variant_sanitizes_translation_inputs(test_client, monkeypatch):
    _, session_factory, _ = test_client
    session = session_factory()
    captured: dict[str, object] = {}
    try:
        from app.services import lesson_service as lesson_service_module

        def fake_translate(texts, api_key, progress_callback=None, resume_state=None, checkpoint_callback=None):
            captured["texts"] = list(texts)
            return _translation_batch_result([f"中:{text}" for text in texts], total_tokens=24)

        monkeypatch.setattr(lesson_service_module, "translate_sentences_to_zh", fake_translate)

        variant = LessonService.build_subtitle_variant(
            asr_payload={
                "transcripts": [
                    {
                        "sentences": [
                            {"text": "  Hello\x07   world  ", "begin_time": 0, "end_time": 900},
                            {"text": "Second\u200b line", "begin_time": 900, "end_time": 1600},
                        ],
                        "words": [
                            _word_entry("Hello", 0, 400),
                            _word_entry("world", 400, 900),
                            _word_entry("Second", 900, 1200),
                            _word_entry("line", 1200, 1600),
                        ],
                    }
                ]
            },
            db=session,
            semantic_split_enabled=False,
        )

        assert captured["texts"] == ["Hello world", "Second line"]
        assert variant["translate_failed_count"] == 0
        assert variant["sentences"][0]["text_en"] == "Hello world"
        assert variant["sentences"][1]["text_en"] == "Second line"
    finally:
        session.close()




def test_build_subtitle_variant_raises_when_translation_incomplete(test_client, monkeypatch):
    _, session_factory, _ = test_client
    session = session_factory()
    try:
        from app.services import lesson_service as lesson_service_module

        monkeypatch.setattr(
            lesson_service_module,
            "translate_sentences_to_zh",
            lambda texts, api_key, progress_callback=None, resume_state=None, checkpoint_callback=None: _translation_batch_result(
                ["中:Hello world", ""],
                failed_count=1,
                total_tokens=24,
                latest_error_summary="第2句失败：REQUEST_FAILED rate limit",
            ),
        )

        with pytest.raises(TranslationError) as exc_info:
            LessonService.build_subtitle_variant(
                asr_payload={
                    "transcripts": [
                        {
                            "sentences": [
                                {"text": "Hello world", "begin_time": 0, "end_time": 900},
                                {"text": "Second line", "begin_time": 900, "end_time": 1600},
                            ],
                            "words": [
                                _word_entry("Hello", 0, 400),
                                _word_entry("world", 400, 900),
                                _word_entry("Second", 900, 1200),
                                _word_entry("line", 1200, 1600),
                            ],
                        }
                    ]
                },
                db=session,
                semantic_split_enabled=False,
            )

        exc = exc_info.value
        assert exc.code == "TRANSLATION_INCOMPLETE"
        assert exc.message == "翻译阶段失败，请重试"
        assert exc.detail == "第2句失败：REQUEST_FAILED rate limit"
        assert exc.translation_debug["failed_sentences"] == 1
        assert exc.translation_debug["latest_error_summary"] == "第2句失败：REQUEST_FAILED rate limit"
    finally:
        session.close()




def test_regenerate_lesson_subtitle_variant_stream_endpoint(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="variant-stream-user@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "variant-stream-user@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="variant stream lesson",
            source_filename="variant-stream.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1600,
            media_storage="client_indexeddb",
            source_duration_ms=1600,
            status="ready",
        )
        session.add(lesson)
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    from app.api.routers import lessons as lesson_router

    def fake_build_subtitle_variant(*, asr_payload, db, task_id=None, semantic_split_enabled=None, progress_callback=None, before_translate_callback=None, translation_progress_callback=None):
        if progress_callback:
            progress_callback(
                {
                    "stage": "prepare",
                    "message": "正在重切分句",
                    "translate_done": 0,
                    "translate_total": 0,
                    "semantic_split_enabled": bool(semantic_split_enabled),
                }
            )
            progress_callback(
                {
                    "stage": "translate",
                    "message": "正在翻译 1/2",
                    "translate_done": 1,
                    "translate_total": 2,
                    "semantic_split_enabled": bool(semantic_split_enabled),
                }
            )
        return {
            "semantic_split_enabled": True,
            "split_mode": "word_level_split+semantic",
            "source_word_count": 3,
            "sentences": [
                {
                    "idx": 0,
                    "begin_ms": 0,
                    "end_ms": 1200,
                    "text_en": "hello world again",
                    "text_zh": "你好世界再次",
                    "tokens": ["hello", "world", "again"],
                    "audio_url": None,
                }
            ],
        }

    monkeypatch.setattr(lesson_router.LessonService, "build_subtitle_variant", fake_build_subtitle_variant)

    with client.stream(
        "POST",
        f"/api/lessons/{lesson_id}/subtitle-variants/stream",
        headers=headers,
        json={
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 400)]}]},
            "semantic_split_enabled": True,
        },
    ) as resp:
        assert resp.status_code == 410
        body = resp.json()
    assert body["ok"] is False
    assert body["error_code"] == "SUBTITLE_VARIANTS_DISABLED"




def test_regenerate_lesson_subtitle_variant_stream_endpoint_emits_error(test_client, monkeypatch):
    client, session_factory, _ = test_client
    token = _register_and_login(client, email="variant-stream-error@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    session = session_factory()
    try:
        user = session.query(User).filter(User.email == "variant-stream-error@example.com").one()
        lesson = Lesson(
            user_id=user.id,
            title="variant stream error",
            source_filename="variant-stream-error.mp4",
            asr_model=QWEN_ASR_MODEL,
            duration_ms=1600,
            media_storage="client_indexeddb",
            source_duration_ms=1600,
            status="ready",
        )
        session.add(lesson)
        session.commit()
        lesson_id = lesson.id
    finally:
        session.close()

    from app.api.routers import lessons as lesson_router

    def fake_build_subtitle_variant(*, asr_payload, db, task_id=None, semantic_split_enabled=None, progress_callback=None, before_translate_callback=None, translation_progress_callback=None):
        raise RuntimeError("stream explode")

    monkeypatch.setattr(lesson_router.LessonService, "build_subtitle_variant", fake_build_subtitle_variant)

    with client.stream(
        "POST",
        f"/api/lessons/{lesson_id}/subtitle-variants/stream",
        headers=headers,
        json={
            "asr_payload": {"transcripts": [{"words": [_word_entry("hello", 0, 400)]}]},
            "semantic_split_enabled": False,
        },
    ) as resp:
        assert resp.status_code == 410
        body = resp.json()
    assert body["ok"] is False
    assert body["error_code"] == "SUBTITLE_VARIANTS_DISABLED"


def test_build_lesson_sentences_prefers_word_level_split():
    from app.services import lesson_builder as lesson_builder_module

    payload = {
        "transcripts": [
            {
                "words": [
                    _word_entry("Hello", 0, 200),
                    _word_entry("world", 200, 500, punctuation="."),
                    _word_entry("This", 600, 800),
                    _word_entry("is", 800, 900),
                    _word_entry("a", 900, 950),
                    _word_entry("test", 950, 1300, punctuation="."),
                ]
            }
        ]
    }

    result = lesson_builder_module.build_lesson_sentences(payload, split_enabled=True, target_words=8, max_words=12)

    assert result["mode"] == "word_level_split"
    assert [item["text"] for item in result["sentences"]] == ["Hello world.", "This is a test."]




def test_build_lesson_sentences_falls_back_when_words_missing():
    from app.services import lesson_builder as lesson_builder_module

    payload = {
        "transcripts": [
            {
                "sentences": [
                    {"text": "fallback line", "begin_time": 0, "end_time": 900},
                ]
            }
        ]
    }

    result = lesson_builder_module.build_lesson_sentences(payload, split_enabled=True)

    assert result["mode"] == "asr_sentences_no_words"
    assert result["sentences"][0]["text"] == "fallback line"




def test_build_lesson_sentences_splits_on_connectors():
    from app.services import lesson_builder as lesson_builder_module

    payload = {
        "transcripts": [
            {
                "words": [
                    _word_entry("I", 0, 100),
                    _word_entry("stayed", 100, 250),
                    _word_entry("home", 250, 400),
                    _word_entry("last", 400, 520),
                    _word_entry("night", 520, 700),
                    _word_entry("because", 700, 900),
                    _word_entry("the", 900, 1000),
                    _word_entry("storm", 1000, 1150),
                    _word_entry("was", 1150, 1250),
                    _word_entry("getting", 1250, 1400),
                    _word_entry("worse", 1400, 1650),
                ]
            }
        ]
    }

    result = lesson_builder_module.build_lesson_sentences(payload, split_enabled=True, target_words=12, max_words=20)

    assert result["mode"] == "word_level_split"
    assert len(result["sentences"]) == 2
    assert result["sentences"][1]["text"].startswith("because")




def test_split_audio_segments_prefers_silence(monkeypatch, tmp_path):
    from app.services.lessons import asr_handler as asr_handler_module

    monkeypatch.setattr(
        asr_handler_module,
        "detect_silence_ranges",
        lambda source_audio, search_start_sec, search_end_sec: [(5.2, 5.9)],
    )

    def fake_run_cmd(cmd, **kwargs):
        output_path = Path(cmd[-1])
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"segment")

    monkeypatch.setattr(asr_handler_module, "run_cmd", fake_run_cmd)

    segments = asr_handler_module.split_audio_segments(
        tmp_path / "source.opus",
        tmp_path / "segments",
        target_seconds=5,
        search_window_seconds=2,
        duration_ms=9000,
    )

    assert len(segments) == 2
    assert segments[0][1] == 0
    assert segments[0][2] == 5700
    assert segments[1][1] == 5700



