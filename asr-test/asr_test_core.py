from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from faster_whisper import WhisperModel
from huggingface_hub import snapshot_download


ROOT_DIR = Path(__file__).resolve().parent
MODELS_DIR = ROOT_DIR / "models"
RUNS_DIR = ROOT_DIR / "runs"
SAMPLES_DIR = ROOT_DIR / "samples"
WEB_DIR = ROOT_DIR / "web"

DEFAULT_DEVICE = "cpu"
DEFAULT_COMPUTE_TYPE = "int8"
DEFAULT_CPU_THREADS = 4
DEFAULT_BEAM_SIZE = 5
DEFAULT_VAD_FILTER = True
DEFAULT_CONDITION_ON_PREVIOUS_TEXT = False

MODEL_SPECS: dict[str, dict[str, str]] = {
    "distil-small.en": {
        "key": "distil-small.en",
        "label": "Distil Small EN",
        "repo_id": "Systran/faster-distil-whisper-small.en",
        "local_dir": "faster-distil-small.en",
        "description": "Lightweight English distil model.",
        "backend": "faster_whisper",
    },
    "distil-medium.en": {
        "key": "distil-medium.en",
        "label": "Distil Medium EN",
        "repo_id": "Systran/faster-distil-whisper-medium.en",
        "local_dir": "faster-distil-medium.en",
        "description": "Stronger English distil model.",
        "backend": "faster_whisper",
    },
    "distil-large-v3": {
        "key": "distil-large-v3",
        "label": "Whisper Large V3 Turbo",
        "repo_id": "deepdml/faster-whisper-large-v3-turbo-ct2",
        "local_dir": "faster-whisper-large-v3-turbo",
        "description": "Turbo CT2 model used as the fast large-model slot.",
        "backend": "faster_whisper",
    },
}

_MODEL_CACHE: dict[str, Any] = {}
_MODEL_CACHE_LOCK = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def ensure_directories() -> None:
    for path in (MODELS_DIR, RUNS_DIR, SAMPLES_DIR, WEB_DIR):
        path.mkdir(parents=True, exist_ok=True)


def model_local_path(model_key: str) -> Path:
    return MODELS_DIR / MODEL_SPECS[model_key]["local_dir"]


def model_required_files(model_key: str) -> tuple[str, ...]:
    return ("config.json", "model.bin", "preprocessor_config.json", "tokenizer.json", "vocabulary.json")


def model_is_downloaded(model_key: str) -> bool:
    model_dir = model_local_path(model_key)
    return model_dir.exists() and all((model_dir / name).exists() for name in model_required_files(model_key))


def model_catalog() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for key, spec in MODEL_SPECS.items():
        local_path = model_local_path(key)
        rows.append(
            {
                "key": key,
                "label": spec["label"],
                "repo_id": spec["repo_id"],
                "description": spec["description"],
                "downloaded": model_is_downloaded(key),
                "local_path": str(local_path),
            }
        )
    return rows


def download_model(model_key: str, force: bool = False) -> Path:
    ensure_directories()
    local_dir = MODELS_DIR / MODEL_SPECS[model_key]["local_dir"]
    if model_is_downloaded(model_key) and not force:
        return local_dir
    snapshot_download(
        repo_id=MODEL_SPECS[model_key]["repo_id"],
        local_dir=str(local_dir),
    )
    return local_dir


def download_all_models(force: bool = False) -> list[dict[str, str]]:
    return [{"model_key": key, "local_path": str(download_model(key, force=force))} for key in MODEL_SPECS]


def _get_model(model_key: str, *, device: str, compute_type: str, cpu_threads: int) -> WhisperModel:
    cache_key = json.dumps(
        {
            "model_key": model_key,
            "device": device,
            "compute_type": compute_type,
            "cpu_threads": int(cpu_threads),
        },
        sort_keys=True,
    )
    with _MODEL_CACHE_LOCK:
        model = _MODEL_CACHE.get(cache_key)
        if model is not None:
            return model
        model = WhisperModel(
            str(model_local_path(model_key)),
            device=device,
            compute_type=compute_type,
            cpu_threads=int(cpu_threads),
            num_workers=1,
        )
        _MODEL_CACHE[cache_key] = model
        return model


