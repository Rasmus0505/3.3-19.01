from __future__ import annotations

import asyncio
import time

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps.auth import get_current_user
from app.core.config import BASE_TMP_DIR, REQUEST_TIMEOUT_SECONDS
from app.core.errors import error_response
from app.db import get_db
from app.models import AsrRecord, User
from app.schemas import (
    AsrBatchTranscribeResponse,
    AsrRecordDeleteResponse,
    AsrRecordDetailResponse,
    AsrRecordItemResponse,
    AsrRecordListItemResponse,
    AsrRecordListResponse,
    AsrRecordSegmentResponse,
    AsrRecordSummaryResponse,
    ErrorResponse,
)
from app.services.asr_dashscope import AsrError
from app.services.asr_model_registry import get_supported_upload_asr_model_keys
from app.services.asr_records import (
    build_asr_record_failure_payload,
    build_asr_record_item_payload,
    create_asr_record,
    normalize_asr_record_output_mode,
)
from app.services.billing_service import get_default_asr_model
from app.services.media import MediaError, cleanup_dir, create_request_dir
from app.services.transcription_service import transcribe_uploaded_file


router = APIRouter(prefix="/api/asr-records", tags=["asr-records"])


def _resolve_media_error_message(exc: MediaError) -> str:
    code = str(getattr(exc, "code", "") or "").strip().upper()
    if code == "FFMPEG_EXTRACT_FAILED":
        return "媒体文件已接收，但音轨提取失败"
    if code == "INVALID_FILE_TYPE":
        return "媒体文件类型不支持"
    return str(getattr(exc, "message", "") or "").strip() or "媒体处理失败"


def _to_asr_record_summary_payload(record: AsrRecord) -> dict[str, object]:
    return {
        "file_count": max(0, int(record.file_count or 0)),
        "success_count": max(0, int(record.success_count or 0)),
        "failure_count": max(0, int(record.failure_count or 0)),
        "total_elapsed_ms": max(0, int(record.total_elapsed_ms or 0)),
    }


def _to_asr_record_item_response(item) -> AsrRecordItemResponse:
    return AsrRecordItemResponse(
        id=int(item.id),
        file_index=max(0, int(item.file_index or 0)),
        source_filename=str(item.source_filename or ""),
        status=str(item.status or ""),
        error_code=str(item.error_code or ""),
        error_message=str(item.error_message or ""),
        preview_text=str(item.preview_text or ""),
        transcript_text=str(item.transcript_text or ""),
        rendered_text=str(item.rendered_text or ""),
        elapsed_ms=max(0, int(item.elapsed_ms or 0)),
        duration_seconds=max(0, int(item.duration_seconds or 0)),
        segments=[AsrRecordSegmentResponse.model_validate(segment) for segment in list(item.segments_json or [])],
    )


