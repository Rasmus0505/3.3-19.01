from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
import subprocess

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.config import BASE_TMP_DIR, REQUEST_TIMEOUT_SECONDS
from app.core.errors import error_response
from app.core.timezone import to_shanghai_aware
from app.db import get_db
from app.models import User
from app.schemas import SOEAssessResponse, SOEErrorResponse, SOEHistoryItem, SOEHistoryResponse, SOEWordResult
from app.services.media import MediaError, cleanup_dir, create_request_dir, extract_audio_for_asr, probe_audio_duration_ms
from app.services.tencent_soe_service import assess_sentence_practice, list_soe_results
from app.infra.tencent_soe import SOEConfigError, SOEAssessmentError


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/soe", tags=["soe"])

# 允许上传的音频格式
SUPPORTED_AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac", ".webm", ".opus"}


def _validate_suffix(filename: str) -> str:
    import os
    _, ext = os.path.splitext(str(filename or "").strip())
    ext_lower = ext.lower()
    if not ext_lower:
        raise HTTPException(status_code=400, detail="文件缺少扩展名")
    if ext_lower not in SUPPORTED_AUDIO_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的音频格式: {ext_lower}，支持: {', '.join(sorted(SUPPORTED_AUDIO_SUFFIXES))}",
        )
    return ext_lower


def _convert_to_wav(audio_path: Path, req_dir: Path) -> Path:
    """将任意格式音频转换为 16kHz 16bit mono WAV（腾讯云 SOE 要求）"""
    output_wav = req_dir / f"{audio_path.stem}_soe.wav"
    ffmpeg_bin = None
    try:
        from app.infra.runtime_tools import get_ffmpeg_bin_dir, resolve_command_path
        resolved = get_ffmpeg_bin_dir()
        if resolved:
            ffmpeg_bin = str(resolved / "ffmpeg")
    except Exception:
        pass

    cmd = [ffmpeg_bin or "ffmpeg", "-y", "-i", str(audio_path),
           "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
           str(output_wav)]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=60)
        return output_wav
    except subprocess.CalledProcessError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"音频格式转换失败: {exc.stderr or exc.stdout}",
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=422, detail="音频格式转换超时")


@router.post(
    "/assess",
    response_model=SOEAssessResponse,
    responses={
        400: {"model": SOEErrorResponse},
        401: {"model": SOEErrorResponse},
        422: {"model": SOEErrorResponse},
        500: {"model": SOEErrorResponse},
    },
)
async def assess_audio(
    audio_file: UploadFile = File(...),
    ref_text: str = Form(...),
    sentence_id: int | None = Form(None),
    lesson_id: int | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    上传用户跟读录音，获取口语评测结果。

    - **audio_file**: 音频文件（wav/mp3/m4a/flac/ogg/aac/webm/opus）
    - **ref_text**: 参考文本（英文句子）
    - **sentence_id**: 关联的课程句子 ID（可选）
    - **lesson_id**: 关联的课程 ID（可选）
    """
    started = time.monotonic()

    suffix = _validate_suffix(audio_file.filename or "")
    req_dir = create_request_dir()
    tmp_input = req_dir / f"upload{suffix}"

    try:
        # 保存上传文件
        with open(tmp_input, "wb") as f:
            content = await audio_file.read()
            f.write(content)

        audio_size = len(content)

        # 探测原始音频时长
        try:
            duration_ms = probe_audio_duration_ms(tmp_input)
        except Exception:
            duration_ms = None

        # 转换音频为腾讯云 SOE 所需格式（16kHz 16bit mono WAV）
        if suffix != ".wav":
            wav_path = _convert_to_wav(tmp_input, req_dir)
        else:
            wav_path = tmp_input

        # 调用评测服务（同步调用，在线程中执行避免阻塞）
        result = await asyncio.wait_for(
            asyncio.to_thread(
                assess_sentence_practice,
                db=db,
                audio_path=str(wav_path),
                ref_text=ref_text.strip(),
                user_id=current_user.id,
                lesson_id=lesson_id,
                sentence_id=sentence_id,
                save_result=True,
            ),
            timeout=90.0,
        )

        elapsed_ms = int((time.monotonic() - started) * 1000)

        if not result.ok:
            return error_response(
                500 if not result.error_code else 500,
                f"SOE_ERROR_{result.error_code or 'UNKNOWN'}",
                result.error_message or "评测失败",
            )

        return SOEAssessResponse(
            ok=True,
            voice_id=result.voice_id,
            ref_text=result.ref_text,
            user_text=result.user_text,
            total_score=result.total_score,
            pronunciation_score=result.pronunciation_score,
            fluency_score=result.fluency_score,
            completeness_score=result.completeness_score,
            word_results=[SOEWordResult(**w) if isinstance(w, dict) else w for w in result.word_results],
            saved_result_id=result.saved_result_id,
        )

    except asyncio.TimeoutError:
        return error_response(504, "REQUEST_TIMEOUT", "评测超时，请重试", f"超过 90 秒")
    except SOEConfigError as e:
        return error_response(503, "SOE_CONFIG_ERROR", str(e))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[DEBUG] soe.assess exception")
        return error_response(500, "INTERNAL_ERROR", "评测服务内部错误", str(exc)[:1200])
    finally:
        try:
            cleanup_dir(req_dir)
        except Exception:
            pass


@router.get(
    "/history",
    response_model=SOEHistoryResponse,
    responses={401: {"model": SOEErrorResponse}},
)
def get_soe_history(
    lesson_id: int | None = None,
    sentence_id: int | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    查询用户的口语评测历史记录。

    - **lesson_id**: 按课程 ID 筛选（可选）
    - **sentence_id**: 按课程句子 ID 筛选（可选）
    - **limit**: 返回条数，默认 50，上限 200
    """
    if limit <= 0 or limit > 200:
        limit = 50

    records = list_soe_results(
        db=db,
        user_id=current_user.id,
        lesson_id=lesson_id,
        sentence_id=sentence_id,
        limit=limit,
    )

    items = [
        SOEHistoryItem(
            id=r.id,
            lesson_id=r.lesson_id,
            sentence_id=r.sentence_id,
            ref_text=r.ref_text,
            user_text=r.user_text,
            total_score=r.total_score,
            pronunciation_score=r.pronunciation_score,
            fluency_score=r.fluency_score,
            completeness_score=r.completeness_score,
            created_at=to_shanghai_aware(r.created_at).isoformat() if r.created_at else "",
        )
        for r in records
    ]

    return SOEHistoryResponse(ok=True, items=items)