def _format_timestamp(seconds: float) -> str:
    total_ms = max(0, int(round(float(seconds or 0) * 1000)))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, milliseconds = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def segments_to_srt(segments: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for index, segment in enumerate(segments, start=1):
        lines.extend(
            [
                str(index),
                f"{_format_timestamp(segment['start'])} --> {_format_timestamp(segment['end'])}",
                segment["text"].strip(),
                "",
            ]
        )
    return "\n".join(lines).strip() + "\n"


def _safe_write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


@dataclass
class RunContext:
    run_id: str
    run_dir: Path
    source_path: Path
    display_name: str
    model_key: str
    created_at: str


def create_run(*, source_path: Path, model_key: str, original_name: str | None = None, copy_source: bool) -> RunContext:
    ensure_directories()
    display_name = original_name or source_path.name
    run_id = f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-{model_key}-{uuid.uuid4().hex[:8]}"
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=False)

    target_path = source_path
    if copy_source:
        upload_dir = run_dir / "source"
        upload_dir.mkdir(parents=True, exist_ok=True)
        target_path = upload_dir / display_name
        shutil.copy2(source_path, target_path)

    created_at = now_iso()
    _safe_write_json(
        run_dir / "input.json",
        {
            "run_id": run_id,
            "model_key": model_key,
            "model_label": MODEL_SPECS[model_key]["label"],
            "created_at": created_at,
            "source_name": display_name,
            "source_path": str(target_path if copy_source else source_path),
            "source_copied": bool(copy_source),
            "source_size_bytes": int(source_path.stat().st_size),
        },
    )
    emit_progress(run_dir, event_type="queued", message="Run created.", percent=0.0)
    return RunContext(run_id=run_id, run_dir=run_dir, source_path=target_path if copy_source else source_path, display_name=display_name, model_key=model_key, created_at=created_at)


