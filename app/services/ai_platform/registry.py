from __future__ import annotations

import os
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import (
    DASHSCOPE_API_KEY,
    LESSON_DEFAULT_ASR_MODEL,
    QWEN_IMAGE_MODEL,
    QWEN_OCR_MODEL,
    QWEN_VISION_MODEL,
    STEPFUN_API_KEY,
    TENCENT_SECRET_ID,
    TENCENT_SECRET_KEY,
    TENCENT_SOE_APP_ID,
    TTS_VC_ENROLLMENT_MODEL,
    TTS_VC_REALTIME_MODEL,
    TTS_VC_TARGET_MODEL,
)
from app.infra.asr_stepfun import STEPFUN_ASR_MODEL
from app.infra.llm.deepseek import DEEPSEEK_MODEL_FAST
from app.services.ai_platform.types import AiCapabilityDescriptor, AiModelAction, AiModelDescriptor, AiPlatformError
from app.services.translation_qwen_mt import MT_MODEL


QWEN_ASR_MODEL = "qwen3-asr-flash-filetrans"
COSYVOICE_TTS_MODEL = "cosyvoice-v1"
QWEN_VL_PLUS_MODEL = "qwen-vl-plus"
TENCENT_SOE_MODEL = "tencent-soe-sentence"

STATUS_READY = "ready"
STATUS_MISSING = "missing"
STATUS_ERROR = "error"

_VERIFY_ACTION = (AiModelAction(key="verify", label="Verify", enabled=True, primary=False),)
_DISABLED_VERIFY_ACTION = (AiModelAction(key="verify", label="Verify", enabled=False, primary=False),)
_FALSEY_ENV_VALUES = {"0", "false", "no", "off"}


def _bool_env_disabled(value: str | None, default: str = "1") -> bool:
    return str(value or default).strip().lower() in _FALSEY_ENV_VALUES


def _dashscope_available() -> tuple[bool, str]:
    if not str(DASHSCOPE_API_KEY or "").strip():
        return False, "DASHSCOPE_API_KEY is missing."
    return True, "Cloud API is ready."


def _stepfun_available() -> tuple[bool, str]:
    if not str(STEPFUN_API_KEY or "").strip():
        return False, "STEPFUN_API_KEY is missing."
    return True, "Cloud API is ready."


def _tencent_soe_available() -> tuple[bool, str]:
    if not str(TENCENT_SOE_APP_ID or "").strip():
        return False, "TENCENT_SOE_APP_ID is missing."
    if not str(TENCENT_SECRET_ID or "").strip():
        return False, "TENCENT_SECRET_ID is missing."
    if not str(TENCENT_SECRET_KEY or "").strip():
        return False, "TENCENT_SECRET_KEY is missing."
    return True, "Tencent SOE is ready."


def _build_cloud_descriptor(
    *,
    model_key: str,
    display_name: str,
    provider: str,
    capabilities: tuple,
    subtitle: str,
    note: str,
    available: bool,
    message: str,
    status_when_unavailable: str = STATUS_MISSING,
    supports_upload: bool = False,
    supports_preview: bool = False,
    supports_transcribe_api: bool = False,
    default_for_capabilities: tuple = (),
    supported_features: tuple[str, ...] = (),
) -> AiModelDescriptor:
    return AiModelDescriptor(
        model_key=model_key,
        display_name=display_name,
        provider=provider,
        capabilities=capabilities,
        subtitle=subtitle,
        note=note,
        runtime_kind="cloud_api",
        runtime_label="Cloud API",
        prepare_mode="none",
        cache_scope="cloud",
        status=STATUS_READY if available else status_when_unavailable,
        available=available,
        download_required=False,
        preparing=False,
        cached=False,
        message=message,
        last_error="" if available else message,
        actions=_VERIFY_ACTION if available or status_when_unavailable != STATUS_ERROR else _DISABLED_VERIFY_ACTION,
        supports_upload=supports_upload,
        supports_preview=supports_preview,
        supports_transcribe_api=supports_transcribe_api,
        default_for_capabilities=default_for_capabilities,
        supported_features=supported_features,
    )


