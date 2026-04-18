from __future__ import annotations

from typing import Any


VALID_COLLINS_LEVELS: tuple[int, ...] = (1, 2, 3, 4, 5)
_LEGACY_LEARNING_LEVEL_TO_COLLINS: dict[str, int] = {
    "A1": 5,
    "A2": 4,
    "B1": 3,
    "B2": 2,
    "C1": 1,
    "C2": 1,
}


def normalize_collins_level(value: Any, default: int | None = None) -> int | None:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return default
    if normalized in VALID_COLLINS_LEVELS:
        return normalized
    return default


def legacy_learning_level_to_collins(value: Any, default: int = 3) -> int:
    normalized = str(value or "").strip().upper()
    if normalized in _LEGACY_LEARNING_LEVEL_TO_COLLINS:
        return _LEGACY_LEARNING_LEVEL_TO_COLLINS[normalized]
    return default


def classify_collins_band(*, collins: int | None, user_collins_level: int) -> str:
    normalized_user = normalize_collins_level(user_collins_level, default=3) or 3
    normalized_collins = normalize_collins_level(collins)
    if normalized_collins is None:
        return "unrated"
    if normalized_collins >= normalized_user:
        return "default"
    if normalized_collins == normalized_user - 1:
        return "i_plus_one"
    return "above_i_plus_one"
