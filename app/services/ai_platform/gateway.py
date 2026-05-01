from __future__ import annotations

import base64
from typing import Any, Iterable

from app.core.config import DASHSCOPE_API_KEY, QWEN_VISION_TIMEOUT_SECONDS, TTS_VC_TARGET_MODEL
from app.infra.asr_dashscope import transcribe_audio_file as transcribe_audio_file_with_cloud
from app.infra.image_generation import ImageGenerationConfig, generate_image as generate_image_with_qwen
from app.infra.llm.deepseek import LLMTokenUsage, call_deepseek
from app.infra.tts import create_voice, delete_voice, synthesize_text, synthesize_text_stream
from app.infra.vision import VisionConfig, analyze_image as analyze_image_with_qwen
from app.services.ai_platform.registry import (
    COSYVOICE_TTS_MODEL,
    MT_MODEL,
    QWEN_VL_PLUS_MODEL,
    TENCENT_SOE_MODEL,
    get_default_model_map,
    require_model_descriptor,
)
from app.services.ai_platform.types import AiPlatformError
from app.services.tencent_soe_service import assess_sentence_practice
from app.services.translation_qwen_mt import translate_sentences_to_zh, translate_to_zh


def _descriptor_for(model_key: str, capability_key: str):
    descriptor = require_model_descriptor(model_key)
    if capability_key not in set(descriptor.capabilities):
        raise AiPlatformError("INVALID_CAPABILITY_MODEL", "模型不支持当前能力", f"{model_key}:{capability_key}")
    return descriptor


def resolve_default_model(capability_key: str, *, db=None) -> str:
    defaults = get_default_model_map(db=db)
    return str(defaults.get(str(capability_key or "").strip().lower()) or "").strip()


def transcribe_audio(
    audio_path: str,
    *,
    model_key: str = "",
    known_duration_ms: int | None = None,
    requests_timeout: int | None = None,
    progress_callback=None,
) -> dict[str, Any]:
    resolved_model_key = str(model_key or resolve_default_model("asr")).strip()
    _descriptor_for(resolved_model_key, "asr")
    return transcribe_audio_file_with_cloud(
        audio_path,
        model=resolved_model_key,
        known_duration_ms=known_duration_ms,
        requests_timeout=requests_timeout or 120,
        progress_callback=progress_callback,
    )


def translate_text_to_zh(text: str, *, model_key: str = "", api_key: str | None = None) -> str:
    resolved_model_key = str(model_key or resolve_default_model("mt")).strip() or MT_MODEL
    _descriptor_for(resolved_model_key, "mt")
    if resolved_model_key != MT_MODEL:
        raise AiPlatformError("INVALID_MODEL", "当前仅支持 qwen-mt-flash", resolved_model_key)
    return translate_to_zh(text, api_key=str(api_key or DASHSCOPE_API_KEY or "").strip())


def translate_sentences(
    texts: Iterable[str],
    *,
    model_key: str = "",
    api_key: str | None = None,
    progress_callback=None,
):
    resolved_model_key = str(model_key or resolve_default_model("mt")).strip() or MT_MODEL
    _descriptor_for(resolved_model_key, "mt")
    if resolved_model_key != MT_MODEL:
        raise AiPlatformError("INVALID_MODEL", "当前仅支持 qwen-mt-flash", resolved_model_key)
    return translate_sentences_to_zh(
        list(texts or []),
        api_key=str(api_key or DASHSCOPE_API_KEY or "").strip(),
        progress_callback=progress_callback,
    )


