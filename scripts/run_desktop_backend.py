from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib
import os
import sys
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


def _resolve_backend_root() -> Path:
    configured = os.getenv("DESKTOP_BACKEND_ROOT", "").strip()
    if configured:
        return Path(configured).resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[1]


BACKEND_ROOT = _resolve_backend_root()
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

LOCAL_ASR_DEFAULT_MODEL = "faster-whisper-medium"
LOCAL_ASR_DEFAULT_PORT = 18765


class LocalAsrFileRequest(BaseModel):
    filePath: str = Field(min_length=1, max_length=4096)
    modelKey: str = Field(default=LOCAL_ASR_DEFAULT_MODEL, max_length=100)


class LocalAsrGenerateCourseRequest(BaseModel):
    filePath: str = Field(min_length=1, max_length=4096)
    sourceFilename: str = Field(default="", max_length=512)
    modelKey: str = Field(default=LOCAL_ASR_DEFAULT_MODEL, max_length=100)
    runtimeKind: str = Field(default="desktop_local", max_length=64)


def _normalize_http_origin(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def _build_allowed_cors_origins() -> list[str]:
    origins: list[str] = []
    for candidate in (
        os.getenv("DESKTOP_CLOUD_APP_URL", ""),
        os.getenv("DESKTOP_APP_URL", ""),
        os.getenv("DESKTOP_WEB_BASE_URL", ""),
    ):
        origin = _normalize_http_origin(candidate)
        if origin and origin not in origins:
            origins.append(origin)
    return origins


def _build_default_paths() -> tuple[Path, Path, Path, Path, Path]:
    user_data_root = Path(os.getenv("DESKTOP_USER_DATA_DIR", "")).expanduser()
    if not str(user_data_root).strip():
        user_data_root = Path.home() / "AppData" / "Roaming" / "Bottle"

    model_root = Path(os.getenv("DESKTOP_MODEL_DIR", "")).expanduser()
    if not str(model_root).strip():
        model_root = user_data_root / "models" / "faster-distil-small.en"

    cache_root = Path(os.getenv("DESKTOP_CACHE_DIR", "")).expanduser()
    if not str(cache_root).strip():
        cache_root = user_data_root / "cache"

    temp_root = Path(os.getenv("DESKTOP_TEMP_DIR", "")).expanduser()
    if not str(temp_root).strip():
        temp_root = user_data_root / "tmp"

    log_root = Path(os.getenv("DESKTOP_LOG_DIR", "")).expanduser()
    if not str(log_root).strip():
        log_root = user_data_root / "logs"
    return user_data_root, model_root, cache_root, temp_root, log_root


def _configure_runtime_environment(port: int) -> dict[str, str]:
    user_data_root, model_root, cache_root, temp_root, log_root = _build_default_paths()
    model_bundle_root = model_root.parent
    persistent_data_dir = user_data_root / "data"

    for directory in (user_data_root, model_bundle_root, cache_root, temp_root, log_root, persistent_data_dir):
        directory.mkdir(parents=True, exist_ok=True)

    os.environ["APP_ENV"] = os.getenv("APP_ENV", "desktop")
    os.environ["PORT"] = str(port)
    os.environ["TMP_WORK_DIR"] = str(temp_root)
    os.environ["PERSISTENT_DATA_DIR"] = str(persistent_data_dir)
    os.environ["ASR_BUNDLE_ROOT_DIR"] = str(model_bundle_root)
    os.environ["FASTER_WHISPER_MODEL_DIR"] = str(model_root)
    os.environ["PYTHONUNBUFFERED"] = "1"
    os.environ["DESKTOP_LOG_DIR"] = str(log_root)

    return {
        "user_data_dir": str(user_data_root),
        "model_dir": str(model_root),
        "cache_dir": str(cache_root),
        "temp_dir": str(temp_root),
        "log_dir": str(log_root),
    }


def _load_local_asr_assets_module():
    return importlib.import_module("app.api.routers.local_asr_assets")


def _load_desktop_asr_module():
    return importlib.import_module("app.api.routers.desktop_asr")


def _load_faster_whisper_status() -> dict[str, object]:
    try:
        faster_whisper_asr = importlib.import_module("app.services.faster_whisper_asr")
        payload = faster_whisper_asr.get_faster_whisper_model_status()
    except Exception as exc:
        return {
            "model_ready": False,
            "model_status": "status_error",
            "model_status_message": str(exc),
        }
    return {
        "model_ready": bool(payload.get("cached") and not payload.get("download_required")),
        "model_status": str(payload.get("status") or ""),
        "model_status_message": str(payload.get("message") or ""),
    }


def _build_helper_health_payload(runtime_paths: dict[str, str]) -> dict[str, object]:
    from app.services.media import get_media_runtime_status

    model_payload = _load_faster_whisper_status()
    media_payload = get_media_runtime_status()
    helper_mode = "bundled-runtime" if getattr(sys, "frozen", False) else "system-python"
    return {
        "ok": True,
        "ready": True,
        "service": "desktop-local-helper",
        "helper_mode": helper_mode,
        "python_version": ".".join(
            [
                str(sys.version_info.major),
                str(sys.version_info.minor),
                str(sys.version_info.micro),
            ]
        ),
        "asr_model_ready": bool(model_payload["model_ready"]),
        "model_ready": bool(model_payload["model_ready"]),
        "model_status": str(model_payload["model_status"]),
        "model_status_message": str(model_payload["model_status_message"]),
        "ffmpeg_ready": bool(media_payload.get("ffmpeg_ready")),
        "ffprobe_ready": bool(media_payload.get("ffprobe_ready")),
        "yt_dlp_ready": bool(media_payload.get("yt_dlp_ready")),
        "media_detail": str(media_payload.get("detail") or ""),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime_paths,
    }


def _raise_local_asr_http_error(status_code: int, code: str, message: str, detail: str = "") -> None:
    raise HTTPException(
        status_code=status_code,
        detail={
            "ok": False,
            "code": code,
            "message": message,
            "detail": str(detail or "").strip(),
        },
    )


def _resolve_local_asr_source_path(raw_path: str) -> Path:
    normalized = str(raw_path or "").strip()
    if not normalized:
        _raise_local_asr_http_error(400, "LOCAL_ASR_SOURCE_PATH_MISSING", "本地媒体文件路径不能为空。")
    candidate = Path(normalized).expanduser()
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError as exc:
        _raise_local_asr_http_error(404, "LOCAL_ASR_SOURCE_NOT_FOUND", "本地媒体文件不存在。", normalized)
    if not resolved.is_file():
        _raise_local_asr_http_error(400, "LOCAL_ASR_SOURCE_NOT_FILE", "本地媒体路径不是文件。", str(resolved))
    return resolved


def _build_local_asr_words(asr_payload: dict[str, object]) -> list[dict[str, object]]:
    transcripts = list(asr_payload.get("transcripts") or [])
    first_transcript = transcripts[0] if transcripts and isinstance(transcripts[0], dict) else {}
    words = []
    for item in list(first_transcript.get("words") or []):
        if not isinstance(item, dict):
            continue
        surface = str(item.get("surface") or item.get("text") or "").strip()
        begin_ms = max(0, int(item.get("begin_time") or 0))
        end_ms = max(begin_ms, int(item.get("end_time") or 0))
        if not surface or end_ms <= begin_ms:
            continue
        words.append(
            {
                "word": surface,
                "start": round(begin_ms / 1000, 3),
                "end": round(end_ms / 1000, 3),
            }
        )
    return words


def _build_local_asr_sentences(asr_payload: dict[str, object]) -> list[dict[str, object]]:
    transcripts = list(asr_payload.get("transcripts") or [])
    first_transcript = transcripts[0] if transcripts and isinstance(transcripts[0], dict) else {}
    sentences = []
    for item in list(first_transcript.get("sentences") or []):
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        begin_ms = max(0, int(item.get("begin_time") or 0))
        end_ms = max(begin_ms, int(item.get("end_time") or 0))
        if not text or end_ms <= begin_ms:
            continue
        sentences.append(
            {
                "text": text,
                "start": round(begin_ms / 1000, 3),
                "end": round(end_ms / 1000, 3),
            }
        )
    return sentences


def _run_local_asr_transcription(source_path: Path, model_key: str) -> dict[str, object]:
    from app.core.config import BASE_TMP_DIR
    from app.infra.asr.faster_whisper import (
        FasterWhisperASRProvider,
        FasterWhisperModelNotReadyError,
    )
    from app.services.media import (
        MediaError,
        cleanup_dir,
        create_request_dir,
        extract_audio_for_asr,
        probe_audio_duration_ms,
        validate_suffix,
    )

    selected_model = str(model_key or "").strip() or LOCAL_ASR_DEFAULT_MODEL
    if selected_model != LOCAL_ASR_DEFAULT_MODEL:
        _raise_local_asr_http_error(
            400,
            "LOCAL_ASR_MODEL_UNSUPPORTED",
            "本地 ASR 仅支持 faster-whisper-medium。",
            selected_model,
        )

    req_dir = create_request_dir(BASE_TMP_DIR)
    audio_path = req_dir / "local_asr_input.opus"
    try:
        validate_suffix(source_path.name)
        source_duration_ms = max(1, probe_audio_duration_ms(source_path))
        extract_audio_for_asr(source_path, audio_path)
        provider = FasterWhisperASRProvider()
        asr_result = provider.transcribe(str(audio_path))
        raw_result = dict(asr_result.raw_result or {})
        asr_payload = dict(raw_result.get("asr_result_json") or {})
        preview_text = str(raw_result.get("preview_text") or asr_result.text or "").strip()
        usage_seconds = int(raw_result.get("usage_seconds") or asr_result.duration_seconds or 0)
        return {
            "ok": True,
            "model_key": selected_model,
            "file_path": str(source_path),
            "text": preview_text,
            "words": _build_local_asr_words(asr_payload),
            "sentences": _build_local_asr_sentences(asr_payload),
            "usage_seconds": max(0, usage_seconds),
            "source_duration_ms": source_duration_ms,
            "asr_result_json": asr_payload,
        }
    except MediaError as exc:
        error_code = str(getattr(exc, "code", "") or "")
        status_code = 404 if error_code.endswith("_NOT_FOUND") else 400
        _raise_local_asr_http_error(status_code, error_code or "LOCAL_ASR_MEDIA_ERROR", str(exc.message), str(exc.detail))
    except FasterWhisperModelNotReadyError as exc:
        _raise_local_asr_http_error(409, "LOCAL_ASR_MODEL_NOT_READY", "本地 faster-whisper 模型尚未就绪。", str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        _raise_local_asr_http_error(500, "LOCAL_ASR_TRANSCRIBE_FAILED", "本地 faster-whisper 转写失败。", str(exc))
    finally:
        cleanup_dir(req_dir)


def _run_local_asr_lesson_generation(source_path: Path, model_key: str) -> dict[str, object]:
    from app.db import SessionLocal
    from app.services.lesson_service import LessonService

    transcription = _run_local_asr_transcription(source_path, model_key)
    asr_payload = dict(transcription.get("asr_result_json") or {})
    with SessionLocal() as db:
        local_generation_result = LessonService.build_local_generation_result(
            asr_payload=asr_payload,
            runtime_kind="desktop_local",
            asr_model=str(transcription.get("model_key") or LOCAL_ASR_DEFAULT_MODEL),
            source_duration_ms=max(1, int(transcription.get("source_duration_ms") or 0)),
            db=db,
            semantic_split_enabled=False,
        )
    variant = dict(local_generation_result.get("variant") or {})
    sentences = [dict(item) for item in list(variant.get("sentences") or []) if isinstance(item, dict)]
    return {
        "ok": True,
        "course_id": uuid4().hex,
        "preview_text": str(transcription.get("text") or ""),
        "sentences": sentences,
        "local_generation_result": local_generation_result,
        "asr_result_json": asr_payload,
        "usage_seconds": int(transcription.get("usage_seconds") or 0),
    }


def _run_local_asr_generate_course(
    source_path: Path,
    source_filename: str,
    model_key: str,
    runtime_kind: str = "desktop_local",
) -> dict[str, object]:
    """
    Full pipeline: ASR transcription -> sentence split -> translation (if online) -> course assembly.
    Translation gracefully degrades when offline: returns null translation for each sentence.
    """
    from app.db import SessionLocal
    from app.services.lesson_service import LessonService

    transcription = _run_local_asr_transcription(source_path, model_key)
    asr_payload = dict(transcription.get("asr_result_json") or {})
    source_duration_ms = max(1, int(transcription.get("source_duration_ms") or 0))
    usage_seconds = int(transcription.get("usage_seconds") or 0)

    normalized_runtime_kind = str(runtime_kind or "desktop_local").strip().lower() or "desktop_local"
    asr_model = str(transcription.get("model_key") or model_key or LOCAL_ASR_DEFAULT_MODEL).strip()

    with SessionLocal() as db:
        local_generation_result = LessonService.build_local_generation_result(
            asr_payload=asr_payload,
            runtime_kind=normalized_runtime_kind,
            asr_model=asr_model,
            source_duration_ms=source_duration_ms,
            db=db,
            semantic_split_enabled=False,
        )

    variant = dict(local_generation_result.get("variant") or {})
    runtime_sentences = [dict(item) for item in list(variant.get("sentences") or []) if isinstance(item, dict)]
    translation_debug = dict(local_generation_result.get("translation_debug") or {})
    failed_count = int(translation_debug.get("failed_sentences", 0) or 0)

    normalized_source_filename = str(source_filename or source_path.name).strip()
    course_id = uuid4().hex
    now_timestamp = datetime.now(timezone.utc).isoformat()
    duration_ms = int(local_generation_result.get("duration_ms") or 0) or source_duration_ms

    course_record = {
        "id": course_id,
        "title": normalized_source_filename.rsplit(".", 1)[0] if normalized_source_filename else f"本地课程_{course_id[:8]}",
        "source_filename": normalized_source_filename,
        "duration_ms": duration_ms,
        "runtime_kind": normalized_runtime_kind,
        "asr_model": asr_model,
        "created_at": now_timestamp,
        "updated_at": now_timestamp,
        "synced_at": None,
        "version": 1,
        "is_local_only": True,
        "metadata": {
            "lesson_status": "partial_ready" if failed_count > 0 else "ready",
            "translation_pending": failed_count > 0,
            "original_course_id": course_id,
        },
    }

    sentence_records = []
    for idx, sentence in enumerate(runtime_sentences):
        sentence_id = f"{course_id}:{idx}"
        text_en = str(sentence.get("text_en") or sentence.get("text") or "").strip()
        text_zh = str(sentence.get("text_zh") or "").strip() or None
        begin_ms = max(0, int(sentence.get("begin_ms") or 0))
        end_ms = max(begin_ms, int(sentence.get("end_ms") or begin_ms))
        words_list = sentence.get("tokens") or sentence.get("words") or []
        sentence_records.append(
            {
                "id": sentence_id,
                "course_id": course_id,
                "sentence_index": idx,
                "english_text": text_en,
                "chinese_text": text_zh or "",
                "start_ms": begin_ms,
                "end_ms": end_ms,
                "words": words_list,
                "variant_key": str(sentence.get("variant_key") or ""),
                "created_at": now_timestamp,
                "updated_at": now_timestamp,
            }
        )

    return {
        "ok": True,
        "course_id": course_id,
        "course": course_record,
        "sentences": sentence_records,
        "sentence_count": len(sentence_records),
        "preview_text": str(transcription.get("text") or ""),
        "usage_seconds": usage_seconds,
        "asr_result_json": asr_payload,
        "local_generation_result": local_generation_result,
        "translation_debug": translation_debug,
        "lesson_status": "partial_ready" if failed_count > 0 else "ready",
        "translation_pending": failed_count > 0,
        "generated_at": now_timestamp,
    }


def create_desktop_helper_app(runtime_paths: dict[str, str]) -> FastAPI:
    local_asr_assets = _load_local_asr_assets_module()
    desktop_asr = _load_desktop_asr_module()

    app = FastAPI(title="Bottle Desktop Local Helper")
    allowed_origins = _build_allowed_cors_origins()
    if allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
        )
    app.include_router(local_asr_assets.router)
    app.include_router(desktop_asr.router)

    @app.get("/")
    def root() -> dict[str, object]:
        return {
            "ok": True,
            "service": "desktop-local-helper",
            "role": "local-resource-only",
            "runtime": runtime_paths,
        }

    @app.get("/health")
    def health() -> dict[str, object]:
        return _build_helper_health_payload(runtime_paths)

    @app.get("/health/ready")
    def ready() -> dict[str, object]:
        health_payload = _build_helper_health_payload(runtime_paths)
        return {
            **health_payload,
            "status": {
                "helper_ready": True,
                "local_only": True,
                "helper_mode": health_payload["helper_mode"],
                "python_version": health_payload["python_version"],
                "model_ready": health_payload["model_ready"],
                "model_status": health_payload["model_status"],
                "model_status_message": health_payload["model_status_message"],
                "checked_at": health_payload["checked_at"],
                "runtime": runtime_paths,
            },
        }

    @app.post("/api/local-asr/transcribe")
    def transcribe_local_asr(payload: LocalAsrFileRequest) -> dict[str, object]:
        source_path = _resolve_local_asr_source_path(payload.filePath)
        return _run_local_asr_transcription(source_path, payload.modelKey)

    @app.post("/api/local-asr/generate-lesson")
    def generate_local_asr_lesson(payload: LocalAsrFileRequest) -> dict[str, object]:
        source_path = _resolve_local_asr_source_path(payload.filePath)
        return _run_local_asr_lesson_generation(source_path, payload.modelKey)

    @app.post("/api/local-asr/generate-course")
    def generate_local_asr_course(payload: LocalAsrGenerateCourseRequest) -> dict[str, object]:
        """
        Full local course generation pipeline: transcription -> sentence split -> translation -> course assembly.
        Translation degrades gracefully when offline (sentences will have null translations).
        Returns course record + sentence records ready for local SQLite storage.
        """
        source_path = _resolve_local_asr_source_path(payload.filePath)
        return _run_local_asr_generate_course(
            source_path=source_path,
            source_filename=payload.sourceFilename,
            model_key=payload.modelKey,
            runtime_kind=payload.runtimeKind,
        )

    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local helper for the Electron desktop client.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=LOCAL_ASR_DEFAULT_PORT)
    args = parser.parse_args()

    os.chdir(BACKEND_ROOT)
    runtime_paths = _configure_runtime_environment(args.port)
    app = create_desktop_helper_app(runtime_paths)

    import uvicorn

    print(f"[desktop] helper_root={BACKEND_ROOT}")
    print(f"[desktop] model_dir={runtime_paths['model_dir']}")
    print(f"[desktop] cache_dir={runtime_paths['cache_dir']}")
    print(f"[desktop] log_dir={runtime_paths['log_dir']}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