def _build_qwen_asr_descriptor() -> AiModelDescriptor:
    if _bool_env_disabled(os.getenv("QWEN_ASR_ENABLED"), "1"):
        return _build_cloud_descriptor(
            model_key=QWEN_ASR_MODEL,
            display_name="Bottle 2.0",
            provider="dashscope",
            capabilities=("asr",),
            subtitle="网页端默认路径，上传后即可开始生成。",
            note="Bottle 2.0 通过 DashScope 云端能力完成识别。",
            available=False,
            message="Cloud API is disabled for this deployment.",
            status_when_unavailable=STATUS_ERROR,
            supports_upload=True,
            supports_transcribe_api=True,
            default_for_capabilities=("asr",),
            supported_features=("lesson_upload_generation",),
        )
    available, message = _dashscope_available()
    return _build_cloud_descriptor(
        model_key=QWEN_ASR_MODEL,
        display_name="Bottle 2.0",
        provider="dashscope",
        capabilities=("asr",),
        subtitle="网页端默认路径，上传后即可开始生成。",
        note="Bottle 2.0 通过 DashScope 云端能力完成识别。",
        available=available,
        message=message,
        supports_upload=True,
        supports_transcribe_api=True,
        default_for_capabilities=("asr",),
        supported_features=("lesson_upload_generation",),
    )


def _build_stepfun_asr_descriptor() -> AiModelDescriptor:
    if _bool_env_disabled(os.getenv("STEPFUN_ASR_ENABLED"), "1"):
        return _build_cloud_descriptor(
            model_key=STEPFUN_ASR_MODEL,
            display_name="StepAudio 2.5 ASR",
            provider="stepfun",
            capabilities=("asr",),
            subtitle="英文素材默认识别路径，使用 StepAudio 2.5 云端识别。",
            note="默认 language=en，enable_itn=false，适合英语学习字幕。",
            available=False,
            message="StepAudio 2.5 ASR is disabled for this deployment.",
            status_when_unavailable=STATUS_ERROR,
            supports_upload=True,
            supports_transcribe_api=True,
            supported_features=("lesson_upload_generation",),
        )
    available, message = _stepfun_available()
    return _build_cloud_descriptor(
        model_key=STEPFUN_ASR_MODEL,
        display_name="StepAudio 2.5 ASR",
        provider="stepfun",
        capabilities=("asr",),
        subtitle="英文素材默认识别路径，使用 StepAudio 2.5 云端识别。",
        note="默认 language=en，enable_itn=false，适合英语学习字幕。",
        available=available,
        message=message,
        supports_upload=True,
        supports_transcribe_api=True,
        supported_features=("lesson_upload_generation",),
    )


def _build_mt_descriptor() -> AiModelDescriptor:
    available, message = _dashscope_available()
    return _build_cloud_descriptor(
        model_key=MT_MODEL,
        display_name="Qwen MT Flash",
        provider="dashscope",
        capabilities=("mt",),
        subtitle="课程中文翻译与生词翻译默认模型。",
        note="用于字幕翻译与词语翻译，不参与英文 ASR 识别。",
        available=available,
        message=message,
        default_for_capabilities=("mt",),
        supported_features=("subtitle_translation", "word_translation"),
    )


def _build_llm_descriptor() -> AiModelDescriptor:
    available, message = _dashscope_available()
    return _build_cloud_descriptor(
        model_key=DEEPSEEK_MODEL_FAST,
        display_name="DeepSeek V3.2",
        provider="deepseek",
        capabilities=("llm",),
        subtitle="讲解、测验、讨论、写作等文本生成默认模型。",
        note="当前 thinking 与 fast 共用同一模型 ID，由请求参数决定推理模式。",
        available=available,
        message=message,
        default_for_capabilities=("llm",),
        supported_features=("lesson_explanation", "quiz_generation", "discussion_generation", "writing_generation"),
    )


