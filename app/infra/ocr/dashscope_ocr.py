"""DashScope-backed OCR provider implementation."""
from __future__ import annotations

import base64
import json
import mimetypes
from pathlib import Path
from typing import Any

import dashscope

from app.core.config import (
    DASHSCOPE_API_KEY,
    QWEN_OCR_BASE_URL,
    QWEN_OCR_MODEL,
)
from app.infra.ocr.base import OCRConfig, OCRProvider, OCRResult, OCRWordInfo

DEFAULT_MODEL = QWEN_OCR_MODEL
SUPPORTED_MODELS = {
    "qwen-vl-ocr",
    "qwen-vl-ocr-latest",
    "qwen-vl-ocr-2025-11-20",
    "qwen-vl-ocr-2025-08-28",
    "qwen-vl-ocr-2025-04-13",
    "qwen-vl-ocr-2024-10-28",
}
DEFAULT_PROMPT = "Please output only the text content from the image without any additional descriptions or formatting."


class OCRError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        super().__init__(message)
        self.code = str(code or "OCR_FAILED").strip() or "OCR_FAILED"
        self.message = str(message or "ocr failed").strip() or "ocr failed"
        self.detail = str(detail or "").strip()


def setup_dashscope(api_key: str, *, base_url: str = QWEN_OCR_BASE_URL) -> None:
    dashscope.api_key = (api_key or "").strip()
    dashscope.base_http_api_url = str(base_url or QWEN_OCR_BASE_URL).strip() or QWEN_OCR_BASE_URL


def _ensure_api_key(api_key: str | None = None) -> str:
    key = str(api_key or getattr(dashscope, "api_key", "") or DASHSCOPE_API_KEY or "").strip()
    if key:
        return key
    raise OCRError("OCR_API_KEY_MISSING", "DASHSCOPE_API_KEY 未配置")


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


def _normalize_model(model_name: str | None) -> str:
    normalized = str(model_name or DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if normalized not in SUPPORTED_MODELS:
        raise OCRError("OCR_MODEL_UNSUPPORTED", f"不支持的 OCR 模型: {normalized}")
    return normalized


def _normalize_prompt(prompt: str | None) -> str:
    text = str(prompt or "").strip()
    return text or DEFAULT_PROMPT


def _normalize_pixels(value: int, *, field_name: str, minimum: int, maximum: int) -> int:
    try:
        normalized = int(value)
    except Exception as exc:
        raise OCRError("OCR_INVALID_PIXELS", f"{field_name} 必须为整数") from exc
    if normalized < minimum or normalized > maximum:
        raise OCRError("OCR_INVALID_PIXELS", f"{field_name} 必须在 {minimum} 到 {maximum} 之间")
    return normalized


def _normalize_seed(seed: int | None) -> int | None:
    if seed is None:
        return None
    try:
        normalized = int(seed)
    except Exception as exc:
        raise OCRError("OCR_INVALID_SEED", "seed 必须为整数") from exc
    if normalized < 0 or normalized > 2147483647:
        raise OCRError("OCR_INVALID_SEED", "seed 取值范围必须在 0 到 2147483647 之间")
    return normalized


def _guess_data_url_for_file(path_text: str) -> str:
    path = Path(path_text)
    if not path.exists():
        raise OCRError("OCR_IMAGE_NOT_FOUND", f"图像文件不存在: {path_text}")
    mime_type, _ = mimetypes.guess_type(path.name)
    mime_type = mime_type or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _normalize_image_source(image_source: str) -> str:
    text = str(image_source or "").strip()
    if not text:
        raise OCRError("OCR_IMAGE_REQUIRED", "image_source 不能为空")
    if text.startswith("http://") or text.startswith("https://") or text.startswith("data:"):
        return text
    return _guess_data_url_for_file(text)


def _build_messages(image_source: str, config: OCRConfig) -> list[dict[str, Any]]:
    image_content: dict[str, Any] = {
        "image": _normalize_image_source(image_source),
        "min_pixels": _normalize_pixels(
            config.min_pixels,
            field_name="min_pixels",
            minimum=3072,
            maximum=30720000,
        ),
        "max_pixels": _normalize_pixels(
            config.max_pixels,
            field_name="max_pixels",
            minimum=3072,
            maximum=30720000,
        ),
    }
    if config.enable_rotate:
        image_content["enable_rotate"] = True

    if config.task:
        return [{"role": "user", "content": [image_content]}]

    return [
        {
            "role": "user",
            "content": [
                image_content,
                {"text": _normalize_prompt(config.prompt)},
            ],
        }
    ]


def _build_call_kwargs(image_source: str, config: OCRConfig, api_key: str) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "api_key": api_key,
        "model": _normalize_model(config.model_name),
        "messages": _build_messages(image_source, config),
        "temperature": float(config.temperature),
        "top_p": float(config.top_p),
        "incremental_output": False,
    }
    if config.max_tokens is not None:
        kwargs["max_tokens"] = int(config.max_tokens)
    normalized_seed = _normalize_seed(config.seed)
    if normalized_seed is not None:
        kwargs["seed"] = normalized_seed
    if config.task:
        kwargs["ocr_options"] = {
            "task": str(config.task).strip(),
        }
        if config.task_config:
            kwargs["ocr_options"]["task_config"] = dict(config.task_config)
    return kwargs


