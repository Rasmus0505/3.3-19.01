from __future__ import annotations

import logging
import math
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import (
    ASR_SEGMENT_SEARCH_WINDOW_SECONDS,
    ASR_SEGMENT_TARGET_SECONDS,
    DASHSCOPE_API_KEY,
    UPLOAD_MAX_BYTES,
)
from app.models import Lesson, LessonSentence
from app.repositories.progress import create_progress
from app.services.asr_dashscope import transcribe_audio_file
from app.services.billing_service import (
    EVENT_CONSUME_TRANSLATE,
    append_translation_request_logs,
    calculate_points,
    calculate_token_points,
    consume_points,
    get_model_rate,
    get_subtitle_settings_snapshot,
    record_consume,
    refund_points,
    reserve_points,
    settle_reserved_points,
)
from app.services.lesson_builder import (
    build_lesson_sentences,
    compose_text_from_words,
    estimate_duration_ms,
    extract_sentences,
    extract_word_items,
    normalize_learning_english_text,
    sentences_from_word_chunks,
    split_words_by_semantic_segments,
    tokenize_learning_sentence,
    tokenize_sentence,
)
from app.services.media import MediaError, extract_audio_for_asr, probe_audio_duration_ms, run_cmd, save_upload_file_stream, validate_suffix
from app.services.translation_qwen_mt import MT_MODEL, SemanticSplitError, split_sentence_by_semantic, translate_sentences_to_zh


logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], None]
_SILENCE_START_RE = re.compile(r"silence_start:\s*(?P<value>-?\d+(?:\.\d+)?)")
_SILENCE_END_RE = re.compile(r"silence_end:\s*(?P<value>-?\d+(?:\.\d+)?)\s*\|\s*silence_duration:\s*(?P<duration>-?\d+(?:\.\d+)?)")


def _emit_progress(callback: ProgressCallback | None, **payload: Any) -> None:
    if not callback:
        return
    try:
        callback(payload)
    except Exception:
        logger.exception("[DEBUG] lesson.progress.emit_failed payload=%s", payload)


def _progress_percent_by_stage(stage_key: str, ratio: float = 1.0) -> int:
    ratio = max(0.0, min(1.0, ratio))
    if stage_key == "convert_audio":
        return int(20 * ratio)
    if stage_key == "asr_transcribe":
        return int(20 + 40 * ratio)
    if stage_key == "translate_zh":
        return int(60 + 30 * ratio)
    if stage_key == "write_lesson":
        return int(90 + 10 * ratio)
    return 0


def _serialize_word_items(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "text": str(item.get("text") or ""),
            "surface": str(item.get("surface") or ""),
            "punctuation": str(item.get("punctuation") or ""),
            "begin_time": int(item["begin_ms"]),
            "end_time": int(item["end_ms"]),
        }
        for item in words
    ]


def _build_parallel_payload(
    duration_ms: int,
    merged_words: list[dict[str, Any]],
    fallback_sentences: list[dict[str, Any]],
) -> dict[str, Any]:
    transcript_sentences: list[dict[str, Any]] = []
    for idx, sentence in enumerate(fallback_sentences):
        transcript_sentences.append(
            {
                "sentence_id": idx,
                "begin_time": int(sentence["begin_ms"]),
                "end_time": int(sentence["end_ms"]),
                "text": str(sentence["text"]),
            }
        )

    transcript_text = compose_text_from_words(merged_words)
    if not transcript_text:
        transcript_text = " ".join(item["text"] for item in fallback_sentences).strip()

    return {
        "properties": {"original_duration_in_milliseconds": int(duration_ms)},
        "transcripts": [
            {
                "channel_id": 0,
                "text": transcript_text,
                "words": _serialize_word_items(merged_words),
                "sentences": transcript_sentences,
            }
        ],
    }