def call_llm_chat(
    messages: list[dict[str, Any]],
    api_key: str,
    *,
    model_key: str = "",
    enable_thinking: bool = False,
    stream: bool = False,
    temperature: float = 0.7,
    max_tokens: int | None = None,
) -> tuple[str, LLMTokenUsage]:
    resolved_model_key = str(model_key or resolve_default_model("llm")).strip()
    _descriptor_for(resolved_model_key, "llm")
    return call_deepseek(
        messages=messages,
        api_key=api_key,
        enable_thinking=enable_thinking,
        stream=stream,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def synthesize_tts(
    *,
    text: str,
    voice: str,
    model_key: str = "",
    language_type: str = "Auto",
    stream: bool = False,
    api_key: str | None = None,
):
    resolved_model_key = str(model_key or resolve_default_model("tts") or COSYVOICE_TTS_MODEL).strip()
    _descriptor_for(resolved_model_key, "tts")
    return synthesize_text(
        text=text,
        voice=voice,
        model=resolved_model_key,
        language_type=language_type,
        stream=stream,
        api_key=api_key,
    )


def synthesize_tts_streaming(
    *,
    text: str,
    voice: str,
    model_key: str = "",
    language_type: str = "Auto",
    api_key: str | None = None,
):
    resolved_model_key = str(model_key or resolve_default_model("tts") or TTS_VC_TARGET_MODEL).strip()
    _descriptor_for(resolved_model_key, "tts")
    return synthesize_text_stream(
        text=text,
        voice=voice,
        model=resolved_model_key,
        language_type=language_type,
        api_key=api_key,
    )


def create_voice_profile_runtime(
    *,
    audio_file_path: str,
    preferred_name: str,
    model_key: str = "",
    language: str | None = None,
    api_key: str | None = None,
):
    resolved_model_key = str(model_key or resolve_default_model("voice_clone")).strip()
    _descriptor_for(resolved_model_key, "voice_clone")
    return create_voice(
        audio_file_path=audio_file_path,
        preferred_name=preferred_name,
        target_model=resolved_model_key,
        language=language,
        api_key=api_key,
    )


def delete_voice_profile_runtime(*, voice_name: str, model_key: str = "", api_key: str | None = None) -> bool:
    resolved_model_key = str(model_key or resolve_default_model("voice_clone")).strip()
    _descriptor_for(resolved_model_key, "voice_clone")
    _ = resolved_model_key
    return delete_voice(voice_name=voice_name, api_key=api_key)


def assess_sentence(
    *,
    audio_path: str,
    ref_text: str,
    user_id: int,
    lesson_id: int | None = None,
    sentence_id: int | None = None,
    db=None,
    model_key: str = "",
    save_result: bool = True,
):
    resolved_model_key = str(model_key or resolve_default_model("soe")).strip() or TENCENT_SOE_MODEL
    _descriptor_for(resolved_model_key, "soe")
    if resolved_model_key != TENCENT_SOE_MODEL:
        raise AiPlatformError("INVALID_MODEL", "当前仅支持 Tencent SOE", resolved_model_key)
    return assess_sentence_practice(
        audio_path=audio_path,
        ref_text=ref_text,
        user_id=user_id,
        lesson_id=lesson_id,
        sentence_id=sentence_id,
        db=db,
        save_result=save_result,
    )


def analyze_image(
    *,
    image_source: str,
    prompt: str = "",
    model_key: str = "",
    api_key: str | None = None,
):
    resolved_model_key = str(model_key or resolve_default_model("vision")).strip()
    _descriptor_for(resolved_model_key, "vision")
    return analyze_image_with_qwen(
        image_source,
        api_key=api_key,
        config=VisionConfig(
            model_name=resolved_model_key,
            prompt=prompt,
            request_timeout=QWEN_VISION_TIMEOUT_SECONDS,
            enable_thinking=False,
        ),
    )


def generate_image_asset(
    *,
    prompt: str,
    model_key: str = "",
    size: str | None = None,
    image_count: int = 1,
    api_key: str | None = None,
):
    resolved_model_key = str(model_key or resolve_default_model("image_generation")).strip()
    _descriptor_for(resolved_model_key, "image_generation")
    return generate_image_with_qwen(
        prompt,
        api_key=api_key,
        config=ImageGenerationConfig(
            model_name=resolved_model_key,
            size=str(size or "1024*1024"),
            image_count=max(1, int(image_count or 1)),
            prompt_extend=True,
            watermark=False,
        ),
    )


def build_tts_data_uri(*, text: str, voice: str, model_key: str = "", api_key: str | None = None) -> str:
    result = synthesize_tts(
        text=text,
        voice=voice,
        model_key=model_key,
        language_type="Auto",
        stream=False,
        api_key=api_key,
    )
    if result.audio_url:
        return result.audio_url
    if result.audio_data:
        return f"data:audio/mpeg;base64,{result.audio_data}"
    raise AiPlatformError("TTS_EMPTY", "语音合成返回为空")


def extract_text_from_image_legacy(
    *,
    image_data_url: str,
    prompt: str,
    model_key: str = QWEN_VL_PLUS_MODEL,
) -> str:
    result = analyze_image(
        image_source=image_data_url,
        prompt=prompt,
        model_key=model_key,
    )
    return str(getattr(result, "text", "") or "").strip()
