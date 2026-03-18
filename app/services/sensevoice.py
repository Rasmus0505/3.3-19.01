from __future__ import annotations

import json
import math
import re
import subprocess
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.core.timezone import now_shanghai_naive
from app.models import SenseVoiceSetting


SENSEVOICE_ASR_MODEL = "sensevoice-small"
DEFAULT_SENSEVOICE_SETTINGS = {
    "model_dir": "iic/SenseVoiceSmall",
    "trust_remote_code": False,
    "remote_code": "",
    "device": "cuda:0",
    "language": "auto",
    "vad_model": "fsmn-vad",
    "vad_max_single_segment_time": 30000,
    "use_itn": True,
    "batch_size_s": 60,
    "merge_vad": True,
    "merge_length_s": 15,
    "ban_emo_unk": False,
}
_SENSEVOICE_SETTINGS_REQUIRED_COLUMN_SQL: tuple[tuple[str, str, str], ...] = (
    ("model_dir", "VARCHAR(255) NOT NULL DEFAULT 'iic/SenseVoiceSmall'", "VARCHAR(255) NOT NULL DEFAULT 'iic/SenseVoiceSmall'"),
    ("trust_remote_code", "BOOLEAN NOT NULL DEFAULT 0", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("remote_code", "VARCHAR(500) NOT NULL DEFAULT ''", "VARCHAR(500) NOT NULL DEFAULT ''"),
    ("device", "VARCHAR(64) NOT NULL DEFAULT 'cuda:0'", "VARCHAR(64) NOT NULL DEFAULT 'cuda:0'"),
    ("language", "VARCHAR(32) NOT NULL DEFAULT 'auto'", "VARCHAR(32) NOT NULL DEFAULT 'auto'"),
    ("vad_model", "VARCHAR(100) NOT NULL DEFAULT 'fsmn-vad'", "VARCHAR(100) NOT NULL DEFAULT 'fsmn-vad'"),
    ("vad_max_single_segment_time", "INTEGER NOT NULL DEFAULT 30000", "INTEGER NOT NULL DEFAULT 30000"),
    ("use_itn", "BOOLEAN NOT NULL DEFAULT 1", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("batch_size_s", "INTEGER NOT NULL DEFAULT 60", "INTEGER NOT NULL DEFAULT 60"),
    ("merge_vad", "BOOLEAN NOT NULL DEFAULT 1", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("merge_length_s", "INTEGER NOT NULL DEFAULT 15", "INTEGER NOT NULL DEFAULT 15"),
    ("ban_emo_unk", "BOOLEAN NOT NULL DEFAULT 0", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP", "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ("updated_by_user_id", "INTEGER", "INTEGER"),
)
_NON_WORD_EDGE_RE = re.compile(r"^[^\w]+|[^\w]+$")
_SURFACE_SPLIT_RE = re.compile(r"\S+")
_MODEL_LOCK = threading.Lock()
_CACHED_MODEL: Any | None = None
_CACHED_MODEL_SIGNATURE: str = ""


@dataclass(frozen=True)
class SenseVoiceSettingsSnapshot:
    model_dir: str
    trust_remote_code: bool
    remote_code: str
    device: str
    language: str
    vad_model: str
    vad_max_single_segment_time: int
    use_itn: bool
    batch_size_s: int
    merge_vad: bool
    merge_length_s: int
    ban_emo_unk: bool


def _sensevoice_settings_schema_name(db: Session) -> str | None:
    bind = db.get_bind()
    if bind is None or bind.dialect.name == "sqlite":
        return None
    return SenseVoiceSetting.__table__.schema


def _qualified_sensevoice_settings_table(db: Session) -> str:
    schema = _sensevoice_settings_schema_name(db)
    return f"{schema}.{SenseVoiceSetting.__tablename__}" if schema else SenseVoiceSetting.__tablename__


def _sensevoice_settings_column_names(db: Session) -> set[str]:
    bind = db.get_bind()
    if bind is None:
        return set()
    schema = _sensevoice_settings_schema_name(db)
    inspector = inspect(bind)
    if not inspector.has_table(SenseVoiceSetting.__tablename__, schema=schema):
        return set()
    return {str(item.get("name") or "").strip() for item in inspector.get_columns(SenseVoiceSetting.__tablename__, schema=schema)}


def _ensure_sensevoice_settings_schema(db: Session) -> bool:
    bind = db.get_bind()
    if bind is None:
        raise RuntimeError("sensevoice_settings schema repair missing bind")

    schema = _sensevoice_settings_schema_name(db)
    inspector = inspect(bind)
    changed = False

    if bind.dialect.name != "sqlite":
        db.execute(text("CREATE SCHEMA IF NOT EXISTS app"))
        db.commit()

    if not inspector.has_table(SenseVoiceSetting.__tablename__, schema=schema):
        SenseVoiceSetting.__table__.create(bind=bind, checkfirst=True)
        db.commit()
        changed = True

    existing_columns = _sensevoice_settings_column_names(db)
    table_name = _qualified_sensevoice_settings_table(db)
    dialect_name = bind.dialect.name
    missing_columns = [item for item in _SENSEVOICE_SETTINGS_REQUIRED_COLUMN_SQL if item[0] not in existing_columns]
    for column_name, sqlite_sql, default_sql in missing_columns:
        column_sql = sqlite_sql if dialect_name == "sqlite" else default_sql
        db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"))
        changed = True
    if missing_columns:
        db.commit()

    if _backfill_sensevoice_settings_values(db):
        changed = True
    return changed


def _backfill_sensevoice_settings_values(db: Session) -> bool:
    table_name = _qualified_sensevoice_settings_table(db)
    column_names = _sensevoice_settings_column_names(db)
    if not column_names:
        return False

    dialect_name = str((db.get_bind().dialect.name if db.get_bind() is not None else "") or "").lower()
    changed = False
    for column_name, default_value in DEFAULT_SENSEVOICE_SETTINGS.items():
        if column_name not in column_names:
            continue
        if isinstance(default_value, bool):
            update_sql = text(f"UPDATE {table_name} SET {column_name} = :default_value WHERE {column_name} IS NULL")
            params = {"default_value": int(default_value) if dialect_name == "sqlite" else bool(default_value)}
        elif isinstance(default_value, int):
            update_sql = text(
                f"UPDATE {table_name} SET {column_name} = {int(default_value)} "
                f"WHERE {column_name} IS NULL OR {column_name} <= 0"
            )
            params = None
        else:
            update_sql = text(f"UPDATE {table_name} SET {column_name} = :default_value WHERE {column_name} IS NULL OR TRIM({column_name}) = ''")
            params = {"default_value": str(default_value or "")}
        result = db.execute(update_sql, params or {})
        changed = changed or bool(getattr(result, "rowcount", 0))

    if "updated_at" in column_names:
        result = db.execute(text(f"UPDATE {table_name} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
        changed = changed or bool(getattr(result, "rowcount", 0))

    if changed:
        db.commit()
    return changed


def _normalize_sensevoice_settings_row(row: SenseVoiceSetting) -> bool:
    changed = False
    for key, value in DEFAULT_SENSEVOICE_SETTINGS.items():
        current = getattr(row, key)
        if isinstance(value, bool):
            if current is None:
                setattr(row, key, value)
                changed = True
            continue
        if isinstance(value, int):
            if current in (None, "") or int(current) <= 0:
                setattr(row, key, value)
                changed = True
            continue
        normalized_value = str(current or "").strip() or str(value or "")
        if normalized_value != current:
            setattr(row, key, normalized_value)
            changed = True
    if getattr(row, "updated_at", None) is None:
        row.updated_at = now_shanghai_naive()
        changed = True
    return changed


def ensure_default_sensevoice_settings(db: Session) -> SenseVoiceSetting:
    _ensure_sensevoice_settings_schema(db)
    row = db.get(SenseVoiceSetting, 1)
    if row is None:
        row = SenseVoiceSetting(id=1, **DEFAULT_SENSEVOICE_SETTINGS)
        db.add(row)
        db.commit()
        db.refresh(row)
    elif _normalize_sensevoice_settings_row(row):
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_sensevoice_settings(db: Session) -> SenseVoiceSetting:
    _ensure_sensevoice_settings_schema(db)
    row = db.get(SenseVoiceSetting, 1)
    if row is None:
        row = ensure_default_sensevoice_settings(db)
    elif _normalize_sensevoice_settings_row(row):
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_sensevoice_settings_snapshot(db: Session) -> SenseVoiceSettingsSnapshot:
    row = get_sensevoice_settings(db)
    return SenseVoiceSettingsSnapshot(
        model_dir=str(getattr(row, "model_dir", "") or DEFAULT_SENSEVOICE_SETTINGS["model_dir"]),
        trust_remote_code=bool(getattr(row, "trust_remote_code", DEFAULT_SENSEVOICE_SETTINGS["trust_remote_code"])),
        remote_code=str(getattr(row, "remote_code", "") or ""),
        device=str(getattr(row, "device", "") or DEFAULT_SENSEVOICE_SETTINGS["device"]),
        language=str(getattr(row, "language", "") or DEFAULT_SENSEVOICE_SETTINGS["language"]),
        vad_model=str(getattr(row, "vad_model", "") or ""),
        vad_max_single_segment_time=max(1, int(getattr(row, "vad_max_single_segment_time", DEFAULT_SENSEVOICE_SETTINGS["vad_max_single_segment_time"]) or DEFAULT_SENSEVOICE_SETTINGS["vad_max_single_segment_time"])),
        use_itn=bool(getattr(row, "use_itn", DEFAULT_SENSEVOICE_SETTINGS["use_itn"])),
        batch_size_s=max(1, int(getattr(row, "batch_size_s", DEFAULT_SENSEVOICE_SETTINGS["batch_size_s"]) or DEFAULT_SENSEVOICE_SETTINGS["batch_size_s"])),
        merge_vad=bool(getattr(row, "merge_vad", DEFAULT_SENSEVOICE_SETTINGS["merge_vad"])),
        merge_length_s=max(1, int(getattr(row, "merge_length_s", DEFAULT_SENSEVOICE_SETTINGS["merge_length_s"]) or DEFAULT_SENSEVOICE_SETTINGS["merge_length_s"])),
        ban_emo_unk=bool(getattr(row, "ban_emo_unk", DEFAULT_SENSEVOICE_SETTINGS["ban_emo_unk"])),
    )


def _load_funasr_symbols():
    try:
        from funasr import AutoModel
    except Exception as exc:  # pragma: no cover - import depends on runtime env
        raise RuntimeError(f"funasr import failed: {str(exc)[:400]}") from exc

    try:
        from funasr.utils.postprocess_utils import rich_transcription_postprocess
    except Exception:  # pragma: no cover - helper availability depends on version
        rich_transcription_postprocess = None
    return AutoModel, rich_transcription_postprocess


def _model_init_signature(snapshot: SenseVoiceSettingsSnapshot) -> str:
    init_payload = {
        "model_dir": snapshot.model_dir,
        "trust_remote_code": snapshot.trust_remote_code,
        "remote_code": snapshot.remote_code,
        "device": snapshot.device,
        "vad_model": snapshot.vad_model,
        "vad_max_single_segment_time": snapshot.vad_max_single_segment_time,
    }
    return json.dumps(init_payload, ensure_ascii=False, sort_keys=True)


def _build_model_kwargs(snapshot: SenseVoiceSettingsSnapshot) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "model": snapshot.model_dir,
        "trust_remote_code": snapshot.trust_remote_code,
        "device": snapshot.device,
    }
    if snapshot.remote_code:
        kwargs["remote_code"] = snapshot.remote_code
    if snapshot.vad_model:
        kwargs["vad_model"] = snapshot.vad_model
        kwargs["vad_kwargs"] = {"max_single_segment_time": snapshot.vad_max_single_segment_time}
    return kwargs


def _get_or_create_model(snapshot: SenseVoiceSettingsSnapshot):
    global _CACHED_MODEL, _CACHED_MODEL_SIGNATURE

    signature = _model_init_signature(snapshot)
    with _MODEL_LOCK:
        if _CACHED_MODEL is not None and _CACHED_MODEL_SIGNATURE == signature:
            return _CACHED_MODEL

        AutoModel, _ = _load_funasr_symbols()
        _CACHED_MODEL = AutoModel(**_build_model_kwargs(snapshot))
        _CACHED_MODEL_SIGNATURE = signature
        return _CACHED_MODEL


def _normalize_surface_token(surface: str) -> tuple[str, str]:
    trimmed = str(surface or "").strip()
    punctuation = ""
    for ch in reversed(trimmed):
        if ch.isalnum():
            break
        punctuation = f"{ch}{punctuation}"
    normalized = _NON_WORD_EDGE_RE.sub("", trimmed) or trimmed
    return normalized, punctuation


def _approximate_words_from_text(text: str, duration_ms: int) -> list[dict[str, Any]]:
    surfaces = [item.strip() for item in _SURFACE_SPLIT_RE.findall(str(text or "").strip()) if item.strip()]
    if not surfaces:
        return []

    weights = [max(1, len(_NON_WORD_EDGE_RE.sub("", surface) or surface)) for surface in surfaces]
    total_weight = max(1, sum(weights))
    cursor = 0
    words: list[dict[str, Any]] = []
    for index, surface in enumerate(surfaces):
        begin_ms = cursor
        if index == len(surfaces) - 1:
            end_ms = max(begin_ms + 1, int(duration_ms))
        else:
            end_ms = max(begin_ms + 1, cursor + int(round((weights[index] / total_weight) * duration_ms)))
        cursor = end_ms
        text_value, punctuation = _normalize_surface_token(surface)
        words.append(
            {
                "text": text_value or surface,
                "surface": surface,
                "punctuation": punctuation,
                "begin_time": int(begin_ms),
                "end_time": int(end_ms),
            }
        )
    return words


def _build_fallback_sentences(text: str, duration_ms: int) -> list[dict[str, Any]]:
    clean_text = str(text or "").strip()
    if not clean_text:
        return []
    return [{"text": clean_text, "begin_time": 0, "end_time": max(1, int(duration_ms))}]


def _probe_audio_duration_ms(audio_path: Path) -> int:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(detail[:1000] or "ffprobe failed")
    try:
        seconds = float((proc.stdout or "").strip())
    except Exception as exc:
        raise RuntimeError(f"invalid duration output: {(proc.stdout or '').strip()[:120]}") from exc
    return max(0, int(seconds * 1000))


def _normalize_generate_result(result: Any) -> dict[str, Any]:
    if isinstance(result, dict):
        return dict(result)
    if hasattr(result, "to_dict"):
        try:
            payload = result.to_dict()
            if isinstance(payload, dict):
                return dict(payload)
        except Exception:
            pass
    return {"text": str(result or "").strip()}


def _settings_summary(snapshot: SenseVoiceSettingsSnapshot) -> dict[str, Any]:
    payload = asdict(snapshot)
    payload["runtime"] = "funasr"
    return payload


def transcribe_audio_file_with_sensevoice(
    audio_path: str,
    *,
    settings: SenseVoiceSettingsSnapshot,
    progress_callback=None,
) -> dict[str, Any]:
    model = _get_or_create_model(settings)
    _, rich_postprocess = _load_funasr_symbols()
    source_path = Path(str(audio_path))
    duration_ms = max(1, int(_probe_audio_duration_ms(source_path) or 0))

    if progress_callback:
        try:
            progress_callback({"elapsed_seconds": 0})
        except Exception:
            pass

    started = time.monotonic()
    generate_kwargs: dict[str, Any] = {
        "input": str(source_path),
        "cache": {},
        "language": settings.language,
        "use_itn": settings.use_itn,
        "batch_size_s": settings.batch_size_s,
        "merge_vad": settings.merge_vad,
        "merge_length_s": settings.merge_length_s,
        "ban_emo_unk": settings.ban_emo_unk,
    }
    generate_result = model.generate(**generate_kwargs)
    normalized_result = _normalize_generate_result(generate_result[0] if isinstance(generate_result, list) and generate_result else generate_result)
    raw_text = str(normalized_result.get("text") or "").strip()
    text = rich_postprocess(raw_text) if callable(rich_postprocess) and raw_text else raw_text
    words = _approximate_words_from_text(text, duration_ms)
    transcript: dict[str, Any] = {
        "text": text,
        "lang": str(normalized_result.get("lang") or normalized_result.get("language") or settings.language or ""),
        "emotion": str(normalized_result.get("emotion") or normalized_result.get("emo") or ""),
        "event": str(normalized_result.get("event") or normalized_result.get("aed") or ""),
    }
    if words:
        transcript["words"] = words
    else:
        transcript["sentences"] = _build_fallback_sentences(text, duration_ms)
    asr_payload = {
        "source": "sensevoice_server",
        "engine": "sensevoice_funasr",
        "transcripts": [transcript],
    }

    elapsed_seconds = max(0, int(round(time.monotonic() - started)))
    if progress_callback:
        try:
            progress_callback({"elapsed_seconds": elapsed_seconds})
        except Exception:
            pass

    settings_summary = _settings_summary(settings)
    return {
        "model": SENSEVOICE_ASR_MODEL,
        "task_id": "",
        "task_status": "SUCCEEDED",
        "usage_seconds": max(1, math.ceil(duration_ms / 1000)),
        "transcription_url": "",
        "preview_text": text,
        "asr_result_json": asr_payload,
        "provider": "sensevoice",
        "settings_summary": settings_summary,
        "raw_generate_result": normalized_result,
    }
