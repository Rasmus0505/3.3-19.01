"""
DeepSeek V3.2 LLM provider using DashScope / OpenAI-compatible API.

Supports two modes:
- enable_thinking=True:  DeepSeek V3.2 with reasoning (charges more)
- enable_thinking=False:  DeepSeek V3.2 fast/non-thinking (cheaper)
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Generator

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI

from app.core.timezone import now_shanghai_naive

DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip()
DEEPSEEK_MODEL_THINKING = "deepseek-v3.2"
DEEPSEEK_MODEL_FAST = "deepseek-v3.2"
DEEPSEEK_TIMEOUT_SECONDS = max(10, int((os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "90") or "90").strip() or "90"))
DEEPSEEK_MAX_TOKENS = max(100, int((os.getenv("DEEPSEEK_MAX_TOKENS", "4096") or "4096").strip() or "4096"))
DEEPSEEK_MAX_RETRIES = 3

logger = logging.getLogger(__name__)

# Reuse a single client per API key to keep HTTP connections alive
_client_cache: dict[str, OpenAI] = {}


@dataclass(frozen=True)
class LLMTokenUsage:
    prompt_tokens: int
    completion_tokens: int
    reasoning_tokens: int
    total_tokens: int


def _client(api_key: str) -> OpenAI:
    if api_key not in _client_cache:
        _client_cache[api_key] = OpenAI(
            api_key=api_key,
            base_url=DEEPSEEK_BASE_URL,
            max_retries=0,  # We handle retries ourselves for better logging
            timeout=DEEPSEEK_TIMEOUT_SECONDS,
        )
    return _client_cache[api_key]


def _extract_usage(completion: object) -> LLMTokenUsage:
    usage = getattr(completion, "usage", None)
    if not usage:
        return LLMTokenUsage(prompt_tokens=0, completion_tokens=0, reasoning_tokens=0, total_tokens=0)

    prompt_tokens = max(0, int(getattr(usage, "prompt_tokens", 0) or 0))
    completion_tokens = max(0, int(getattr(usage, "completion_tokens", 0) or 0))
    total_tokens = max(0, int(getattr(usage, "total_tokens", 0) or 0))
    reasoning_tokens = max(0, int(getattr(usage, "completion_tokens_details", None) or 0))
    if hasattr(usage, "completion_tokens_details") and usage.completion_tokens_details is not None:
        reasoning_tokens = max(0, int(getattr(usage.completion_tokens_details, "reasoning_tokens", 0) or 0))
        completion_tokens = max(0, int(getattr(usage.completion_tokens_details, "content_tokens", 0) or 0))

    return LLMTokenUsage(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        reasoning_tokens=reasoning_tokens,
        total_tokens=total_tokens or (prompt_tokens + completion_tokens),
    )


def _estimate_prompt_chars(messages: list[dict]) -> int:
    return sum(len(str(m.get("content", ""))) for m in messages)


def call_deepseek(
    messages: list[dict],
    api_key: str,
    *,
    enable_thinking: bool = False,
    stream: bool = False,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    _retry_count: int = 0,
) -> tuple[str, LLMTokenUsage]:
    """
    Call DeepSeek V3.2 API with automatic retry on transient errors.

    Returns (content, usage).
    Retries on: timeout, connection error, 5xx status, empty response.
    Raises ValueError if content is empty after all retries.
    """
    client = _client(api_key)
    model = DEEPSEEK_MODEL_THINKING if enable_thinking else DEEPSEEK_MODEL_FAST
    effective_max_tokens = max_tokens or DEEPSEEK_MAX_TOKENS
    prompt_chars = _estimate_prompt_chars(messages)

    extra_body: dict = {}
    if not enable_thinking:
        extra_body["enable_thinking"] = False

    last_error: Exception | None = None

    for attempt in range(DEEPSEEK_MAX_RETRIES):
        try:
            t0 = time.monotonic()
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=effective_max_tokens,
                stream=stream,
                extra_body=extra_body if extra_body else None,
            )
            elapsed_ms = int((time.monotonic() - t0) * 1000)

            if stream:
                content_chunks: list[str] = []
                for chunk in response:
                    delta = chunk.choices[0].delta
                    if delta and getattr(delta, "content", None):
                        content_chunks.append(delta.content)
                content = "".join(content_chunks)
                usage = _extract_usage(response)
                return content, usage

            if not response.choices:
                logger.warning(
                    "[call_deepseek] Empty choices attempt=%d/%d elapsed=%dms prompt_chars=%d model=%s",
                    attempt + 1, DEEPSEEK_MAX_RETRIES, elapsed_ms, prompt_chars, model,
                )
                last_error = ValueError("LLM returned no choices")
                if attempt < DEEPSEEK_MAX_RETRIES - 1:
                    time.sleep(min(2 ** attempt, 8))
                continue

            choice = response.choices[0]
            raw_content = getattr(choice.message, "content", "") or ""
            content = str(raw_content).strip()

            if not content:
                logger.warning(
                    "[call_deepseek] Empty content attempt=%d/%d elapsed=%dms prompt_chars=%d model=%s finish_reason=%s",
                    attempt + 1, DEEPSEEK_MAX_RETRIES, elapsed_ms, prompt_chars, model,
                    getattr(choice, "finish_reason", "unknown"),
                )
                last_error = ValueError("LLM returned empty content")
                if attempt < DEEPSEEK_MAX_RETRIES - 1:
                    time.sleep(min(2 ** attempt, 8))
                continue

            logger.info(
                "[call_deepseek] OK attempt=%d elapsed=%dms prompt_chars=%d content_len=%d model=%s",
                attempt + 1, elapsed_ms, prompt_chars, len(content), model,
            )
            usage = _extract_usage(response)
            return content, usage

        except APITimeoutError as exc:
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            logger.warning(
                "[call_deepseek] TIMEOUT attempt=%d/%d elapsed=%dms prompt_chars=%d timeout_cfg=%ds model=%s error=%s",
                attempt + 1, DEEPSEEK_MAX_RETRIES, elapsed_ms, prompt_chars,
                DEEPSEEK_TIMEOUT_SECONDS, model, str(exc)[:200],
            )
            last_error = exc
            if attempt < DEEPSEEK_MAX_RETRIES - 1:
                time.sleep(min(2 ** attempt, 8))

        except APIStatusError as exc:
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            # Extract response body for diagnosis
            resp_text = ""
            try:
                resp_text = str(exc.response.text)[:500] if hasattr(exc, "response") and exc.response else ""
            except Exception:
                pass
            logger.error(
                "[call_deepseek] STATUS_ERROR attempt=%d/%d status=%s elapsed=%dms prompt_chars=%d model=%s error=%s body=%s",
                attempt + 1, DEEPSEEK_MAX_RETRIES, exc.status_code, elapsed_ms,
                prompt_chars, model, str(exc)[:200], resp_text,
            )
            last_error = exc
            # Retry on 5xx (server-side), 429 (rate limit); fail fast on 4xx
            if exc.status_code in (429, 500, 502, 503, 504):
                wait = min(2 ** attempt, 8)
                if exc.status_code == 429:
                    wait = max(wait, 5)  # Rate limit needs longer backoff
                if attempt < DEEPSEEK_MAX_RETRIES - 1:
                    time.sleep(wait)
                continue
            raise  # 4xx client errors are not retryable

        except APIConnectionError as exc:
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            logger.warning(
                "[call_deepseek] CONNECTION_ERROR attempt=%d/%d elapsed=%dms prompt_chars=%d model=%s error=%s",
                attempt + 1, DEEPSEEK_MAX_RETRIES, elapsed_ms, prompt_chars, model, str(exc)[:200],
            )
            last_error = exc
            if attempt < DEEPSEEK_MAX_RETRIES - 1:
                time.sleep(min(2 ** attempt, 8))

    # All retries exhausted
    if isinstance(last_error, ValueError):
        raise last_error
    raise last_error or ValueError("LLM call failed after all retries")


def generate_reading_material(
    user_words: list[dict],
    target_level: int,
    enable_thinking: bool,
    api_key: str,
) -> Generator[tuple[str, LLMTokenUsage], None, None]:
    """
    Generate reading material from user words using DeepSeek V3.2.

    Yields (content_chunk, usage) for streaming, or yields single (full_content, usage) for non-streaming.
    """
    if not user_words:
        return

    word_list_str = ", ".join(
        f"{item.get('word', '')}" for item in user_words if item.get("word")
    )
    if not word_list_str:
        return

    system_prompt = (
        "You are an English reading material generator for language learners. "
        "Generate engaging, grade-appropriate reading passages that naturally incorporate the provided vocabulary words. "
        "The reading level should target the specified Collins star level, where 5 is easier and 1 is harder. "
        "Include comprehension questions after the passage. "
        "Format output as clean markdown."
    )

    user_prompt = (
        f"Target Collins Level: {int(target_level)}\n"
        f"Vocabulary words to incorporate: {word_list_str}\n\n"
        f"Please generate a reading passage (around 200-400 words) that naturally uses these words in context. "
        f"Include 3-5 comprehension questions at the end. "
        f"Make sure the reading is appropriate for Collins {int(target_level)} learners."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    content, usage = call_deepseek(
        messages=messages,
        api_key=api_key,
        enable_thinking=enable_thinking,
        stream=False,
        temperature=0.7,
        max_tokens=2048,
    )

    yield content, usage


def estimate_reading_material_cost(num_words: int, enable_thinking: bool) -> dict[str, int]:
    """
    Estimate token usage for reading material generation.
    Returns dict with estimated prompt_tokens, completion_tokens, total_tokens.
    """
    prompt_per_word = 15
    completion_per_word = 40
    estimated_prompt = num_words * prompt_per_word
    estimated_completion = num_words * completion_per_word
    return {
        "prompt_tokens": estimated_prompt,
        "completion_tokens": estimated_completion,
        "total_tokens": estimated_prompt + estimated_completion,
    }