def _detect_silence_ranges(source_audio: Path, search_start_sec: float, search_end_sec: float) -> list[tuple[float, float]]:
    if search_end_sec <= search_start_sec:
        return []
    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-ss",
                f"{search_start_sec:.3f}",
                "-to",
                f"{search_end_sec:.3f}",
                "-i",
                str(source_audio),
                "-af",
                "silencedetect=n=-30dB:d=0.35",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except FileNotFoundError as exc:
        raise MediaError("COMMAND_MISSING", "媒体处理依赖缺失", str(exc)[:1000]) from exc
    except subprocess.TimeoutExpired as exc:
        raise MediaError("COMMAND_TIMEOUT", "静音检测超时", str(exc)[:1000]) from exc

    output = "\n".join(part for part in (proc.stdout, proc.stderr) if part)
    ranges: list[tuple[float, float]] = []
    current_start: float | None = None
    for line in output.splitlines():
        start_match = _SILENCE_START_RE.search(line)
        if start_match:
            current_start = float(start_match.group("value")) + search_start_sec
            continue
        end_match = _SILENCE_END_RE.search(line)
        if end_match and current_start is not None:
            silence_end = float(end_match.group("value")) + search_start_sec
            if silence_end > current_start:
                ranges.append((current_start, silence_end))
            current_start = None
    return ranges


def _choose_segment_cut(
    source_audio: Path,
    segment_start_sec: float,
    target_seconds: int,
    search_window_seconds: int,
    total_seconds: float,
) -> float:
    threshold = min(total_seconds, segment_start_sec + target_seconds)
    if threshold >= total_seconds:
        return total_seconds

    search_start = max(segment_start_sec, threshold - search_window_seconds)
    search_end = min(total_seconds, threshold + search_window_seconds)
    silence_ranges = _detect_silence_ranges(source_audio, search_start, search_end)
    candidate_points: list[float] = []
    for silence_start, silence_end in silence_ranges:
        cut_at = min(silence_end, silence_start + 0.5)
        if cut_at <= segment_start_sec + 1:
            continue
        if total_seconds - cut_at <= 1:
            continue
        candidate_points.append(cut_at)
    if candidate_points:
        return min(candidate_points, key=lambda value: abs(value - threshold))
    return threshold


def _split_audio_segments(
    source_audio: Path,
    segments_dir: Path,
    target_seconds: int,
    search_window_seconds: int,
    duration_ms: int,
) -> list[tuple[int, int, Path]]:
    if target_seconds <= 0:
        raise MediaError("ASR_SEGMENT_CONFIG_INVALID", "分段时长配置无效", str(target_seconds))

    total_seconds = max(1.0, duration_ms / 1000.0)
    segments_dir.mkdir(parents=True, exist_ok=True)
    output: list[tuple[int, int, Path]] = []

    segment_start_sec = 0.0
    index = 0
    while segment_start_sec < total_seconds:
        if total_seconds - segment_start_sec <= target_seconds:
            segment_end_sec = total_seconds
        else:
            segment_end_sec = _choose_segment_cut(
                source_audio,
                segment_start_sec,
                target_seconds=target_seconds,
                search_window_seconds=search_window_seconds,
                total_seconds=total_seconds,
            )
        segment_end_sec = max(segment_start_sec + 1, min(total_seconds, segment_end_sec))
        segment_path = segments_dir / f"segment_{index:04d}.opus"
        try:
            run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-ss",
                    f"{segment_start_sec:.3f}",
                    "-to",
                    f"{segment_end_sec:.3f}",
                    "-i",
                    str(source_audio),
                    "-ac",
                    "1",
                    "-ar",
                    "16000",
                    "-c:a",
                    "libopus",
                    str(segment_path),
                ]
            )
        except MediaError as exc:
            raise MediaError("ASR_SEGMENT_SPLIT_FAILED", "ASR 分段切片失败", exc.detail or exc.message) from exc
        output.append((index, int(round(segment_start_sec * 1000)), segment_path))
        index += 1
        if segment_end_sec >= total_seconds:
            break
        segment_start_sec = segment_end_sec

    return output


def _shift_words(word_items: list[dict[str, Any]], offset_ms: int) -> list[dict[str, Any]]:
    shifted: list[dict[str, Any]] = []
    for item in word_items:
        shifted.append(
            {
                "text": item["text"],
                "surface": item.get("surface") or item["text"],
                "punctuation": item.get("punctuation") or "",
                "begin_ms": int(item["begin_ms"]) + offset_ms,
                "end_ms": int(item["end_ms"]) + offset_ms,
            }
        )
    return shifted


