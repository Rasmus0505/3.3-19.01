from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class AsrRecordSegmentResponse(BaseModel):
    begin_ms: int
    end_ms: int
    text: str


class AsrRecordSummaryResponse(BaseModel):
    file_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    total_elapsed_ms: int = 0


class AsrRecordItemResponse(BaseModel):
    id: int
    file_index: int
    source_filename: str
    status: str
    error_code: str = ""
    error_message: str = ""
    preview_text: str = ""
    transcript_text: str = ""
    rendered_text: str = ""
    elapsed_ms: int = 0
    duration_seconds: int = 0
    segments: list[AsrRecordSegmentResponse] = Field(default_factory=list)


class AsrRecordListItemResponse(BaseModel):
    id: int
    asr_model: str
    output_mode: str
    include_timestamps: bool
    include_filename_headers: bool
    record_status: str
    preview_text: str = ""
    merged_text: str = ""
    summary: AsrRecordSummaryResponse = Field(default_factory=AsrRecordSummaryResponse)
    created_at: datetime
    updated_at: datetime | None = None


class AsrRecordDetailResponse(AsrRecordListItemResponse):
    items: list[AsrRecordItemResponse] = Field(default_factory=list)


class AsrBatchTranscribeResponse(BaseModel):
    ok: bool = True
    record: AsrRecordDetailResponse


class AsrRecordListResponse(BaseModel):
    ok: bool = True
    items: list[AsrRecordListItemResponse] = Field(default_factory=list)


class AsrRecordDeleteResponse(BaseModel):
    ok: bool = True
    record_id: int
