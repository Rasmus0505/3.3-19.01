"""Shared helper utilities for regression tests.

Extracted from test_regression_api.py to enable splitting that file.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from types import SimpleNamespace


def frontend_build_marker_from_index() -> str:
    html = (Path(__file__).resolve().parents[1] / "app" / "static" / "index.html").read_text(encoding="utf-8")
    match = re.search(r'/static/assets/([^"\']+)', html)
    assert match
    return str(match.group(1))


def word_entry(text: str, begin_ms: int, end_ms: int, *, punctuation: str = "", surface: str | None = None) -> dict[str, object]:
    return {
        "text": text,
        "surface": surface or (f"{text}{punctuation}" if punctuation else text),
        "punctuation": punctuation,
        "begin_time": begin_ms,
        "end_time": end_ms,
    }


def translation_batch_result(texts: list[str], *, failed_count: int = 0, total_tokens: int = 0, latest_error_summary: str = ""):
    success_count = max(0, len(texts) - failed_count)
    return SimpleNamespace(
        texts=list(texts),
        failed_count=failed_count,
        attempt_records=[],
        total_requests=len(texts),
        success_request_count=success_count,
        success_prompt_tokens=0,
        success_completion_tokens=0,
        success_total_tokens=total_tokens,
        latest_error_summary=latest_error_summary,
    )


def parse_sse_events(raw_text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in raw_text.replace("\r\n", "\n").split("\n\n"):
        chunk = block.strip()
        if not chunk:
            continue
        event_name = "message"
        data_lines: list[str] = []
        for line in chunk.split("\n"):
            if line.startswith("event:"):
                event_name = line.split(":", 1)[1].strip() or "message"
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
        if not data_lines:
            continue
        events.append((event_name, json.loads("\n".join(data_lines))))
    return events
