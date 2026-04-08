"""TTS (Text-to-Speech) infrastructure providers."""
from app.infra.tts.base import (
    TTSConfig,
    TTSProvider,
    TTSResult,
    VoiceCloningResult,
    VoiceInfo,
)
from app.infra.tts.dashscope import (
    DashScopeTTSProvider,
    TTSError,
    create_voice,
    delete_voice,
    list_voices,
    setup_dashscope,
    synthesize_text,
    synthesize_text_stream,
)

__all__ = [
    "TTSConfig",
    "TTSProvider",
    "TTSResult",
    "VoiceCloningResult",
    "VoiceInfo",
    "TTSError",
    "setup_dashscope",
    "create_voice",
    "list_voices",
    "delete_voice",
    "synthesize_text",
    "synthesize_text_stream",
    "DashScopeTTSProvider",
]
