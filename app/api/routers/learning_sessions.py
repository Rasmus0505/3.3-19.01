from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.errors import error_response
from app.core.timezone import now_shanghai_naive, to_shanghai_aware
from app.db import get_db
from app.models import LearningSession, Lesson, User
from app.schemas import (
    DashboardDailyStudyPoint,
    DashboardLessonStudyPoint,
    DashboardStudyTimeResponse,
    ErrorResponse,
    LearningSessionFinishRequest,
    LearningSessionHeartbeatRequest,
    LearningSessionListResponse,
    LearningSessionPauseRequest,
    LearningSessionResponse,
    LearningSessionResumeRequest,
    LearningSessionStartRequest,
    LearningSessionSummary,
    LearningSessionUpdateRequest,
)

router = APIRouter(prefix="/api/learning-sessions", tags=["learning-sessions"])


def _to_session_summary(session: LearningSession) -> LearningSessionSummary:
    return LearningSessionSummary(
        id=session.id,
        lesson_id=session.lesson_id,
        title_snapshot=session.title_snapshot or "",
        started_at=to_shanghai_aware(session.started_at),
        ended_at=to_shanghai_aware(session.ended_at) if session.ended_at else None,
        effective_seconds=int(session.effective_seconds or 0),
        paused_seconds=int(session.paused_seconds or 0),
        status=str(session.status or "active"),
        last_activity_at=to_shanghai_aware(session.last_activity_at),
        manual_pause_count=int(session.manual_pause_count or 0),
        auto_pause_count=int(session.auto_pause_count or 0),
        notes=session.notes or "",
    )


def _get_owned_lesson(db: Session, lesson_id: int, user_id: int) -> Lesson | None:
    return db.scalar(select(Lesson).where(Lesson.id == lesson_id, Lesson.user_id == user_id))


def _get_owned_session(db: Session, session_id: int, user_id: int) -> LearningSession | None:
    return db.scalar(select(LearningSession).where(LearningSession.id == session_id, LearningSession.user_id == user_id))


def _resolve_last_activity(value: datetime | None) -> datetime:
    return value.replace(tzinfo=None) if value else now_shanghai_naive()


def _compute_streak(active_dates: set[date]) -> int:
    if not active_dates:
        return 0
    today = date.today()
    streak = 0
    cursor = today
    while cursor in active_dates:
        streak += 1
        cursor -= timedelta(days=1)
    if streak == 0 and (today - timedelta(days=1)) in active_dates:
        cursor = today - timedelta(days=1)
        while cursor in active_dates:
            streak += 1
            cursor -= timedelta(days=1)
    return streak


