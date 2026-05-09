"""Learning Dashboard — stats aggregation and AI coach endpoints."""

from __future__ import annotations

import csv
import logging
import os
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.api.routers.learning_sessions import get_study_time_dashboard as _get_study_time_dashboard
from app.api.routers.llm_shared import _require_api_key
from app.db import get_db
from app.models import (
    Lesson,
    LessonProgress,
    LessonSentence,
    ReadingPack,
    SOEResult,
    User,
    WordbookEntry,
)
from app.schemas.learning_session import DashboardStudyTimeResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

# ---------------------------------------------------------------------------
# Collins vocabulary lookup (loaded once)
# ---------------------------------------------------------------------------

_Collins_WORD_LEVEL: dict[str, str] = {}


def _load_collins_vocab() -> dict[str, str]:
    global _Collins_WORD_LEVEL
    if _Collins_WORD_LEVEL:
        return _Collins_WORD_LEVEL
    csv_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "collinsj-vocabulary-profile-1.5.csv")
    csv_path = os.path.normpath(csv_path)
    if not os.path.exists(csv_path):
        return _Collins_WORD_LEVEL
    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            word = (row.get("headword") or "").strip().lower()
            level = (row.get("Collins") or "").strip().upper()
            if word and level:
                _Collins_WORD_LEVEL[word] = level
    return _Collins_WORD_LEVEL


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class DailyActivity(BaseModel):
    date: str
    minutes: int = 0
    lessons: int = 0
    readings: int = 0


class SkillScores(BaseModel):
    listening: int = 0
    reading: int = 0
    vocabulary: int = 0
    grammar: int = 0
    speaking: int = 0


class DashboardStatsResponse(BaseModel):
    total_lessons: int = 0
    total_reading_packs: int = 0
    total_study_minutes: int = 0
    streak_days: int = 0
    vocabulary_count: int = 0
    vocabulary_by_level: dict[str, int] = {}
    lesson_completion_rate: float = 0.0
    reading_completion_rate: float = 0.0
    avg_soe_score: float = 0.0
    daily_activity: list[DailyActivity] = []
    skill_scores: SkillScores = SkillScores()


class AICoachRequest(BaseModel):
    stats: dict
    language: str = Field("zh", pattern=r"^(zh|en)$")


class AICoachResponse(BaseModel):
    ok: bool
    coach_text: str


# ---------------------------------------------------------------------------
# Stats aggregation helpers
# ---------------------------------------------------------------------------


def _compute_streak(active_dates: set[date]) -> int:
    if not active_dates:
        return 0
    today = date.today()
    streak = 0
    d = today
    while d in active_dates:
        streak += 1
        d -= timedelta(days=1)
    if streak == 0 and (today - timedelta(days=1)) in active_dates:
        d = today - timedelta(days=1)
        while d in active_dates:
            streak += 1
            d -= timedelta(days=1)
    return streak


