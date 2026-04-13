from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.config import APP_TIMEZONE


logger = logging.getLogger(__name__)


def _build_timezone() -> ZoneInfo:
    try:
        return ZoneInfo(APP_TIMEZONE)
    except ZoneInfoNotFoundError:
        logger.warning("[DEBUG] Invalid APP_TIMEZONE `%s`, fallback to Asia/Shanghai", APP_TIMEZONE)
        return ZoneInfo("Asia/Shanghai")


SHANGHAI_TZ = _build_timezone()


def now_shanghai_naive() -> datetime:
    return datetime.now(tz=SHANGHAI_TZ).replace(tzinfo=None)


def to_shanghai_naive(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(SHANGHAI_TZ).replace(tzinfo=None)


def to_shanghai_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=SHANGHAI_TZ)
    return dt.astimezone(SHANGHAI_TZ)
