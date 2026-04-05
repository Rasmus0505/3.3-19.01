from __future__ import annotations

"""
腾讯云智聆口语评测（SOE）基础设施层

API 端点: wss://soe.cloud.tencent.com/soe/api/
文档: 大模型调用参考文档/腾讯云/口语评测（新版） 智聆口语评测（新版）相关接口_腾讯云.md

实现要点（与文档一致）:
- 建立 WSS 后必须先收到服务端握手成功（code=0），再发送音频二进制，最后发送结束 JSON。
- 使用 asyncio + websockets，避免 websocket-client 线程模型与握手/发送竞态。
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import random
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import websockets
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)

SOE_WS_URL = "wss://soe.cloud.tencent.com/soe/api/"

# 引擎类型
ENGINE_EN = "16k_en"
ENGINE_ZH = "16k_zh"

# 音频格式（与官方文档一致：0 pcm，1 wav，2 mp3）
VOICE_FORMAT_PCM = 0
VOICE_FORMAT_WAV = 1

# 文本模式（文档：0 普通文本，1 音素结构）
TEXT_MODE_PLAIN = 0

# 识别模式
REC_MODE_STREAM = 0  # 流式评测
REC_MODE_FILE = 1    # 录音文件评测

# 评测模式（智聆口语评测新版文档：0 单词/单字，1 句子，2 段落…）
EVAL_MODE_WORD = 0
EVAL_MODE_SENTENCE = 1


@dataclass
class SOEResult:
    """口语评测结果"""

    voice_id: str
    code: int
    message: str
    user_text: str = ""
    total_score: float = 0.0
    pronunciation_score: float = 0.0
    fluency_score: float = 0.0
    completeness_score: float = 0.0
    word_results: list[dict] = field(default_factory=list)
    raw_response: dict = field(default_factory=dict)
    # 新增：句子/单词匹配标签统计
    matched_word_count: int = 0      # 匹配上的单词数（MatchTag=0）
    total_word_count: int = 0         # 参考文本总单词数
    added_word_count: int = 0          # 多读的单词数（MatchTag=1）
    missing_word_count: int = 0        # 漏读的单词数（MatchTag=2）
    misread_word_count: int = 0        # 错读的单词数（MatchTag=3）

    @property
    def is_success(self) -> bool:
        return self.code == 0


class SOEConfigError(RuntimeError):
    """配置错误"""


class SOEAssessmentError(RuntimeError):
    """评测执行错误"""

    def __init__(self, code: int, message: str, detail: str = ""):
        super().__init__(message)
        self.code = code
        self.message = message
        self.detail = detail


def _quote_autho(s: str) -> str:
    if sys.version_info >= (3, 0):
        import urllib.parse as urlparse

        return urlparse.quote(s)
    import urllib

    return urllib.quote(s)


def _sign(signstr: str, secret_key: str) -> str:
    hmacstr = hmac.new(secret_key.encode("utf-8"), signstr.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(hmacstr).decode("utf-8")


def _format_sign_string(params: list) -> str:
    signstr = "soe.cloud.tencent.com/soe/api/"
    for t in params:
        if "appid" in t:
            signstr += str(t[1])
            break
    signstr += "?"
    for x in params:
        tmp = x
        if "appid" in x:
            continue
        for t in tmp:
            signstr += str(t)
            signstr += "="
        signstr = signstr[:-1]
        signstr += "&"
    signstr = signstr[:-1]
    return signstr


def _build_ws_url(
    appid: int,
    secret_id: str,
    secret_key: str,
    engine_type: str,
    voice_id: str,
    voice_format: int,
    text_mode: int,
    rec_mode: int,
    ref_text: str,
    eval_mode: int,
    sentence_info_enabled: int = 1,
    nonce: str | None = None,
    token: str = "",
) -> str:
    timestamp = str(int(time.time()))
    nonce_str = str(nonce) if nonce is not None else str(random.randint(1, 9999999999))

    params = {
        "appid": appid,
        "server_engine_type": engine_type,
        "text_mode": text_mode,
        "rec_mode": rec_mode,
        "ref_text": ref_text,
        "keyword": "",
        "eval_mode": eval_mode,
        "score_coeff": 1.0,
        "sentence_info_enabled": sentence_info_enabled,
        "secretid": secret_id,
        "voice_format": voice_format,
        "voice_id": voice_id,
        "timestamp": timestamp,
        "nonce": nonce_str,
        "expired": int(time.time()) + 24 * 60 * 60,
    }
    if token:
        params["token"] = token

    sorted_params = sorted(params.items(), key=lambda d: d[0])
    signstr = _format_sign_string(sorted_params)
    signature = _sign(signstr, secret_key)

    query_parts = [str(params["appid"]), "?"]
    for key, value in params.items():
        if key == "appid":
            continue
        query_parts.append(f"{key}={_quote_autho(str(value))}&")

    base_url = SOE_WS_URL + "".join(query_parts)
    if base_url.endswith("&"):
        base_url = base_url[:-1]

    signed_url = base_url + f"&signature={_quote_autho(signature)}"
    return signed_url


def _coerce_soe_result_dict(raw: object) -> dict | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return None
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None
    if isinstance(raw, dict):
        return raw
    return None


def _pick_float(d: dict, *keys: str, default: float | None = None) -> float | None:
    for k in keys:
        if k not in d or d[k] is None:
            continue
        try:
            return float(d[k])
        except (TypeError, ValueError):
            continue
    return default


def _pick_int(d: dict, *keys: str, default: int = 0) -> int:
    for k in keys:
        if k not in d or d[k] is None:
            continue
        try:
            return int(d[k])
        except (TypeError, ValueError):
            continue
    return default


def _scale_fluency_completion(v: float) -> float:
    """腾讯云 PronFluency / PronCompletion 为 0~1，前端环形图为 0~100。"""
    if 0.0 <= v <= 1.0:
        return round(v * 100.0, 2)
    return round(v, 2)


def _parse_phone_result(phone: dict) -> dict:
    """解析单个音素（PhoneInfo）结果"""
    if not isinstance(phone, dict):
        return {}
    pa = _pick_float(phone, "PronAccuracy", default=0.0) or 0.0
    if pa < 0:
        pa = 0.0
    ds = phone.get("DetectedStress", False)
    is_stress = phone.get("Stress", False)
    return {
        "phone": str(phone.get("Phone") or phone.get("phone") or ""),
        "reference_phone": str(phone.get("ReferencePhone") or phone.get("reference_phone") or ""),
        "reference_letter": str(phone.get("ReferenceLetter") or phone.get("reference_letter") or ""),
        "pronunciation_score": round(min(100.0, pa), 2),
        "start_time": _pick_int(phone, "MemBeginTime", "mem_begin_time", default=0),
        "end_time": _pick_int(phone, "MemEndTime", "mem_end_time", default=0),
        "match_tag": _pick_int(phone, "MatchTag", "match_tag", default=0),
        "detected_stress": bool(ds) if ds is not None else False,
        "is_stress": bool(is_stress) if is_stress is not None else False,
    }


def _build_soe_result_from_tencent_payload(voice_id: str, resp: dict, result_data: dict) -> SOEResult:
    """将腾讯云返回的 SentenceInfo（PascalCase）与旧字段名统一为内部 SOEResult。"""
    words_src = result_data.get("word_list") or result_data.get("Words") or result_data.get("words") or []
    if not isinstance(words_src, list):
        words_src = []

    word_results: list[dict] = []
    for w in words_src:
        if not isinstance(w, dict):
            continue
        pa = _pick_float(w, "PronAccuracy", default=0.0) or 0.0
        if pa < 0:
            pa = 0.0
        pf = _pick_float(w, "PronFluency", default=0.0) or 0.0
        ic = _pick_float(w, "PronCompletion", "integrity_score", default=0.0) or 0.0
        match_tag = _pick_int(w, "MatchTag", "match_tag", default=0)
        is_keyword = bool(w.get("KeywordTag") or w.get("keyword_tag") or 0)

        # 解析音素详情
        phone_src = w.get("PhoneInfos") or w.get("phone_infos") or []
        if not isinstance(phone_src, list):
            phone_src = []
        phone_results = [_parse_phone_result(p) for p in phone_src if isinstance(p, dict)]

        word = str(w.get("Word") or w.get("word") or "")
        ref_word = str(w.get("ReferenceWord") or w.get("reference_word") or "")
        word_results.append(
            {
                "word": word,
                "reference_word": ref_word,
                "start_time": _pick_int(w, "MemBeginTime", "mem_begin_time", default=0),
                "end_time": _pick_int(w, "MemEndTime", "mem_end_time", default=0),
                "pronunciation_score": round(min(100.0, pa), 2),
                "fluency_score": _scale_fluency_completion(pf),
                "integrity_score": _scale_fluency_completion(ic),
                "match_tag": match_tag,
                "is_keyword": is_keyword,
                "phone_results": phone_results,
            }
        )

    user_text = str(
        result_data.get("voice_text_str")
        or result_data.get("VoiceTextStr")
        or result_data.get("text")
        or ""
    ).strip()

    pa_s = _pick_float(result_data, "PronAccuracy", "pronunciation_score")
    pf_s = _pick_float(result_data, "PronFluency", "fluency_score")
    pc_s = _pick_float(result_data, "PronCompletion", "completeness_score", "integrity_score")
    suggested = _pick_float(result_data, "SuggestedScore", "total_score")

    if pa_s is not None:
        pronunciation = round(min(100.0, pa_s if pa_s >= 0 else 0.0), 2)
    elif word_results:
        pronunciation = round(
            sum(w["pronunciation_score"] for w in word_results) / len(word_results),
            2,
        )
    else:
        pronunciation = 0.0

    if pf_s is not None:
        fluency = _scale_fluency_completion(pf_s)
    elif word_results:
        fluency = round(sum(w["fluency_score"] for w in word_results) / len(word_results), 2)
    else:
        fluency = 0.0

    if pc_s is not None:
        completeness = _scale_fluency_completion(pc_s)
    else:
        completeness = 0.0

    if suggested is not None and suggested >= 0:
        total = round(min(100.0, suggested), 2)
    elif pronunciation or fluency or completeness:
        total = round((pronunciation + fluency + completeness) / 3.0, 2)
    else:
        total = 0.0

    # 统计 MatchTag 分布
    matched = sum(1 for w in word_results if w["match_tag"] == 0)
    added = sum(1 for w in word_results if w["match_tag"] == 1)
    missing = sum(1 for w in word_results if w["match_tag"] == 2)
    misread = sum(1 for w in word_results if w["match_tag"] == 3)
    total_w = len(word_results)

    return SOEResult(
        voice_id=voice_id,
        code=0,
        message="success",
        user_text=user_text,
        total_score=total,
        pronunciation_score=pronunciation,
        fluency_score=fluency,
        completeness_score=completeness,
        word_results=word_results,
        raw_response=resp,
        matched_word_count=matched,
        total_word_count=total_w,
        added_word_count=added,
        missing_word_count=missing,
        misread_word_count=misread,
    )


def _parse_json_text(raw: str | bytes) -> dict:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise SOEAssessmentError(0, "评测响应格式异常", raw[:500])
    return data


async def _soe_assessment_file_async(
    ws_url: str,
    audio_bytes: bytes,
    voice_id: str,
    timeout: float,
) -> SOEResult:
    """
    先收握手成功，再发整段音频（录音模式），再发结束帧，最后收评测结果。
    """
    last_result: SOEResult | None = None
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout

    try:
        async with websockets.connect(
            ws_url,
            open_timeout=min(30.0, timeout),
            close_timeout=10.0,
            max_size=None,
        ) as ws:
            # 1) 握手：必须先收到服务端 code=0
            raw0 = await asyncio.wait_for(ws.recv(), timeout=min(30.0, max(5.0, deadline - loop.time())))
            hs = _parse_json_text(raw0)
            hs["voice_id"] = voice_id
            if hs.get("code", -1) != 0:
                raise SOEAssessmentError(
                    int(hs.get("code", -1) or -1),
                    str(hs.get("message", "握手失败")),
                    json.dumps(hs, ensure_ascii=False)[:1200],
                )

            # 2) 上传音频（录音模式：单次二进制分片）
            await ws.send(audio_bytes)
            await asyncio.sleep(0.2)
            await ws.send(json.dumps({"type": "end"}))

            # 3) 识别结果（可能多条，最后一条 final=1）
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    raise SOEAssessmentError(0, "评测超时，未收到结果")
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                if isinstance(raw, bytes):
                    continue

                resp = _parse_json_text(raw)
                resp["voice_id"] = voice_id
                code = resp.get("code", -1)
                if code != 0:
                    raise SOEAssessmentError(
                        int(code),
                        str(resp.get("message", "评测失败")),
                        json.dumps(resp, ensure_ascii=False)[:1200],
                    )

                result_data = _coerce_soe_result_dict(resp.get("result"))
                if result_data:
                    last_result = _build_soe_result_from_tencent_payload(voice_id, resp, result_data)

                if resp.get("final") == 1:
                    break

    except ConnectionClosed as exc:
        if last_result is not None:
            return last_result
        detail = ""
        if exc.rcvd is not None:
            detail = f"{exc.rcvd.code} {exc.rcvd.reason or ''}".strip()
        raise SOEAssessmentError(0, detail or str(exc) or "评测连接已关闭") from exc
    except asyncio.TimeoutError as exc:
        if last_result is not None:
            return last_result
        raise SOEAssessmentError(0, "评测超时，未收到结果") from exc

    if last_result is None:
        raise SOEAssessmentError(0, "评测完成但未收到有效评分结果（请检查音频与参考文本是否匹配）")
    return last_result


def soe_assessment_file(
    audio_path: str | Path,
    ref_text: str,
    appid: int,
    secret_id: str,
    secret_key: str,
    engine_type: str = ENGINE_EN,
    voice_format: int = VOICE_FORMAT_WAV,
    eval_mode: int = EVAL_MODE_SENTENCE,
    sentence_info_enabled: int = 1,
    timeout: float = 60.0,
) -> SOEResult:
    """
    对音频文件进行口语评测（录音文件评测模式，rec_mode=1）。

    Args:
        audio_path: 16kHz、16bit、mono 的 wav（或文档允许的格式）
        ref_text: 参考文本（英文句子）
        eval_mode: 1=句子模式（跟读句子），0=单词/单字模式
        voice_format: 1=wav，0=pcm
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise SOEAssessmentError(0, f"音频文件不存在: {audio_path}")

    voice_id = str(uuid.uuid1())
    ws_url = _build_ws_url(
        appid=appid,
        secret_id=secret_id,
        secret_key=secret_key,
        engine_type=engine_type,
        voice_id=voice_id,
        voice_format=voice_format,
        text_mode=TEXT_MODE_PLAIN,
        rec_mode=REC_MODE_FILE,
        ref_text=ref_text,
        eval_mode=eval_mode,
        sentence_info_enabled=sentence_info_enabled,
    )

    audio_bytes = audio_path.read_bytes()
    logger.info(
        "tencent_soe start voice_id=%s audio_bytes=%s ref_len=%s timeout=%s",
        voice_id,
        len(audio_bytes),
        len(ref_text),
        timeout,
    )
    try:
        out = asyncio.run(_soe_assessment_file_async(ws_url, audio_bytes, voice_id, timeout))
        logger.info(
            "tencent_soe ok voice_id=%s total=%s pron=%s",
            voice_id,
            out.total_score,
            out.pronunciation_score,
        )
        return out
    except SOEAssessmentError as e:
        logger.error(
            "tencent_soe fail voice_id=%s code=%s msg=%s",
            voice_id,
            e.code,
            (e.message or "")[:500],
        )
        raise