def _build_dashboard_stats(db: Session, user_id: int) -> dict:
    uid = user_id

    # Basic counts
    total_lessons = db.query(func.count(Lesson.id)).filter(Lesson.user_id == uid).scalar() or 0
    total_reading_packs = db.query(func.count(ReadingPack.id)).filter(ReadingPack.user_id == uid).scalar() or 0
    vocabulary_count = (
        db.query(func.count(WordbookEntry.id))
        .filter(WordbookEntry.user_id == uid, WordbookEntry.status == "active")
        .scalar()
        or 0
    )

    # Study minutes — from lesson duration_ms
    lesson_minutes_raw = (
        db.query(func.coalesce(func.sum(Lesson.duration_ms), 0)).filter(Lesson.user_id == uid).scalar() or 0
    )
    total_study_minutes = lesson_minutes_raw // 60000
    # Add reading estimate: ~5 min per reading pack
    total_study_minutes += total_reading_packs * 5

    # SOE average
    avg_soe = db.query(func.avg(SOEResult.total_score)).filter(SOEResult.user_id == uid).scalar()
    avg_soe_score = round(float(avg_soe), 1) if avg_soe else 0.0

    # Completion rates
    lesson_completion_rate = 0.0
    if total_lessons > 0:
        completed_count = 0
        progresses = (
            db.query(LessonProgress.lesson_id, LessonProgress.completed_indexes_json)
            .filter(LessonProgress.user_id == uid)
            .all()
        )
        for lp_lesson_id, completed_json in progresses:
            completed_indexes = completed_json or []
            sentence_count = (
                db.query(func.count(LessonSentence.id))
                .filter(LessonSentence.lesson_id == lp_lesson_id)
                .scalar()
                or 0
            )
            if sentence_count > 0 and len(completed_indexes) >= sentence_count:
                completed_count += 1
        lesson_completion_rate = round(completed_count / total_lessons, 2)

    reading_completion_rate = 0.0
    if total_reading_packs > 0:
        completed_readings = (
            db.query(func.count(ReadingPack.id))
            .filter(ReadingPack.user_id == uid, ReadingPack.flow_status == "completed")
            .scalar()
            or 0
        )
        reading_completion_rate = round(completed_readings / total_reading_packs, 2)

    # Vocabulary by Collins level
    vocab_by_level: dict[str, int] = {"A1": 0, "A2": 0, "B1": 0, "B2": 0, "C1": 0}
    collins_vocab = _load_collins_vocab()
    if collins_vocab:
        words = (
            db.query(WordbookEntry.normalized_text)
            .filter(WordbookEntry.user_id == uid, WordbookEntry.status == "active")
            .all()
        )
        for (word_text,) in words:
            level = collins_vocab.get((word_text or "").lower().strip())
            if level and level in vocab_by_level:
                vocab_by_level[level] += 1

    # Daily activity (last 90 days)
    cutoff = datetime.now() - timedelta(days=90)
    daily_map: dict[str, dict] = defaultdict(lambda: {"minutes": 0, "lessons": 0, "readings": 0})

    lesson_rows = (
        db.query(
            func.date(Lesson.created_at).label("d"),
            func.count(Lesson.id),
            func.coalesce(func.sum(Lesson.duration_ms), 0),
        )
        .filter(Lesson.user_id == uid, Lesson.created_at >= cutoff)
        .group_by(func.date(Lesson.created_at))
        .all()
    )
    for d, cnt, dur_ms in lesson_rows:
        ds = str(d)
        daily_map[ds]["lessons"] += cnt
        daily_map[ds]["minutes"] += dur_ms // 60000

    reading_rows = (
        db.query(
            func.date(ReadingPack.created_at).label("d"),
            func.count(ReadingPack.id),
        )
        .filter(ReadingPack.user_id == uid, ReadingPack.created_at >= cutoff)
        .group_by(func.date(ReadingPack.created_at))
        .all()
    )
    for d, cnt in reading_rows:
        ds = str(d)
        daily_map[ds]["readings"] += cnt
        daily_map[ds]["minutes"] += cnt * 5

    daily_activity = sorted(
        [DailyActivity(date=k, **v) for k, v in daily_map.items()],
        key=lambda x: x.date,
    )

    # Streak days
    active_dates: set[date] = set()
    for da in daily_activity:
        try:
            active_dates.add(date.fromisoformat(da.date))
        except ValueError:
            pass
    # Also include SOE result dates
    soe_dates = (
        db.query(func.date(SOEResult.created_at))
        .filter(SOEResult.user_id == uid, SOEResult.created_at >= cutoff)
        .distinct()
        .all()
    )
    for (sd,) in soe_dates:
        if sd:
            try:
                active_dates.add(sd if isinstance(sd, date) else date.fromisoformat(str(sd)))
            except (ValueError, TypeError):
                pass

    streak_days = _compute_streak(active_dates)

    # Skill scores (heuristic 0-100)
    listening_score = min(100, int(lesson_completion_rate * 80 + (avg_soe_score * 0.2 if avg_soe_score else 0)))
    reading_score = min(100, int(reading_completion_rate * 90 + total_reading_packs * 1))
    vocab_score = min(100, int(vocabulary_count / 20 * 10)) if vocabulary_count else 0
    grammar_score = min(100, max(30, int((listening_score + reading_score) / 2 * 0.8)))
    speaking_score = min(100, int(avg_soe_score)) if avg_soe_score else 0

    skill_scores = SkillScores(
        listening=listening_score,
        reading=reading_score,
        vocabulary=vocab_score,
        grammar=grammar_score,
        speaking=speaking_score,
    )

    return DashboardStatsResponse(
        total_lessons=total_lessons,
        total_reading_packs=total_reading_packs,
        total_study_minutes=total_study_minutes,
        streak_days=streak_days,
        vocabulary_count=vocabulary_count,
        vocabulary_by_level=vocab_by_level,
        lesson_completion_rate=lesson_completion_rate,
        reading_completion_rate=reading_completion_rate,
        avg_soe_score=avg_soe_score,
        daily_activity=daily_activity,
        skill_scores=skill_scores,
    ).model_dump()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _build_dashboard_stats(db, current_user.id)


