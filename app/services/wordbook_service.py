from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.timezone import now_shanghai_naive
from app.models import WordbookEntry, WordbookEntrySource
from app.repositories.lessons import get_sentence
from app.repositories.wordbook import (
    build_wordbook_entry_payload,
    count_due_wordbook_entries,
    get_wordbook_entry_by_identity,
    get_wordbook_entry_for_user,
    get_wordbook_source_link,
    list_due_wordbook_entries,
    list_wordbook_entries,
)
from app.services.wordbook_review_scheduler import REVIEW_GRADES, apply_review_grade, build_initial_review_state, _resolve_interval_hours
from app.services.lesson_builder import tokenize_learning_sentence


WORD_ENTRY_TYPE = "word"
PHRASE_ENTRY_TYPE = "phrase"
WORD_STATUS_ACTIVE = "active"
WORD_STATUS_MASTERED = "mastered"
WORD_SORT_RECENT = "recent"
WORD_SORT_OLDEST = "oldest"
VALID_ENTRY_TYPES = {WORD_ENTRY_TYPE, PHRASE_ENTRY_TYPE}
VALID_ENTRY_STATUSES = {WORD_STATUS_ACTIVE, WORD_STATUS_MASTERED}
VALID_SORTS = {WORD_SORT_RECENT, WORD_SORT_OLDEST}


@dataclass
class WordbookCollectResult:
    payload: dict[str, object]
    created: bool
    updated_context: bool


def _normalize_entry_text(text: str) -> str:
    return " ".join(tokenize_learning_sentence(str(text or "")))


def _validated_sentence_tokens(sentence) -> list[str]:
    tokens = list(sentence.tokens_json or [])
    if tokens:
        return [str(item or "").strip() for item in tokens if str(item or "").strip()]
    return tokenize_learning_sentence(sentence.text_en or "")


def _validate_collect_payload(*, sentence, entry_type: str, entry_text: str, start_token_index: int, end_token_index: int) -> tuple[str, str]:
    safe_entry_type = str(entry_type or "").strip().lower()
    if safe_entry_type not in VALID_ENTRY_TYPES:
        raise HTTPException(status_code=400, detail="词条类型无效")

    sentence_tokens = _validated_sentence_tokens(sentence)
    if not sentence_tokens:
        raise HTTPException(status_code=400, detail="该句缺少可收藏的英文词元")

    start_idx = int(start_token_index)
    end_idx = int(end_token_index)
    if start_idx < 0 or end_idx < start_idx or end_idx >= len(sentence_tokens):
        raise HTTPException(status_code=400, detail="词条范围无效")

    expected_tokens = sentence_tokens[start_idx : end_idx + 1]
    if safe_entry_type == WORD_ENTRY_TYPE and len(expected_tokens) != 1:
        raise HTTPException(status_code=400, detail="单词收藏必须只选择一个词")
    if safe_entry_type == PHRASE_ENTRY_TYPE and len(expected_tokens) < 2:
        raise HTTPException(status_code=400, detail="短语收藏必须选择连续的两个及以上词")

    normalized_entry_text = _normalize_entry_text(entry_text)
    expected_text = " ".join(expected_tokens)
    if normalized_entry_text != expected_text:
        raise HTTPException(status_code=400, detail="所选文本不是该句中的连续片段")
    return expected_text, expected_text


def _entry_payload_to_dict(payload: dict[str, object]) -> dict[str, object]:
    entry = payload["entry"]
    return {
        "id": int(entry.id),
        "entry_text": str(entry.entry_text or ""),
        "normalized_text": str(entry.normalized_text or ""),
        "entry_type": str(entry.entry_type or WORD_ENTRY_TYPE),
        "status": str(entry.status or WORD_STATUS_ACTIVE),
        "latest_sentence_idx": int(entry.latest_sentence_idx or 0),
        "latest_sentence_en": str(entry.latest_sentence_en or ""),
        "latest_sentence_zh": str(entry.latest_sentence_zh or ""),
        "latest_collected_at": entry.latest_collected_at,
        "next_review_at": getattr(entry, "next_review_at", None),
        "last_reviewed_at": getattr(entry, "last_reviewed_at", None),
        "review_count": int(getattr(entry, "review_count", 0) or 0),
        "wrong_count": int(getattr(entry, "wrong_count", 0) or 0),
        "memory_score": float(getattr(entry, "memory_score", 0.0) or 0.0),
        "created_at": entry.created_at,
        "updated_at": entry.updated_at,
        "source_lesson_id": int(entry.latest_lesson_id) if entry.latest_lesson_id else None,
        "source_lesson_title": str(payload.get("source_lesson_title") or ""),
        "source_count": int(payload.get("source_count") or 0),
    }


