from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta

from sqlalchemy import case, func, inspect, select, text
from sqlalchemy.orm import Session

from app.core.timezone import now_shanghai_naive, to_shanghai_aware
from app.db import APP_SCHEMA
from app.models.billing import WalletAccount, WalletLedger
from app.models.learning_stats import UserLearningDailyStat
from app.models.lesson import Lesson, LessonProgress, LessonSentence
from app.repositories.learning_stats import apply_learning_daily_activity, list_learning_daily_stats


logger = logging.getLogger(__name__)
SUMMARY_RANGE_DAYS = {7, 30}
STALLED_DAYS_THRESHOLD = 3
RHYTHM_WARNING_DAYS = 1
LEVEL_STEP_POINTS = 120
DAILY_PRACTICE_TARGET = 3

STAGE_LABELS: tuple[tuple[int, str, str], ...] = (
    (1, "spark", "点火学徒"),
    (3, "rhythm", "节律巡航者"),
    (5, "forge", "连击锻造者"),
    (8, "steady", "稳态攻坚者"),
    (12, "marathon", "长期主义者"),
)


def ensure_learning_stats_schema(db: Session) -> bool:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("learning_stats schema repair missing bind")

    schema = None if bind.dialect.name == "sqlite" else APP_SCHEMA
    inspector = inspect(bind)
    changed = False

    if bind.dialect.name != "sqlite":
        db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        db.commit()

    if not inspector.has_table(UserLearningDailyStat.__tablename__, schema=schema):
        logger.warning("[DEBUG] learning_stats.schema_repair_create_table")
        UserLearningDailyStat.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        changed = True

    return changed


def record_progress_activity(
    db: Session,
    *,
    user_id: int,
    previous_completed_indexes: list[int] | None,
    next_completed_indexes: list[int] | None,
    completed_lesson: bool = False,
    stalled_recovery: bool = False,
    previous_current_sentence_index: int | None = None,
    next_current_sentence_index: int | None = None,
    previous_last_played_at_ms: int | None = None,
    next_last_played_at_ms: int | None = None,
    event_time: datetime | None = None,
) -> None:
    ensure_learning_stats_schema(db)
    at = event_time or now_shanghai_naive()
    previous = {int(item) for item in list(previous_completed_indexes or []) if isinstance(item, int)}
    current = {int(item) for item in list(next_completed_indexes or []) if isinstance(item, int)}
    completed_delta = max(0, len(current - previous))
    current_sentence_advanced = max(0, int(next_current_sentence_index or 0)) > max(0, int(previous_current_sentence_index or 0))
    playback_advanced = max(0, int(next_last_played_at_ms or 0)) > max(0, int(previous_last_played_at_ms or 0))
    learning_actions_delta = 1 if completed_delta > 0 or current_sentence_advanced or playback_advanced or stalled_recovery else 0
    apply_learning_daily_activity(
        db,
        user_id=user_id,
        stat_date=at.date(),
        event_time=at,
        completed_delta=completed_delta,
        learning_actions_delta=learning_actions_delta,
        growth_points_delta=(completed_delta * 12) + (24 if completed_lesson else 0),
        task_completions_delta=(1 if completed_delta > 0 else 0) + (1 if completed_lesson else 0),
        completed_lessons_delta=1 if completed_lesson else 0,
    )


def record_check_activity(
    db: Session,
    *,
    user_id: int,
    passed: bool,
    event_time: datetime | None = None,
) -> None:
    ensure_learning_stats_schema(db)
    at = event_time or now_shanghai_naive()
    apply_learning_daily_activity(
        db,
        user_id=user_id,
        stat_date=at.date(),
        event_time=at,
        check_attempts_delta=1,
        check_passes_delta=1 if passed else 0,
        learning_actions_delta=1,
        growth_points_delta=5 if passed else 0,
        task_completions_delta=1 if passed else 0,
    )


def _date_label(value: date) -> str:
    return value.strftime("%m-%d")


def _start_of_day(value: date) -> datetime:
    return datetime.combine(value, time.min)