@router.get("/study-time", response_model=DashboardStudyTimeResponse)
def get_dashboard_study_time(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_study_time_dashboard(db=db, current_user=current_user)


# ---------------------------------------------------------------------------
# AI Coach
# ---------------------------------------------------------------------------

_COACH_SYSTEM_ZH = (
    "你是一位经验丰富、温暖专业的英语学习教练。\n"
    "根据学生的学习数据给出个性化点评和建议，200-400字。\n"
    "要求：\n"
    "1. 分析学习习惯（连续性、频率、时长）\n"
    "2. 判断能力强项和弱项\n"
    "3. 给出具体的、可执行的下一步建议（如\"建议用B1难度的新闻材料做听写\"）\n"
    "4. 预测当前大致Collins等级\n"
    "语气像真人教练，亲切但专业。用\"我注意到...\"\"建议你...\"这样的语气。"
)

_COACH_SYSTEM_EN = (
    "You are an experienced, warm, and professional English learning coach.\n"
    "Based on the student's learning data, give personalized feedback and advice in 200-400 words.\n"
    "Requirements:\n"
    "1. Analyze learning habits (consistency, frequency, duration)\n"
    "2. Identify strengths and weaknesses\n"
    "3. Give specific, actionable next-step suggestions (e.g. 'Try dictation with B1-level news articles')\n"
    "4. Predict approximate Collins level\n"
    "Speak like a real coach — warm but professional. Use phrases like 'I've noticed...', 'I'd suggest...'"
)


def _build_coach_messages(stats: dict, language: str) -> list[dict]:
    system = _COACH_SYSTEM_ZH if language == "zh" else _COACH_SYSTEM_EN
    summary_parts = [
        f"Total lessons completed: {stats.get('total_lessons', 0)}",
        f"Total reading packs: {stats.get('total_reading_packs', 0)}",
        f"Study minutes: {stats.get('total_study_minutes', 0)}",
        f"Streak days: {stats.get('streak_days', 0)}",
        f"Vocabulary count: {stats.get('vocabulary_count', 0)}",
        f"Vocabulary by Collins level: {stats.get('vocabulary_by_level', {})}",
        f"Lesson completion rate: {stats.get('lesson_completion_rate', 0)}",
        f"Reading completion rate: {stats.get('reading_completion_rate', 0)}",
        f"Average speaking score: {stats.get('avg_soe_score', 0)}",
        f"Skill scores: {stats.get('skill_scores', {})}",
    ]
    user_msg = "Here is the student's learning data:\n" + "\n".join(summary_parts)
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_msg},
    ]


@router.post("/ai-coach", response_model=AICoachResponse)
def ai_coach_endpoint(
    body: AICoachRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.api.routers import llm as llm_root

    api_key = _require_api_key()
    llm_root.ensure_default_billing_rates(db)

    messages = _build_coach_messages(body.stats, body.language)

    try:
        raw_response, usage = llm_root.call_deepseek(
            messages=messages,
            api_key=api_key,
            enable_thinking=False,
            stream=False,
            temperature=0.7,
        )
    except Exception as exc:
        logger.warning("AI coach LLM call failed: %s", exc)
        raise HTTPException(status_code=503, detail="AI coach generation failed") from exc

    if not raw_response or not raw_response.strip():
        raise HTTPException(status_code=503, detail="AI coach returned empty response")

    # Billing — silent failure
    try:
        rate = llm_root.get_model_rate(db, llm_root.LLM_MODEL_DEEPSEEK_FAST)
        if rate:
            total_tokens = usage.prompt_tokens + usage.completion_tokens
            charge = llm_root.calculate_llm_charge_by_tokens(
                total_tokens=total_tokens,
                points_per_1k_tokens=rate.points_per_1k_tokens,
            )
            if charge > 0:
                llm_root.consume_points(
                    db,
                    user_id=current_user.id,
                    points=charge,
                    model_name=llm_root.LLM_MODEL_DEEPSEEK_FAST,
                    lesson_id=None,
                    event_type=llm_root.EVENT_CONSUME_LLM,
                    note=f"ai coach, tokens={total_tokens}",
                )
                db.commit()
    except Exception:
        logger.warning("AI coach billing failed silently for user %s", current_user.id)

    return AICoachResponse(ok=True, coach_text=raw_response.strip())

