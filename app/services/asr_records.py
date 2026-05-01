from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import AsrRecord, AsrRecordItem
from app.services.lesson_builder import extract_sentences


ASR_RECORD_OUTPUT_MODES = {"per_file", "merged"}
ASR_RECORD_STATUS_SUCCEEDED = "succeeded"
ASR_RECORD_STATUS_PARTIAL = "partial"
ASR_RECORD_STATUS_FAILED = "failed"
ASR_RECORD_ITEM_STATUS_SUCCEEDED = "succeeded"
ASR_RECORD_ITEM_STATUS_FAILED = "failed"


def normalize_asr_record_output_mode(value: str) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in ASR_RECORD_OUTPUT_MODES else "per_file"


def format_timestamp_ms(value: int) -> str:
    total_ms = max(0, int(value or 0))
    minutes = total_ms // 60000
    seconds = (total_ms % 60000) // 1000
    milliseconds = total_ms % 1000
    return f"{minutes:02d}:{seconds:02d}.{milliseconds:03d}"


def _truncate_text(value: str, *, limit: int = 240) -> str:
    normalized = " ".join(str(value or "").split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: max(0, limit - 1)].rstrip()}…"


def extract_asr_segments(asr_payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    payload = dict(asr_payload or {}) if isinstance(asr_payload, dict) else {}
    try:
        return [
            {
                "begin_ms": int(item["begin_ms"]),
                "end_ms": int(item["end_ms"]),
                "text": str(item["text"] or "").strip(),
            }
            for item in extract_sentences(payload)
        ]
    except Exception:
        return []


def extract_asr_transcript_text(asr_payload: dict[str, Any] | None) -> str:
    payload = dict(asr_payload or {}) if isinstance(asr_payload, dict) else {}
    segments = extract_asr_segments(payload)
    if segments:
        return "\n".join(str(item.get("text") or "").strip() for item in segments if str(item.get("text") or "").strip()).strip()

    top_level_text = str(payload.get("text") or "").strip()
    if top_level_text:
        return top_level_text

    transcripts = payload.get("transcripts")
    if isinstance(transcripts, list):
        texts = [str(item.get("text") or "").strip() for item in transcripts if isinstance(item, dict) and str(item.get("text") or "").strip()]
        return "\n".join(texts).strip()
    return ""


def render_asr_item_text(
    *,
    source_filename: str,
    transcript_text: str,
    segments: list[dict[str, Any]] | None,
    include_timestamps: bool,
    include_filename_headers: bool,
) -> str:
    normalized_filename = str(source_filename or "").strip() or "unnamed"
    normalized_segments = list(segments or [])

    if include_timestamps and normalized_segments:
        body = "\n".join(
            f"[{format_timestamp_ms(int(item.get('begin_ms') or 0))} - {format_timestamp_ms(int(item.get('end_ms') or 0))}] {str(item.get('text') or '').strip()}".rstrip()
            for item in normalized_segments
            if str(item.get("text") or "").strip()
        ).strip()
    else:
        body = str(transcript_text or "").strip()

    if include_filename_headers:
        header = f"### {normalized_filename}"
        return f"{header}\n{body}".strip() if body else header
    return body


def build_asr_record_item_payload(
    *,
    file_index: int,
    source_filename: str,
    asr_payload: dict[str, Any] | None,
    elapsed_ms: int,
    duration_seconds: int,
    include_timestamps: bool,
    include_filename_headers: bool,
) -> dict[str, Any]:
    segments = extract_asr_segments(asr_payload)
    transcript_text = extract_asr_transcript_text(asr_payload)
    rendered_text = render_asr_item_text(
        source_filename=source_filename,
        transcript_text=transcript_text,
        segments=segments,
        include_timestamps=include_timestamps,
        include_filename_headers=include_filename_headers,
    )
    return {
        "file_index": max(0, int(file_index or 0)),
        "source_filename": str(source_filename or "").strip() or "upload.bin",
        "status": ASR_RECORD_ITEM_STATUS_SUCCEEDED,
        "error_code": "",
        "error_message": "",
        "preview_text": _truncate_text(transcript_text),
        "transcript_text": transcript_text,
        "rendered_text": rendered_text,
        "elapsed_ms": max(0, int(elapsed_ms or 0)),
        "duration_seconds": max(0, int(duration_seconds or 0)),
        "segments_json": segments,
    }


def build_asr_record_failure_payload(
    *,
    file_index: int,
    source_filename: str,
    error_code: str,
    error_message: str,
    elapsed_ms: int,
    include_filename_headers: bool = True,
) -> dict[str, Any]:
    normalized_filename = str(source_filename or "").strip() or "upload.bin"
    normalized_message = str(error_message or "").strip() or "识别失败"
    rendered_text = f"### {normalized_filename}\n识别失败：{normalized_message}" if include_filename_headers else f"识别失败：{normalized_message}"
    return {
        "file_index": max(0, int(file_index or 0)),
        "source_filename": normalized_filename,
        "status": ASR_RECORD_ITEM_STATUS_FAILED,
        "error_code": str(error_code or "ASR_RECORD_ITEM_FAILED").strip() or "ASR_RECORD_ITEM_FAILED",
        "error_message": normalized_message,
        "preview_text": _truncate_text(normalized_message),
        "transcript_text": "",
        "rendered_text": rendered_text,
        "elapsed_ms": max(0, int(elapsed_ms or 0)),
        "duration_seconds": 0,
        "segments_json": [],
    }


def build_asr_record_merged_text(item_payloads: list[dict[str, Any]]) -> str:
    return "\n\n".join(
        str(item.get("rendered_text") or "").strip()
        for item in item_payloads
        if str(item.get("rendered_text") or "").strip()
    ).strip()


def resolve_asr_record_status(item_payloads: list[dict[str, Any]]) -> str:
    success_count = sum(1 for item in item_payloads if str(item.get("status") or "").strip().lower() == ASR_RECORD_ITEM_STATUS_SUCCEEDED)
    if success_count <= 0:
        return ASR_RECORD_STATUS_FAILED
    if success_count >= len(item_payloads):
        return ASR_RECORD_STATUS_SUCCEEDED
    return ASR_RECORD_STATUS_PARTIAL


def create_asr_record(
    *,
    db: Session,
    owner_user_id: int,
    asr_model: str,
    output_mode: str,
    include_timestamps: bool,
    include_filename_headers: bool,
    item_payloads: list[dict[str, Any]],
) -> AsrRecord:
    normalized_items = list(item_payloads or [])
    merged_text = build_asr_record_merged_text(normalized_items)
    success_count = sum(1 for item in normalized_items if str(item.get("status") or "").strip().lower() == ASR_RECORD_ITEM_STATUS_SUCCEEDED)
    record = AsrRecord(
        user_id=int(owner_user_id),
        asr_model=str(asr_model or "").strip(),
        output_mode=normalize_asr_record_output_mode(output_mode),
        include_timestamps=bool(include_timestamps),
        include_filename_headers=bool(include_filename_headers),
        record_status=resolve_asr_record_status(normalized_items),
        file_count=len(normalized_items),
        success_count=success_count,
        failure_count=max(0, len(normalized_items) - success_count),
        total_elapsed_ms=sum(max(0, int(item.get("elapsed_ms") or 0)) for item in normalized_items),
        preview_text=_truncate_text(merged_text),
        merged_text=merged_text,
    )
    for item in normalized_items:
        record.items.append(
            AsrRecordItem(
                file_index=max(0, int(item.get("file_index") or 0)),
                source_filename=str(item.get("source_filename") or "").strip() or "upload.bin",
                status=str(item.get("status") or ASR_RECORD_ITEM_STATUS_FAILED).strip().lower(),
                error_code=str(item.get("error_code") or "").strip(),
                error_message=str(item.get("error_message") or "").strip(),
                preview_text=str(item.get("preview_text") or "").strip(),
                transcript_text=str(item.get("transcript_text") or "").strip(),
                rendered_text=str(item.get("rendered_text") or "").strip(),
                elapsed_ms=max(0, int(item.get("elapsed_ms") or 0)),
                duration_seconds=max(0, int(item.get("duration_seconds") or 0)),
                segments_json=list(item.get("segments_json") or []),
            )
        )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