def _build_tts_descriptors() -> list[AiModelDescriptor]:
    available, message = _dashscope_available()
    return [
        _build_cloud_descriptor(
            model_key=COSYVOICE_TTS_MODEL,
            display_name="CosyVoice V1",
            provider="dashscope",
            capabilities=("tts",),
            subtitle="阅读课堂和普通语音合成默认音色模型。",
            note="适合短句 TTS 回放。",
            available=available,
            message=message,
            default_for_capabilities=("tts",),
            supported_features=("speech_synthesis",),
        ),
        _build_cloud_descriptor(
            model_key=TTS_VC_TARGET_MODEL,
            display_name="Qwen TTS VC",
            provider="dashscope",
            capabilities=("tts",),
            subtitle="支持语音克隆音色的标准 TTS 模型。",
            note="用于讲解音频和自定义音色合成。",
            available=available,
            message=message,
            supported_features=("speech_synthesis", "voice_clone_playback"),
        ),
        _build_cloud_descriptor(
            model_key=TTS_VC_REALTIME_MODEL,
            display_name="Qwen TTS VC Realtime",
            provider="dashscope",
            capabilities=("tts",),
            subtitle="流式 TTS 模型。",
            note="用于实时语音输出。",
            available=available,
            message=message,
            supported_features=("speech_synthesis_stream",),
        ),
    ]


def _build_voice_clone_descriptor() -> AiModelDescriptor:
    available, message = _dashscope_available()
    return _build_cloud_descriptor(
        model_key=TTS_VC_ENROLLMENT_MODEL,
        display_name="Qwen Voice Enrollment",
        provider="dashscope",
        capabilities=("voice_clone",),
        subtitle="用户音色创建模型。",
        note="用于创建和管理自定义语音音色。",
        available=available,
        message=message,
        default_for_capabilities=("voice_clone",),
        supported_features=("voice_profile_create", "voice_profile_delete"),
    )


def _build_soe_descriptor() -> AiModelDescriptor:
    available, message = _tencent_soe_available()
    return _build_cloud_descriptor(
        model_key=TENCENT_SOE_MODEL,
        display_name="Tencent SOE",
        provider="tencent",
        capabilities=("soe",),
        subtitle="句子口语评测模型。",
        note="用于英语跟读评分。",
        available=available,
        message=message,
        default_for_capabilities=("soe",),
        supported_features=("sentence_assessment",),
    )


def _build_vision_descriptor() -> AiModelDescriptor:
    available, message = _dashscope_available()
    return _build_cloud_descriptor(
        model_key=QWEN_VISION_MODEL,
        display_name="Qwen Vision",
        provider="dashscope",
        capabilities=("vision",),
        subtitle="图片理解默认模型。",
        note="用于图片理解和视觉问答。",
        available=available,
        message=message,
        default_for_capabilities=("vision",),
        supported_features=("image_understanding",),
    )


def _build_image_generation_descriptor() -> AiModelDescriptor:
    available, message = _dashscope_available()
    return _build_cloud_descriptor(
        model_key=QWEN_IMAGE_MODEL,
        display_name="Qwen Image",
        provider="dashscope",
        capabilities=("image_generation",),
        subtitle="图片生成默认模型。",
        note="用于词卡配图和图片生成。",
        available=available,
        message=message,
        default_for_capabilities=("image_generation",),
        supported_features=("image_generation",),
    )


def _build_ocr_descriptors() -> list[AiModelDescriptor]:
    available, message = _dashscope_available()
    return [
        _build_cloud_descriptor(
            model_key=QWEN_OCR_MODEL,
            display_name="Qwen OCR",
            provider="dashscope",
            capabilities=("ocr",),
            subtitle="OCR 服务默认模型。",
            note="用于图片文字提取。",
            available=available,
            message=message,
            default_for_capabilities=("ocr",),
            supported_features=("ocr",),
        ),
        _build_cloud_descriptor(
            model_key=QWEN_VL_PLUS_MODEL,
            display_name="Qwen VL Plus",
            provider="dashscope",
            capabilities=("ocr", "vision"),
            subtitle="兼容旧图片识别入口的多模态模型。",
            note="用于图片 OCR 兼容路径。",
            available=available,
            message=message,
            supported_features=("ocr", "image_understanding"),
        ),
    ]


