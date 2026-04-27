from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.media import MediaError, run_cmd


_PUNCT_EDGE_RE = re.compile(r"^[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+|[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+$")
_USD_AMOUNT_RE = re.compile(r"(?<![A-Za-z0-9])\$(\d[\d,]*)(?:\.(\d{1,2}))?(?![A-Za-z0-9])")
_STRONG_BOUNDARY_PUNCT = {".", "!", "?", ";"}

logger = logging.getLogger(__name__)

_NUMBER_WORDS_LT_20 = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
]
_NUMBER_WORDS_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_NUMBER_WORDS_SCALES = [
    (1_000_000_000_000, "trillion"),
    (1_000_000_000, "billion"),
    (1_000_000, "million"),
    (1_000, "thousand"),
]



def normalize_token(token: str) -> str:
    normalized = (token or "").strip().lower().replace("’", "'")
    return _PUNCT_EDGE_RE.sub("", normalized)


def tokenize_sentence(sentence: str) -> list[str]:
    raw_tokens = re.split(r"\s+", (sentence or "").strip())
    tokens = [normalize_token(tok) for tok in raw_tokens]
    return [tok for tok in tokens if tok]


def _integer_to_english(value: int) -> str:
    if value < 0:
        raise ValueError("only non-negative values are supported")
    if value < 20:
        return _NUMBER_WORDS_LT_20[value]
    if value < 100:
        tens, remainder = divmod(value, 10)
        head = _NUMBER_WORDS_TENS[tens]
        return head if remainder == 0 else f"{head}-{_integer_to_english(remainder)}"
    if value < 1_000:
        hundreds, remainder = divmod(value, 100)
        head = f"{_integer_to_english(hundreds)} hundred"
        return head if remainder == 0 else f"{head} {_integer_to_english(remainder)}"
    for scale_value, scale_name in _NUMBER_WORDS_SCALES:
        if value >= scale_value:
            major, remainder = divmod(value, scale_value)
            head = f"{_integer_to_english(major)} {scale_name}"
            return head if remainder == 0 else f"{head} {_integer_to_english(remainder)}"
    return str(value)


def _usd_amount_to_spoken_text(dollar_text: str, cent_text: str | None) -> str:
    dollars = int((dollar_text or "0").replace(",", "") or "0")
    cents = 0
    if cent_text:
        cents = int(str(cent_text).ljust(2, "0")[:2])

    dollar_words = ""
    if dollars > 0 or cents == 0:
        dollar_unit = "dollar" if dollars == 1 else "dollars"
        dollar_words = f"{_integer_to_english(dollars)} {dollar_unit}"

    if cents <= 0:
        return dollar_words

    cent_unit = "cent" if cents == 1 else "cents"
    cent_words = f"{_integer_to_english(cents)} {cent_unit}"
    if dollars <= 0:
        return cent_words
    return f"{dollar_words} and {cent_words}"


def normalize_learning_english_text(text: str) -> str:
    source = str(text or "").strip()
    if not source:
        return ""

    def _replace(match: re.Match[str]) -> str:
        return _usd_amount_to_spoken_text(match.group(1), match.group(2))

    return _USD_AMOUNT_RE.sub(_replace, source)


def tokenize_learning_sentence(sentence: str) -> list[str]:
    return tokenize_sentence(normalize_learning_english_text(sentence))


def normalize_learning_token_list(tokens: list[str]) -> list[str]:
    output: list[str] = []
    for item in list(tokens or []):
        output.extend(tokenize_learning_sentence(str(item or "")))
    return output


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _safe_ms(value: Any, *, seconds: bool = False) -> int:
    try:
        numeric = float(value)
    except Exception:
        return 0
    if seconds:
        numeric *= 1000
    return max(0, int(round(numeric)))


def _extract_word_punctuation(payload: dict[str, Any]) -> str:
    punctuation = str(payload.get("punctuation") or "").strip()
    if punctuation:
        return punctuation
    surface = str(payload.get("surface") or "").strip()
    if not surface:
        return ""
    tail = ""
    for ch in reversed(surface):
        if ch.isalnum():
            break
        tail = ch + tail
    return tail


def _compose_surface_text(text: str, punctuation: str) -> str:
    cleaned = (text or "").strip()
    suffix = (punctuation or "").strip()
    if cleaned and suffix and not cleaned.endswith(suffix):
        return f"{cleaned}{suffix}"
    return cleaned or suffix


def compose_text_from_words(words: list[dict[str, Any]]) -> str:
    surfaces = [str(item.get("surface") or item.get("text") or "").strip() for item in words]
    text = " ".join(part for part in surfaces if part).strip()
    text = re.sub(r"\s+([,.;!?])", r"\1", text)
    text = re.sub(r"\s+'", "'", text)
    text = re.sub(r"'\s+", "'", text)
    return text.strip()


