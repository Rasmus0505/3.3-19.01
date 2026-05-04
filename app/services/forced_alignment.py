from __future__ import annotations

import logging
import re
import tempfile
from collections.abc import Iterable
from contextlib import suppress
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import QWEN_FORCED_ALIGNER_DEVICE, QWEN_FORCED_ALIGNER_MODEL_DIR
from app.services.media import MediaError, run_cmd

logger = logging.getLogger(__name__)
_TOKEN_EDGE_RE = re.compile(r"^[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+|[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+$")
_LATIN_RE = re.compile(r"[A-Za-z]")
_CJK_RE = re.compile(r"[\u3400-\u9fff]")


class ForcedAlignmentError(RuntimeError):
    def __init__(self, code: str, message: str, detail: str = ""):
        self.code = str(code or "FORCED_ALIGNMENT_FAILED").strip() or "FORCED_ALIGNMENT_FAILED"
        self.message = str(message or "时间戳对齐失败").strip() or "时间戳对齐失败"
        self.detail = str(detail or "").strip()
        super().__init__(self.message)


def _normalize_language(value: str) -> str:
    raw = str(value or "").strip().lower()
    mapping = {
        "en": "English",
        "english": "English",
        "zh": "Chinese",
        "zh-cn": "Chinese",
        "chinese": "Chinese",
        "yue": "Cantonese",
        "cantonese": "Cantonese",
        "fr": "French",
        "french": "French",
        "de": "German",
        "german": "German",
        "it": "Italian",
        "italian": "Italian",
        "ja": "Japanese",
        "japanese": "Japanese",
        "ko": "Korean",
        "korean": "Korean",
        "pt": "Portuguese",
        "portuguese": "Portuguese",
        "ru": "Russian",
        "russian": "Russian",
        "es": "Spanish",
        "spanish": "Spanish",
    }
    return mapping.get(raw, "")


def _resolve_model_dir(model_dir: str | Path | None = None) -> Path:
    candidate = Path(model_dir) if model_dir else Path(QWEN_FORCED_ALIGNER_MODEL_DIR)
    candidate = candidate.expanduser()
    if not str(candidate).strip():
        raise ForcedAlignmentError(
            "FORCED_ALIGNER_MODEL_DIR_MISSING",
            "未配置本地对齐模型目录",
            "请设置 QWEN_FORCED_ALIGNER_MODEL_DIR 指向 Qwen3-ForcedAligner-0.6B 模型目录。",
        )
    if not candidate.exists():
        raise ForcedAlignmentError(
            "FORCED_ALIGNER_MODEL_DIR_NOT_FOUND",
            "本地对齐模型目录不存在",
            str(candidate),
        )
    if not (candidate / "model.safetensors").exists():
        raise ForcedAlignmentError(
            "FORCED_ALIGNER_MODEL_INCOMPLETE",
            "本地对齐模型目录不完整",
            f"缺少 {candidate / 'model.safetensors'}",
        )
    return candidate


@lru_cache(maxsize=1)
def _load_aligner(model_dir_text: str, device: str):
    try:
        import torch  # type: ignore
        from qwen_asr import Qwen3ForcedAligner  # type: ignore
    except Exception as exc:
        raise ForcedAlignmentError(
            "FORCED_ALIGNER_DEPENDENCY_MISSING",
            "本地对齐依赖未安装",
            f"导入 qwen_asr 失败: {exc}",
        ) from exc

    model_dir = Path(model_dir_text)
    normalized_device = str(device or QWEN_FORCED_ALIGNER_DEVICE or "cpu").strip() or "cpu"
    preferred_dtype = torch.bfloat16 if normalized_device.startswith("cuda") else torch.float32
    logger.info("[DEBUG] forced_alignment.load model_dir=%s device=%s dtype=%s", model_dir, normalized_device, preferred_dtype)
    try:
        return Qwen3ForcedAligner.from_pretrained(
            str(model_dir),
            device_map=normalized_device,
            dtype=preferred_dtype,
        )
    except Exception as exc:
        raise ForcedAlignmentError(
            "FORCED_ALIGNER_LOAD_FAILED",
            "本地对齐模型加载失败",
            str(exc),
        ) from exc


def _safe_ms(value: Any) -> int:
    numeric = float(value)
    if abs(numeric) < 10_000 and not float(numeric).is_integer():
        numeric *= 1000
    return max(0, int(round(numeric)))