def collect_wordbook_entry(
    db: Session,
    *,
    lesson,
    user_id: int,
    sentence_index: int,
    entry_type: str,
    entry_text: str,
    start_token_index: int,
    end_token_index: int,
) -> WordbookCollectResult:
    sentence = get_sentence(db, lesson.id, int(sentence_index))
    if not sentence:
        raise HTTPException(status_code=404, detail="句子不存在")

    canonical_text, normalized_text = _validate_collect_payload(
        sentence=sentence,
        entry_type=entry_type,
        entry_text=entry_text,
        start_token_index=start_token_index,
        end_token_index=end_token_index,
    )

    existing_entry = get_wordbook_entry_by_identity(db, user_id=user_id, normalized_text=normalized_text, entry_type=entry_type)
    created = existing_entry is None
    if existing_entry is None:
        initial_review_state = build_initial_review_state()
        existing_entry = WordbookEntry(
            user_id=user_id,
            latest_lesson_id=lesson.id,
            entry_text=canonical_text,
            normalized_text=normalized_text,
            entry_type=entry_type,
            latest_sentence_idx=sentence.idx,
            latest_sentence_en=str(sentence.text_en or ""),
            latest_sentence_zh=str(sentence.text_zh or ""),
            latest_collected_at=now_shanghai_naive(),
            next_review_at=initial_review_state.next_review_at,
            last_reviewed_at=initial_review_state.last_reviewed_at,
            review_count=initial_review_state.review_count,
            wrong_count=initial_review_state.wrong_count,
            memory_score=initial_review_state.memory_score,
            status=initial_review_state.status,
        )
    else:
        existing_entry.latest_lesson_id = lesson.id
        existing_entry.entry_text = canonical_text
        existing_entry.latest_sentence_idx = sentence.idx
        existing_entry.latest_sentence_en = str(sentence.text_en or "")
        existing_entry.latest_sentence_zh = str(sentence.text_zh or "")
        existing_entry.latest_collected_at = now_shanghai_naive()

    db.add(existing_entry)
    db.flush()

    source_link = get_wordbook_source_link(db, entry_id=existing_entry.id, lesson_id=lesson.id, sentence_idx=sentence.idx)
    if source_link is None:
        source_link = WordbookEntrySource(
            entry_id=existing_entry.id,
            lesson_id=lesson.id,
            sentence_idx=sentence.idx,
            sentence_en=str(sentence.text_en or ""),
            sentence_zh=str(sentence.text_zh or ""),
            first_collected_at=now_shanghai_naive(),
            last_collected_at=now_shanghai_naive(),
        )
    else:
        source_link.sentence_en = str(sentence.text_en or "")
        source_link.sentence_zh = str(sentence.text_zh or "")
        source_link.last_collected_at = now_shanghai_naive()

    db.add(source_link)
    db.commit()

    raw_payload = build_wordbook_entry_payload(db, entry_id=existing_entry.id, user_id=user_id)
    if not raw_payload:
        raise HTTPException(status_code=500, detail="词条保存后读取失败")
    return WordbookCollectResult(payload=_entry_payload_to_dict(raw_payload), created=created, updated_context=not created)


def list_wordbook_entry_payloads(
    db: Session,
    *,
    user_id: int,
    status: str = WORD_STATUS_ACTIVE,
    source_lesson_id: int | None = None,
    sort: str = WORD_SORT_RECENT,
) -> dict[str, object]:
    safe_status = str(status or WORD_STATUS_ACTIVE).strip().lower()
    if safe_status not in VALID_ENTRY_STATUSES:
        safe_status = WORD_STATUS_ACTIVE
    safe_sort = str(sort or WORD_SORT_RECENT).strip().lower()
    if safe_sort not in VALID_SORTS:
        safe_sort = WORD_SORT_RECENT
    safe_source_lesson_id = int(source_lesson_id or 0) or None

    rows, available_lessons = list_wordbook_entries(
        db,
        user_id=user_id,
        status=safe_status,
        source_lesson_id=safe_source_lesson_id,
        sort=safe_sort,
    )
    return {
        "items": [_entry_payload_to_dict(row) for row in rows],
        "available_lessons": available_lessons,
        "total": len(rows),
        "due_count": count_due_wordbook_entries(db, user_id=user_id),
        "status": safe_status,
        "sort": safe_sort,
        "source_lesson_id": safe_source_lesson_id,
    }


def update_wordbook_entry_status(db: Session, *, entry_id: int, user_id: int, status: str) -> dict[str, object]:
    safe_status = str(status or "").strip().lower()
    if safe_status not in VALID_ENTRY_STATUSES:
        raise HTTPException(status_code=400, detail="词条状态无效")
    entry = get_wordbook_entry_for_user(db, entry_id=entry_id, user_id=user_id)
    if not entry:
        raise HTTPException(status_code=404, detail="词条不存在")
    entry.status = safe_status
    db.add(entry)
    db.commit()
    raw_payload = build_wordbook_entry_payload(db, entry_id=entry_id, user_id=user_id)
    if not raw_payload:
        raise HTTPException(status_code=500, detail="词条更新后读取失败")
    return _entry_payload_to_dict(raw_payload)


def list_wordbook_review_queue_payloads(db: Session, *, user_id: int) -> dict[str, object]:
    rows = list_due_wordbook_entries(db, user_id=user_id)
    return {
        "items": [_entry_payload_to_dict(row) for row in rows],
        "total": len(rows),
    }