def list_capability_descriptors(default_models: dict[str, str] | None = None) -> list[AiCapabilityDescriptor]:
    defaults = dict(default_models or {})
    return [
        AiCapabilityDescriptor("asr", "ASR", "音视频转写与字幕识别", defaults.get("asr", "")),
        AiCapabilityDescriptor("mt", "Translation", "字幕与文本翻译", defaults.get("mt", "")),
        AiCapabilityDescriptor("llm", "LLM", "讲解、测验、讨论、写作等文本生成", defaults.get("llm", "")),
        AiCapabilityDescriptor("tts", "TTS", "文本转语音", defaults.get("tts", "")),
        AiCapabilityDescriptor("soe", "SOE", "口语评分", defaults.get("soe", "")),
        AiCapabilityDescriptor("vision", "Vision", "图片理解与视觉问答", defaults.get("vision", "")),
        AiCapabilityDescriptor("image_generation", "Image Generation", "图片生成", defaults.get("image_generation", "")),
        AiCapabilityDescriptor("voice_clone", "Voice Clone", "音色创建与管理", defaults.get("voice_clone", "")),
        AiCapabilityDescriptor("ocr", "OCR", "图片文字提取", defaults.get("ocr", "")),
    ]


def list_model_descriptors() -> list[AiModelDescriptor]:
    models = [
        _build_qwen_asr_descriptor(),
        _build_stepfun_asr_descriptor(),
        _build_mt_descriptor(),
        _build_llm_descriptor(),
        *_build_tts_descriptors(),
        _build_voice_clone_descriptor(),
        _build_soe_descriptor(),
        _build_vision_descriptor(),
        _build_image_generation_descriptor(),
        *_build_ocr_descriptors(),
    ]
    deduped: dict[str, AiModelDescriptor] = {}
    for item in models:
        deduped[item.model_key] = item
    return list(deduped.values())


def get_model_descriptor(model_key: str) -> AiModelDescriptor | None:
    normalized_model_key = str(model_key or "").strip()
    if not normalized_model_key:
        return None
    for descriptor in list_model_descriptors():
        if descriptor.model_key == normalized_model_key:
            return descriptor
    return None


def require_model_descriptor(model_key: str) -> AiModelDescriptor:
    descriptor = get_model_descriptor(model_key)
    if descriptor is None:
        raise AiPlatformError("INVALID_MODEL", "不支持的模型", model_key)
    return descriptor


def filter_models_by_capability(capability_key: str) -> list[AiModelDescriptor]:
    normalized_capability_key = str(capability_key or "").strip().lower()
    return [
        item
        for item in list_model_descriptors()
        if normalized_capability_key and normalized_capability_key in {value for value in item.capabilities}
    ]


def get_supported_model_keys(capability_key: str | None = None) -> tuple[str, ...]:
    descriptors = filter_models_by_capability(capability_key) if capability_key else list_model_descriptors()
    return tuple(item.model_key for item in descriptors)


def get_default_model_map(db: Session | None = None) -> dict[str, str]:
    asr_default = LESSON_DEFAULT_ASR_MODEL
    if db is not None:
        try:
            from app.services.billing.settings import get_default_asr_model
            asr_default = get_default_asr_model(db)
        except Exception:
            asr_default = LESSON_DEFAULT_ASR_MODEL
    return {
        "asr": str(asr_default or LESSON_DEFAULT_ASR_MODEL).strip() or LESSON_DEFAULT_ASR_MODEL,
        "mt": MT_MODEL,
        "llm": DEEPSEEK_MODEL_FAST,
        "tts": COSYVOICE_TTS_MODEL,
        "soe": TENCENT_SOE_MODEL,
        "vision": QWEN_VISION_MODEL,
        "image_generation": QWEN_IMAGE_MODEL,
        "voice_clone": TTS_VC_ENROLLMENT_MODEL,
        "ocr": QWEN_OCR_MODEL,
    }


def list_model_status_payloads() -> list[dict[str, Any]]:
    return [item.to_dict() for item in list_model_descriptors()]
