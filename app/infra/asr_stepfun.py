from __future__ import annotations

import asyncio
import base64
import json
import logging
import math
import re
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any

import websockets

from app.core.config import (
    STEPFUN_API_KEY,
    STEPFUN_ASR_BASE_URL,
    STEPFUN_ASR_ENABLE_ITN,
    STEPFUN_ASR_LANGUAGE,
)
from app.exceptions.asr import AsrCancellationRequested, AsrError
from app.services.media import resolve_media_command


STEPFUN_ASR_MODEL = "stepaudio-2.5-asr"
STEPFUN_ASR_STREAM_MODEL = "step-asr-1.1-stream"
PCM_RATE = 16000
PCM_BITS = 16
PCM_CHANNELS = 1
PCM_CHUNK_BYTES = 64_000
TERMINAL_EVENT_TYPES = {"conversation.item.input_audio_transcription.completed", "error"}
TIMESTAMPED_DELTA_TYPE = "conversation.item.input_audio_transcription.delta"

logger = logging.getLogger(__name__)


def _ensure_stepfun_api_key() -> str:
    api_key = str(STEPFUN_API_KEY or "").strip()
    if api_key:
        return api_key
    raise AsrError("ASR_API_KEY_MISSING", "STEPFUN_API_KEY 未配置")


def _raise_if_cancel_requested(*, audio_path: str | None = None) -> None:
    try:
        from app.services.lesson_task_manager import is_task_terminate_requested
    except Exception:
        return
    if is_task_terminate_requested(path=audio_path):
        raise AsrCancellationRequested("terminate requested")


