from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.media import MediaError, run_cmd


_PUNCT_EDGE_RE = re.compile(r"^[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+|[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+$")
_STRONG_BOUNDARY_PUNCT = {".", "!", "?", ";"}
_WEAK_BOUNDARY_PUNCT = {",", ":"}
_CONNECTOR_WORDS = {"that", "which", "where", "when", "because", "but", "and", "or"}
_CONNECTOR_CONTEXT_WORDS = 4
_MIN_CHUNK_WORDS = 4
_DEFAULT_SPACY_MODEL = "en_core_web_sm"
_DEFAULT_SUBTITLE_SPLIT_ENABLED = True
_DEFAULT_SUBTITLE_SPLIT_TARGET_WORDS = 18
_DEFAULT_SUBTITLE_SPLIT_MAX_WORDS = 28

logger = logging.getLogger(__name__)

try:
    import spacy
except Exception as exc:  # pragma: no cover - depends on environment
    spacy = None
    _SPACY_IMPORT_ERROR = exc
else:
    _SPACY_IMPORT_ERROR = None


def normalize_token(token: str) -> str:
    normalized = (token or "").strip().lower().replace("’", "'")
    return _PUNCT_EDGE_RE.sub("", normalized)


def tokenize_sentence(sentence: str) -> list[str]:
    raw_tokens = re.split(r"\s+", (sentence or "").strip())
    tokens = [normalize_token(tok) for tok in raw_tokens]
    return [tok for tok in tokens if tok]


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
                continue
            text = str(sentence.get("text") or "").strip()
            begin_ms = int(sentence.get("begin_time") or 0)
            end_ms = int(sentence.get("end_time") or 0)
            if not text or end_ms <= begin_ms:
                continue
            items.append({"text": text, "begin_ms": begin_ms, "end_ms": end_ms})
    return items


@lru_cache(maxsize=1)
def _load_english_nlp():
    if spacy is None:
        detail = str(_SPACY_IMPORT_ERROR)[:400] if _SPACY_IMPORT_ERROR else "spacy import failed"
        raise MediaError("SUBTITLE_SPLIT_SPACY_MISSING", "英文分句依赖缺失", detail)
    try:
        return spacy.load(_DEFAULT_SPACY_MODEL, disable=["lemmatizer", "ner", "textcat"])
    except Exception as exc:
        raise MediaError("SUBTITLE_SPLIT_MODEL_MISSING", "英文分句模型缺失", str(exc)[:400]) from exc


def _lexical_word_count(words: list[dict[str, Any]]) -> int:
    return sum(1 for item in words if normalize_token(str(item.get("text") or item.get("surface") or "")))


