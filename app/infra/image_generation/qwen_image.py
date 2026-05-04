"""Qwen image generation provider implementation."""
from __future__ import annotations

import json
import re
from typing import Any

import dashscope

from app.core.config import (
    DASHSCOPE_API_KEY,
    QWEN_IMAGE_BASE_URL,
    QWEN_IMAGE_DEFAULT_SIZE,
    QWEN_IMAGE_MODEL,
)
from app.infra.image_generation.base import (
    GeneratedImage,
    ImageGenerationConfig,
    ImageGenerationProvider,
    ImageGenerationResult,
)

DEFAULT_MODEL = QWEN_IMAGE_MODEL
SUPPORTED_MODELS = {
    "qwen-image-2.0-pro",
    "qwen-image-2.0-pro-2026-03-03",
}
_SIZE_RE = re.compile(r"^(?P<width>\d+)\*(?P<height>\d+)$")
_MIN_IMAGE_PIXELS = 512 * 512
_MAX_IMAGE_PIXELS = 2048 * 2048


class ImageGenerationError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        super().__init__(message)
        self.code = str(code or "IMAGE_GENERATION_FAILED").strip() or "IMAGE_GENERATION_FAILED"
        self.message = str(message or "image generation failed").strip() or "image generation failed"
        self.detail = str(detail or "").strip()


def setup_dashscope(api_key: str, *, base_url: str = QWEN_IMAGE_BASE_URL) -> None:
    """Initialize DashScope API key and base URL."""
    dashscope.api_key = (api_key or "").strip()
    dashscope.base_http_api_url = str(base_url or QWEN_IMAGE_BASE_URL).strip() or QWEN_IMAGE_BASE_URL


def _ensure_api_key(api_key: str | None = None) -> str:
    key = str(api_key or getattr(dashscope, "api_key", "") or DASHSCOPE_API_KEY or "").strip()
    if key:
        return key
    raise ImageGenerationError("IMAGE_API_KEY_MISSING", "DASHSCOPE_API_KEY 未配置")


def _to_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "to_dict"):
        try:
            res = value.to_dict()
            if isinstance(res, dict):
                return res
        except Exception:
            pass
    if hasattr(value, "__dict__"):
        try:
            return json.loads(json.dumps(value.__dict__, ensure_ascii=False, default=str))
        except Exception:
            return dict(value.__dict__)
    if value is None:
        return {}
    try:
        return json.loads(json.dumps(value, ensure_ascii=False, default=str))
    except Exception:
        return {"raw": str(value)}


def _normalize_prompt(prompt: str) -> str:
    text = str(prompt or "").strip()
    if not text:
        raise ImageGenerationError("IMAGE_PROMPT_REQUIRED", "prompt 不能为空")
    return text


def _normalize_size(size: str | None) -> str:
    candidate = str(size or QWEN_IMAGE_DEFAULT_SIZE or "").strip() or QWEN_IMAGE_DEFAULT_SIZE
    match = _SIZE_RE.match(candidate)
    if not match:
        raise ImageGenerationError("IMAGE_INVALID_SIZE", f"非法 size: {candidate}")
    width = int(match.group("width"))
    height = int(match.group("height"))
    pixels = width * height
    if pixels < _MIN_IMAGE_PIXELS or pixels > _MAX_IMAGE_PIXELS:
        raise ImageGenerationError(
            "IMAGE_INVALID_SIZE",
            f"qwen-image-2.0-pro size 总像素需在 {_MIN_IMAGE_PIXELS} 到 {_MAX_IMAGE_PIXELS} 之间，当前为 {pixels}",
        )
    return f"{width}*{height}"


def _normalize_image_count(image_count: int) -> int:
    try:
        count = int(image_count)
    except Exception as exc:
        raise ImageGenerationError("IMAGE_INVALID_COUNT", "image_count 必须为整数") from exc
    if count < 1 or count > 6:
        raise ImageGenerationError("IMAGE_INVALID_COUNT", "qwen-image-2.0-pro 仅支持生成 1 到 6 张图片")
    return count


def _normalize_seed(seed: int | None) -> int | None:
    if seed is None:
        return None
    try:
        normalized = int(seed)
    except Exception as exc:
        raise ImageGenerationError("IMAGE_INVALID_SEED", "seed 必须为整数") from exc
    if normalized < 0 or normalized > 2147483647:
        raise ImageGenerationError("IMAGE_INVALID_SEED", "seed 取值范围必须在 0 到 2147483647 之间")
    return normalized


