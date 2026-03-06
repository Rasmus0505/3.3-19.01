from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.services.media import MediaError, run_cmd


_PUNCT_EDGE_RE = re.compile(r"^[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+|[\s\.,!?;:\"'`~\-\(\)\[\]\{\}]+$")


def normalize_token(token: str) -> str:
    normalized = (token or "").strip().lower().replace("’", "'")
    return _PUNCT_EDGE_RE.sub("", normalized)


def tokenize_sentence(sentence: str) -> list[str]:
    raw_tokens = re.split(r"\s+", (sentence or "").strip())
    tokens = [normalize_token(tok) for tok in raw_tokens]
    return [tok for tok in tokens if tok]


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
            items.append({"text": text, "begin_ms": begin_ms, "end_ms": end_ms})
    return items


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