def _end_of_day_exclusive(value: date) -> datetime:
    return _start_of_day(value + timedelta(days=1))


def _is_active_day(row: UserLearningDailyStat | None) -> bool:
    if row is None:
        return False
    return bool(
        int(getattr(row, "learning_actions", 0) or 0) > 0
        or int(getattr(row, "growth_points", 0) or 0) > 0
        or int(getattr(row, "task_completions", 0) or 0) > 0
    )


def _build_streak_days(activity_dates: set[date]) -> int:
    if not activity_dates:
        return 0
    cursor = max(activity_dates)
    streak = 0
    while cursor in activity_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _build_best_streak_days(activity_dates: set[date]) -> int:
    if not activity_dates:
        return 0
    ordered_dates = sorted(activity_dates)
    best = 0
    current = 0
    previous: date | None = None
    for item in ordered_dates:
        if previous is not None and item == previous + timedelta(days=1):
            current += 1
        else:
            current = 1
        best = max(best, current)
        previous = item
    return best


def _serialize_lesson_target(item: dict | None) -> dict | None:
    if not item:
        return None
    return {
        "lesson_id": int(item["lesson_id"]),
        "title": str(item["title"]),
        "sentence_count": int(item["sentence_count"]),
        "completed_sentence_count": int(item["completed_sentence_count"]),
        "progress_percent": float(item["progress_percent"]),
        "updated_at": to_shanghai_aware(item.get("updated_at")),
    }


def _load_lesson_progress_rows(db: Session, *, user_id: int) -> list[dict[str, object]]:
    sentence_count_sq = (
        select(LessonSentence.lesson_id.label("lesson_id"), func.count(LessonSentence.id).label("sentence_count"))
        .group_by(LessonSentence.lesson_id)
        .subquery()
    )
    progress_sq = (
        select(
            LessonProgress.lesson_id.label("lesson_id"),
            LessonProgress.current_sentence_idx.label("current_sentence_idx"),
            LessonProgress.completed_indexes_json.label("completed_indexes_json"),
            LessonProgress.last_played_at_ms.label("last_played_at_ms"),
            LessonProgress.updated_at.label("updated_at"),
        )
        .where(LessonProgress.user_id == user_id)
        .subquery()
    )
    rows = db.execute(
        select(
            Lesson.id,
            Lesson.title,
            Lesson.created_at,
            func.coalesce(sentence_count_sq.c.sentence_count, 0).label("sentence_count"),
            progress_sq.c.current_sentence_idx,
            progress_sq.c.completed_indexes_json,
            progress_sq.c.last_played_at_ms,
            progress_sq.c.updated_at,
        )
        .outerjoin(sentence_count_sq, sentence_count_sq.c.lesson_id == Lesson.id)
        .outerjoin(progress_sq, progress_sq.c.lesson_id == Lesson.id)
        .where(Lesson.user_id == user_id)
        .order_by(Lesson.created_at.desc(), Lesson.id.desc())
    ).all()

    items: list[dict[str, object]] = []
    for lesson_id, title, created_at, sentence_count, current_sentence_idx, completed_indexes_json, last_played_at_ms, updated_at in rows:
        completed_indexes = [int(item) for item in list(completed_indexes_json or [])]
        completed_sentence_count = min(len(completed_indexes), max(0, int(sentence_count or 0)))
        sentence_total = max(0, int(sentence_count or 0))
        progress_percent = round((completed_sentence_count / sentence_total) * 100, 1) if sentence_total else 0.0
        has_progress = bool(
            completed_sentence_count > 0
            or int(current_sentence_idx or 0) > 0
            or int(last_played_at_ms or 0) > 0
            or updated_at is not None
        )
        items.append(
            {
                "lesson_id": int(lesson_id),
                "title": str(title or ""),
                "created_at": created_at,
                "sentence_count": sentence_total,
                "completed_sentence_count": completed_sentence_count,
                "progress_percent": progress_percent,
                "current_sentence_index": max(0, int(current_sentence_idx or 0)),
                "last_played_at_ms": max(0, int(last_played_at_ms or 0)),
                "updated_at": updated_at,
                "is_completed": sentence_total > 0 and completed_sentence_count >= sentence_total,
                "has_progress": has_progress,
            }
        )
    return items