def _split_by_strong_punctuation(words: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    chunks: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for item in words:
        current.append(item)
        punctuation = str(item.get("punctuation") or "")
        surface = str(item.get("surface") or "")
        if "..." in punctuation or "..." in surface or surface.endswith("-"):
            continue
        if any(mark in punctuation for mark in _STRONG_BOUNDARY_PUNCT):
            chunks.append(current)
            current = []
    if current:
        chunks.append(current)
    return chunks


def _split_chunk_by_positions(words: list[dict[str, Any]], cut_positions: list[int]) -> list[list[dict[str, Any]]]:
    if not cut_positions:
        return [words]
    boundaries = [0] + sorted(set(pos for pos in cut_positions if 0 < pos < len(words))) + [len(words)]
    output: list[list[dict[str, Any]]] = []
    for idx in range(len(boundaries) - 1):
        chunk = words[boundaries[idx] : boundaries[idx + 1]]
        if chunk:
            output.append(chunk)
    return output or [words]


def _should_split_on_comma(left_words: list[dict[str, Any]], right_words: list[dict[str, Any]], nlp: Any) -> bool:
    if _lexical_word_count(left_words) < _MIN_CHUNK_WORDS or _lexical_word_count(right_words) < _MIN_CHUNK_WORDS:
        return False
    right_doc = nlp(compose_text_from_words(right_words))
    has_subject = any(token.dep_ in {"nsubj", "nsubjpass", "csubj", "expl"} or token.pos_ == "PRON" for token in right_doc)
    has_verb = any(token.pos_ in {"VERB", "AUX"} for token in right_doc)
    return has_subject and has_verb


def _split_by_comma(words: list[dict[str, Any]], nlp: Any) -> list[list[dict[str, Any]]]:
    positions: list[int] = []
    for index, item in enumerate(words[:-1], start=1):
        punctuation = str(item.get("punctuation") or "")
        if "," not in punctuation and "，" not in punctuation:
            continue
        if _should_split_on_comma(words[:index], words[index:], nlp):
            positions.append(index)
    return _split_chunk_by_positions(words, positions)


def _align_doc_tokens_to_words(doc: Any, words: list[dict[str, Any]]) -> list[tuple[int, int]]:
    mapping: list[tuple[int, int]] = []
    word_norms = [normalize_token(str(item.get("text") or item.get("surface") or "")) for item in words]
    word_index = 0
    for token_index, token in enumerate(doc):
        token_norm = normalize_token(token.text)
        if not token_norm:
            continue
        while word_index < len(word_norms) and not word_norms[word_index]:
            word_index += 1
        if word_index >= len(word_norms):
            break
        if token_norm == word_norms[word_index] or token_norm in word_norms[word_index] or word_norms[word_index] in token_norm:
            mapping.append((token_index, word_index))
            word_index += 1
            continue
        for candidate in range(word_index + 1, min(word_index + 4, len(word_norms))):
            if token_norm == word_norms[candidate]:
                mapping.append((token_index, candidate))
                word_index = candidate + 1
                break
    return mapping


def _find_connector_split(words: list[dict[str, Any]], nlp: Any) -> int | None:
    doc = nlp(compose_text_from_words(words))
    for token_index, word_index in _align_doc_tokens_to_words(doc, words):
        token = doc[token_index]
        normalized = normalize_token(token.text)
        if normalized not in _CONNECTOR_WORDS:
            continue
        left_words = words[:word_index]
        right_words = words[word_index:]
        if _lexical_word_count(left_words) < _CONNECTOR_CONTEXT_WORDS or _lexical_word_count(right_words) < _CONNECTOR_CONTEXT_WORDS:
            continue
        if token_index + 1 < len(doc) and doc[token_index + 1].text in {"'s", "'re", "'ve", "'ll", "'d"}:
            continue
        if normalized == "that":
            if token.dep_ == "mark" and token.head.pos_ in {"VERB", "AUX"}:
                return word_index
            continue
        if token.dep_ in {"det", "pron"} and token.head.pos_ in {"NOUN", "PROPN"}:
            continue
        return word_index
    return None


def _split_by_connectors(words: list[dict[str, Any]], nlp: Any) -> list[list[dict[str, Any]]]:
    sentences = [words]
    while True:
        split_occurred = False
        output: list[list[dict[str, Any]]] = []
        for sentence in sentences:
            split_pos = _find_connector_split(sentence, nlp)
            if split_pos is None:
                output.append(sentence)
                continue
            output.extend(_split_chunk_by_positions(sentence, [split_pos]))
            split_occurred = True
        sentences = output
        if not split_occurred:
            return sentences


def _split_score(words: list[dict[str, Any]], cut_position: int, aligned_tokens: dict[int, Any], target_words: int) -> int:
    if cut_position <= _MIN_CHUNK_WORDS or len(words) - cut_position < _MIN_CHUNK_WORDS:
        return -10_000
    prev_word = words[cut_position - 1]
    next_word = words[cut_position]
    prev_punctuation = str(prev_word.get("punctuation") or "")
    prev_token = aligned_tokens.get(cut_position - 1)
    next_token = aligned_tokens.get(cut_position)
    left_count = _lexical_word_count(words[:cut_position])
    score = 100 - abs(left_count - target_words) * 5
    if any(mark in prev_punctuation for mark in _STRONG_BOUNDARY_PUNCT):
        score += 40
    elif any(mark in prev_punctuation for mark in _WEAK_BOUNDARY_PUNCT):
        score += 18
    if prev_token is not None and (prev_token.dep_ == "ROOT" or prev_token.pos_ in {"VERB", "AUX"}):
        score += 16
    if next_token is not None and normalize_token(next_token.text) in _CONNECTOR_WORDS:
        score += 8
    if normalize_token(str(next_word.get("text") or next_word.get("surface") or "")) in _CONNECTOR_WORDS:
        score += 8
    return score


def _find_best_root_split(words: list[dict[str, Any]], nlp: Any, target_words: int, max_words: int) -> int | None:
    if _lexical_word_count(words) <= max_words:
        return None
    doc = nlp(compose_text_from_words(words))
    aligned_tokens = {word_index: doc[token_index] for token_index, word_index in _align_doc_tokens_to_words(doc, words)}
    best_position: int | None = None
    best_score = -10_000
    for cut_position in range(_MIN_CHUNK_WORDS, len(words) - _MIN_CHUNK_WORDS + 1):
        score = _split_score(words, cut_position, aligned_tokens, target_words)
        if score > best_score:
            best_score = score
            best_position = cut_position
    return best_position


def _split_by_root(words: list[dict[str, Any]], nlp: Any, target_words: int, max_words: int) -> list[list[dict[str, Any]]]:
    output: list[list[dict[str, Any]]] = []
    pending = [words]
    while pending:
        current = pending.pop(0)
        if _lexical_word_count(current) <= max_words:
            output.append(current)
            continue
        split_pos = _find_best_root_split(current, nlp, target_words, max_words)
        if split_pos is None:
            split_pos = min(len(current) - _MIN_CHUNK_WORDS, max(_MIN_CHUNK_WORDS, target_words))
        left_chunk = current[:split_pos]
        right_chunk = current[split_pos:]
        if not left_chunk or not right_chunk:
            output.append(current)
            continue
        pending.insert(0, right_chunk)
        pending.insert(0, left_chunk)
    return output


def split_rule_word_chunks(
    words: list[dict[str, Any]],
    *,
    target_words: int = _DEFAULT_SUBTITLE_SPLIT_TARGET_WORDS,
    max_words: int = _DEFAULT_SUBTITLE_SPLIT_MAX_WORDS,
) -> list[list[dict[str, Any]]]:
    if not words:
        return []
    nlp = _load_english_nlp()
    chunks = _split_by_strong_punctuation(words)
    comma_chunks: list[list[dict[str, Any]]] = []
    for chunk in chunks:
        comma_chunks.extend(_split_by_comma(chunk, nlp))
    connector_chunks: list[list[dict[str, Any]]] = []
    for chunk in comma_chunks:
        connector_chunks.extend(_split_by_connectors(chunk, nlp))
    final_chunks: list[list[dict[str, Any]]] = []
    for chunk in connector_chunks:
        final_chunks.extend(_split_by_root(chunk, nlp, target_words, max_words))
    return [chunk for chunk in final_chunks if chunk]


def sentences_from_word_chunks(chunks: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    sentences: list[dict[str, Any]] = []
    for chunk in chunks:
        text = compose_text_from_words(chunk)
        if not text:
            continue
        begin_ms = max(0, int(chunk[0]["begin_ms"]))
        end_ms = max(begin_ms + 1, int(chunk[-1]["end_ms"]))
        sentences.append({"text": text, "begin_ms": begin_ms, "end_ms": end_ms})
    return sentences


def split_word_items_into_sentences(
    words: list[dict[str, Any]],
    *,
    target_words: int = _DEFAULT_SUBTITLE_SPLIT_TARGET_WORDS,
    max_words: int = _DEFAULT_SUBTITLE_SPLIT_MAX_WORDS,
) -> list[dict[str, Any]]:
    return sentences_from_word_chunks(split_rule_word_chunks(words, target_words=target_words, max_words=max_words))


def build_lesson_sentences(
    asr_payload: dict[str, Any],
    *,
    split_enabled: bool = _DEFAULT_SUBTITLE_SPLIT_ENABLED,
    target_words: int = _DEFAULT_SUBTITLE_SPLIT_TARGET_WORDS,
    max_words: int = _DEFAULT_SUBTITLE_SPLIT_MAX_WORDS,
) -> dict[str, Any]:
    raw_sentences = extract_sentences(asr_payload)
    if not split_enabled:
        return {"sentences": raw_sentences, "chunks": [], "mode": "asr_sentences_disabled"}
    words = extract_word_items(asr_payload)
    if not words:
        return {"sentences": raw_sentences, "chunks": [], "mode": "asr_sentences_no_words"}
    chunks = split_rule_word_chunks(words, target_words=target_words, max_words=max_words)
    sentences = sentences_from_word_chunks(chunks)
    if sentences:
        return {"sentences": sentences, "chunks": chunks, "mode": "word_level_split"}
    return {"sentences": raw_sentences, "chunks": [], "mode": "asr_sentences_split_empty"}


def split_words_by_semantic_segments(word_chunk: list[dict[str, Any]], segment_texts: list[str]) -> list[list[dict[str, Any]]]:
    if not word_chunk or len(segment_texts) <= 1:
        return [word_chunk]
    normalized_segments = [tokenize_sentence(item) for item in segment_texts if tokenize_sentence(item)]
    if len(normalized_segments) <= 1:
        return [word_chunk]

    output: list[list[dict[str, Any]]] = []
    cursor = 0
    total_words = len(word_chunk)
    for segment_index, segment_tokens in enumerate(normalized_segments):
        if not segment_tokens:
            continue
        if segment_index == len(normalized_segments) - 1:
            chunk = word_chunk[cursor:]
            if chunk:
                output.append(chunk)
            break
        take_count = len(segment_tokens)
        next_cursor = min(total_words, cursor + take_count)
        chunk = word_chunk[cursor:next_cursor]
        if not chunk:
            return [word_chunk]
        output.append(chunk)
        cursor = next_cursor

    rebuilt = [compose_text_from_words(chunk) for chunk in output]
    original_tokens = tokenize_sentence(compose_text_from_words(word_chunk))
    rebuilt_tokens: list[str] = []
    for item in rebuilt:
        rebuilt_tokens.extend(tokenize_sentence(item))
    if rebuilt_tokens != original_tokens:
        return [word_chunk]
    return output if output else [word_chunk]


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