def _extract_text_item(item: dict[str, Any]) -> str:
    value = item.get("text")
    if value is None:
        return ""
    return str(value)


def _extract_result(raw: dict[str, Any], model_name: str) -> OCRResult:
    output = raw.get("output") if isinstance(raw.get("output"), dict) else {}
    choices = output.get("choices") if isinstance(output.get("choices"), list) else []
    if not choices:
        raise OCRError("OCR_RESULT_EMPTY", "OCR 调用成功但未返回 choices", json.dumps(raw, ensure_ascii=False)[:1200])

    first_choice = choices[0] if isinstance(choices[0], dict) else {}
    message = first_choice.get("message") if isinstance(first_choice.get("message"), dict) else {}
    content = message.get("content")

    text_parts: list[str] = []
    structured_result: dict[str, Any] | None = None
    words_info: list[OCRWordInfo] = []

    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            text = _extract_text_item(item)
            if text:
                text_parts.append(text)
            ocr_result = item.get("ocr_result")
            if isinstance(ocr_result, dict):
                if isinstance(ocr_result.get("kv_result"), dict):
                    structured_result = dict(ocr_result["kv_result"])
                lines = ocr_result.get("words_info")
                if isinstance(lines, list):
                    for line in lines:
                        if not isinstance(line, dict):
                            continue
                        words_info.append(
                            OCRWordInfo(
                                text=str(line.get("text") or "").strip(),
                                location=list(line.get("location") or []),
                                rotate_rect=list(line.get("rotate_rect") or []),
                            )
                        )
    elif isinstance(content, str):
        text_parts.append(content)

    combined_text = "\n".join(part for part in text_parts if str(part).strip()).strip()
    usage = raw.get("usage") if isinstance(raw.get("usage"), dict) else {}

    return OCRResult(
        text=combined_text,
        structured_result=structured_result,
        words_info=words_info,
        provider="dashscope_qwen_ocr",
        model=model_name,
        request_id=str(raw.get("request_id") or raw.get("requestId") or "").strip(),
        prompt_tokens=int(
            usage.get("prompt_tokens")
            or usage.get("input_tokens")
            or 0
        ),
        completion_tokens=int(
            usage.get("completion_tokens")
            or usage.get("output_tokens")
            or 0
        ),
        total_tokens=int(usage.get("total_tokens") or 0),
        image_tokens=int(
            usage.get("image_tokens")
            or ((usage.get("input_tokens_details") or {}).get("image_tokens") if isinstance(usage.get("input_tokens_details"), dict) else 0)
            or 0
        ),
        raw_result=raw,
    )


def extract_ocr(
    image_source: str,
    *,
    config: OCRConfig | None = None,
    api_key: str | None = None,
    base_url: str = QWEN_OCR_BASE_URL,
) -> OCRResult:
    effective_config = config or OCRConfig(model_name=DEFAULT_MODEL)
    key = _ensure_api_key(api_key)
    setup_dashscope(key, base_url=base_url)
    model_name = _normalize_model(effective_config.model_name)
    call_kwargs = _build_call_kwargs(image_source, effective_config, key)

    try:
        response = dashscope.MultiModalConversation.call(**call_kwargs)
    except Exception as exc:
        raise OCRError("OCR_REQUEST_FAILED", "调用 OCR 模型失败", str(exc)[:1200]) from exc

    raw = _to_dict(response)
    status_code = int(raw.get("status_code", 200) or 200)
    code = str(raw.get("code") or "").strip()
    message = str(raw.get("message") or "").strip()
    if status_code >= 400 or code:
        raise OCRError(code or "OCR_REQUEST_FAILED", message or "OCR 请求失败", json.dumps(raw, ensure_ascii=False)[:1200])

    return _extract_result(raw, model_name)


class DashScopeOCRProvider(OCRProvider):
    """DashScope-backed OCR provider."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = QWEN_OCR_BASE_URL,
    ):
        self._api_key = str(api_key or "").strip()
        self._base_url = str(base_url or QWEN_OCR_BASE_URL).strip() or QWEN_OCR_BASE_URL

    @property
    def provider_name(self) -> str:
        return "dashscope_ocr"

    def _default_model_name(self) -> str:
        return DEFAULT_MODEL

    def supports_model(self, model_name: str) -> bool:
        return str(model_name or "").strip() in SUPPORTED_MODELS

    def extract(
        self,
        image_source: str,
        config: OCRConfig | None = None,
    ) -> OCRResult:
        effective_config = config or self.get_default_config()
        return extract_ocr(
            image_source,
            config=effective_config,
            api_key=self._api_key or None,
            base_url=self._base_url,
        )


__all__ = [
    "DEFAULT_MODEL",
    "SUPPORTED_MODELS",
    "DashScopeOCRProvider",
    "OCRError",
    "extract_ocr",
    "setup_dashscope",
]
