from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.services.media import MediaError, run_cmd


_PUNCT_EDGE_RE = re.compile(r"^[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+|[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+$")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([,.;:!?，。！？；：])")
_STRONG_PUNCT = {".", "!", "?", "。", "！", "？"}
_WEAK_PUNCT = {",", ";", ":", "，", "；", "："}
_BOUNDARY_PUNCT = _STRONG_PUNCT | _WEAK_PUNCT
_CONNECTOR_WORDS = {"that", "which", "where", "when", "because", "but", "and", "or"}
_WINDOW_SIZE = 5
_MIN_CHUNK_WORDS = 4
_PAUSE_THRESHOLD_MS = 250


def normalize_token(token: str) -> str:
    return _PUNCT_EDGE_RE.sub("", (token or "").strip().lower())


def tokenize_sentence(sentence: str) -> list[str]:
    raw_tokens = re.split(r"\s+", (sentence or "").strip())
    tokens = [normalize_token(tok) for tok in raw_tokens]
    return [tok for tok in tokens if tok]


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _extract_boundary_punct(word: dict[str, Any]) -> str:
    punctuation = str(word.get("punctuation") or "").strip()
    if punctuation:
        return punctuation[-1]

    surface = str(word.get("surface") or "").strip()
    if surface and surface[-1] in _BOUNDARY_PUNCT:
        return surface[-1]
    return ""


def _word_surface_text(word: dict[str, Any]) -> str:
    text = str(word.get("text") or "").strip()
    punctuation = str(word.get("punctuation") or "").strip()
    if punctuation and text and not text.endswith(punctuation):
        return f"{text}{punctuation}"
    return text


def _extract_sentence_words(sentence_payload: dict[str, Any]) -> list[dict[str, Any]]:
    payload_words = sentence_payload.get("words")
    if not isinstance(payload_words, list):
        return []

    words: list[dict[str, Any]] = []
    for item in payload_words:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        punctuation = str(item.get("punctuation") or "").strip()
        surface = text
        if punctuation and text and not text.endswith(punctuation):
            surface = f"{text}{punctuation}"
        begin_ms = _safe_int(item.get("begin_time"))
        end_ms = _safe_int(item.get("end_time"))
        if not surface:
            continue
        if end_ms < begin_ms:
            continue
        words.append(
            {
                "text": text or surface,
                "surface": surface,
                "punctuation": punctuation,
                "begin_ms": begin_ms,
                "end_ms": end_ms,
            }
        )
    return words