def review_wordbook_entry(db: Session, *, entry_id: int, user_id: int, grade: str) -> dict[str, object]:
    safe_grade = str(grade or "").strip().lower()
    if safe_grade not in REVIEW_GRADES:
        raise HTTPException(status_code=400, detail="复习反馈无效")
    entry = get_wordbook_entry_for_user(db, entry_id=entry_id, user_id=user_id)
    if not entry:
        raise HTTPException(status_code=404, detail="词条不存在")

    previous_memory_score = float(getattr(entry, "memory_score", 0.0) or 0.0)
    now = now_shanghai_naive()
    next_review = getattr(entry, "next_review_at", None)
    if next_review and next_review > now:
        previous_hours = (next_review - now).total_seconds() / 3600
        previous_interval = _format_interval_hours(previous_hours)
    else:
        previous_interval = "现在"

    review_update = apply_review_grade(
        grade=safe_grade,
        memory_score=previous_memory_score,
        review_count=int(getattr(entry, "review_count", 0) or 0),
        wrong_count=int(getattr(entry, "wrong_count", 0) or 0),
    )
    entry.next_review_at = review_update.next_review_at
    entry.last_reviewed_at = review_update.last_reviewed_at
    entry.review_count = review_update.review_count
    entry.wrong_count = review_update.wrong_count
    entry.memory_score = review_update.memory_score
    entry.status = review_update.status
    db.add(entry)
    db.commit()
    raw_payload = build_wordbook_entry_payload(db, entry_id=entry_id, user_id=user_id)
    if not raw_payload:
        raise HTTPException(status_code=500, detail="词条复习后读取失败")

    new_interval_hours = (review_update.next_review_at - now).total_seconds() / 3600
    new_interval = _format_interval_hours(new_interval_hours)
    interval_diff_hours = new_interval_hours - previous_hours if previous_hours > 0 else new_interval_hours
    if interval_diff_hours >= 0:
        interval_change = f"+{_format_interval_hours(interval_diff_hours)}"
    else:
        interval_change = _format_interval_hours(abs(interval_diff_hours))
    memory_score_change = review_update.memory_score - previous_memory_score

    return {
        "entry": _entry_payload_to_dict(raw_payload),
        "remaining_due": count_due_wordbook_entries(db, user_id=user_id),
        "review_result": {
            "previous_interval": previous_interval,
            "new_interval": new_interval,
            "interval_change": interval_change,
            "memory_score_change": round(memory_score_change, 4),
        },
    }


def delete_wordbook_entry(db: Session, *, entry_id: int, user_id: int) -> None:
    entry = get_wordbook_entry_for_user(db, entry_id=entry_id, user_id=user_id)
    if not entry:
        raise HTTPException(status_code=404, detail="词条不存在")
    db.delete(entry)
    db.commit()


def _format_interval_hours(hours: float) -> str:
    if hours < 1:
        return f"{int(round(hours * 60))}分钟后"
    if hours < 24:
        return f"{int(round(hours))}小时后"
    days = int(round(hours / 24))
    return f"{days}天后"


def _calculate_preview_grades(
    memory_score: float,
    review_count: int,
    wrong_count: int,
) -> list[dict[str, object]]:
    results = []
    for grade in REVIEW_GRADES:
        next_review_count = max(0, review_count) + 1
        next_wrong_count = max(0, wrong_count)
        if grade == "again":
            next_wrong_count += 1
        next_score = clamp_memory_score(memory_score + {
            "again": -0.28,
            "hard": 0.06,
            "good": 0.16,
            "easy": 0.26,
        }.get(grade, 0))
        interval_hours = _resolve_interval_hours(
            grade=grade,
            memory_score=next_score,
            review_count=next_review_count,
            wrong_count=next_wrong_count,
        )
        results.append({
            "grade": grade,
            "interval": _format_interval_hours(interval_hours),
            "interval_hours": float(interval_hours),
        })
    return results


def preview_wordbook_review_grades(db: Session, *, entry_id: int, user_id: int) -> dict[str, object]:
    entry = get_wordbook_entry_for_user(db, entry_id=entry_id, user_id=user_id)
    if not entry:
        raise HTTPException(status_code=404, detail="词条不存在")
    memory_score = float(getattr(entry, "memory_score", 0.0) or 0.0)
    review_count = int(getattr(entry, "review_count", 0) or 0)
    wrong_count = int(getattr(entry, "wrong_count", 0) or 0)
    grades = _calculate_preview_grades(
        memory_score=memory_score,
        review_count=review_count,
        wrong_count=wrong_count,
    )
    now = now_shanghai_naive()
    next_review = getattr(entry, "next_review_at", None)
    if next_review and next_review > now:
        hours_until = (next_review - now).total_seconds() / 3600
        current_interval = _format_interval_hours(hours_until)
    else:
        current_interval = "现在"
    return {
        "entry_id": int(entry.id),
        "current_interval": current_interval,
        "grades": grades,
    }