def _to_asr_record_list_item_response(record: AsrRecord) -> AsrRecordListItemResponse:
    return AsrRecordListItemResponse(
        id=int(record.id),
        asr_model=str(record.asr_model or ""),
        output_mode=str(record.output_mode or "per_file"),
        include_timestamps=bool(record.include_timestamps),
        include_filename_headers=bool(record.include_filename_headers),
        record_status=str(record.record_status or ""),
        preview_text=str(record.preview_text or ""),
        merged_text=str(record.merged_text or ""),
        summary=AsrRecordSummaryResponse.model_validate(_to_asr_record_summary_payload(record)),
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _to_asr_record_detail_response(record: AsrRecord) -> AsrRecordDetailResponse:
    return AsrRecordDetailResponse(
        **_to_asr_record_list_item_response(record).model_dump(),
        items=[_to_asr_record_item_response(item) for item in list(record.items or [])],
    )


def _load_record_for_user(*, db: Session, owner_user_id: int, record_id: int) -> AsrRecord | None:
    return db.scalar(
        select(AsrRecord)
        .options(selectinload(AsrRecord.items))
        .where(AsrRecord.id == int(record_id), AsrRecord.user_id == int(owner_user_id))
    )


@router.post(
    "/transcribe",
    response_model=AsrBatchTranscribeResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def transcribe_asr_record_batch(
    files: list[UploadFile] = File(...),
    model: str = Form(""),
    output_mode: str = Form("per_file"),
    include_timestamps: bool = Form(False),
    include_filename_headers: bool = Form(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    normalized_output_mode = normalize_asr_record_output_mode(output_mode)
    selected_model = (model or "").strip() or get_default_asr_model(db)
    supported_models = set(get_supported_upload_asr_model_keys())
    if selected_model not in supported_models:
        for file in files or []:
            await file.close()
        return error_response(
            400,
            "INVALID_MODEL",
            "不支持的模型",
            {"supported_models": sorted(supported_models), "input_model": selected_model},
        )
    if not files:
        return error_response(400, "FILES_REQUIRED", "请至少上传一个媒体文件")

    item_payloads: list[dict[str, object]] = []
    try:
        for file_index, upload_file in enumerate(files):
            item_started = time.monotonic()
            req_dir = create_request_dir(BASE_TMP_DIR)
            source_filename = str(upload_file.filename or f"upload-{file_index + 1}.bin")
            try:
                asr_result = await asyncio.wait_for(
                    asyncio.to_thread(transcribe_uploaded_file, upload_file, req_dir, selected_model),
                    timeout=REQUEST_TIMEOUT_SECONDS,
                )
                item_payloads.append(
                    build_asr_record_item_payload(
                        file_index=file_index,
                        source_filename=source_filename,
                        asr_payload=dict(asr_result.get("asr_result_json") or {}),
                        elapsed_ms=int((time.monotonic() - item_started) * 1000),
                        duration_seconds=max(0, int(asr_result.get("usage_seconds") or 0)),
                        include_timestamps=bool(include_timestamps),
                        include_filename_headers=bool(include_filename_headers),
                    )
                )
            except asyncio.TimeoutError:
                item_payloads.append(
                    build_asr_record_failure_payload(
                        file_index=file_index,
                        source_filename=source_filename,
                        error_code="REQUEST_TIMEOUT",
                        error_message=f"单文件处理超过 {REQUEST_TIMEOUT_SECONDS} 秒",
                        elapsed_ms=int((time.monotonic() - item_started) * 1000),
                        include_filename_headers=bool(include_filename_headers),
                    )
                )
            except AsrError as exc:
                item_payloads.append(
                    build_asr_record_failure_payload(
                        file_index=file_index,
                        source_filename=source_filename,
                        error_code=str(exc.code or "ASR_FAILED"),
                        error_message=str(exc.message or "识别失败"),
                        elapsed_ms=int((time.monotonic() - item_started) * 1000),
                        include_filename_headers=bool(include_filename_headers),
                    )
                )
            except MediaError as exc:
                item_payloads.append(
                    build_asr_record_failure_payload(
                        file_index=file_index,
                        source_filename=source_filename,
                        error_code=str(exc.code or "MEDIA_ERROR"),
                        error_message=_resolve_media_error_message(exc),
                        elapsed_ms=int((time.monotonic() - item_started) * 1000),
                        include_filename_headers=bool(include_filename_headers),
                    )
                )
            except Exception as exc:
                item_payloads.append(
                    build_asr_record_failure_payload(
                        file_index=file_index,
                        source_filename=source_filename,
                        error_code="INTERNAL_ERROR",
                        error_message=str(exc)[:1200] or "服务内部错误",
                        elapsed_ms=int((time.monotonic() - item_started) * 1000),
                        include_filename_headers=bool(include_filename_headers),
                    )
                )
            finally:
                cleanup_dir(req_dir)
                await upload_file.close()

        record = create_asr_record(
            db=db,
            owner_user_id=current_user.id,
            asr_model=selected_model,
            output_mode=normalized_output_mode,
            include_timestamps=bool(include_timestamps),
            include_filename_headers=bool(include_filename_headers),
            item_payloads=item_payloads,
        )
        record = _load_record_for_user(db=db, owner_user_id=current_user.id, record_id=record.id)
        if record is None:
            return error_response(500, "ASR_RECORD_SAVE_FAILED", "识别记录保存失败")
        return AsrBatchTranscribeResponse(ok=True, record=_to_asr_record_detail_response(record))
    except Exception as exc:
        db.rollback()
        return error_response(500, "INTERNAL_ERROR", "批量识别失败", str(exc)[:1200])


@router.get(
    "",
    response_model=AsrRecordListResponse,
    responses={401: {"model": ErrorResponse}},
)
def list_asr_records(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    records = list(
        db.scalars(
            select(AsrRecord)
            .where(AsrRecord.user_id == int(current_user.id))
            .order_by(desc(AsrRecord.created_at), desc(AsrRecord.id))
            .limit(int(limit))
        ).all()
    )
    return AsrRecordListResponse(ok=True, items=[_to_asr_record_list_item_response(item) for item in records])


@router.get(
    "/{record_id}",
    response_model=AsrRecordDetailResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_asr_record_detail(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _load_record_for_user(db=db, owner_user_id=current_user.id, record_id=record_id)
    if record is None:
        return error_response(404, "ASR_RECORD_NOT_FOUND", "未找到对应识别记录")
    return _to_asr_record_detail_response(record)


@router.delete(
    "/{record_id}",
    response_model=AsrRecordDeleteResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def delete_asr_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = _load_record_for_user(db=db, owner_user_id=current_user.id, record_id=record_id)
    if record is None:
        return error_response(404, "ASR_RECORD_NOT_FOUND", "未找到对应识别记录")
    db.delete(record)
    db.commit()
    return AsrRecordDeleteResponse(ok=True, record_id=int(record_id))