def _shift_sentences(sentence_items: list[dict[str, Any]], offset_ms: int) -> list[dict[str, Any]]:
    shifted: list[dict[str, Any]] = []
    for item in sentence_items:
        shifted.append(
            {
                "text": item["text"],
                "begin_ms": int(item["begin_ms"]) + offset_ms,
                "end_ms": int(item["end_ms"]) + offset_ms,
            }
        )
    return shifted


def _transcribe_segment(
    segment_index: int,
    segment_start_ms: int,
    segment_path: Path,
    asr_model: str,
) -> tuple[int, list[dict[str, Any]], list[dict[str, Any]], int | None]:
    asr_result = transcribe_audio_file(str(segment_path), model=asr_model)
    segment_payload = asr_result["asr_result_json"]
    usage_seconds = asr_result.get("usage_seconds")
    segment_words = _shift_words(extract_word_items(segment_payload), segment_start_ms)
    segment_sentences = _shift_sentences(extract_sentences(segment_payload), segment_start_ms)
    return (
        segment_index,
        segment_words,
        segment_sentences,
        int(usage_seconds) if isinstance(usage_seconds, int) and usage_seconds > 0 else None,
    )


def _apply_semantic_split(
    chunks: list[list[dict[str, Any]]],
    *,
    enabled: bool,
    threshold_words: int,
    model: str,
    timeout_seconds: int,
) -> tuple[list[list[dict[str, Any]]], bool]:
    if not enabled or not chunks:
        return chunks, False

    final_chunks: list[list[dict[str, Any]]] = []
    semantic_applied = False
    for chunk in chunks:
        chunk_text = compose_text_from_words(chunk)
        chunk_word_count = len(tokenize_sentence(chunk_text))
        if chunk_word_count <= max(1, threshold_words):
            final_chunks.append(chunk)
            continue
        try:
            semantic_segments = split_sentence_by_semantic(
                chunk_text,
                api_key=DASHSCOPE_API_KEY,
                model=model,
                timeout_seconds=timeout_seconds,
            )
            semantic_chunks = split_words_by_semantic_segments(chunk, semantic_segments)
        except SemanticSplitError as exc:
            logger.warning(
                "[DEBUG] lesson.generate semantic_split_failed words=%s detail=%s",
                chunk_word_count,
                str(exc)[:240],
            )
            final_chunks.append(chunk)
            continue
        if len(semantic_chunks) <= 1:
            final_chunks.append(chunk)
            continue
        semantic_applied = True
        final_chunks.extend(semantic_chunks)
    return final_chunks, semantic_applied


