from app.services.ai_platform.registry import (
    COSYVOICE_TTS_MODEL,
    QWEN_ASR_MODEL,
    QWEN_VL_PLUS_MODEL,
    TENCENT_SOE_MODEL,
    filter_models_by_capability,
    get_default_model_map,
    get_model_descriptor,
    get_supported_model_keys,
    list_capability_descriptors,
    list_model_descriptors,
    list_model_status_payloads,
    require_model_descriptor,
)
from app.services.ai_platform.types import (
    AiCapabilityDescriptor,
    AiExecutionRequest,
    AiModelAction,
    AiModelDescriptor,
    AiPlatformError,
)


def transcribe_audio(*args, **kwargs):
    from app.services.ai_platform.gateway import transcribe_audio as _impl
    return _impl(*args, **kwargs)


def translate_text_to_zh(*args, **kwargs):
    from app.services.ai_platform.gateway import translate_text_to_zh as _impl
    return _impl(*args, **kwargs)


def translate_sentences(*args, **kwargs):
    from app.services.ai_platform.gateway import translate_sentences as _impl
    return _impl(*args, **kwargs)


def call_llm_chat(*args, **kwargs):
    from app.services.ai_platform.gateway import call_llm_chat as _impl
    return _impl(*args, **kwargs)


def synthesize_tts(*args, **kwargs):
    from app.services.ai_platform.gateway import synthesize_tts as _impl
    return _impl(*args, **kwargs)


def synthesize_tts_streaming(*args, **kwargs):
    from app.services.ai_platform.gateway import synthesize_tts_streaming as _impl
    return _impl(*args, **kwargs)


def create_voice_profile_runtime(*args, **kwargs):
    from app.services.ai_platform.gateway import create_voice_profile_runtime as _impl
    return _impl(*args, **kwargs)


def delete_voice_profile_runtime(*args, **kwargs):
    from app.services.ai_platform.gateway import delete_voice_profile_runtime as _impl
    return _impl(*args, **kwargs)


def assess_sentence(*args, **kwargs):
    from app.services.ai_platform.gateway import assess_sentence as _impl
    return _impl(*args, **kwargs)


def analyze_image(*args, **kwargs):
    from app.services.ai_platform.gateway import analyze_image as _impl
    return _impl(*args, **kwargs)


def generate_image_asset(*args, **kwargs):
    from app.services.ai_platform.gateway import generate_image_asset as _impl
    return _impl(*args, **kwargs)


def build_tts_data_uri(*args, **kwargs):
    from app.services.ai_platform.gateway import build_tts_data_uri as _impl
    return _impl(*args, **kwargs)


def resolve_default_model(*args, **kwargs):
    from app.services.ai_platform.gateway import resolve_default_model as _impl
    return _impl(*args, **kwargs)


__all__ = [
    "AiCapabilityDescriptor",
    "AiExecutionRequest",
    "AiModelAction",
    "AiModelDescriptor",
    "AiPlatformError",
    "COSYVOICE_TTS_MODEL",
    "QWEN_ASR_MODEL",
    "QWEN_VL_PLUS_MODEL",
    "TENCENT_SOE_MODEL",
    "analyze_image",
    "assess_sentence",
    "build_tts_data_uri",
    "call_llm_chat",
    "create_voice_profile_runtime",
    "delete_voice_profile_runtime",
    "filter_models_by_capability",
    "generate_image_asset",
    "get_default_model_map",
    "get_model_descriptor",
    "get_supported_model_keys",
    "list_capability_descriptors",
    "list_model_descriptors",
    "list_model_status_payloads",
    "require_model_descriptor",
    "resolve_default_model",
    "synthesize_tts",
    "synthesize_tts_streaming",
    "transcribe_audio",
    "translate_sentences",
    "translate_text_to_zh",
]
