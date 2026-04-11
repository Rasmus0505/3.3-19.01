"""Qwen3-VL image understanding provider implementation."""
from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path
from typing import Any, Optional

from openai import OpenAI

from app.core.config import (
    DASHSCOPE_API_KEY,
    QWEN_VISION_BASE_URL,
    QWEN_VISION_MODEL,
    QWEN_VISION_TIMEOUT_SECONDS,
)
from app.infra.vision.base import VisionConfig, VisionProvider, VisionResult


DEFAULT_MODEL = QWEN_VISION_MODEL
SUPPORTED_MODEL_PREFIXES = ("qwen3-vl-flash",)
DEFAULT_PROMPT = "请用简洁中文描述图片中最重要的信息。"
_MIN_PIXELS_MINIMUM = 65536
_MAX_PIXELS_MAXIMUM = 16777216


class VisionError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        super().__init__(message)
        self.code = str(code or "VISION_FAILED").strip() or "VISION_FAILED"
        self.message = str(message or "vision failed").strip() or "vision failed"
        self.detail = str(detail or "").strip()


def _client(api_key: str, *, base_url: str = QWEN_VISION_BASE_URL) -> OpenAI:
    return OpenAI(api_key=api_key, base_url=base_url, max_retries=0)


def _ensure_api_key(api_key: Optional[str] = None) -> str:
    key = str(api_key or DASHSCOPE_API_KEY or "").strip()
    if key:
        return key
    raise VisionError("VISION_API_KEY_MISSING", "DASHSCOPE_API_KEY 未配置")


def _to_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
            if isinstance(dumped, dict):
                return dumped
        except Exception:
            pass
    if hasattr(value, "to_dict"):
        try:
            dumped = value.to_dict()
            if isinstance(dumped, dict):
                return dumped
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


def _supports_model_name(model_name: str | None) -> bool:
    normalized = str(model_name or "").strip().lower()
    return any(normalized.startswith(prefix) for prefix in SUPPORTED_MODEL_PREFIXES)


def _normalize_model(model_name: str | None) -> str:
    normalized = str(model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if not _supports_model_name(normalized):
        raise VisionError("VISION_MODEL_UNSUPPORTED", f"不支持的视觉模型: {normalized}")
    return normalized


def _normalize_prompt(prompt: str | None) -> str:
    text = str(prompt or "").strip()
    return text or DEFAULT_PROMPT


def _normalize_pixels(value: int, *, field_name: str, minimum: int, maximum: int) -> int:
    try:
        normalized = int(value)
    except Exception as exc:
        raise VisionError("VISION_INVALID_PIXELS", f"{field_name} 必须为整数") from exc
    if normalized < minimum or normalized > maximum:
        raise VisionError("VISION_INVALID_PIXELS", f"{field_name} 必须在 {minimum} 到 {maximum} 之间")
    return normalized


def _normalize_seed(seed: int | None) -> int | None:
    if seed is None:
        return None
    try:
        normalized = int(seed)
    except Exception as exc:
        raise VisionError("VISION_INVALID_SEED", "seed 必须为整数") from exc
    if normalized < 0 or normalized > 2147483647:
        raise VisionError("VISION_INVALID_SEED", "seed 取值范围必须在 0 到 2147483647 之间")
    return normalized


def _guess_data_url_for_file(path_text: str) -> str:
    path = Path(path_text)
    if not path.exists():
        raise VisionError("VISION_IMAGE_NOT_FOUND", f"图像文件不存在: {path_text}")
    mime_type, _ = mimetypes.guess_type(path.name)
    mime_type = mime_type or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _normalize_image_source(image_source: str) -> str:
    text = str(image_source or "").strip()
    if not text:
        raise VisionError("VISION_IMAGE_REQUIRED", "image_source 不能为空")
    if text.startswith("http://") or text.startswith("https://") or text.startswith("data:"):
        return text
    return _guess_data_url_for_file(text)


def _build_messages(image_source: str, config: VisionConfig) -> list[dict[str, Any]]:
    return [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": _normalize_prompt(config.prompt),
                },
                {
                    "type": "image_url",
                    "image_url": {"url": _normalize_image_source(image_source)},
                    "min_pixels": _normalize_pixels(
                        config.min_pixels,
                        field_name="min_pixels",
                        minimum=_MIN_PIXELS_MINIMUM,
                        maximum=_MAX_PIXELS_MAXIMUM,
                    ),
                    "max_pixels": _normalize_pixels(
                        config.max_pixels,
                        field_name="max_pixels",
                        minimum=_MIN_PIXELS_MINIMUM,
                        maximum=_MAX_PIXELS_MAXIMUM,
                    ),
                },
            ],
        }
    ]