def _normalize_token(value: str) -> str:
    return _TOKEN_EDGE_RE.sub("", str(value or "").strip().lower().replace("’", "'"))


def _normalize_word_item(item: Any) -> dict[str, Any] | None:
    text = str(getattr(item, "text", "") or "").strip()
    try:
        start_ms = _safe_ms(getattr(item, "start_time", None))
        end_ms = _safe_ms(getattr(item, "end_time", None))
    except Exception:
        return None
    if not text or end_ms <= start_ms:
        return None
    return {
        "text": text,
        "begin_ms": start_ms,
        "end_ms": end_ms,
    }


def _flatten_alignment_words(result: Any) -> list[dict[str, Any]]:
    if not isinstance(result, Iterable):
        raise ForcedAlignmentError("FORCED_ALIGNMENT_EMPTY", "本地对齐结果为空")
    words: list[dict[str, Any]] = []
    for item in result:
        normalized = _normalize_word_item(item)
        if normalized:
            words.append(normalized)
    if not words:
        raise ForcedAlignmentError("FORCED_ALIGNMENT_EMPTY", "本地对齐未返回有效词级时间戳")
    return words


def _normalize_sentence_tokens(sentence_text: str) -> list[str]:
    return [_normalize_token(part) for part in str(sentence_text or "").strip().split() if _normalize_token(part)]


def _provider_sentence_tokens(sentence: dict[str, Any]) -> list[str]:
    provider_words = list(sentence.get("words") or [])
    if provider_words:
        tokens = [_normalize_token(item.get("text") or item.get("surface") or "") for item in provider_words if isinstance(item, dict)]
        tokens = [token for token in tokens if token]
        if tokens:
            return tokens
    return _normalize_sentence_tokens(str(sentence.get("text") or sentence.get("text_en") or ""))


def _sentence_has_latin_tokens(sentence: dict[str, Any]) -> bool:
    for item in list(sentence.get("words") or []):
        if not isinstance(item, dict):
            continue
        if _LATIN_RE.search(str(item.get("text") or item.get("surface") or "")):
            return True
    return bool(_LATIN_RE.search(str(sentence.get("text_en") or sentence.get("text") or "")))


def _sentence_has_cjk(sentence: dict[str, Any]) -> bool:
    for item in list(sentence.get("words") or []):
        if not isinstance(item, dict):
            continue
        if _CJK_RE.search(str(item.get("text") or item.get("surface") or "")):
            return True
    return bool(_CJK_RE.search(str(sentence.get("text_en") or sentence.get("text") or "")))


def _is_english_alignable_sentence(sentence: dict[str, Any]) -> bool:
    sentence_language = str(sentence.get("language") or "").strip().lower()
    if sentence_language in {"zh", "zh-cn", "chinese", "yue", "cantonese", "ja", "japanese", "ko", "korean"}:
        return False
    if sentence_language in {"en", "english"}:
        return True
    if not _sentence_has_latin_tokens(sentence):
        return False
    return not _sentence_has_cjk(sentence)


