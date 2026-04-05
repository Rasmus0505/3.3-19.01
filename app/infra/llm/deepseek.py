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
from dataclasses import dataclass
from typing import Generator

from openai import OpenAI

from app.core.timezone import now_shanghai_naive

DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip()
DEEPSEEK_MODEL_THINKING = "deepseek-v3"
DEEPSEEK_MODEL_FAST = "deepseek-v3"
DEEPSEEK_TIMEOUT_SECONDS = max(10, int((os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "60") or "60").strip() or "60"))
DEEPSEEK_MAX_TOKENS = max(100, int((os.getenv("DEEPSEEK_MAX_TOKENS", "4096") or "4096").strip() or "4096"))

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMTokenUsage:
    prompt_tokens: int
    completion_tokens: int
    reasoning_tokens: int
    total_tokens: int


def _client(api_key: str) -> OpenAI:
    return OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL, max_retries=0)


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


def call_deepseek(
    messages: list[dict],
    api_key: str,
    *,
    enable_thinking: bool = False,
    stream: bool = False,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> tuple[str, LLMTokenUsage]:
    """
    Call DeepSeek V3.2 API.

    Returns (content, usage).
    """
    client = _client(api_key)
    model = DEEPSEEK_MODEL_THINKING if enable_thinking else DEEPSEEK_MODEL_FAST
    effective_max_tokens = max_tokens or DEEPSEEK_MAX_TOKENS

    extra_body: dict = {}
    if not enable_thinking:
        extra_body["think"] = False

    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=effective_max_tokens,
        stream=stream,
        extra_body=extra_body if extra_body else None,
        timeout=DEEPSEEK_TIMEOUT_SECONDS,
    )

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
        return "", LLMTokenUsage(prompt_tokens=0, completion_tokens=0, reasoning_tokens=0, total_tokens=0)

    choice = response.choices[0]
    content = str(getattr(choice.message, "content", "") or "").strip()
    usage = _extract_usage(response)
    return content, usage


def generate_reading_material(
    user_words: list[dict],
    target_level: str,
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
        "The reading level should target the specified CEFR level (A1, A2, B1, B2, C1). "
        "Include comprehension questions after the passage. "
        "Format output as clean markdown."
    )

    user_prompt = (
        f"Target CEFR Level: {target_level.upper()}\n"
        f"Vocabulary words to incorporate: {word_list_str}\n\n"
        f"Please generate a reading passage (around 200-400 words) that naturally uses these words in context. "
        f"Include 3-5 comprehension questions at the end. "
        f"Make sure the reading is appropriate for {target_level.upper()} level learners."
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