@router.post(
    "/start",
    response_model=LearningSessionResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def start_learning_session(
    payload: LearningSessionStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lesson = _get_owned_lesson(db, payload.lesson_id, current_user.id)
    if not lesson:
        return error_response(404, "LESSON_NOT_FOUND", "课程不存在")

    existing = db.scalar(
        select(LearningSession)
        .where(
            LearningSession.user_id == current_user.id,
            LearningSession.lesson_id == payload.lesson_id,
            LearningSession.status.in_(["active", "paused"]),
        )
        .order_by(desc(LearningSession.started_at))
    )
    if existing:
        return LearningSessionResponse(session=_to_session_summary(existing))

    now = now_shanghai_naive()
    session = LearningSession(
        user_id=current_user.id,
        lesson_id=payload.lesson_id,
        title_snapshot=str(payload.title_snapshot or lesson.title or "").strip(),
        started_at=now,
        last_activity_at=now,
        status="active",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return LearningSessionResponse(session=_to_session_summary(session))


@router.post(
    "/{session_id}/heartbeat",
    response_model=LearningSessionResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def heartbeat_learning_session(
    session_id: int,
    payload: LearningSessionHeartbeatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, session_id, current_user.id)
    if not session:
        return error_response(404, "SESSION_NOT_FOUND", "学习记录不存在")

    session.effective_seconds = int(payload.effective_seconds or 0)
    session.paused_seconds = int(payload.paused_seconds or 0)
    session.last_activity_at = _resolve_last_activity(payload.last_activity_at)
    if session.status not in {"completed", "discarded"}:
        session.status = "active" if (payload.playing or payload.typing_active) else session.status
    db.add(session)
    db.commit()
    db.refresh(session)
    return LearningSessionResponse(session=_to_session_summary(session))


@router.post(
    "/{session_id}/pause",
    response_model=LearningSessionResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def pause_learning_session(
    session_id: int,
    payload: LearningSessionPauseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, session_id, current_user.id)
    if not session:
        return error_response(404, "SESSION_NOT_FOUND", "学习记录不存在")

    session.effective_seconds = int(payload.effective_seconds or 0)
    session.paused_seconds = int(payload.paused_seconds or 0)
    session.last_activity_at = _resolve_last_activity(payload.last_activity_at)
    session.status = "paused"
    if payload.reason == "manual":
        session.manual_pause_count = int(session.manual_pause_count or 0) + 1
    else:
        session.auto_pause_count = int(session.auto_pause_count or 0) + 1
    db.add(session)
    db.commit()
    db.refresh(session)
    return LearningSessionResponse(session=_to_session_summary(session))


@router.post(
    "/{session_id}/resume",
    response_model=LearningSessionResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def resume_learning_session(
    session_id: int,
    payload: LearningSessionResumeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, session_id, current_user.id)
    if not session:
        return error_response(404, "SESSION_NOT_FOUND", "学习记录不存在")

    session.effective_seconds = int(payload.effective_seconds or 0)
    session.paused_seconds = int(payload.paused_seconds or 0)
    session.last_activity_at = _resolve_last_activity(payload.last_activity_at)
    session.status = "active"
    db.add(session)
    db.commit()
    db.refresh(session)
    return LearningSessionResponse(session=_to_session_summary(session))


@router.post(
    "/{session_id}/finish",
    response_model=LearningSessionResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def finish_learning_session(
    session_id: int,
    payload: LearningSessionFinishRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, session_id, current_user.id)
    if not session:
        return error_response(404, "SESSION_NOT_FOUND", "学习记录不存在")

    session.effective_seconds = int(payload.effective_seconds or 0)
    session.paused_seconds = int(payload.paused_seconds or 0)
    session.last_activity_at = _resolve_last_activity(payload.last_activity_at)
    session.ended_at = now_shanghai_naive()
    session.status = "completed" if payload.reason == "completed" else "discarded"
    db.add(session)
    db.commit()
    db.refresh(session)
    return LearningSessionResponse(session=_to_session_summary(session))


@router.get(
    "",
    response_model=LearningSessionListResponse,
    responses={401: {"model": ErrorResponse}},
)
def list_learning_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.scalars(
        select(LearningSession)
        .where(LearningSession.user_id == current_user.id)
        .order_by(desc(LearningSession.started_at))
        .limit(200)
    ).all()
    return LearningSessionListResponse(items=[_to_session_summary(item) for item in rows])


@router.patch(
    "/{session_id}",
    response_model=LearningSessionResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_learning_session(
    session_id: int,
    payload: LearningSessionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, session_id, current_user.id)
    if not session:
        return error_response(404, "SESSION_NOT_FOUND", "学习记录不存在")

    if payload.effective_seconds is not None:
        session.effective_seconds = int(payload.effective_seconds or 0)
    if payload.notes is not None:
        session.notes = str(payload.notes or "")
    db.add(session)
    db.commit()
    db.refresh(session)
    return LearningSessionResponse(session=_to_session_summary(session))


@router.delete(
    "/{session_id}",
    response_model=LearningSessionResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
def delete_learning_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = _get_owned_session(db, session_id, current_user.id)
    if not session:
        return error_response(404, "SESSION_NOT_FOUND", "学习记录不存在")
    if session.status in {"active", "paused"}:
        return error_response(409, "SESSION_ACTIVE", "当前正在学习的记录不能删除")

    summary = _to_session_summary(session)
    db.delete(session)
    db.commit()
    return LearningSessionResponse(session=summary)


@router.get(
    "/dashboard/study-time",
    response_model=DashboardStudyTimeResponse,
    responses={401: {"model": ErrorResponse}},
)
def get_study_time_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = db.scalars(
        select(LearningSession)
        .where(
            LearningSession.user_id == current_user.id,
            LearningSession.status.in_(["active", "paused", "completed"]),
        )
        .order_by(desc(LearningSession.started_at))
    ).all()

    total_minutes = sum(int(item.effective_seconds or 0) for item in rows) // 60
    today_value = date.today().isoformat()
    today_minutes = (
        sum(int(item.effective_seconds or 0) for item in rows if (item.started_at.date().isoformat() == today_value)) // 60
    )

    daily_map: dict[str, int] = defaultdict(int)
    lesson_map: dict[tuple[int, str], int] = defaultdict(int)
    active_dates: set[date] = set()
    for item in rows:
        day_key = item.started_at.date().isoformat()
        minutes = int(item.effective_seconds or 0) // 60
        daily_map[day_key] += minutes
        lesson_map[(int(item.lesson_id), str(item.title_snapshot or ""))] += minutes
        if minutes > 0:
            active_dates.add(item.started_at.date())

    latest = rows[0] if rows else None
    daily_points = [
        DashboardDailyStudyPoint(date=day_key, minutes=minutes)
        for day_key, minutes in sorted(daily_map.items(), key=lambda item: item[0])[-30:]
    ]
    lesson_points = [
        DashboardLessonStudyPoint(lesson_id=lesson_id, title_snapshot=title_snapshot, minutes=minutes)
        for (lesson_id, title_snapshot), minutes in sorted(lesson_map.items(), key=lambda item: item[1], reverse=True)[:10]
    ]
    recent_sessions = [_to_session_summary(item) for item in rows[:20]]

    return DashboardStudyTimeResponse(
        total_minutes=total_minutes,
        today_minutes=today_minutes,
        streak_days=_compute_streak(active_dates),
        latest_lesson_title=str(latest.title_snapshot or "") if latest else "",
        latest_activity_at=to_shanghai_aware(latest.last_activity_at) if latest else None,
        daily_minutes=daily_points,
        lesson_minutes=lesson_points,
        recent_sessions=recent_sessions,
    )