def _filter_alignable_sentences(source_sentences: list[dict[str, Any]], *, language: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    normalized_language = str(language or "").strip().lower()
    if normalized_language == "english":
        alignable = []
        passthrough = []
        for idx, item in enumerate(source_sentences):
            payload = dict(item)
            payload["idx"] = int(payload.get("idx", idx))
            if _is_english_alignable_sentence(payload):
                alignable.append(payload)
            else:
                passthrough.append(payload)
        return alignable, passthrough
    return [dict(item, idx=int(dict(item).get("idx", idx))) for idx, item in enumerate(source_sentences)], []


def _merge_sentence_results(
    *,
    source_sentences: list[dict[str, Any]],
    aligned_sentences: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    aligned_by_idx = {int(item.get("idx", -1)): dict(item) for item in aligned_sentences}
    merged: list[dict[str, Any]] = []
    for idx, sentence in enumerate(source_sentences):
        aligned = aligned_by_idx.get(int(sentence.get("idx", idx)))
        if aligned:
            merged.append(aligned)
            continue
        merged.append(
            {
                "idx": int(sentence.get("idx", idx)),
                "text": str(sentence.get("text") or sentence.get("text_en") or ""),
                "text_en": str(sentence.get("text_en") or sentence.get("text") or ""),
                "text_zh": str(sentence.get("text_zh") or ""),
                "tokens": list(sentence.get("tokens") or _provider_sentence_tokens(sentence)),
                "audio_url": sentence.get("audio_url"),
                "begin_ms": int(sentence.get("begin_ms", 0)),
                "end_ms": int(sentence.get("end_ms", 0)),
                "words": [dict(item) for item in list(sentence.get("words") or []) if isinstance(item, dict)],
            }
        )
    return merged


def _find_sentence_end_index(
    *,
    aligned_tokens: list[str],
    cursor: int,
    target_tokens: list[str],
) -> tuple[int, int] | None:
    if not target_tokens:
        return None
    token_len = len(aligned_tokens)
    max_end = min(token_len, cursor + max(len(target_tokens) + 6, len(target_tokens)))
    for end in range(cursor + len(target_tokens), max_end + 1):
        candidate = aligned_tokens[cursor:end]
        if candidate == target_tokens:
            return cursor, end
    max_window = min(token_len, cursor + len(target_tokens) + 8)
    match_positions: list[int] = []
    search_cursor = cursor
    for token in target_tokens:
        matched_position = None
        for candidate_idx in range(search_cursor, max_window):
            if aligned_tokens[candidate_idx] == token:
                matched_position = candidate_idx
                break
        if matched_position is None:
            return None
        match_positions.append(matched_position)
        search_cursor = matched_position + 1
    if not match_positions:
        return None
    return match_positions[0], match_positions[-1] + 1


def _fallback_sentence_result(sentence: dict[str, Any], idx: int, *, detail: str = "") -> dict[str, Any]:
    begin_ms = max(0, int(sentence.get("begin_ms", 0)))
    end_ms = max(begin_ms, int(sentence.get("end_ms", begin_ms)))
    payload = {
        "idx": int(sentence.get("idx", idx)),
        "text": str(sentence.get("text") or sentence.get("text_en") or ""),
        "text_en": str(sentence.get("text_en") or sentence.get("text") or ""),
        "text_zh": str(sentence.get("text_zh") or ""),
        "tokens": list(sentence.get("tokens") or _provider_sentence_tokens(sentence)),
        "audio_url": sentence.get("audio_url"),
        "begin_ms": begin_ms,
        "end_ms": end_ms,
        "words": [dict(item) for item in list(sentence.get("words") or []) if isinstance(item, dict)],
    }
    if detail:
        payload["alignment_fallback_reason"] = str(detail)
    return payload
    return None


def _build_sentence_windows(
    *,
    aligned_words: list[dict[str, Any]],
    source_sentences: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[int]]:
    if not source_sentences:
        raise ForcedAlignmentError("FORCED_ALIGNMENT_SENTENCES_MISSING", "缺少待聚合的句级文本")

    cursor = 0
    total_words = len(aligned_words)
    aligned_tokens = [_normalize_token(item.get("text") or "") for item in aligned_words]
    output: list[dict[str, Any]] = []
    aligned_sentence_indexes: list[int] = []
    for idx, sentence in enumerate(source_sentences):
        text = str(sentence.get("text") or sentence.get("text_en") or "").strip()
        if not text:
            output.append(_fallback_sentence_result(sentence, idx, detail="empty_sentence_text"))
            continue
        expected_tokens = _provider_sentence_tokens(sentence)
        if not expected_tokens:
            expected_tokens = _normalize_sentence_tokens(text)
        span = _find_sentence_end_index(
            aligned_tokens=aligned_tokens,
            cursor=cursor,
            target_tokens=expected_tokens,
        )
        if span is None:
            logger.warning(
                "[DEBUG] forced_alignment.sentence_fallback token_mismatch sentence_index=%s expected_tokens=%s remaining_words=%s",
                idx,
                len(expected_tokens),
                max(0, total_words - cursor),
            )
            matched_surface_cursor = cursor
            if expected_tokens:
                lower_bound = cursor
                upper_bound = min(total_words, cursor + max(len(expected_tokens) * 3, 24))
                first_token = expected_tokens[0]
                for candidate_idx in range(lower_bound, upper_bound):
                    if aligned_tokens[candidate_idx] == first_token:
                        matched_surface_cursor = candidate_idx
                        break
            cursor = max(cursor, matched_surface_cursor)
            output.append(
                _fallback_sentence_result(
                    sentence,
                    idx,
                    detail=f"token_mismatch expected={len(expected_tokens)} remaining={max(0, total_words - cursor)}",
                )
            )
            continue
        start_cursor, end_cursor = span
        sentence_words = aligned_words[start_cursor:end_cursor]
        begin_ms = int(sentence_words[0]["begin_ms"])
        end_ms = int(sentence_words[-1]["end_ms"])
        if end_ms <= begin_ms:
            logger.warning(
                "[DEBUG] forced_alignment.sentence_fallback invalid_window sentence_index=%s begin_ms=%s end_ms=%s",
                idx,
                begin_ms,
                end_ms,
            )
            output.append(
                _fallback_sentence_result(
                    sentence,
                    idx,
                    detail=f"invalid_window begin_ms={begin_ms} end_ms={end_ms}",
                )
            )
            cursor = max(cursor, end_cursor)
            continue
        output.append(
            {
                "idx": int(sentence.get("idx", idx)),
                "text": text,
                "text_en": str(sentence.get("text_en") or text),
                "text_zh": str(sentence.get("text_zh") or ""),
                "tokens": list(sentence.get("tokens") or expected_tokens),
                "audio_url": sentence.get("audio_url"),
                "begin_ms": begin_ms,
                "end_ms": end_ms,
                "words": sentence_words,
            }
        )
        aligned_sentence_indexes.append(int(sentence.get("idx", idx)))
        cursor = end_cursor

    if cursor != total_words:
        logger.warning(
            "[DEBUG] forced_alignment.extra_words ignored total=%s consumed=%s",
            total_words,
            cursor,
        )
    return output, aligned_sentence_indexes


def _align_sentence_clip(
    *,
    aligner: Any,
    clip_audio_path: Path,
    sentence: dict[str, Any],
    language: str,
) -> dict[str, Any] | None:
    sentence_text = str(sentence.get("text_en") or sentence.get("text") or "").strip()
    expected_tokens = _provider_sentence_tokens(sentence)
    if not sentence_text or not expected_tokens:
        return None
    try:
        raw_results = aligner.align(
            audio=str(clip_audio_path),
            text=sentence_text,
            language=language,
        )
    except Exception as exc:
        logger.warning(
            "[DEBUG] forced_alignment.sentence_clip_failed sentence_idx=%s detail=%s",
            sentence.get("idx"),
            str(exc)[:240],
        )
        return None
    if not isinstance(raw_results, list) or not raw_results:
        return None
    try:
        aligned_words = _flatten_alignment_words(raw_results[0])
    except ForcedAlignmentError:
        logger.warning(
            "[DEBUG] forced_alignment.sentence_clip_empty sentence_idx=%s",
            sentence.get("idx"),
        )
        return None
    clip_tokens = [_normalize_token(item.get("text") or "") for item in aligned_words]
    span = _find_sentence_end_index(aligned_tokens=clip_tokens, cursor=0, target_tokens=expected_tokens)
    if span is None:
        return None
    start_cursor, end_cursor = span
    sentence_words = aligned_words[start_cursor:end_cursor]
    if not sentence_words:
        return None
    clip_begin_ms = int(sentence.get("begin_ms", 0))
    begin_ms = clip_begin_ms + int(sentence_words[0]["begin_ms"])
    end_ms = clip_begin_ms + int(sentence_words[-1]["end_ms"])
    if end_ms <= begin_ms:
        return None
    adjusted_words = [
        {
            "text": str(item.get("text") or ""),
            "begin_ms": clip_begin_ms + int(item["begin_ms"]),
            "end_ms": clip_begin_ms + int(item["end_ms"]),
        }
        for item in sentence_words
    ]
    return {
        "idx": int(sentence.get("idx", 0)),
        "text": sentence_text,
        "text_en": str(sentence.get("text_en") or sentence_text),
        "text_zh": str(sentence.get("text_zh") or ""),
        "tokens": list(sentence.get("tokens") or expected_tokens),
        "audio_url": sentence.get("audio_url"),
        "begin_ms": begin_ms,
        "end_ms": end_ms,
        "words": adjusted_words,
    }


def _predecode_audio_to_wav(audio_path: Path, wav_path: Path) -> None:
    """将音频预解码为 16kHz 单声道 WAV，避免每句切割时重复解码。"""
    try:
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(audio_path),
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "wav",
                str(wav_path),
            ]
        )
    except MediaError as exc:
        raise ForcedAlignmentError("FORCED_ALIGNMENT_AUDIO_SLICE_FAILED", "音频预解码为 WAV 失败", exc.detail or exc.message) from exc