def _convert_to_stepfun_pcm(audio_path: str, output_path: Path, *, timeout: int = 300) -> None:
    try:
        proc = subprocess.run(
            [
                resolve_media_command("ffmpeg"),
                "-hide_banner",
                "-y",
                "-i",
                str(audio_path),
                "-vn",
                "-ac",
                str(PCM_CHANNELS),
                "-ar",
                str(PCM_RATE),
                "-f",
                "s16le",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=max(5, int(timeout or 300)),
        )
    except FileNotFoundError as exc:
        raise AsrError("ASR_AUDIO_CONVERT_FAILED", "媒体处理依赖缺失", str(exc)[:1200]) from exc
    except subprocess.TimeoutExpired as exc:
        raise AsrError("ASR_AUDIO_CONVERT_FAILED", "音频转码超时", str(exc)[:1200]) from exc
    if proc.returncode != 0:
        detail = "\n".join(part for part in (proc.stdout, proc.stderr) if part).strip()
        raise AsrError("ASR_AUDIO_CONVERT_FAILED", "音频转码失败", detail[:1200])


def _stepfun_ws_url() -> str:
    base_url = str(STEPFUN_ASR_BASE_URL or "https://api.stepfun.com/v1").rstrip("/")
    if base_url.startswith("https://"):
        base_url = "wss://" + base_url[len("https://") :]
    elif base_url.startswith("http://"):
        base_url = "ws://" + base_url[len("http://") :]
    return f"{base_url}/realtime/asr/stream"


def _session_update_event() -> dict[str, Any]:
    return {
        "event_id": f"event_{uuid.uuid4().hex}",
        "type": "session.update",
        "session": {
            "audio": {
                "input": {
                    "format": {
                        "type": "pcm",
                        "codec": "pcm_s16le",
                        "rate": PCM_RATE,
                        "bits": PCM_BITS,
                        "channel": PCM_CHANNELS,
                    },
                    "transcription": {
                        "model": STEPFUN_ASR_STREAM_MODEL,
                        "language": STEPFUN_ASR_LANGUAGE,
                        "enable_itn": bool(STEPFUN_ASR_ENABLE_ITN),
                        "full_rerun_on_commit": False,
                    },
                }
            }
        },
    }


async def _connect_stepfun_ws(url: str, api_key: str):
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        return await websockets.connect(url, additional_headers=headers)
    except TypeError:
        return await websockets.connect(url, extra_headers=headers)


async def _run_stepfun_realtime_asr(
    pcm_path: Path,
    *,
    api_key: str,
    request_timeout: int,
    audio_path_for_cancel: str,
    progress_callback=None,
    started_monotonic: float,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    segment_done = 0
    pcm_bytes = pcm_path.read_bytes()
    if not pcm_bytes:
        raise AsrError("ASR_AUDIO_CONVERT_FAILED", "音频转码结果为空")

    try:
        async with await _connect_stepfun_ws(_stepfun_ws_url(), api_key) as websocket:
            await websocket.send(json.dumps(_session_update_event(), ensure_ascii=False))
            for offset in range(0, len(pcm_bytes), PCM_CHUNK_BYTES):
                _raise_if_cancel_requested(audio_path=audio_path_for_cancel)
                chunk = pcm_bytes[offset : offset + PCM_CHUNK_BYTES]
                await websocket.send(
                    json.dumps(
                        {
                            "event_id": f"event_{uuid.uuid4().hex}",
                            "type": "input_audio_buffer.append",
                            "audio": base64.b64encode(chunk).decode("ascii"),
                        },
                        ensure_ascii=False,
                    )
                )
            await websocket.send(
                json.dumps(
                    {"event_id": f"event_{uuid.uuid4().hex}", "type": "input_audio_buffer.commit"},
                    ensure_ascii=False,
                )
            )

            while True:
                _raise_if_cancel_requested(audio_path=audio_path_for_cancel)
                try:
                    raw_event = await asyncio.wait_for(websocket.recv(), timeout=max(5, int(request_timeout or 120)))
                except asyncio.TimeoutError as exc:
                    raise AsrError("ASR_REQUEST_TIMEOUT", "StepAudio 2.5 ASR 等待识别结果超时") from exc
                try:
                    event = json.loads(str(raw_event or ""))
                except Exception as exc:
                    raise AsrError("ASR_RESULT_JSON_INVALID", "StepAudio 返回了无法解析的 WebSocket 数据", str(raw_event)[:1200]) from exc
                if not isinstance(event, dict):
                    continue
                events.append(event)
                event_type = str(event.get("type") or "").strip()
                if event_type == TIMESTAMPED_DELTA_TYPE:
                    segment_done += 1
                    if progress_callback:
                        progress_callback(
                            {
                                "elapsed_seconds": int(max(0, time.monotonic() - started_monotonic)),
                                "segment_done": segment_done,
                                "segment_total": 0,
                            }
                        )
                if event_type in TERMINAL_EVENT_TYPES:
                    break
    except AsrError:
        raise
    except Exception as exc:
        raise AsrError("ASR_REQUEST_FAILED", "调用 StepAudio 2.5 ASR 失败", str(exc)[:1200]) from exc

    return events


def _clean_delta_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    cleaned = re.sub(r"\s+([,.;!?])", r"\1", cleaned)
    cleaned = re.sub(r"\s+'", "'", cleaned)
    cleaned = re.sub(r"'\s+", "'", cleaned)
    return cleaned.strip()


def _compose_text(parts: list[str]) -> str:
    return _clean_delta_text(" ".join(str(part or "") for part in parts))


def _timestamp_ms(value: Any) -> int | None:
    try:
        number = float(value)
    except Exception:
        return None
    if not math.isfinite(number):
        return None
    return max(0, int(round(number)))


def _normalize_timestamped_delta(event: dict[str, Any], index: int) -> dict[str, Any]:
    text = _clean_delta_text(str(event.get("text") or ""))
    start_ms = _timestamp_ms(event.get("start_time"))
    end_ms = _timestamp_ms(event.get("end_time"))
    if not text or start_ms is None or end_ms is None or end_ms <= start_ms:
        raise AsrError(
            "ASR_TIMESTAMP_MISSING",
            "StepAudio 2.5 ASR 返回结果缺少官方音频时间戳",
            json.dumps(
                {
                    "delta_index": index,
                    "event_type": event.get("type"),
                    "has_text": bool(text),
                    "has_start_time": event.get("start_time") is not None,
                    "has_end_time": event.get("end_time") is not None,
                    "top_level_keys": sorted(str(key) for key in event.keys()),
                },
                ensure_ascii=False,
            ),
        )
    return {
        "text": text,
        "surface": text,
        "punctuation": "",
        "begin_time": start_ms,
        "end_time": end_ms,
        "source": "stepfun_official_delta",
    }


def _build_sentences_from_official_deltas(deltas: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sentences: list[dict[str, Any]] = []
    for item in deltas:
        text = _clean_delta_text(str(item.get("text") or ""))
        if not text:
            continue
        sentences.append(
            {
                "sentence_id": len(sentences),
                "begin_time": int(item["begin_time"]),
                "end_time": int(item["end_time"]),
                "text": text,
                "words": [dict(item)],
                "source": "stepfun_official_delta",
            }
        )
    return sentences


def _normalize_stepfun_asr_events(events: list[dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any] | None, str]:
    error_event = next((event for event in events if str(event.get("type") or "") == "error"), None)
    if error_event is not None:
        error_payload = error_event.get("error") if isinstance(error_event.get("error"), dict) else error_event
        raise AsrError("ASR_TASK_FAILED", "StepAudio 2.5 ASR 识别失败", json.dumps(error_payload, ensure_ascii=False)[:1200])

    completed_event = next(
        (event for event in events if str(event.get("type") or "") == "conversation.item.input_audio_transcription.completed"),
        None,
    )
    if completed_event is None:
        raise AsrError("ASR_RESULT_MISSING", "StepAudio 2.5 ASR 未返回最终识别结果")

    deltas = [
        _normalize_timestamped_delta(event, index)
        for index, event in enumerate(events)
        if str(event.get("type") or "") == TIMESTAMPED_DELTA_TYPE
    ]
    sentences = _build_sentences_from_official_deltas(deltas)
    full_text = _compose_text([str(item["text"]) for item in deltas])

    if not deltas or not sentences:
        raise AsrError(
            "ASR_TIMESTAMP_MISSING",
            "StepAudio 2.5 ASR 返回结果缺少官方音频时间戳",
            json.dumps(
                {
                    "has_timestamped_deltas": bool(deltas),
                    "has_sentences": bool(sentences),
                    "event_types": [str(event.get("type") or "") for event in events],
                    "completed_keys": sorted(str(key) for key in completed_event.keys()),
                },
                ensure_ascii=False,
            ),
        )

    return (
        {
            "transcripts": [
                {
                    "channel_id": 0,
                    "text": full_text,
                    "sentences": sentences,
                    "words": deltas,
                }
            ]
        },
        completed_event,
        full_text,
    )


def transcribe_audio_file(
    audio_path: str,
    *,
    model: str = STEPFUN_ASR_MODEL,
    requests_timeout: int = 120,
    known_duration_ms: int | None = None,
    progress_callback=None,
) -> dict[str, Any]:
    model_name = str(model or "").strip()
    if model_name != STEPFUN_ASR_MODEL:
        raise AsrError("INVALID_MODEL", "不支持的 StepAudio 模型", model_name)

    api_key = _ensure_stepfun_api_key()
    request_timeout = max(5, int(requests_timeout or 120))
    source_path = Path(audio_path)
    upload_path = source_path.with_suffix(".stepfun.pcm")
    _raise_if_cancel_requested(audio_path=audio_path)
    _convert_to_stepfun_pcm(audio_path, upload_path, timeout=request_timeout)
    _raise_if_cancel_requested(audio_path=audio_path)

    started_monotonic = time.monotonic()
    try:
        events = asyncio.run(
            _run_stepfun_realtime_asr(
                upload_path,
                api_key=api_key,
                request_timeout=request_timeout,
                audio_path_for_cancel=audio_path,
                progress_callback=progress_callback,
                started_monotonic=started_monotonic,
            )
        )
    finally:
        try:
            upload_path.unlink(missing_ok=True)
        except Exception:
            logger.debug("stepfun_asr.upload_cleanup_failed path=%s", upload_path, exc_info=True)

    asr_payload, completed_event, full_text = _normalize_stepfun_asr_events(events)
    duration_ms = max(1, int(known_duration_ms or 0))
    usage_seconds = max(1, math.ceil(duration_ms / 1000)) if duration_ms > 0 else None
    completed_meta = completed_event.get("meta") if isinstance(completed_event, dict) and isinstance(completed_event.get("meta"), dict) else {}
    return {
        "model": model_name,
        "task_id": str(completed_meta.get("session_id") or ""),
        "task_status": "SUCCEEDED",
        "usage_seconds": usage_seconds,
        "preview_text": full_text[:300],
        "asr_result_json": asr_payload,
        "raw_generate_result": {
            "provider": "stepfun",
            "endpoint": "realtime/asr/stream",
            "public_model": STEPFUN_ASR_MODEL,
            "stream_model": STEPFUN_ASR_STREAM_MODEL,
            "events": events,
            "language": STEPFUN_ASR_LANGUAGE,
            "enable_itn": bool(STEPFUN_ASR_ENABLE_ITN),
            "segment_count": len((asr_payload.get("transcripts") or [{}])[0].get("sentences") or []),
        },
    }


__all__ = ["STEPFUN_ASR_MODEL", "STEPFUN_ASR_STREAM_MODEL", "transcribe_audio_file"]