def emit_progress(
    run_dir: Path,
    *,
    event_type: str,
    message: str,
    percent: float | None = None,
    elapsed_seconds: float | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {"created_at": now_iso(), "event_type": event_type, "message": message}
    if percent is not None:
        payload["percent"] = max(0.0, min(100.0, float(percent)))
    if elapsed_seconds is not None:
        payload["elapsed_seconds"] = round(float(elapsed_seconds), 3)
    if extra:
        payload.update(extra)
    _append_jsonl(run_dir / "progress.jsonl", payload)
    return payload


def transcribe_run(
    context: RunContext,
    *,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
    device: str = DEFAULT_DEVICE,
    compute_type: str = DEFAULT_COMPUTE_TYPE,
    cpu_threads: int = DEFAULT_CPU_THREADS,
    beam_size: int = DEFAULT_BEAM_SIZE,
    vad_filter: bool = DEFAULT_VAD_FILTER,
    condition_on_previous_text: bool = DEFAULT_CONDITION_ON_PREVIOUS_TEXT,
) -> dict[str, Any]:
    start_time = time.monotonic()

    def publish(event_type: str, message: str, percent: float | None = None, extra: dict[str, Any] | None = None) -> None:
        payload = emit_progress(
            context.run_dir,
            event_type=event_type,
            message=message,
            percent=percent,
            elapsed_seconds=time.monotonic() - start_time,
            extra=extra,
        )
        if progress_callback:
            progress_callback(payload)

    publish("loading_model", "Loading model from local cache.", 5.0)
    if not model_is_downloaded(context.model_key):
        raise RuntimeError(f"Model is not downloaded: {context.model_key}")
    segments: list[dict[str, Any]] = []
    transcript_parts: list[str] = []
    model = _get_model(context.model_key, device=device, compute_type=compute_type, cpu_threads=cpu_threads)
    publish("transcribing", "Transcription started.", 10.0)
    segments_iter, info = model.transcribe(
        str(context.source_path),
        language="en",
        beam_size=int(beam_size),
        word_timestamps=True,
        vad_filter=bool(vad_filter),
        condition_on_previous_text=bool(condition_on_previous_text),
    )

    media_duration = float(getattr(info, "duration", 0) or 0)
    publish(
        "transcribing",
        "Media metadata loaded.",
        15.0,
        {
            "media_duration_seconds": round(media_duration, 3),
            "language": str(getattr(info, "language", "") or ""),
            "language_probability": round(float(getattr(info, "language_probability", 0) or 0), 4),
        },
    )

    for index, segment in enumerate(segments_iter, start=1):
        segment_payload = {
            "id": index,
            "start": round(float(getattr(segment, "start", 0) or 0), 3),
            "end": round(float(getattr(segment, "end", 0) or 0), 3),
            "text": str(getattr(segment, "text", "") or "").strip(),
            "avg_logprob": round(float(getattr(segment, "avg_logprob", 0) or 0), 6),
            "no_speech_prob": round(float(getattr(segment, "no_speech_prob", 0) or 0), 6),
            "compression_ratio": round(float(getattr(segment, "compression_ratio", 0) or 0), 6),
            "words": [],
        }
        for word in list(getattr(segment, "words", None) or []):
            segment_payload["words"].append(
                {
                    "start": round(float(getattr(word, "start", 0) or 0), 3),
                    "end": round(float(getattr(word, "end", 0) or 0), 3),
                    "word": str(getattr(word, "word", "") or ""),
                    "probability": round(float(getattr(word, "probability", 0) or 0), 6),
                }
            )
        segments.append(segment_payload)
        transcript_parts.append(segment_payload["text"])
        segment_progress = min(segment_payload["end"] / media_duration, 0.98) if media_duration > 0 else min(0.15 + index * 0.02, 0.98)
        publish(
            "transcribing",
            f"Processed segment {index}.",
            15.0 + segment_progress * 75.0,
            {"segment_index": index, "segment_end_seconds": segment_payload["end"], "segment_text": segment_payload["text"][:200]},
        )

    publish("writing_outputs", "Writing transcript artifacts.", 95.0)
    transcript_text = "\n".join(part for part in transcript_parts if part).strip() + "\n"
    subtitle_text = segments_to_srt(segments)
    elapsed_seconds = time.monotonic() - start_time
    audio_seconds = media_duration or max((segment["end"] for segment in segments), default=0.0)
    rtf = (elapsed_seconds / audio_seconds) if audio_seconds > 0 else None
    language = str(info["language"] if isinstance(info, dict) else getattr(info, "language", "") or "")
    language_probability = float(info["language_probability"] if isinstance(info, dict) else getattr(info, "language_probability", 0) or 0)

    (context.run_dir / "transcript.txt").write_text(transcript_text, encoding="utf-8")
    (context.run_dir / "subtitle.srt").write_text(subtitle_text, encoding="utf-8")
    _safe_write_json(context.run_dir / "segments.json", segments)
    _safe_write_json(
        context.run_dir / "metrics.json",
        {
            "run_id": context.run_id,
            "model_key": context.model_key,
            "audio_seconds": round(audio_seconds, 3),
            "elapsed_seconds": round(elapsed_seconds, 3),
            "rtf": round(rtf, 4) if rtf is not None else None,
            "segment_count": len(segments),
            "language": language,
            "language_probability": round(language_probability, 4),
            "source_size_bytes": int(context.source_path.stat().st_size),
        },
    )

    result = {
        "run_id": context.run_id,
        "status": "completed",
        "created_at": context.created_at,
        "completed_at": now_iso(),
        "model_key": context.model_key,
        "model_label": MODEL_SPECS[context.model_key]["label"],
        "repo_id": MODEL_SPECS[context.model_key]["repo_id"],
        "file_name": context.display_name,
        "source_path": str(context.source_path),
        "transcript_path": str(context.run_dir / "transcript.txt"),
        "subtitle_path": str(context.run_dir / "subtitle.srt"),
        "segments_path": str(context.run_dir / "segments.json"),
        "metrics_path": str(context.run_dir / "metrics.json"),
        "preview_text": transcript_text[:400],
    }
    _safe_write_json(context.run_dir / "result.json", result)
    publish(
        "completed",
        "Run completed.",
        100.0,
        {"segment_count": len(segments), "elapsed_seconds": round(elapsed_seconds, 3), "audio_seconds": round(audio_seconds, 3), "rtf": round(rtf, 4) if rtf is not None else None},
    )
    return result


def write_failure(context: RunContext, exc: Exception) -> dict[str, Any]:
    payload = {
        "run_id": context.run_id,
        "status": "failed",
        "created_at": context.created_at,
        "completed_at": now_iso(),
        "model_key": context.model_key,
        "model_label": MODEL_SPECS[context.model_key]["label"],
        "file_name": context.display_name,
        "source_path": str(context.source_path),
        "error": str(exc),
        "preview_text": "",
    }
    _safe_write_json(context.run_dir / "result.json", payload)
    emit_progress(context.run_dir, event_type="failed", message=str(exc), percent=100.0)
    return payload


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def read_run_detail(run_id: str) -> dict[str, Any]:
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise FileNotFoundError(run_id)
    progress_lines = []
    progress_path = run_dir / "progress.jsonl"
    if progress_path.exists():
        for raw_line in progress_path.read_text(encoding="utf-8").splitlines():
            raw_line = raw_line.strip()
            if not raw_line:
                continue
            try:
                progress_lines.append(json.loads(raw_line))
            except Exception:
                continue
    transcript_path = run_dir / "transcript.txt"
    subtitle_path = run_dir / "subtitle.srt"
    result_payload = _load_json(run_dir / "result.json", {})
    return {
        "run_id": run_id,
        "status": result_payload.get("status") or (progress_lines[-1]["event_type"] if progress_lines else "queued"),
        "input": _load_json(run_dir / "input.json", {}),
        "result": result_payload,
        "metrics": _load_json(run_dir / "metrics.json", {}),
        "progress": progress_lines,
        "artifacts": {
            "transcript": transcript_path.read_text(encoding="utf-8") if transcript_path.exists() else "",
            "subtitle": subtitle_path.read_text(encoding="utf-8") if subtitle_path.exists() else "",
        },
    }


def list_runs(limit: int = 50) -> list[dict[str, Any]]:
    ensure_directories()
    rows: list[dict[str, Any]] = []
    for run_dir in sorted(RUNS_DIR.iterdir(), reverse=True):
        if not run_dir.is_dir():
            continue
        input_payload = _load_json(run_dir / "input.json", {})
        result_payload = _load_json(run_dir / "result.json", {})
        metrics_payload = _load_json(run_dir / "metrics.json", {})
        rows.append(
            {
                "run_id": run_dir.name,
                "status": result_payload.get("status") or "running",
                "created_at": input_payload.get("created_at", ""),
                "model_key": input_payload.get("model_key", ""),
                "model_label": result_payload.get("model_label") or MODEL_SPECS.get(input_payload.get("model_key", ""), {}).get("label", ""),
                "file_name": input_payload.get("source_name", ""),
                "audio_seconds": metrics_payload.get("audio_seconds"),
                "elapsed_seconds": metrics_payload.get("elapsed_seconds"),
                "rtf": metrics_payload.get("rtf"),
                "segment_count": metrics_payload.get("segment_count"),
                "preview_text": result_payload.get("preview_text", ""),
            }
        )
        if len(rows) >= limit:
            break
    return rows
