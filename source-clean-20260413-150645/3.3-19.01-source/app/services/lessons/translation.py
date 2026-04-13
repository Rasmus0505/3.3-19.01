"""翻译处理服务 - 课程服务模块。

提供翻译相关的处理功能。

此文件是从 app/services/lesson_service.py 中提取的翻译相关逻辑。
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Callable, Iterable

from sqlalchemy.orm import Session

from app.core.timezone import now_shanghai_naive
from app.models import TranslationRequestLog
from app.services.billing import EVENT_CONSUME_TRANSLATE
from app.services.translation_qwen_mt import (
    MT_MODEL,
    SemanticSplitError,
    TranslationError,
    split_sentence_by_semantic,
    translate_sentences_to_zh,
)


logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], None]

_TRANSLATION_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_TRANSLATION_ZERO_WIDTH_RE = re.compile(r"[\u200B-\u200D\uFEFF]")


def _now() -> datetime:
    return now_shanghai_naive()


def sanitize_translation_text(text: str) -> str:
    """清理翻译文本中的控制字符和零宽字符。

    Args:
        text: 原始文本

    Returns:
        清理后的文本
    """
    normalized = str(text or "")
    normalized = _TRANSLATION_ZERO_WIDTH_RE.sub("", normalized)
    normalized = _TRANSLATION_CONTROL_CHAR_RE.sub(" ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def prepare_translation_sentences(sentences: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """准备翻译句子列表。

    过滤空文本并清理控制字符。

    Args:
        sentences: 句子列表

    Returns:
        (清理后的句子列表, 被丢弃的句子数量)
    """
    cleaned_sentences: list[dict[str, Any]] = []
    dropped_count = 0

    for sentence in sentences:
        cleaned = dict(sentence)
        cleaned_text = sanitize_translation_text(str(sentence.get("text") or ""))
        if not cleaned_text:
            dropped_count += 1
            continue
        cleaned["text"] = cleaned_text
        cleaned_sentences.append(cleaned)

    return cleaned_sentences, dropped_count


def build_translation_failure_debug(
    *,
    total_sentences: int,
    failed_sentences: int,
    request_count: int,
    success_request_count: int,
    latest_error_summary: str,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
) -> dict[str, Any]:
    """构建翻译失败调试信息。

    Args:
        total_sentences: 总句子数
        failed_sentences: 失败句子数
        request_count: 请求总数
        success_request_count: 成功请求数
        latest_error_summary: 最新错误摘要
        prompt_tokens: 提示 token 数
        completion_tokens: 完成 token 数
        total_tokens: 总 token 数

    Returns:
        调试信息字典
    """
    return {
        "total_sentences": total_sentences,
        "failed_sentences": failed_sentences,
        "request_count": request_count,
        "success_request_count": success_request_count,
        "failed_request_count": request_count - success_request_count,
        "latest_error_summary": latest_error_summary,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def append_translation_request_logs(
    db: Session,
    *,
    trace_id: str,
    user_id: int | None,
    task_id: str | None,
    lesson_id: int | None,
    records: Iterable[dict[str, object]],
) -> int:
    """批量写入翻译请求日志。

    Args:
        db: 数据库会话
        trace_id: 追踪 ID
        user_id: 用户 ID
        task_id: 任务 ID
        lesson_id: 课程 ID
        records: 翻译请求记录列表

    Returns:
        成功插入的记录数
    """
    inserted = 0
    for item in records:
        row = TranslationRequestLog(
            trace_id=str(trace_id or "").strip(),
            task_id=str(item.get("task_id") or task_id or "").strip() or None,
            lesson_id=int(item["lesson_id"]) if item.get("lesson_id") is not None else lesson_id,
            user_id=int(item["user_id"]) if item.get("user_id") is not None else user_id,
            sentence_idx=int(item.get("sentence_idx", 0)),
            attempt_no=max(1, int(item.get("attempt_no", 1))),
            provider=str(item.get("provider") or "dashscope_compatible"),
            model_name=str(item.get("model_name") or ""),
            base_url=str(item.get("base_url") or ""),
            input_text_preview=str(item.get("input_text_preview") or ""),
            provider_request_id=str(item.get("provider_request_id") or "").strip() or None,
            status_code=int(item["status_code"]) if item.get("status_code") is not None else None,
            finish_reason=str(item.get("finish_reason") or "").strip() or None,
            prompt_tokens=max(0, int(item.get("prompt_tokens", 0) or 0)),
            completion_tokens=max(0, int(item.get("completion_tokens", 0) or 0)),
            total_tokens=max(0, int(item.get("total_tokens", 0) or 0)),
            success=bool(item.get("success")),
            error_code=str(item.get("error_code") or "").strip() or None,
            error_message=str(item.get("error_message") or ""),
            raw_request_text=str(item.get("raw_request_text") or ""),
            raw_response_text=str(item.get("raw_response_text") or ""),
            raw_error_text=str(item.get("raw_error_text") or ""),
            started_at=item.get("started_at") or _now(),
            finished_at=item.get("finished_at") or _now(),
            created_at=item.get("created_at") or item.get("finished_at") or _now(),
        )
        db.add(row)
        inserted += 1
    if inserted:
        db.flush()
    return inserted


def emit_progress(callback: ProgressCallback | None, **payload: Any) -> None:
    """发送进度回调。

    Args:
        callback: 进度回调函数
        **payload: 进度数据
    """
    if not callback:
        return
    try:
        callback(payload)
    except Exception:
        logger.exception("[DEBUG] lesson.progress.emit_failed payload=%s", payload)


def get_translation_batch_chars_scope() -> int:
    """获取翻译批次字符范围。

    Returns:
        每批翻译的最大字符数
    """
    try:
        from app.services.translation_qwen_mt import translation_batch_chars_scope
        return translation_batch_chars_scope()
    except Exception:
        return 2600


def estimate_translation_cost(
    sentences: list[dict[str, Any]],
    *,
    prompt_tokens_per_char: float = 2.5,
    completion_tokens_per_word: float = 3.0,
) -> dict[str, int]:
    """估算翻译成本。

    Args:
        sentences: 句子列表
        prompt_tokens_per_char: 每字符 Prompt Token 估算
        completion_tokens_per_word: 每单词 Completion Token 估算

    Returns:
        成本估算字典
    """
    total_chars = sum(len(str(s.get("text", "")).encode("utf-8")) for s in sentences)
    total_words = sum(len(str(s.get("text", "")).split()) for s in sentences)

    estimated_prompt_tokens = int(total_chars * prompt_tokens_per_char)
    estimated_completion_tokens = int(total_words * completion_tokens_per_word)
    estimated_total_tokens = estimated_prompt_tokens + estimated_completion_tokens

    return {
        "total_chars": total_chars,
        "total_words": total_words,
        "estimated_prompt_tokens": estimated_prompt_tokens,
        "estimated_completion_tokens": estimated_completion_tokens,
        "estimated_total_tokens": estimated_total_tokens,
    }


__all__ = [
    "sanitize_translation_text",
    "prepare_translation_sentences",
    "build_translation_failure_debug",
    "append_translation_request_logs",
    "emit_progress",
    "get_translation_batch_chars_scope",
    "estimate_translation_cost",
]
