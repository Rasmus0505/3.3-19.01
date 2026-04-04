from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
import subprocess

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps.auth import get_current_user
from app.core.errors import error_response
from app.core.timezone import to_shanghai_aware
from app.db import get_db
from app.models import LessonSentence, User
from app.schemas import SOEAssessResponse, SOEErrorResponse, SOEHistoryItem, SOEHistoryResponse, SOEWordResult
from app.services.media import cleanup_dir, create_request_dir, probe_audio_duration_ms
from app.services.tencent_soe_service import SOEServiceResult, assess_sentence_practice, list_soe_results
from app.infra.tencent_soe import SOEConfigError


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/soe", tags=["soe"])

# 允许上传的音频格式
SUPPORTED_AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac", ".webm", ".opus"}


def _resolve_lesson_sentence_db_id(db: Session, lesson_id: int | None, sentence_idx: int | None) -> int | None:
    """
    前端课程详情里的句子只有 idx（LessonSentenceResponse.idx），没有数据库主键 id。
    口语评测表单里的 sentence_id 实际传的是 idx，在此解析为 lesson_sentences.id，避免外键写入失败或错绑。
    """
    if sentence_idx is None:
        return None
    if lesson_id is None:
        return sentence_idx
    row = (
        db.query(LessonSentence)
        .filter(LessonSentence.lesson_id == lesson_id, LessonSentence.idx == sentence_idx)
        .one_or_none()
    )
    return int(row.id) if row else None


def _http_status_for_soe_failure(result: SOEServiceResult) -> int:
    """区分配置缺失、腾讯云业务错误与本服务内部错误，便于前端与监控识别。"""
    code = result.error_code
    if code == 1:
        return 503
    if code is not None and code >= 4000:
        return 502
    return 500


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

        resolved_sentence_id = _resolve_lesson_sentence_db_id(db, lesson_id, sentence_id)

        logger.info(
            "soe assess start user_id=%s lesson_id=%s sentence_idx=%s resolved_sentence_id=%s "
            "audio_bytes=%s duration_ms=%s ref_len=%s",
            current_user.id,
            lesson_id,
            sentence_id,
            resolved_sentence_id,
            audio_size,
            duration_ms,
            len(ref_text.strip()),
        )

        # 评测在独立线程中跑 asyncio/WebSocket；禁止把 FastAPI 的 db Session 传入子线程（非线程安全）
        result = await asyncio.wait_for(
            asyncio.to_thread(
                assess_sentence_practice,
                str(wav_path),
                ref_text.strip(),
                current_user.id,
                lesson_id,
                resolved_sentence_id,
                db=None,
                save_result=True,
            ),
            timeout=90.0,
        )

        elapsed_ms = int((time.monotonic() - started) * 1000)

        if not result.ok:
            status = _http_status_for_soe_failure(result)
            err_code = f"SOE_ERROR_{result.error_code if result.error_code is not None else 'UNKNOWN'}"
            msg = result.error_message or "评测失败"
            detail_out = (result.error_detail or "").strip()[:1500]
            logger.error(
                "soe assess failed user_id=%s lesson_id=%s sentence_idx=%s http=%s err=%s msg=%s detail_len=%s elapsed_ms=%s",
                current_user.id,
                lesson_id,
                sentence_id,
                status,
                err_code,
                msg[:500],
                len(detail_out),
                elapsed_ms,
            )
            return error_response(status, err_code, msg, detail_out)

        logger.info(
            "soe assess ok user_id=%s voice_id=%s total=%s elapsed_ms=%s saved_id=%s",
            current_user.id,
            result.voice_id,
            result.total_score,
            elapsed_ms,
            result.saved_result_id,
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
        logger.warning(
            "soe assess timeout user_id=%s lesson_id=%s sentence_id=%s",
            current_user.id,
            lesson_id,
            sentence_id,
        )
        return error_response(504, "REQUEST_TIMEOUT", "评测超时，请重试", "超过 90 秒")
    except SOEConfigError as e:
        logger.error(
            "soe assess config error user_id=%s lesson_id=%s sentence_id=%s detail=%s",
            current_user.id,
            lesson_id,
            sentence_id,
            str(e),
        )
        return error_response(503, "SOE_CONFIG_ERROR", str(e))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "soe assess internal error user_id=%s lesson_id=%s sentence_id=%s",
            current_user.id,
            lesson_id,
            sentence_id,
        )
        return error_response(
            500,
            "INTERNAL_ERROR",
            f"评测服务内部错误: {type(exc).__name__}",
            str(exc)[:1200],
        )
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
