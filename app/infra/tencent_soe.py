from __future__ import annotations

"""
腾讯云智聆口语评测（SOE）基础设施层

基于 SDK: D:/GITHUB/tencentcloud-speech-sdk-python
API 端点: wss://soe.cloud.tencent.com/soe/api/
文档: D:/3.3-19.01/口语评测（新版） 智聆口语评测（新版）相关接口_腾讯云.md
"""

import base64
import hmac
import hashlib
import json
import random
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import websocket

from app.core.config import TENCENT_SECRET_ID, TENCENT_SECRET_KEY


SOE_WS_URL = "wss://soe.cloud.tencent.com/soe/api/"

# 引擎类型
ENGINE_EN = "16k_en"
ENGINE_ZH = "16k_zh"

# 音频格式（与官方文档一致：0 pcm，1 wav，2 mp3）
VOICE_FORMAT_PCM = 0
VOICE_FORMAT_WAV = 1

# 文本模式
TEXT_MODE_EVAL = 0   # 评测模式
TEXT_MODE_TRANSFER = 1  # 传输模式

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

    @property
    def is_success(self) -> bool:
        return self.code == 0


class SOEConfigError(RuntimeError):
    """配置错误"""
    pass


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
    else:
        import urllib
        return urllib.quote(s)


def _sign(signstr: str, secret_key: str) -> str:
    hmacstr = hmac.new(
        secret_key.encode("utf-8"),
        signstr.encode("utf-8"),
        hashlib.sha1,
    ).digest()
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


def _scale_fluency_completion(v: float) -> float:
    """腾讯云 PronFluency / PronCompletion 为 0~1，前端环形图为 0~100。"""
    if 0.0 <= v <= 1.0:
        return round(v * 100.0, 2)
    return round(v, 2)


def _build_soe_result_from_tencent_payload(voice_id: str, resp: dict, result_data: dict) -> SOEResult:
    """将腾讯云返回的 SentenceInfo（PascalCase）与旧字段名统一为内部 SOEResult。"""
    words_src = result_data.get("word_list") or result_data.get("Words") or result_data.get("words") or []
    if not isinstance(words_src, list):
        words_src = []

    word_results: list[dict] = []
    for w in words_src:
        if not isinstance(w, dict):
            continue
        pa = _pick_float(w, "pronunciation_score", "PronAccuracy", default=0.0) or 0.0
        if pa < 0:
            pa = 0.0
        pf = _pick_float(w, "fluency_score", "PronFluency", default=0.0) or 0.0
        ic = _pick_float(w, "integrity_score", "PronCompletion", default=0.0) or 0.0
        word_results.append(
            {
                "word": str(w.get("word") or w.get("Word") or ""),
                "start_time": int(w.get("start_time") or w.get("MemBeginTime") or 0),
                "end_time": int(w.get("end_time") or w.get("MemEndTime") or 0),
                "pronunciation_score": round(min(100.0, pa), 2),
                "fluency_score": _scale_fluency_completion(pf),
                "integrity_score": _scale_fluency_completion(ic),
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
    )


class _ResultCollector:
    """收集 WebSocket 返回结果的辅助类"""

    def __init__(self) -> None:
        self.result: SOEResult | None = None
        self.error: Exception | None = None
        self.event = threading.Event()

    def set_result(self, result: SOEResult) -> None:
        self.result = result
        self.event.set()

    def set_error(self, exc: Exception) -> None:
        self.error = exc
        self.event.set()

    def wait(self, timeout: float = 60.0) -> SOEResult:
        self.event.wait(timeout=timeout)
        if self.error:
            raise self.error
        if self.result is None:
            raise SOEAssessmentError(0, "评测超时，未收到结果")
        return self.result


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
    对音频文件进行口语评测（录音文件评测模式）。

    Args:
        audio_path: 音频文件路径（16kHz、16bit、mono、wav 或 pcm）
        ref_text: 参考文本（英文句子）
        appid: 腾讯云 AppID
        secret_id: SecretId
        secret_key: SecretKey
        engine_type: 引擎类型，默认 16k_en
        voice_format: 音频格式，默认 1=wav
        eval_mode: 评测模式，0=整句，1=单词
        sentence_info_enabled: 是否返回句子详情，1=是
        timeout: 等待结果超时时间（秒）

    Returns:
        SOEResult 对象
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise SOEAssessmentError(0, f"音频文件不存在: {audio_path}")

    collector = _ResultCollector()
    voice_id = str(uuid.uuid1())

    def on_message(ws, message: str) -> None:
        try:
            resp = json.loads(message)
            resp["voice_id"] = voice_id

            code = resp.get("code", -1)
            if code != 0:
                collector.set_error(
                    SOEAssessmentError(
                        code,
                        resp.get("message", "评测失败"),
                        message,
                    )
                )
                ws.close()
                return

            final = resp.get("final", 0)
            result_data = _coerce_soe_result_dict(resp.get("result"))
            if result_data:
                collector.set_result(_build_soe_result_from_tencent_payload(voice_id, resp, result_data))

            if final == 1:
                ws.close()

        except Exception as e:
            collector.set_error(e)
            ws.close()

    def on_error(ws, error) -> None:
        collector.set_error(SOEAssessmentError(0, f"WebSocket 错误: {error}"))

    def on_close(ws, *args) -> None:
        pass

    def on_open(ws) -> None:
        nonlocal opened
        opened = True

        try:
            with open(audio_path, "rb") as f:
                audio_data = f.read()

            ws.send_binary(audio_data)

            time.sleep(0.5)
            ws.send('{"type": "end"}')
        except Exception as e:
            collector.set_error(e)

    opened = False
    ws_url = _build_ws_url(
        appid=appid,
        secret_id=secret_id,
        secret_key=secret_key,
        engine_type=engine_type,
        voice_id=voice_id,
        voice_format=voice_format,
        text_mode=TEXT_MODE_EVAL,
        rec_mode=REC_MODE_FILE,
        ref_text=ref_text,
        eval_mode=eval_mode,
        sentence_info_enabled=sentence_info_enabled,
    )

    ws = websocket.WebSocketApp(
        ws_url,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
        on_open=on_open,
    )

    t = threading.Thread(target=ws.run_forever)
    t.daemon = True
    t.start()

    return collector.wait(timeout=timeout)