class LessonService:
    @staticmethod
    def _normalize_runtime_sentences(sentences: list[dict[str, Any]], zh_list: list[str]) -> list[dict[str, Any]]:
        normalized_sentences: list[dict[str, Any]] = []
        for idx, sentence in enumerate(sentences):
            normalized_text_en = normalize_learning_english_text(str(sentence["text"]))
            normalized_tokens = tokenize_learning_sentence(normalized_text_en)
            normalized_sentences.append(
                {
                    "idx": idx,
                    "begin_ms": int(sentence["begin_ms"]),
                    "end_ms": int(sentence["end_ms"]),
                    "text_en": normalized_text_en,
                    "text_zh": zh_list[idx] if idx < len(zh_list) else "",
                    "tokens": normalized_tokens,
                    "audio_url": None,
                }
            )
        return normalized_sentences

    @staticmethod
    def build_subtitle_variant(
        *,
        asr_payload: dict[str, Any],
        db: Session,
        task_id: str | None = None,
        semantic_split_enabled: bool | None = None,
        before_translate_callback: Callable[[int], None] | None = None,
        translation_progress_callback: Callable[[int, int], None] | None = None,
    ) -> dict[str, Any]:
        if not isinstance(asr_payload, dict):
            raise MediaError("ASR_PAYLOAD_INVALID", "字幕源数据无效", "asr_payload 必须是对象")

        subtitle_settings = get_subtitle_settings_snapshot(db)
        effective_semantic_split_enabled = (
            subtitle_settings.semantic_split_default_enabled
            if semantic_split_enabled is None
            else bool(semantic_split_enabled)
        )

        sentence_result = build_lesson_sentences(
            asr_payload,
            split_enabled=subtitle_settings.subtitle_split_enabled,
            target_words=subtitle_settings.subtitle_split_target_words,
            max_words=subtitle_settings.subtitle_split_max_words,
        )
        sentences = sentence_result["sentences"]
        chunks = sentence_result.get("chunks") or []
        split_mode = sentence_result["mode"]
        semantic_split_applied = False
        if effective_semantic_split_enabled and chunks:
            chunks, semantic_split_applied = _apply_semantic_split(
                chunks,
                enabled=True,
                threshold_words=subtitle_settings.semantic_split_max_words_threshold,
                model=subtitle_settings.semantic_split_model,
                timeout_seconds=subtitle_settings.semantic_split_timeout_seconds,
            )
            if semantic_split_applied:
                sentences = sentences_from_word_chunks(chunks)
                split_mode = "word_level_split+semantic"
        if not sentences:
            raise MediaError("ASR_SENTENCE_MISSING", "ASR 返回结果缺少句级信息", "未找到有效句子")

        source_word_count = len(extract_word_items(asr_payload))
        logger.info(
            "[DEBUG] lesson.subtitle_variant split_mode=%s split_enabled=%s semantic_split_enabled=%s semantic_split_applied=%s source_words=%s output_sentences=%s",
            split_mode,
            subtitle_settings.subtitle_split_enabled,
            effective_semantic_split_enabled,
            semantic_split_applied,
            source_word_count,
            len(sentences),
        )
        if split_mode not in {"word_level_split", "word_level_split+semantic"} and subtitle_settings.subtitle_split_enabled:
            logger.warning("[DEBUG] lesson.subtitle_variant split_fallback mode=%s output_sentences=%s", split_mode, len(sentences))

        if before_translate_callback:
            before_translate_callback(len(sentences))
        translation_result = translate_sentences_to_zh(
            [x["text"] for x in sentences],
            api_key=DASHSCOPE_API_KEY,
            progress_callback=translation_progress_callback,
        )
        normalized_sentences = LessonService._normalize_runtime_sentences(sentences, translation_result.texts)
        return {
            "semantic_split_enabled": bool(effective_semantic_split_enabled),
            "split_mode": split_mode,
            "source_word_count": source_word_count,
            "sentences": normalized_sentences,
            "translate_failed_count": int(translation_result.failed_count),
            "translation_attempt_records": list(translation_result.attempt_records),
            "translation_request_count": int(translation_result.total_requests),
            "translation_success_request_count": int(translation_result.success_request_count),
            "translation_usage": {
                "prompt_tokens": int(translation_result.success_prompt_tokens),
                "completion_tokens": int(translation_result.success_completion_tokens),
                "total_tokens": int(translation_result.success_total_tokens),
                "charged_points": 0,
            },
            "latest_translate_error_summary": str(translation_result.latest_error_summary or ""),
            "task_id": task_id,
        }

    @staticmethod
    def build_subtitle_cache_seed(*, asr_payload: dict[str, Any], variant: dict[str, Any]) -> dict[str, Any]:
        return {
            "semantic_split_enabled": bool(variant.get("semantic_split_enabled")),
            "split_mode": str(variant.get("split_mode") or ""),
            "source_word_count": int(variant.get("source_word_count", 0)),
            "asr_payload": dict(asr_payload or {}),
            "sentences": [dict(item) for item in list(variant.get("sentences") or []) if isinstance(item, dict)],
        }

    @staticmethod
    def generate_from_upload(
        upload_file: UploadFile,
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        db: Session,
        progress_callback: ProgressCallback | None = None,
        semantic_split_enabled: bool | None = None,
    ) -> Lesson:
        source_filename = (upload_file.filename or "unknown")[:255]
        suffix = validate_suffix(source_filename)
        original_path = req_dir / f"source{suffix}"
        save_upload_file_stream(upload_file, original_path, max_bytes=UPLOAD_MAX_BYTES)

        return LessonService.generate_from_saved_file(
            source_path=original_path,
            source_filename=source_filename,
            req_dir=req_dir,
            owner_id=owner_id,
            asr_model=asr_model,
            db=db,
            progress_callback=progress_callback,
            semantic_split_enabled=semantic_split_enabled,
        )

    @staticmethod
    def _transcribe_with_optional_parallel(
        *,
        opus_path: Path,
        req_dir: Path,
        asr_model: str,
        source_duration_ms: int,
        parallel_enabled: bool,
        parallel_threshold_seconds: int,
        segment_target_seconds: int,
        max_concurrency: int,
        progress_callback: ProgressCallback | None,
    ) -> dict[str, Any]:
        duration_seconds = max(1, math.ceil(source_duration_ms / 1000))
        estimate_total_subtitles = max(1, int(round(duration_seconds / 3.2)))

        should_parallel = (
            parallel_enabled
            and duration_seconds >= max(1, parallel_threshold_seconds)
            and segment_target_seconds > 0
            and max_concurrency > 1
        )

        if not should_parallel:
            _emit_progress(
                progress_callback,
                stage_key="asr_transcribe",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("asr_transcribe", 0.2),
                current_text=f"转写字幕 0/约{estimate_total_subtitles}",
                counters={
                    "asr_done": 0,
                    "asr_estimated": estimate_total_subtitles,
                    "translate_done": 0,
                    "translate_total": 0,
                },
            )
            asr_result = transcribe_audio_file(str(opus_path), model=asr_model)
            asr_payload = asr_result["asr_result_json"]
            _emit_progress(
                progress_callback,
                stage_key="asr_transcribe",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("asr_transcribe", 1.0),
                current_text=f"转写字幕 {estimate_total_subtitles}/约{estimate_total_subtitles}",
                counters={
                    "asr_done": estimate_total_subtitles,
                    "asr_estimated": estimate_total_subtitles,
                    "translate_done": 0,
                    "translate_total": 0,
                },
            )
            return {
                "asr_payload": asr_payload,
                "usage_seconds": int(asr_result.get("usage_seconds"))
                if isinstance(asr_result.get("usage_seconds"), int) and int(asr_result.get("usage_seconds")) > 0
                else None,
            }

        segments = _split_audio_segments(
            opus_path,
            req_dir / "asr_segments",
            segment_target_seconds,
            ASR_SEGMENT_SEARCH_WINDOW_SECONDS,
            source_duration_ms,
        )
        total_segments = len(segments)
        if total_segments <= 0:
            raise MediaError("ASR_SEGMENT_EMPTY", "ASR 分段失败", "未生成任何分段")

        logger.info(
            "[DEBUG] lesson.parallel_asr enabled=true duration_seconds=%s threshold=%s target_seconds=%s search_window=%s concurrency=%s total_segments=%s",
            duration_seconds,
            parallel_threshold_seconds,
            segment_target_seconds,
            ASR_SEGMENT_SEARCH_WINDOW_SECONDS,
            max_concurrency,
            total_segments,
        )

        _emit_progress(
            progress_callback,
            stage_key="asr_transcribe",
            stage_status="running",
            overall_percent=_progress_percent_by_stage("asr_transcribe", 0.1),
            current_text=f"ASR分段 0/{total_segments}",
            counters={
                "asr_done": 0,
                "asr_estimated": estimate_total_subtitles,
                "translate_done": 0,
                "translate_total": 0,
            },
        )

        merged: list[tuple[int, list[dict[str, Any]], list[dict[str, Any]], int | None]] = []
        completed_segments = 0

        with ThreadPoolExecutor(max_workers=max(1, min(max_concurrency, total_segments))) as executor:
            future_map = {
                executor.submit(_transcribe_segment, segment_index, segment_start_ms, segment_path, asr_model): segment_index
                for segment_index, segment_start_ms, segment_path in segments
            }
            for future in as_completed(future_map):
                segment_index, segment_words, segment_sentences, usage_seconds = future.result()
                merged.append((segment_index, segment_words, segment_sentences, usage_seconds))
                completed_segments += 1
                asr_done_estimate = max(1, int(round(estimate_total_subtitles * completed_segments / total_segments)))
                ratio = completed_segments / total_segments
                _emit_progress(
                    progress_callback,
                    stage_key="asr_transcribe",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("asr_transcribe", ratio),
                    current_text=f"转写字幕 {asr_done_estimate}/约{estimate_total_subtitles}",
                    counters={
                        "asr_done": asr_done_estimate,
                        "asr_estimated": estimate_total_subtitles,
                        "translate_done": 0,
                        "translate_total": 0,
                        "segment_done": completed_segments,
                        "segment_total": total_segments,
                    },
                )
                logger.info(
                    "[DEBUG] lesson.parallel_asr.segment_done idx=%s done=%s total=%s words=%s sentences=%s",
                    segment_index,
                    completed_segments,
                    total_segments,
                    len(segment_words),
                    len(segment_sentences),
                )

        merged.sort(key=lambda item: item[0])
        ordered_words: list[dict[str, Any]] = []
        fallback_sentences: list[dict[str, Any]] = []
        usage_values: list[int] = []
        for _, segment_words, segment_sentences, usage_seconds in merged:
            ordered_words.extend(segment_words)
            fallback_sentences.extend(segment_sentences)
            if isinstance(usage_seconds, int) and usage_seconds > 0:
                usage_values.append(usage_seconds)

        ordered_words.sort(key=lambda item: (int(item["begin_ms"]), int(item["end_ms"])))
        fallback_sentences.sort(key=lambda item: (int(item["begin_ms"]), int(item["end_ms"])))

        if not ordered_words and not fallback_sentences:
            raise MediaError("ASR_SENTENCE_MISSING", "ASR 返回结果缺少句级信息", "并发分段后未提取到任何词或句子")

        final_estimate = len(ordered_words) if ordered_words else len(fallback_sentences)
        _emit_progress(
            progress_callback,
            stage_key="asr_transcribe",
            stage_status="completed",
            overall_percent=_progress_percent_by_stage("asr_transcribe", 1.0),
            current_text=f"转写字幕 {final_estimate}/约{estimate_total_subtitles}",
            counters={
                "asr_done": final_estimate,
                "asr_estimated": estimate_total_subtitles,
                "translate_done": 0,
                "translate_total": 0,
                "segment_done": total_segments,
                "segment_total": total_segments,
            },
        )

        usage_total_seconds = sum(usage_values) if len(usage_values) == total_segments else None
        return {
            "asr_payload": _build_parallel_payload(source_duration_ms, ordered_words, fallback_sentences),
            "usage_seconds": usage_total_seconds,
        }

    @staticmethod
    def generate_from_saved_file(
        *,
        source_path: Path,
        source_filename: str,
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        db: Session,
        progress_callback: ProgressCallback | None = None,
        task_id: str | None = None,
        semantic_split_enabled: bool | None = None,
    ) -> Lesson:
        _emit_progress(
            progress_callback,
            stage_key="convert_audio",
            stage_status="running",
            overall_percent=_progress_percent_by_stage("convert_audio", 0.1),
            current_text="转换音频格式",
            counters={"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0},
        )

        opus_path = req_dir / "lesson_input.opus"
        extract_audio_for_asr(source_path, opus_path)

        _emit_progress(
            progress_callback,
            stage_key="convert_audio",
            stage_status="completed",
            overall_percent=_progress_percent_by_stage("convert_audio", 1.0),
            current_text="转换音频格式完成",
            counters={"asr_done": 0, "asr_estimated": 0, "translate_done": 0, "translate_total": 0},
        )

        reserved_points = 0
        reserved_duration_ms = 0
        reserve_ledger_id: int | None = None
        translation_trace_id = uuid4().hex

        try:
            reserved_duration_ms = probe_audio_duration_ms(opus_path)
            rate = get_model_rate(db, asr_model)
            reserved_points = calculate_points(reserved_duration_ms, rate.points_per_minute)
            logger.info(
                "[DEBUG] lesson.generate reserve owner_id=%s model=%s duration_ms=%s points=%s",
                owner_id,
                asr_model,
                reserved_duration_ms,
                reserved_points,
            )
            reserve_ledger = reserve_points(
                db,
                user_id=owner_id,
                points=reserved_points,
                model_name=asr_model,
                duration_ms=reserved_duration_ms,
                note=f"课程生成预扣，模型={asr_model}",
            )
            reserve_ledger_id = reserve_ledger.id
            db.commit()

            segment_target_seconds = max(
                1,
                int(getattr(rate, "segment_seconds", ASR_SEGMENT_TARGET_SECONDS) or ASR_SEGMENT_TARGET_SECONDS),
            )
            asr_transcribe = LessonService._transcribe_with_optional_parallel(
                opus_path=opus_path,
                req_dir=req_dir,
                asr_model=asr_model,
                source_duration_ms=reserved_duration_ms,
                parallel_enabled=bool(getattr(rate, "parallel_enabled", False)),
                parallel_threshold_seconds=max(1, int(getattr(rate, "parallel_threshold_seconds", 600))),
                segment_target_seconds=segment_target_seconds,
                max_concurrency=max(1, int(getattr(rate, "max_concurrency", 2))),
                progress_callback=progress_callback,
            )
            asr_payload = asr_transcribe["asr_payload"]
            usage_seconds = asr_transcribe.get("usage_seconds")
            runtime_sentences: list[dict[str, Any]] = []
            translate_total = 0

            def _on_before_translation(total: int) -> None:
                nonlocal translate_total
                translate_total = max(0, int(total))
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("translate_zh", 0.0),
                    current_text=f"翻译字幕 0/{translate_total}",
                    counters={
                        "asr_done": translate_total,
                        "asr_estimated": translate_total,
                        "translate_done": 0,
                        "translate_total": translate_total,
                    },
                )

            def _on_translation_progress(done: int, total: int) -> None:
                sentence_total = len(runtime_sentences) if runtime_sentences else total
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("translate_zh", done / max(total, 1)),
                    current_text=f"翻译字幕 {done}/{total}",
                    counters={
                        "asr_done": sentence_total,
                        "asr_estimated": sentence_total,
                        "translate_done": done,
                        "translate_total": total,
                    },
                )

            variant = LessonService.build_subtitle_variant(
                asr_payload=asr_payload,
                db=db,
                task_id=task_id,
                semantic_split_enabled=semantic_split_enabled,
                before_translate_callback=_on_before_translation,
                translation_progress_callback=_on_translation_progress,
            )
            runtime_sentences = list(variant["sentences"])
            translate_total = len(runtime_sentences)
            translation_rate = get_model_rate(db, MT_MODEL)
            translation_usage = dict(variant.get("translation_usage") or {})
            translation_points = calculate_token_points(
                int(translation_usage.get("total_tokens", 0) or 0),
                int(getattr(translation_rate, "points_per_1k_tokens", 0) or 0),
            )
            translation_usage["charged_points"] = translation_points
            translation_debug = {
                "total_sentences": translate_total,
                "failed_sentences": int(variant.get("translate_failed_count", 0)),
                "request_count": int(variant.get("translation_request_count", 0)),
                "success_request_count": int(variant.get("translation_success_request_count", 0)),
                "usage": translation_usage,
                "latest_error_summary": str(variant.get("latest_translate_error_summary") or ""),
            }
            _emit_progress(
                progress_callback,
                stage_key="translate_zh",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("translate_zh", 1.0),
                current_text=f"翻译字幕 {translate_total}/{translate_total}",
                counters={
                    "asr_done": translate_total,
                    "asr_estimated": translate_total,
                    "translate_done": translate_total,
                    "translate_total": translate_total,
                },
                translation_debug=translation_debug,
            )

            failed_count = int(variant.get("translate_failed_count", 0))
            failed_ratio = failed_count / max(translate_total, 1)
            lesson_status = "partial_ready" if failed_ratio >= 0.3 else "ready"
            duration_ms = estimate_duration_ms(asr_payload, runtime_sentences)
            usage_hit = isinstance(usage_seconds, int) and usage_seconds > 0
            actual_duration_ms = int(usage_seconds * 1000) if usage_hit else int(duration_ms)
            actual_points = calculate_points(actual_duration_ms, rate.points_per_minute)
            points_diff = int(actual_points) - int(reserved_points)
            logger.info(
                "[DEBUG] lesson.generate settle owner_id=%s model=%s usage_hit=%s reserved_points=%s actual_points=%s diff=%s",
                owner_id,
                asr_model,
                usage_hit,
                reserved_points,
                actual_points,
                points_diff,
            )

            _emit_progress(
                progress_callback,
                stage_key="write_lesson",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("write_lesson", 0.2),
                current_text="写入课程",
                counters={
                    "asr_done": translate_total,
                    "asr_estimated": translate_total,
                    "translate_done": translate_total,
                    "translate_total": translate_total,
                },
            )

            lesson = Lesson(
                user_id=owner_id,
                title=Path(source_filename or "lesson").stem[:200] or "lesson",
                source_filename=source_filename,
                asr_model=asr_model,
                duration_ms=duration_ms,
                media_storage="client_indexeddb",
                source_duration_ms=reserved_duration_ms,
                status=lesson_status,
            )
            db.add(lesson)
            db.flush()
            logger.info(
                "[DEBUG] lesson.generate mode=client_indexeddb lesson_id=%s source_duration_ms=%s",
                lesson.id,
                reserved_duration_ms,
            )

            for sentence in runtime_sentences:
                db.add(
                    LessonSentence(
                        lesson_id=lesson.id,
                        idx=int(sentence["idx"]),
                        begin_ms=int(sentence["begin_ms"]),
                        end_ms=int(sentence["end_ms"]),
                        text_en=str(sentence["text_en"]),
                        text_zh=str(sentence["text_zh"]),
                        tokens_json=[str(item) for item in list(sentence.get("tokens") or [])],
                        audio_clip_path=None,
                    )
                )

            create_progress(db, lesson_id=lesson.id, user_id=owner_id)
            append_translation_request_logs(
                db,
                trace_id=translation_trace_id,
                user_id=owner_id,
                task_id=task_id,
                lesson_id=lesson.id,
                records=list(variant.get("translation_attempt_records") or []),
            )
            settle_reserved_points(
                db,
                user_id=owner_id,
                model_name=asr_model,
                reserved_points=reserved_points,
                actual_points=actual_points,
                duration_ms=actual_duration_ms,
                note=(
                    f"课程生成结算，预扣流水#{reserve_ledger_id}，预扣={reserved_points}，实耗={actual_points}，差额={points_diff}，"
                    f"usage_seconds={usage_seconds if usage_hit else 'fallback'}"
                ),
            )
            logger.info(
                "[DEBUG] lesson.generate translate_settle owner_id=%s lesson_id=%s model=%s total_tokens=%s charged_points=%s failed=%s requests=%s",
                owner_id,
                lesson.id,
                MT_MODEL,
                int(translation_usage.get("total_tokens", 0) or 0),
                translation_points,
                failed_count,
                int(variant.get("translation_request_count", 0) or 0),
            )
            consume_points(
                db,
                user_id=owner_id,
                points=translation_points,
                model_name=MT_MODEL,
                lesson_id=lesson.id,
                event_type=EVENT_CONSUME_TRANSLATE,
                note=(
                    f"课程翻译扣点，请求={int(variant.get('translation_request_count', 0) or 0)}，"
                    f"成功请求={int(variant.get('translation_success_request_count', 0) or 0)}，"
                    f"失败句数={failed_count}，"
                    f"prompt_tokens={int(translation_usage.get('prompt_tokens', 0) or 0)}，"
                    f"completion_tokens={int(translation_usage.get('completion_tokens', 0) or 0)}，"
                    f"total_tokens={int(translation_usage.get('total_tokens', 0) or 0)}，"
                    f"trace_id={translation_trace_id}"
                ),
            )
            record_consume(
                db,
                user_id=owner_id,
                model_name=asr_model,
                duration_ms=actual_duration_ms,
                lesson_id=lesson.id,
                note=(
                    f"课程生成完成，预扣流水#{reserve_ledger_id}，预扣={reserved_points}，实耗={actual_points}，差额={points_diff}，"
                    f"usage_seconds={usage_seconds if usage_hit else 'fallback'}"
                ),
            )
            db.commit()
            db.refresh(lesson)
            lesson.subtitle_cache_seed = LessonService.build_subtitle_cache_seed(asr_payload=asr_payload, variant=variant)

            _emit_progress(
                progress_callback,
                stage_key="write_lesson",
                stage_status="completed",
                overall_percent=100,
                current_text="课程生成完成",
                counters={
                    "asr_done": translate_total,
                    "asr_estimated": translate_total,
                    "translate_done": translate_total,
                    "translate_total": translate_total,
                },
                translation_debug=translation_debug,
            )
            return lesson
        except Exception:
            db.rollback()
            if reserve_ledger_id is not None:
                try:
                    refund_points(
                        db,
                        user_id=owner_id,
                        points=reserved_points,
                        model_name=asr_model,
                        duration_ms=reserved_duration_ms,
                        note=f"课程生成失败，退回预扣点数，预扣流水#{reserve_ledger_id}",
                    )
                    db.commit()
                except Exception:
                    db.rollback()
            raise
