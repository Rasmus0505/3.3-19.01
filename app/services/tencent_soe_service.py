from __future__ import annotations

import logging
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core.config import TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_SOE_APP_ID
from app.db import SessionLocal
from app.core.timezone import now_shanghai_naive
from app.infra.tencent_soe import (
    ENGINE_EN,
    EVAL_MODE_SENTENCE,
    SOEAssessmentError,
    SOEConfigError,
    SOEResult,
    VOICE_FORMAT_WAV,
    soe_assessment_file,
)
from app.models import SOEResult as SOEResultModel

logger = logging.getLogger(__name__)


@dataclass
class SOEServiceResult:
    """口语评测服务返回结果"""
    ok: bool
    voice_id: str
    ref_text: str
    user_text: str
    total_score: float
    pronunciation_score: float
    fluency_score: float
    completeness_score: float
    word_results: list[dict] = field(default_factory=list)
    saved_result_id: int | None = None
    error_code: int | None = None
    error_message: str | None = None
    error_detail: str | None = None


def _check_config() -> tuple[int, str, str]:
    appid_str = TENCENT_SOE_APP_ID
    secret_id = TENCENT_SECRET_ID
    secret_key = TENCENT_SECRET_KEY

    if not appid_str:
        raise SOEConfigError("TENCENT_SOE_APP_ID 未配置")
    if not secret_id:
        raise SOEConfigError("TENCENT_SECRET_ID 未配置")
    if not secret_key:
        raise SOEConfigError("TENCENT_SECRET_KEY 未配置")

    try:
        appid = int(appid_str)
    except ValueError:
        raise SOEConfigError(f"TENCENT_SOE_APP_ID 不是有效的整数: {appid_str}")

    return appid, secret_id, secret_key


def _map_soe_result(r: SOEResult) -> SOEServiceResult:
    return SOEServiceResult(
        ok=True,
        voice_id=r.voice_id,
        ref_text="",
        user_text=r.user_text,
        total_score=r.total_score,
        pronunciation_score=r.pronunciation_score,
        fluency_score=r.fluency_score,
        completeness_score=r.completeness_score,
        word_results=r.word_results,
        saved_result_id=None,
        error_code=None,
        error_message=None,
    )


def _map_error(code: int, message: str, voice_id: str = "", detail: str = "") -> SOEServiceResult:
    return SOEServiceResult(
        ok=False,
        voice_id=voice_id,
        ref_text="",
        user_text="",
        total_score=0.0,
        pronunciation_score=0.0,
        fluency_score=0.0,
        completeness_score=0.0,
        word_results=[],
        saved_result_id=None,
        error_code=code,
        error_message=message,
        error_detail=detail.strip() if detail else None,
    )


def assess_sentence_practice(
    audio_path: str,
    ref_text: str,
    user_id: int,
    lesson_id: int | None = None,
    sentence_id: int | None = None,
    *,
    db: Session | None = None,
    engine_type: str = ENGINE_EN,
    save_result: bool = True,
) -> SOEServiceResult:
    """
    对用户的跟读录音进行口语评测。

    Args:
        audio_path: 用户录音文件路径
        ref_text: 参考文本（英文句子，即课程句子的 text_en）
        user_id: 当前用户 ID
        lesson_id: 关联课程 ID（可选）
        sentence_id: 关联 lesson_sentences.id（可选）
        db: 若传入则用于写入结果；若为 None 则在本函数内创建 SessionLocal（供 asyncio.to_thread
            等工作线程调用，避免跨线程复用 FastAPI 注入的 Session）。
        engine_type: 引擎类型，默认 16k_en
        save_result: 是否保存评测结果到数据库，默认 True

    Returns:
        SOEServiceResult
    """
    try:
        appid, secret_id, secret_key = _check_config()
    except SOEConfigError as e:
        return _map_error(1, str(e))

    try:
        soe_res = soe_assessment_file(
            audio_path=audio_path,
            ref_text=ref_text,
            appid=appid,
            secret_id=secret_id,
            secret_key=secret_key,
            engine_type=engine_type,
            voice_format=VOICE_FORMAT_WAV,
            eval_mode=EVAL_MODE_SENTENCE,
            sentence_info_enabled=1,
            timeout=60.0,
        )
    except SOEAssessmentError as e:
        return _map_error(e.code, e.message, voice_id="", detail=getattr(e, "detail", "") or "")

    service_result = _map_soe_result(soe_res)
    service_result.ref_text = ref_text

    if save_result:
        session = db if db is not None else SessionLocal()
        own_session = db is None
        try:
            model = SOEResultModel(
                user_id=user_id,
                lesson_id=lesson_id,
                sentence_id=sentence_id,
                ref_text=ref_text,
                user_text=soe_res.user_text,
                total_score=soe_res.total_score,
                pronunciation_score=soe_res.pronunciation_score,
                fluency_score=soe_res.fluency_score,
                completeness_score=soe_res.completeness_score,
                voice_id=soe_res.voice_id,
                raw_response_json=soe_res.raw_response,
                created_at=now_shanghai_naive(),
            )
            session.add(model)
            session.commit()
            session.refresh(model)
            service_result.saved_result_id = model.id
        except Exception:
            session.rollback()
            logger.exception(
                "soe_results 写入失败 user_id=%s lesson_id=%s sentence_id=%s voice_id=%s",
                user_id,
                lesson_id,
                sentence_id,
                soe_res.voice_id,
            )
        finally:
            if own_session:
                session.close()

    return service_result


def list_soe_results(
    db: Session,
    user_id: int,
    lesson_id: int | None = None,
    sentence_id: int | None = None,
    limit: int = 50,
) -> list[SOEResultModel]:
    """查询用户的口语评测历史记录"""
    stmt = db.query(SOEResultModel).where(SOEResultModel.user_id == user_id)

    if lesson_id is not None:
        stmt = stmt.where(SOEResultModel.lesson_id == lesson_id)
    if sentence_id is not None:
        stmt = stmt.where(SOEResultModel.sentence_id == sentence_id)

    return list(
        stmt.order_by(SOEResultModel.created_at.desc())
        .limit(limit)
        .all()
    )
