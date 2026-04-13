from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.timezone import now_shanghai_naive


REVIEW_GRADES: tuple[str, ...] = ("again", "hard", "good", "easy")
TARGET_MEMORY_SCORE = 0.85
DEFAULT_MEMORY_SCORE = 0.35


@dataclass(frozen=True)
class ReviewStateUpdate:
    next_review_at: datetime
    last_reviewed_at: datetime | None
    review_count: int
    wrong_count: int
    memory_score: float
    status: str


def clamp_memory_score(value: float) -> float:
    return round(max(0.05, min(0.99, float(value))), 4)


def resolve_wordbook_status(memory_score: float) -> str:
    return "mastered" if float(memory_score) >= TARGET_MEMORY_SCORE else "active"


def build_initial_review_state(now: datetime | None = None) -> ReviewStateUpdate:
    safe_now = now or now_shanghai_naive()
    memory_score = clamp_memory_score(DEFAULT_MEMORY_SCORE)
    return ReviewStateUpdate(
        next_review_at=safe_now,
        last_reviewed_at=None,
        review_count=0,
        wrong_count=0,
        memory_score=memory_score,
        status=resolve_wordbook_status(memory_score),
    )


def _resolve_interval_hours(*, grade: str, memory_score: float, review_count: int, wrong_count: int) -> int:
    score_weight = max(0.2, float(memory_score))
    history_weight = max(0, int(review_count)) * 5
    error_penalty = max(0, int(wrong_count)) * 3
    dynamic_base = max(6.0, 10.0 + score_weight * 28.0 + history_weight - error_penalty)

    if grade == "again":
        return max(6, int(round(6 + review_count * 2 + wrong_count * 2)))
    if grade == "hard":
        return max(12, int(round(dynamic_base * 0.75)))
    if grade == "good":
        return max(24, int(round(dynamic_base * 1.6)))
    return max(48, int(round(dynamic_base * 2.5)))


def apply_review_grade(
    *,
    grade: str,
    memory_score: float,
    review_count: int,
    wrong_count: int,
    now: datetime | None = None,
) -> ReviewStateUpdate:
    safe_now = now or now_shanghai_naive()
    safe_grade = str(grade or "").strip().lower()
    if safe_grade not in REVIEW_GRADES:
        raise ValueError(f"unsupported review grade: {grade}")

    current_score = clamp_memory_score(memory_score or DEFAULT_MEMORY_SCORE)
    next_review_count = max(0, int(review_count or 0)) + 1
    next_wrong_count = max(0, int(wrong_count or 0))

    score_delta = {
        "again": -0.28,
        "hard": 0.06,
        "good": 0.16,
        "easy": 0.26,
    }[safe_grade]
    if safe_grade == "again":
        next_wrong_count += 1

    next_score = clamp_memory_score(current_score + score_delta)
    interval_hours = _resolve_interval_hours(
        grade=safe_grade,
        memory_score=next_score,
        review_count=next_review_count,
        wrong_count=next_wrong_count,
    )
    return ReviewStateUpdate(
        next_review_at=safe_now + timedelta(hours=interval_hours),
        last_reviewed_at=safe_now,
        review_count=next_review_count,
        wrong_count=next_wrong_count,
        memory_score=next_score,
        status=resolve_wordbook_status(next_score),
    )