def _extract_text(raw: dict[str, Any]) -> str:
    choices = raw.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first_choice = choices[0] if isinstance(choices[0], dict) else {}
    message = first_choice.get("message") if isinstance(first_choice.get("message"), dict) else {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        text_parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if text:
                text_parts.append(text)
        return "\n".join(text_parts).strip()
    return ""


def analyze_image(
    image_source: str,
    *,
    config: Optional[VisionConfig] = None,
    api_key: Optional[str] = None,
    base_url: str = QWEN_VISION_BASE_URL,
) -> VisionResult:
    """Analyze an image with qwen3-vl-flash."""
    effective_config = config or VisionConfig(model_name=DEFAULT_MODEL)
    key = _ensure_api_key(api_key)
    client = _client(key, base_url=base_url)

    call_kwargs: dict[str, Any] = {
        "model": _normalize_model(effective_config.model_name),
        "messages": _build_messages(image_source, effective_config),
        "temperature": float(effective_config.temperature),
        "top_p": float(effective_config.top_p),
        "timeout": int(effective_config.request_timeout or QWEN_VISION_TIMEOUT_SECONDS or 45),
    }
    if effective_config.max_tokens is not None:
        call_kwargs["max_tokens"] = int(effective_config.max_tokens)
    normalized_seed = _normalize_seed(effective_config.seed)
    if normalized_seed is not None:
        call_kwargs["seed"] = normalized_seed

    extra_body: dict[str, Any] = {}
    if not effective_config.enable_thinking:
        extra_body["enable_thinking"] = False
    if effective_config.vl_high_resolution_images:
        extra_body["vl_high_resolution_images"] = True
    if extra_body:
        call_kwargs["extra_body"] = extra_body

    try:
        response = client.chat.completions.create(**call_kwargs)
    except Exception as exc:
        raise VisionError("VISION_REQUEST_FAILED", "调用视觉模型失败", str(exc)[:1200]) from exc

    raw = _to_dict(response)
    text = _extract_text(raw)
    if not text:
        raise VisionError("VISION_RESULT_EMPTY", "视觉模型调用成功但未返回文本", json.dumps(raw, ensure_ascii=False)[:1200])

    usage = raw.get("usage") if isinstance(raw.get("usage"), dict) else {}
    image_tokens = 0
    prompt_details = usage.get("prompt_tokens_details")
    if isinstance(prompt_details, dict):
        image_tokens = int(prompt_details.get("image_tokens", 0) or 0)
    if image_tokens <= 0:
        image_tokens = int(usage.get("image_tokens", 0) or 0)

    request_id = str(
        raw.get("request_id")
        or raw.get("requestId")
        or raw.get("id")
        or ""
    ).strip()

    return VisionResult(
        text=text,
        provider="dashscope_qwen_vision",
        model=str(raw.get("model") or call_kwargs["model"]).strip(),
        request_id=request_id,
        prompt_tokens=int(usage.get("prompt_tokens", 0) or 0),
        completion_tokens=int(usage.get("completion_tokens", 0) or 0),
        total_tokens=int(usage.get("total_tokens", 0) or 0),
        image_tokens=image_tokens,
        raw_result=raw,
    )


class QwenVisionProvider(VisionProvider):
    """DashScope-backed qwen3-vl-flash provider."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: str = QWEN_VISION_BASE_URL,
    ):
        self._api_key = str(api_key or "").strip()
        self._base_url = str(base_url or QWEN_VISION_BASE_URL).strip() or QWEN_VISION_BASE_URL

    @property
    def provider_name(self) -> str:
        return "qwen_vision"

    def _default_model_name(self) -> str:
        return DEFAULT_MODEL

    def supports_model(self, model_name: str) -> bool:
        return _supports_model_name(model_name)

    def analyze(
        self,
        image_source: str,
        config: Optional[VisionConfig] = None,
    ) -> VisionResult:
        effective_config = config or self.get_default_config()
        if not self.supports_model(effective_config.model_name):
            raise VisionError("VISION_MODEL_UNSUPPORTED", f"不支持的视觉模型: {effective_config.model_name}")
        return analyze_image(
            image_source,
            config=effective_config,
            api_key=self._api_key or None,
            base_url=self._base_url,
        )


__all__ = [
    "DEFAULT_MODEL",
    "SUPPORTED_MODEL_PREFIXES",
    "QwenVisionProvider",
    "VisionError",
    "analyze_image",
]