def extract_sentences(asr_payload: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    transcripts = asr_payload.get("transcripts")
    if not isinstance(transcripts, list):
        return items
    for t in transcripts:
        if not isinstance(t, dict):
            continue
        sentences = t.get("sentences")
        if not isinstance(sentences, list):
            continue
        for s in sentences:
            if not isinstance(s, dict):
                continue
            text = str(s.get("text") or "").strip()
            begin_ms = int(s.get("begin_time") or 0)
            end_ms = int(s.get("end_time") or 0)
            if not text:
                continue
            if end_ms <= begin_ms:
                continue
            items.append(
                {
                    "text": text,
                    "begin_ms": begin_ms,
                    "end_ms": end_ms,
                    "words": _extract_sentence_words(s),
                }
            )
    return items


def _fallback_word_units(text: str, begin_ms: int, end_ms: int) -> list[dict[str, Any]]:
    tokens = re.findall(r"\S+", text)
    if not tokens:
        return []

    duration = max(end_ms - begin_ms, len(tokens))
    units: list[dict[str, Any]] = []
    for idx, token in enumerate(tokens):
        seg_begin = begin_ms + int(duration * idx / len(tokens))
        seg_end = begin_ms + int(duration * (idx + 1) / len(tokens))
        if seg_end <= seg_begin:
            seg_end = seg_begin + 1

        punctuation = token[-1] if token and token[-1] in _BOUNDARY_PUNCT else ""
        text_part = token[:-1] if punctuation and len(token) > 1 else token
        units.append(
            {
                "text": text_part or token,
                "surface": token,
                "punctuation": punctuation,
                "begin_ms": seg_begin,
                "end_ms": seg_end,
            }
        )
    return units


def _has_valid_timestamps(words: list[dict[str, Any]], sentence_begin_ms: int, sentence_end_ms: int) -> bool:
    if not words:
        return False
    for word in words:
        begin_ms = _safe_int(word.get("begin_ms"))
        end_ms = _safe_int(word.get("end_ms"))
        if begin_ms < 0 or end_ms < begin_ms:
            return False
    first_begin = _safe_int(words[0].get("begin_ms"))
    last_end = _safe_int(words[-1].get("end_ms"))
    if last_end <= first_begin:
        return False
    if sentence_end_ms > sentence_begin_ms and last_end > sentence_end_ms + 1000:
        return False
    return True


def _prepare_word_units(sentence: dict[str, Any]) -> list[dict[str, Any]]:
    text = str(sentence.get("text") or "").strip()
    begin_ms = _safe_int(sentence.get("begin_ms"))
    end_ms = _safe_int(sentence.get("end_ms"))
    sentence_words = sentence.get("words")
    if isinstance(sentence_words, list) and _has_valid_timestamps(sentence_words, begin_ms, end_ms):
        return [dict(item) for item in sentence_words if isinstance(item, dict)]
    return _fallback_word_units(text, begin_ms, end_ms)


def _is_english_sentence(word_units: list[dict[str, Any]]) -> bool:
    tokens = [normalize_token(str(word.get("text") or "")) for word in word_units]
    tokens = [token for token in tokens if token]
    if len(tokens) < 8:
        return False
    english_token_count = sum(1 for token in tokens if re.search(r"[a-z]", token))
    return english_token_count >= max(8, int(len(tokens) * 0.6))


def _compose_text_from_words(word_units: list[dict[str, Any]]) -> str:
    surfaces = [str(word.get("surface") or _word_surface_text(word)).strip() for word in word_units]
    surfaces = [token for token in surfaces if token]
    if not surfaces:
        return ""
    merged = " ".join(surfaces)
    merged = _SPACE_BEFORE_PUNCT_RE.sub(r"\1", merged)
    merged = re.sub(r"\s+", " ", merged).strip()
    return merged


def _candidate_category(word_units: list[dict[str, Any]], cut_index: int) -> int:
    prev_word = word_units[cut_index - 1]
    next_word = word_units[cut_index]

    boundary_punct = _extract_boundary_punct(prev_word)
    if boundary_punct in _STRONG_PUNCT:
        return 4
    if boundary_punct in _WEAK_PUNCT:
        return 3

    connector = normalize_token(str(next_word.get("text") or ""))
    if connector in _CONNECTOR_WORDS:
        return 2

    gap_ms = _safe_int(next_word.get("begin_ms")) - _safe_int(prev_word.get("end_ms"))
    if gap_ms >= _PAUSE_THRESHOLD_MS:
        return 1

    return 0


def _choose_split_point(word_units: list[dict[str, Any]], lower: int, upper: int, target: int) -> int | None:
    best_point: int | None = None
    best_score: tuple[int, int] | None = None
    for cut_index in range(lower, upper + 1):
        category = _candidate_category(word_units, cut_index)
        if category <= 0:
            continue
        distance = abs(cut_index - target)
        score = (category, -distance)
        if best_score is None or score > best_score:
            best_score = score
            best_point = cut_index
    return best_point


def _split_word_units(word_units: list[dict[str, Any]], max_words: int) -> list[int]:
    cuts: list[int] = []
    start = 0
    total = len(word_units)

    while total - start > max_words:
        target = min(start + max_words, total - _MIN_CHUNK_WORDS)
        lower = max(start + _MIN_CHUNK_WORDS, target - _WINDOW_SIZE)
        upper = min(total - _MIN_CHUNK_WORDS, target + _WINDOW_SIZE)

        if lower > upper:
            cut_index = min(start + max_words, total - _MIN_CHUNK_WORDS)
        else:
            cut_index = _choose_split_point(word_units, lower, upper, target)
            if cut_index is None:
                cut_index = min(start + max_words, total - _MIN_CHUNK_WORDS)

        if cut_index <= start:
            break
        cuts.append(cut_index)
        start = cut_index

    return cuts


def _resolve_segment_time(
    chunk_words: list[dict[str, Any]],
    chunk_start: int,
    chunk_end: int,
    sentence_begin_ms: int,
    sentence_end_ms: int,
    total_words: int,
) -> tuple[int, int]:
    begin_ms = _safe_int(chunk_words[0].get("begin_ms"))
    end_ms = _safe_int(chunk_words[-1].get("end_ms"))
    if end_ms > begin_ms:
        return begin_ms, end_ms

    duration = max(sentence_end_ms - sentence_begin_ms, total_words)
    begin_ms = sentence_begin_ms + int(duration * chunk_start / total_words)
    end_ms = sentence_begin_ms + int(duration * chunk_end / total_words)
    if end_ms <= begin_ms:
        end_ms = begin_ms + 1
    if sentence_end_ms > sentence_begin_ms:
        begin_ms = max(sentence_begin_ms, begin_ms)
        end_ms = min(sentence_end_ms, end_ms)
        if end_ms <= begin_ms:
            end_ms = min(sentence_end_ms, begin_ms + 1)
    return begin_ms, end_ms


def _to_output_words(chunk_words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for word in chunk_words:
        output.append(
            {
                "text": str(word.get("text") or "").strip(),
                "punctuation": str(word.get("punctuation") or "").strip(),
                "begin_time": _safe_int(word.get("begin_ms")),
                "end_time": _safe_int(word.get("end_ms")),
            }
        )
    return output


def split_sentences_by_word_limit(sentences: list[dict[str, Any]], max_words: int) -> list[dict[str, Any]]:
    if max_words < 1:
        return list(sentences)

    split_result: list[dict[str, Any]] = []
    for sentence in sentences:
        text = str(sentence.get("text") or "").strip()
        sentence_begin_ms = _safe_int(sentence.get("begin_ms"))
        sentence_end_ms = _safe_int(sentence.get("end_ms"))
        if not text:
            continue
        if sentence_end_ms <= sentence_begin_ms:
            continue

        word_units = _prepare_word_units(sentence)
        if len(word_units) <= max_words or not _is_english_sentence(word_units):
            kept = dict(sentence)
            kept["text"] = text
            kept["words"] = _to_output_words(word_units) if word_units else []
            split_result.append(kept)
            continue

        cuts = _split_word_units(word_units, max_words)
        if not cuts:
            kept = dict(sentence)
            kept["text"] = text
            kept["words"] = _to_output_words(word_units) if word_units else []
            split_result.append(kept)
            continue

        boundaries = [0] + cuts + [len(word_units)]
        for idx in range(len(boundaries) - 1):
            start = boundaries[idx]
            end = boundaries[idx + 1]
            chunk_words = word_units[start:end]
            if not chunk_words:
                continue
            chunk_text = _compose_text_from_words(chunk_words)
            if not chunk_text:
                continue
            begin_ms, end_ms = _resolve_segment_time(
                chunk_words=chunk_words,
                chunk_start=start,
                chunk_end=end,
                sentence_begin_ms=sentence_begin_ms,
                sentence_end_ms=sentence_end_ms,
                total_words=len(word_units),
            )
            if end_ms <= begin_ms:
                continue
            split_result.append(
                {
                    "text": chunk_text,
                    "begin_ms": begin_ms,
                    "end_ms": end_ms,
                    "words": _to_output_words(chunk_words),
                }
            )

    return split_result


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