def _word_from_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    raw_text = str(payload.get("text") or payload.get("word") or "").strip()
    punctuation = _extract_word_punctuation(payload)
    surface = str(payload.get("surface") or "").strip() or _compose_surface_text(raw_text, punctuation)
    if not surface and raw_text:
        surface = raw_text
    begin_ms = _safe_int(payload.get("begin_time"))
    end_ms = _safe_int(payload.get("end_time"))
    if begin_ms <= 0 and payload.get("start") is not None:
        begin_ms = _safe_ms(payload.get("start"), seconds=True)
    if end_ms <= 0 and payload.get("end") is not None:
        end_ms = _safe_ms(payload.get("end"), seconds=True)
    if not surface or end_ms <= begin_ms:
        return None
    return {
        "text": raw_text or surface,
        "surface": surface,
        "punctuation": punctuation,
        "begin_ms": begin_ms,
        "end_ms": end_ms,
    }


def _extract_words_from_sentence(sentence_payload: dict[str, Any]) -> list[dict[str, Any]]:
    payload_words = sentence_payload.get("words")
    if not isinstance(payload_words, list):
        return []
    output: list[dict[str, Any]] = []
    for item in payload_words:
        word = _word_from_payload(item)
        if word:
            output.append(word)
    return output


def _dedupe_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int]] = set()
    for item in sorted(words, key=lambda x: (int(x["begin_ms"]), int(x["end_ms"]), str(x["surface"]))):
        key = (
            normalize_token(str(item.get("surface") or item.get("text") or "")),
            int(item["begin_ms"]),
            int(item["end_ms"]),
        )
        if not key[0] or key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def extract_word_items(asr_payload: dict[str, Any]) -> list[dict[str, Any]]:
    words: list[dict[str, Any]] = []
    transcripts = asr_payload.get("transcripts")
    if isinstance(transcripts, list):
        for transcript in transcripts:
            if not isinstance(transcript, dict):
                continue
            transcript_words = transcript.get("words")
            if isinstance(transcript_words, list) and transcript_words:
                for item in transcript_words:
                    word = _word_from_payload(item)
                    if word:
                        words.append(word)
                continue
            sentences = transcript.get("sentences")
            if not isinstance(sentences, list):
                continue
            for sentence in sentences:
                if not isinstance(sentence, dict):
                    continue
                words.extend(_extract_words_from_sentence(sentence))
    return _dedupe_words(words)


def extract_sentences(asr_payload: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    transcripts = asr_payload.get("transcripts")
    if not isinstance(transcripts, list):
        return items
    for transcript in transcripts:
        if not isinstance(transcript, dict):
            continue
        sentences = transcript.get("sentences")
        if not isinstance(sentences, list):
            continue
        for sentence in sentences:
            if not isinstance(sentence, dict):
                raise ValueError("ASR provider sentence is not an object")
            text = str(sentence.get("text") or "").strip()
            begin_ms = int(sentence.get("begin_time") or 0)
            end_ms = int(sentence.get("end_time") or 0)
            if not text:
                raise ValueError("ASR provider sentence has empty text")
            if end_ms <= begin_ms:
                raise ValueError("ASR provider sentence has invalid official timestamps")
            items.append({"text": text, "begin_ms": begin_ms, "end_ms": end_ms})
    return items


def build_lesson_sentences(asr_payload: dict[str, Any]) -> dict[str, Any]:
    """直接返回 ASR 模型提供的句子。"""
    raw_sentences = extract_sentences(asr_payload)
    return {"sentences": raw_sentences, "chunks": [], "mode": "asr_provider_sentences"}


def estimate_duration_ms(asr_payload: dict[str, Any], sentences: list[dict[str, Any]]) -> int:
    props = asr_payload.get("properties")
    if isinstance(props, dict):
        dur = props.get("original_duration_in_milliseconds")
        if isinstance(dur, int) and dur > 0:
            return dur
    if sentences:
        return max(int(s["end_ms"]) for s in sentences)
    return 0


def cut_sentence_audio_clips(source_audio: Path, clips_dir: Path, sentences: list[dict[str, Any]]) -> list[Path]:
    clips_dir.mkdir(parents=True, exist_ok=True)
    clip_paths: list[Path] = []
    for idx, sentence in enumerate(sentences):
        start_sec = sentence["begin_ms"] / 1000.0
        end_sec = sentence["end_ms"] / 1000.0
        clip_path = clips_dir / f"sentence_{idx:04d}.opus"
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
                    str(source_audio),
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-c:a",
                    "libopus",
                    str(clip_path),
                ]
            )
        except MediaError as exc:
            raise MediaError("SENTENCE_CLIP_FAILED", "句级音频切片失败", exc.detail) from exc
        clip_paths.append(clip_path)
    return clip_paths