def _cut_sentence_clip(
    *,
    audio_path: Path,
    clip_path: Path,
    begin_ms: int,
    end_ms: int,
) -> None:
    start_sec = max(0.0, begin_ms / 1000.0)
    end_sec = max(start_sec + 0.12, end_ms / 1000.0)
    try:
        run_cmd(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{start_sec:.3f}",
                "-to",
                f"{end_sec:.3f}",
                "-i",
                str(audio_path),
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "wav",
                str(clip_path),
            ]
        )
    except MediaError as exc:
        raise ForcedAlignmentError("FORCED_ALIGNMENT_AUDIO_SLICE_FAILED", "句级音频切片失败", exc.detail or exc.message) from exc


def align_transcript_timestamps(
    *,
    audio_path: str | Path,
    source_sentences: list[dict[str, Any]],
    language: str,
    model_dir: str | Path | None = None,
    device: str | None = None,
) -> dict[str, Any]:
    resolved_language = _normalize_language(language)
    if not resolved_language:
        raise ForcedAlignmentError(
            "FORCED_ALIGNMENT_LANGUAGE_UNSUPPORTED",
            "当前语言不支持本地时间戳对齐",
            str(language or ""),
        )

    resolved_model_dir = _resolve_model_dir(model_dir)
    normalized_audio_path = Path(audio_path)
    if not normalized_audio_path.exists():
        raise ForcedAlignmentError(
            "FORCED_ALIGNMENT_AUDIO_NOT_FOUND",
            "待对齐音频不存在",
            str(normalized_audio_path),
        )

    alignable_sentences, passthrough_sentences = _filter_alignable_sentences(source_sentences, language=resolved_language)
    if not alignable_sentences:
        return {
            "language": resolved_language,
            "words": [],
            "aligned_sentence_indexes": [],
            "sentences": _merge_sentence_results(source_sentences=source_sentences, aligned_sentences=[]),
        }

    aligner = _load_aligner(str(resolved_model_dir), str(device or QWEN_FORCED_ALIGNER_DEVICE or "cpu"))
    aligned_sentences: list[dict[str, Any]] = []
    aligned_sentence_indexes: list[int] = []
    with tempfile.TemporaryDirectory(prefix="forced-align-") as tmp_dir_text:
        tmp_dir = Path(tmp_dir_text)
        wav_path = tmp_dir / "predecoded.wav"
        _predecode_audio_to_wav(normalized_audio_path, wav_path)
        for idx, sentence in enumerate(alignable_sentences):
            clip_path = tmp_dir / f"sentence_{idx:04d}.wav"
            _cut_sentence_clip(
                audio_path=wav_path,
                clip_path=clip_path,
                begin_ms=int(sentence.get("begin_ms", 0)),
                end_ms=int(sentence.get("end_ms", 0)),
            )
            aligned_sentence = _align_sentence_clip(
                aligner=aligner,
                clip_audio_path=clip_path,
                sentence=sentence,
                language=resolved_language,
            )
            if aligned_sentence is None:
                logger.warning(
                    "[DEBUG] forced_alignment.sentence_passthrough idx=%s text=%s",
                    sentence.get("idx", idx),
                    str(sentence.get("text") or sentence.get("text_en") or "")[:120],
                )
                aligned_sentences.append(
                    _fallback_sentence_result(sentence, idx, detail="sentence_level_alignment_unavailable")
                )
                continue
            aligned_sentences.append(aligned_sentence)
            aligned_sentence_indexes.append(int(sentence.get("idx", idx)))
            with suppress(FileNotFoundError):
                clip_path.unlink()

    all_aligned_words: list[dict[str, Any]] = []
    for item in aligned_sentences:
        all_aligned_words.extend([dict(word) for word in list(item.get("words") or []) if isinstance(word, dict)])
    return {
        "language": resolved_language,
        "words": all_aligned_words,
        "aligned_sentence_indexes": aligned_sentence_indexes,
        "sentences": _merge_sentence_results(source_sentences=source_sentences, aligned_sentences=aligned_sentences + passthrough_sentences),
    }


__all__ = ["ForcedAlignmentError", "align_transcript_timestamps"]