def _extract_images(raw: dict[str, Any]) -> list[GeneratedImage]:
    output = raw.get("output")
    if not isinstance(output, dict):
        return []
    choices = output.get("choices")
    if not isinstance(choices, list):
        return []

    images: list[GeneratedImage] = []
    for choice in choices:
        if not isinstance(choice, dict):
            continue
        message = choice.get("message")
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for item in content:
            if not isinstance(item, dict):
                continue
            url = str(item.get("image") or "").strip()
            if url:
                images.append(GeneratedImage(url=url))
    return images


def generate_image(
    prompt: str,
    *,
    config: ImageGenerationConfig | None = None,
    api_key: str | None = None,
    base_url: str = QWEN_IMAGE_BASE_URL,
) -> ImageGenerationResult:
    """Generate images with qwen-image-2.0-pro."""
    effective_config = config or ImageGenerationConfig(model_name=DEFAULT_MODEL)
    key = _ensure_api_key(api_key)
    setup_dashscope(key, base_url=base_url)

    normalized_prompt = _normalize_prompt(prompt)
    normalized_size = _normalize_size(effective_config.size)
    normalized_count = _normalize_image_count(effective_config.image_count)
    normalized_seed = _normalize_seed(effective_config.seed)

    call_kwargs: dict[str, Any] = {
        "api_key": key,
        "model": str(effective_config.model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [{"text": normalized_prompt}],
            }
        ],
        "result_format": "message",
        "stream": False,
        "watermark": bool(effective_config.watermark),
        "prompt_extend": bool(effective_config.prompt_extend),
        "size": normalized_size,
        "n": normalized_count,
    }
    if effective_config.negative_prompt:
        call_kwargs["negative_prompt"] = str(effective_config.negative_prompt).strip()
    if normalized_seed is not None:
        call_kwargs["seed"] = normalized_seed

    try:
        response = dashscope.MultiModalConversation.call(**call_kwargs)
    except Exception as exc:
        raise ImageGenerationError("IMAGE_REQUEST_FAILED", "调用图像生成模型失败", str(exc)[:1200]) from exc

    raw = _to_dict(response)
    status_code = int(raw.get("status_code", 200) or 200)
    code = str(raw.get("code") or "").strip()
    message = str(raw.get("message") or "").strip()
    if status_code >= 400 or code:
        raise ImageGenerationError(code or "IMAGE_REQUEST_FAILED", message or "图像生成请求失败", json.dumps(raw, ensure_ascii=False)[:1200])

    images = _extract_images(raw)
    if not images:
        raise ImageGenerationError("IMAGE_RESULT_EMPTY", "图像生成成功但未返回图片地址", json.dumps(raw, ensure_ascii=False)[:1200])

    usage = raw.get("usage") if isinstance(raw.get("usage"), dict) else {}
    width = int(usage.get("width", 0) or 0) or None
    height = int(usage.get("height", 0) or 0) or None

    return ImageGenerationResult(
        images=images,
        provider="dashscope_qwen_image",
        model=call_kwargs["model"],
        request_id=str(raw.get("request_id") or raw.get("requestId") or "").strip(),
        width=width,
        height=height,
        raw_result=raw,
    )


class QwenImageProvider(ImageGenerationProvider):
    """DashScope-backed qwen-image provider."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = QWEN_IMAGE_BASE_URL,
    ):
        self._api_key = str(api_key or "").strip()
        self._base_url = str(base_url or QWEN_IMAGE_BASE_URL).strip() or QWEN_IMAGE_BASE_URL

    @property
    def provider_name(self) -> str:
        return "qwen_image"

    def _default_model_name(self) -> str:
        return DEFAULT_MODEL

    def supports_model(self, model_name: str) -> bool:
        normalized = str(model_name or "").strip()
        return normalized in SUPPORTED_MODELS

    def generate(
        self,
        prompt: str,
        config: ImageGenerationConfig | None = None,
    ) -> ImageGenerationResult:
        effective_config = config or self.get_default_config()
        if not self.supports_model(effective_config.model_name):
            raise ImageGenerationError("IMAGE_MODEL_UNSUPPORTED", f"不支持的图像模型: {effective_config.model_name}")
        return generate_image(
            prompt,
            config=effective_config,
            api_key=self._api_key or None,
            base_url=self._base_url,
        )


__all__ = [
    "DEFAULT_MODEL",
    "SUPPORTED_MODELS",
    "ImageGenerationError",
    "QwenImageProvider",
    "generate_image",
    "setup_dashscope",
]
