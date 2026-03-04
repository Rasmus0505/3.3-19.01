from __future__ import annotations

from fastapi import UploadFile

from app.core.config import UPLOAD_MAX_BYTES
from app.services.asr_dashscope import transcribe_audio_file
from app.services.media import extract_audio_for_asr, save_upload_file_stream, validate_suffix


def transcribe_uploaded_file(upload_file: UploadFile, req_dir, model: str) -> dict:
    suffix = validate_suffix(upload_file.filename or "")
    input_path = req_dir / f"upload{suffix}"
    save_upload_file_stream(upload_file, input_path, max_bytes=UPLOAD_MAX_BYTES)
    audio_path = req_dir / "input.opus"
    extract_audio_for_asr(input_path, audio_path)
    return transcribe_audio_file(str(audio_path), model=model)