def _level_payload(total_growth_points: int) -> dict[str, object]:
    safe_points = max(0, int(total_growth_points or 0))
    level = (safe_points // LEVEL_STEP_POINTS) + 1
    level_floor = (level - 1) * LEVEL_STEP_POINTS
    next_level_points = level * LEVEL_STEP_POINTS
    level_progress_points = safe_points - level_floor
    level_progress_percent = round((level_progress_points / LEVEL_STEP_POINTS) * 100, 1) if LEVEL_STEP_POINTS else 0.0
    stage_key = STAGE_LABELS[0][1]
    stage_label = STAGE_LABELS[0][2]
    for minimum_level, key, label in STAGE_LABELS:
        if level >= minimum_level:
            stage_key = key
            stage_label = label
    return {
        "level": level,
        "stage_key": stage_key,
        "stage_label": stage_label,
        "next_level_points": next_level_points,
        "points_to_next_level": max(0, next_level_points - safe_points),
        "level_progress_percent": level_progress_percent,
    }


def _choose_action_target(
    *,
    lesson_total: int,
    stalled_lesson: dict | None,
    near_completion_lesson: dict | None,
    continue_lesson: dict | None,
) -> tuple[str, str, int | None]:
    if lesson_total <= 0:
        return "switch-upload", "去上传素材", None
    target = stalled_lesson or near_completion_lesson or continue_lesson
    if target:
        return "resume-lesson", "继续这节课", int(target["lesson_id"])
    return "history", "去历史记录", None


def _format_percent(value: float) -> str:
    return f"{float(value or 0):.1f}%"


def _build_primary_recommendation(
    *,
    lesson_total: int,
    continue_lesson: dict | None,
    stalled_lesson: dict | None,
    near_completion_lesson: dict | None,
    today: date,
) -> dict[str, object]:
    if stalled_lesson:
        updated_at = stalled_lesson.get("updated_at")
        gap_days = max(1, (today - updated_at.date()).days) if isinstance(updated_at, datetime) else STALLED_DAYS_THRESHOLD
        return {
            "kind": "resume-stalled",
            "title": "先救回快完成却停住的课",
            "description": f"《{stalled_lesson['title']}》已停了 {gap_days} 天，现在接回来最容易恢复节奏。",
            "action_label": "继续这节课",
            "lesson_id": int(stalled_lesson["lesson_id"]),
        }
    if near_completion_lesson:
        remaining = max(
            0,
            int(near_completion_lesson["sentence_count"]) - int(near_completion_lesson["completed_sentence_count"]),
        )
        return {
            "kind": "finish-near-completion",
            "title": "把快学完的课收尾",
            "description": f"《{near_completion_lesson['title']}》还差 {remaining} 句，先拿下完整闭环。",
            "action_label": "继续完成",
            "lesson_id": int(near_completion_lesson["lesson_id"]),
        }
    if lesson_total <= 0:
        return {
            "kind": "start-first-upload",
            "title": "先生成第一节课",
            "description": "还没有可学内容，先上传一份素材，后续面板才会开始积累趋势、风险和建议。",
            "action_label": "去上传素材",
            "lesson_id": None,
        }
    if continue_lesson:
        return {
            "kind": "continue-learning",
            "title": "从最近在学的课程继续",
            "description": f"《{continue_lesson['title']}》已经推进到 {int(round(float(continue_lesson['progress_percent'])))}%，继续最顺手。",
            "action_label": "继续学习",
            "lesson_id": int(continue_lesson["lesson_id"]),
        }
    return {
        "kind": "open-history",
        "title": "先从历史课程里挑一节继续",
        "description": "你已经有课程了，但暂时没有明确优先项，可以从最近生成的内容开始。",
        "action_label": "去历史记录",
        "lesson_id": None,
    }


def _build_momentum_label(*, is_active_today: bool, stalled_lessons: int, streak_days: int) -> str:
    if is_active_today:
        return "今日已点亮"
    if stalled_lessons > 0:
        return "优先回收停滞课"
    if streak_days >= 3:
        return "连续节奏进行中"
    return "今天先完成一轮"


def _build_hero(
    *,
    level_payload: dict[str, object],
    recommendation: dict[str, object],
    streak_days: int,
    total_growth_points: int,
    stalled_lessons: int,
    is_active_today: bool,
) -> dict[str, object]:
    return {
        "title": recommendation["title"],
        "subtitle": recommendation["description"],
        "level": int(level_payload["level"]),
        "stage_label": str(level_payload["stage_label"]),
        "streak_days": streak_days,
        "growth_points": max(0, int(total_growth_points or 0)),
        "level_progress_percent": float(level_payload["level_progress_percent"]),
        "next_level_points": int(level_payload["next_level_points"]),
        "points_to_next_level": int(level_payload["points_to_next_level"]),
        "momentum_label": _build_momentum_label(
            is_active_today=is_active_today,
            stalled_lessons=stalled_lessons,
            streak_days=streak_days,
        ),
    }


def _build_today_tasks(
    *,
    lesson_total: int,
    is_active_today: bool,
    continue_lesson: dict | None,
    stalled_lesson: dict | None,
    near_completion_lesson: dict | None,
    check_passes_in_range: int,
    completed_sentences_in_range: int,
) -> list[dict[str, object]]:
    tasks: list[dict[str, object]] = []
    if lesson_total <= 0:
        tasks.append(
            {
                "key": "start-first-course",
                "title": "上传第一份素材",
                "description": "先把第一节课生成出来，后续的进度、风险和建议才有真实依据。",
                "action_label": "去上传素材",
                "action_kind": "switch-upload",
                "xp_reward": 12,
                "status": "todo",
                "tone": "default",
                "lesson_id": None,
            }
        )
        tasks.append(
            {
                "key": "finish-first-chain",
                "title": "跑通首次生成链路",
                "description": "确认素材能成功进入历史记录，避免上传后一直转圈却没有结果。",
                "action_label": "查看历史记录",
                "action_kind": "history",
                "xp_reward": 8,
                "status": "todo",
                "tone": "default",
                "lesson_id": None,
            }
        )
        tasks.append(
            {
                "key": "learn-first-lesson",
                "title": "完成第一轮学习",
                "description": "进入课程后至少完成一句跟读或识别校验，面板才会开始记录成长。",
                "action_label": "先去生成课程",
                "action_kind": "switch-upload",
                "xp_reward": 5,
                "status": "todo",
                "tone": "default",
                "lesson_id": None,
            }
        )
        return tasks

    tasks.append(
        {
            "key": "today-practice",
            "title": "完成今天的第一轮学习",
            "description": "先把今天的学习点亮，再决定继续哪节课。",
            "action_label": "查看课程列表" if is_active_today else "现在去学习",
            "action_kind": "history",
            "xp_reward": 10,
            "status": "done" if is_active_today else "focus",
            "tone": "success" if is_active_today else "default",
            "lesson_id": None,
        }
    )

    if stalled_lesson:
        tasks.append(
            {
                "key": "resume-stalled",
                "title": "先救回停滞课程",
                "description": f"《{stalled_lesson['title']}》进度高但已停住，先续上最容易找回状态。",
                "action_label": "继续这节课",
                "action_kind": "resume-lesson",
                "xp_reward": 16,
                "status": "focus" if not is_active_today else "todo",
                "tone": "warning",
                "lesson_id": int(stalled_lesson["lesson_id"]),
            }
        )
    elif near_completion_lesson:
        tasks.append(
            {
                "key": "finish-near-completion",
                "title": "把快完成的课收尾",
                "description": f"《{near_completion_lesson['title']}》马上就能学完，先拿到完整闭环。",
                "action_label": "继续完成",
                "action_kind": "resume-lesson",
                "xp_reward": 14,
                "status": "focus" if not is_active_today else "todo",
                "tone": "default",
                "lesson_id": int(near_completion_lesson["lesson_id"]),
            }
        )
    elif continue_lesson:
        tasks.append(
            {
                "key": "continue-current",
                "title": "继续最近在学的课",
                "description": f"《{continue_lesson['title']}》最接近你的当前上下文，继续成本最低。",
                "action_label": "继续学习",
                "action_kind": "resume-lesson",
                "xp_reward": 12,
                "status": "todo" if is_active_today else "focus",
                "tone": "default",
                "lesson_id": int(continue_lesson["lesson_id"]),
            }
        )

    tasks.append(
        {
            "key": "check-loop",
            "title": "做一次识别校验",
            "description": "跟读校验能更快暴露字幕、断句和可学性问题。",
            "action_label": "去课程里练习" if continue_lesson or stalled_lesson or near_completion_lesson else "查看历史记录",
            "action_kind": "resume-lesson" if continue_lesson or stalled_lesson or near_completion_lesson else "history",
            "xp_reward": 5,
            "status": "done" if check_passes_in_range > 0 else ("todo" if completed_sentences_in_range > 0 else "focus"),
            "tone": "success" if check_passes_in_range > 0 else "default",
            "lesson_id": int((stalled_lesson or near_completion_lesson or continue_lesson or {}).get("lesson_id") or 0) or None,
        }
    )
    return tasks[:3]


def _build_risk_cards(
    *,
    lesson_total: int,
    pass_rate_in_range: float,
    check_attempts_in_range: int,
    active_days_in_range: int,
    unfinished_lessons: int,
    stalled_lesson: dict | None,
) -> list[dict[str, object]]:
    cards: list[dict[str, object]] = []
    if lesson_total <= 0:
        return [
            {
                "key": "start-chain",
                "title": "还没有跑通第一条生成链路",
                "description": "现在最大的风险不是学习中断，而是上传后没有真正产出一节可学习的课程。",
                "severity": "info",
                "action_label": "去上传素材",
                "action_kind": "switch-upload",
                "lesson_id": None,
            },
            {
                "key": "missing-baseline",
                "title": "暂时没有可用样本",
                "description": "没有首节课程时，前端也无法判断是上传、转写、翻译还是保存阶段出了问题。",
                "severity": "warning",
                "action_label": "先生成一节课",
                "action_kind": "switch-upload",
                "lesson_id": None,
            },
        ]

    if stalled_lesson:
        cards.append(
            {
                "key": "unfinished-backlog",
                "title": "有高进度课程停滞",
                "description": f"《{stalled_lesson['title']}》已经接近完成，但停下太久，会直接打断连续反馈。",
                "severity": "danger",
                "action_label": "回到这节课",
                "action_kind": "resume-lesson",
                "lesson_id": int(stalled_lesson["lesson_id"]),
            }
        )
    if unfinished_lessons >= 3:
        cards.append(
            {
                "key": "too-many-open-lessons",
                "title": "未完成课程偏多",
                "description": f"当前还有 {unfinished_lessons} 节未完成课程，继续分散注意力会降低收尾率。",
                "severity": "warning",
                "action_label": "优先收尾课程",
                "action_kind": "history",
                "lesson_id": None,
            }
        )
    if check_attempts_in_range >= 3 and pass_rate_in_range < 60:
        cards.append(
            {
                "key": "low-check-pass-rate",
                "title": "近阶段识别通过率偏低",
                "description": "如果字幕、翻译或断句不稳定，跟读校验会先出现明显掉通过率。",
                "severity": "warning",
                "action_label": "回看最近课程",
                "action_kind": "history",
                "lesson_id": None,
            }
        )
    if active_days_in_range <= RHYTHM_WARNING_DAYS:
        cards.append(
            {
                "key": "rhythm-drop",
                "title": "近期学习节奏偏弱",
                "description": "连续学习天数一旦断掉，后续更容易出现只生成不学习、只上传不收尾的情况。",
                "severity": "info",
                "action_label": "今天先完成一轮",
                "action_kind": "history",
                "lesson_id": None,
            }
        )
    return cards[:3]


def _build_milestones(
    *,
    streak_days: int,
    total_growth_points: int,
    lesson_completed_total: int,
) -> list[dict[str, object]]:
    return [
        {
            "key": "streak-3",
            "label": "连续 3 天学习",
            "value": f"当前 {streak_days} / 3 天",
            "hint": "先稳定节奏，再追求更高强度。",
            "achieved": streak_days >= 3,
        },
        {
            "key": "growth-120",
            "label": "累计 120 成长值",
            "value": f"当前 {total_growth_points} / 120 XP",
            "hint": "达到后会进入下一个成长等级。",
            "achieved": total_growth_points >= LEVEL_STEP_POINTS,
        },
        {
            "key": "finish-first-lesson",
            "label": "完成第一节课程",
            "value": f"已完成 {lesson_completed_total} 节课程",
            "hint": "完整闭环比只上传不收尾更有价值。",
            "achieved": lesson_completed_total >= 1,
        },
    ]


def build_learning_progress_summary(
    db: Session,
    *,
    user_id: int,
    range_days: int,
    now: datetime | None = None,
) -> dict[str, object]:
    ensure_learning_stats_schema(db)
    safe_range_days = int(range_days or 7)
    if safe_range_days not in SUMMARY_RANGE_DAYS:
        raise ValueError(f"unsupported range_days: {safe_range_days}")

    current_time = now or now_shanghai_naive()
    end_date = current_time.date()
    start_date = end_date - timedelta(days=safe_range_days - 1)
    start_at = _start_of_day(start_date)
    end_exclusive = _end_of_day_exclusive(end_date)

    all_daily_stats = list_learning_daily_stats(db, user_id=user_id)
    range_daily_stats = [item for item in all_daily_stats if start_date <= item.stat_date <= end_date]
    range_map = {item.stat_date: item for item in range_daily_stats}

    activity_dates_all = {item.stat_date for item in all_daily_stats if _is_active_day(item)}
    activity_dates_range = {item.stat_date for item in range_daily_stats if _is_active_day(item)}
    today_row = range_map.get(end_date)
    is_active_today = _is_active_day(today_row)

    completed_sentences_in_range = sum(int(item.completed_sentences or 0) for item in range_daily_stats)
    check_attempts_in_range = sum(int(item.check_attempts or 0) for item in range_daily_stats)
    check_passes_in_range = sum(int(item.check_passes or 0) for item in range_daily_stats)
    completed_lessons_in_range = sum(int(item.completed_lessons or 0) for item in range_daily_stats)
    growth_points_in_range = sum(int(item.growth_points or 0) for item in range_daily_stats)
    total_growth_points = sum(int(item.growth_points or 0) for item in all_daily_stats)
    mission_days_in_range = sum(1 for item in range_daily_stats if int(item.task_completions or 0) >= DAILY_PRACTICE_TARGET)
    active_days_in_range = len(activity_dates_range)
    total_active_days = len(activity_dates_all)
    streak_days = _build_streak_days(activity_dates_all)
    best_streak_days = _build_best_streak_days(activity_dates_all)
    recent_learning_at = max((item.last_learning_at for item in all_daily_stats if item.last_learning_at), default=None)
    pass_rate_in_range = round((check_passes_in_range / check_attempts_in_range) * 100, 1) if check_attempts_in_range else 0.0

    chart_points: list[dict[str, object]] = []
    for offset in range(safe_range_days):
        current_date = start_date + timedelta(days=offset)
        row = range_map.get(current_date)
        attempts = int(getattr(row, "check_attempts", 0) or 0)
        passes = int(getattr(row, "check_passes", 0) or 0)
        chart_points.append(
            {
                "label": _date_label(current_date),
                "完成句子": int(getattr(row, "completed_sentences", 0) or 0),
                "成长值": int(getattr(row, "growth_points", 0) or 0),
                "通过率": round((passes / attempts) * 100, 1) if attempts else 0.0,
            }
        )

    lesson_rows = _load_lesson_progress_rows(db, user_id=user_id)
    lesson_total = len(lesson_rows)
    lesson_completed_total = sum(1 for item in lesson_rows if item["is_completed"])
    lesson_in_progress_rows = [item for item in lesson_rows if item["has_progress"] and not item["is_completed"]]
    lesson_in_progress_total = len(lesson_in_progress_rows)
    sentence_total = sum(int(item["sentence_count"]) for item in lesson_rows)
    sentence_completed_total = sum(int(item["completed_sentence_count"]) for item in lesson_rows)
    completion_rate = round((sentence_completed_total / sentence_total) * 100, 1) if sentence_total else 0.0
    unfinished_lessons = max(0, lesson_total - lesson_completed_total)

    continue_candidates = sorted(
        [item for item in lesson_rows if not item["is_completed"]],
        key=lambda item: (
            item["updated_at"] or item["created_at"] or datetime.min,
            float(item["progress_percent"]),
            int(item["lesson_id"]),
        ),
        reverse=True,
    )
    continue_lesson = continue_candidates[0] if continue_candidates else None

    stalled_before = current_time - timedelta(days=STALLED_DAYS_THRESHOLD)
    stalled_candidates = sorted(
        [
            item
            for item in lesson_in_progress_rows
            if isinstance(item.get("updated_at"), datetime) and item["updated_at"] <= stalled_before
        ],
        key=lambda item: (
            float(item["progress_percent"]),
            item["updated_at"] or datetime.min,
            int(item["lesson_id"]),
        ),
        reverse=True,
    )
    stalled_lesson = stalled_candidates[0] if stalled_candidates else None
    stalled_lessons = len(stalled_candidates)

    near_completion_candidates = sorted(
        [item for item in lesson_in_progress_rows if float(item["progress_percent"]) >= 75.0],
        key=lambda item: (
            float(item["progress_percent"]),
            item["updated_at"] or item["created_at"] or datetime.min,
            int(item["lesson_id"]),
        ),
        reverse=True,
    )
    near_completion_lesson = near_completion_candidates[0] if near_completion_candidates else None

    consumed_points_in_range = int(
        db.scalar(
            select(
                func.coalesce(
                    func.sum(case((WalletLedger.delta_amount_cents < 0, -WalletLedger.delta_amount_cents), else_=0)),
                    0,
                )
            ).where(
                WalletLedger.user_id == user_id,
                WalletLedger.created_at >= start_at,
                WalletLedger.created_at < end_exclusive,
                WalletLedger.event_type.in_(["consume", "consume_translate"]),
            )
        )
        or 0
    )
    account = db.scalar(select(WalletAccount).where(WalletAccount.user_id == user_id))
    balance_points = int(getattr(account, "balance_points", 0) or 0)

    level_payload = _level_payload(total_growth_points)
    primary_recommendation = _build_primary_recommendation(
        lesson_total=lesson_total,
        continue_lesson=continue_lesson,
        stalled_lesson=stalled_lesson,
        near_completion_lesson=near_completion_lesson,
        today=end_date,
    )
    action_kind, action_label, action_lesson_id = _choose_action_target(
        lesson_total=lesson_total,
        stalled_lesson=stalled_lesson,
        near_completion_lesson=near_completion_lesson,
        continue_lesson=continue_lesson,
    )

    summary = {
        "streak_days": streak_days,
        "current_streak_days": streak_days,
        "best_streak_days": best_streak_days,
        "active_days_in_range": active_days_in_range,
        "total_active_days": total_active_days,
        "mission_days_in_range": mission_days_in_range,
        "completed_sentences_in_range": completed_sentences_in_range,
        "check_attempts_in_range": check_attempts_in_range,
        "check_passes_in_range": check_passes_in_range,
        "pass_rate_in_range": pass_rate_in_range,
        "completed_lessons_in_range": completed_lessons_in_range,
        "lesson_total": lesson_total,
        "lesson_completed_total": lesson_completed_total,
        "lesson_in_progress_total": lesson_in_progress_total,
        "stalled_lessons": stalled_lessons,
        "sentence_total": sentence_total,
        "sentence_completed_total": sentence_completed_total,
        "completion_rate": completion_rate,
        "recent_learning_at": to_shanghai_aware(recent_learning_at),
        "points_consumed_in_range": consumed_points_in_range,
        "balance_points": balance_points,
        "growth_points_in_range": growth_points_in_range,
        "total_growth_points": total_growth_points,
        "current_level": int(level_payload["level"]),
        "current_stage_label": str(level_payload["stage_label"]),
        "level_progress_percent": float(level_payload["level_progress_percent"]),
        "next_level_points": int(level_payload["next_level_points"]),
        "points_to_next_level": int(level_payload["points_to_next_level"]),
        "is_active_today": is_active_today,
        "unfinished_lessons": unfinished_lessons,
    }

    return {
        "range_days": safe_range_days,
        "summary": summary,
        "hero": _build_hero(
            level_payload=level_payload,
            recommendation=primary_recommendation,
            streak_days=streak_days,
            total_growth_points=total_growth_points,
            stalled_lessons=stalled_lessons,
            is_active_today=is_active_today,
        ),
        "today_tasks": _build_today_tasks(
            lesson_total=lesson_total,
            is_active_today=is_active_today,
            continue_lesson=continue_lesson,
            stalled_lesson=stalled_lesson,
            near_completion_lesson=near_completion_lesson,
            check_passes_in_range=check_passes_in_range,
            completed_sentences_in_range=completed_sentences_in_range,
        ),
        "risk_cards": _build_risk_cards(
            lesson_total=lesson_total,
            pass_rate_in_range=pass_rate_in_range,
            check_attempts_in_range=check_attempts_in_range,
            active_days_in_range=active_days_in_range,
            unfinished_lessons=unfinished_lessons,
            stalled_lesson=stalled_lesson,
        ),
        "milestones": _build_milestones(
            streak_days=streak_days,
            total_growth_points=total_growth_points,
            lesson_completed_total=lesson_completed_total,
        ),
        "focus_cards": [
            {
                "label": "连续学习天数",
                "value": streak_days,
                "hint": "按最近连续活跃日计算",
                "tone": "info",
            },
            {
                "label": f"近 {safe_range_days} 天完成句子",
                "value": completed_sentences_in_range,
                "hint": "只统计新增完成的句子",
                "tone": "success",
            },
            {
                "label": f"近 {safe_range_days} 天通过率",
                "value": _format_percent(pass_rate_in_range),
                "hint": "通过次数 / 校验尝试次数",
                "tone": "warning",
            },
            {
                "label": "累计课程完成率",
                "value": _format_percent(completion_rate),
                "hint": "已完成句子 / 全部句子",
                "tone": "default",
            },
        ],
        "charts": [
            {
                "title": f"近 {safe_range_days} 天学习趋势",
                "description": "同时看完成句子、成长值和通过率，判断学习链路是否健康。",
                "type": "line",
                "x_key": "label",
                "series": [
                    {"key": "完成句子", "name": "完成句子", "color": "#2563eb"},
                    {"key": "成长值", "name": "成长值", "color": "#10b981"},
                    {"key": "通过率", "name": "通过率", "color": "#f59e0b"},
                ],
                "data": chart_points,
            },
            {
                "title": "课程状态分布",
                "description": "优先关注进行中和停滞课程，而不是一味继续开新课。",
                "type": "bar",
                "x_key": "label",
                "series": [{"key": "value", "name": "课程数", "color": "#8b5cf6"}],
                "data": [
                    {"label": "已完成", "value": lesson_completed_total},
                    {"label": "进行中", "value": lesson_in_progress_total},
                    {"label": "未开始", "value": max(0, lesson_total - lesson_completed_total - lesson_in_progress_total)},
                ],
            },
        ],
        "continue_lesson": _serialize_lesson_target(continue_lesson),
        "stalled_lesson": _serialize_lesson_target(stalled_lesson),
        "primary_recommendation": {
            **primary_recommendation,
            "lesson_id": primary_recommendation.get("lesson_id"),
        },
    }
