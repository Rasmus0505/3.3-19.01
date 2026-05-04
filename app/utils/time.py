"""时间处理工具。

使用 zoneinfo 实现，与项目 app/core/timezone.py 保持一致。
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.core.timezone import SHANGHAI_TZ, to_shanghai_naive
from app.core.timezone import now_shanghai_naive as _now_shanghai_naive


# 重新导出核心函数
def now_shanghai_naive() -> datetime:
    """返回上海时区的当前时间（naive datetime）。"""
    return _now_shanghai_naive()


def now_shanghai_aware() -> datetime:
    """返回上海时区的当前时间（aware datetime）。"""
    return datetime.now(tz=SHANGHAI_TZ)


def to_shanghai(dt: datetime | None) -> datetime | None:
    """将 datetime 转换为上海时区（naive）。"""
    return to_shanghai_naive(dt)


def to_utc(dt: datetime) -> datetime:
    """将 datetime 转换为 UTC 时区。"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SHANGHAI_TZ)
    return dt.astimezone(UTC)


def format_duration_ms(duration_ms: int | float | None) -> str:
    """格式化毫秒为人类可读的时长字符串。"""
    if duration_ms is None or duration_ms < 0:
        return "0s"

    total_seconds = int(duration_ms / 1000)
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)

    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    if seconds > 0 or not parts:
        parts.append(f"{seconds}s")

    return "".join(parts)


def parse_duration_ms(duration_str: str) -> int:
    """解析时长字符串（如 "1h30m15s"）为毫秒。"""
    if not duration_str:
        return 0

    total_ms = 0
    import re

    # 匹配小时
    hours = re.search(r"(\d+)h", duration_str)
    if hours:
        total_ms += int(hours.group(1)) * 3600 * 1000

    # 匹配分钟
    minutes = re.search(r"(\d+)m", duration_str)
    if minutes:
        total_ms += int(minutes.group(1)) * 60 * 1000

    # 匹配秒
    seconds = re.search(r"(\d+)s", duration_str)
    if seconds:
        total_ms += int(seconds.group(1)) * 1000

    return total_ms


def format_datetime(dt: datetime, format_str: str = "%Y-%m-%d %H:%M:%S") -> str:
    """格式化 datetime 为字符串。"""
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=SHANGHAI_TZ)
    return dt.strftime(format_str)


def parse_datetime(dt_str: str, format_str: str = "%Y-%m-%d %H:%M:%S") -> datetime | None:
    """解析字符串为 datetime。"""
    if not dt_str:
        return None
    try:
        return datetime.strptime(dt_str, format_str)
    except ValueError:
        return None


def is_expired(expire_at: datetime | None, now: datetime | None = None) -> bool:
    """检查时间是否已过期。"""
    if expire_at is None:
        return False
    if now is None:
        now = now_shanghai_naive()
    if expire_at.tzinfo is None:
        expire_at = expire_at.replace(tzinfo=SHANGHAI_TZ)
    if now.tzinfo is None:
        now = now.replace(tzinfo=SHANGHAI_TZ)
    return expire_at < now


def add_days(dt: datetime, days: int) -> datetime:
    """添加天数到 datetime。"""
    return dt + timedelta(days=days)


def add_hours(dt: datetime, hours: int) -> datetime:
    """添加小时到 datetime。"""
    return dt + timedelta(hours=hours)


def add_minutes(dt: datetime, minutes: int) -> datetime:
    """添加分钟到 datetime。"""
    return dt + timedelta(minutes=minutes)
