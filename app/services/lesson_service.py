from __future__ import annotations

import logging
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import DASHSCOPE_API_KEY, UPLOAD_MAX_BYTES
from app.models import Lesson, LessonSentence
from app.repositories.progress import create_progress
from app.services.asr_dashscope import transcribe_audio_file
from app.services.billing_service import (
    calculate_points,
    get_model_rate,
    record_consume,
    refund_points,
    reserve_points,
    settle_reserved_points,
)
from app.services.lesson_builder import estimate_duration_ms, extract_sentences, tokenize_sentence
from app.services.media import MediaError, extract_audio_for_asr, probe_audio_duration_ms, run_cmd, save_upload_file_stream, validate_suffix
from app.services.translation_qwen_mt import translate_sentences_to_zh


logger = logging.getLogger(__name__)

ProgressCallback = Callable[[dict[str, Any]], None]


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


def _build_parallel_payload(duration_ms: int, merged_sentences: list[dict[str, Any]]) -> dict[str, Any]:
    transcript_sentences: list[dict[str, Any]] = []
    for idx, sentence in enumerate(merged_sentences):
        transcript_sentences.append(
            {
                "sentence_id": idx,
                "begin_time": int(sentence["begin_ms"]),
                "end_time": int(sentence["end_ms"]),
                "text": str(sentence["text"]),
            }
        )

    return {
        "properties": {"original_duration_in_milliseconds": int(duration_ms)},
        "transcripts": [
            {
                "channel_id": 0,
                "text": " ".join(item["text"] for item in merged_sentences).strip(),
                "sentences": transcript_sentences,
            }
        ],
    }


def _split_audio_segments(source_audio: Path, segments_dir: Path, segment_seconds: int, duration_ms: int) -> list[tuple[int, int, Path]]:
    if segment_seconds <= 0:
        raise MediaError("ASR_SEGMENT_CONFIG_INVALID", "分段时长配置无效", str(segment_seconds))

    total_seconds = max(1, math.ceil(duration_ms / 1000))
    segment_count = max(1, math.ceil(total_seconds / segment_seconds))

    segments_dir.mkdir(parents=True, exist_ok=True)
    output: list[tuple[int, int, Path]] = []

    for idx in range(segment_count):
        start_sec = idx * segment_seconds
        end_sec = min(total_seconds, (idx + 1) * segment_seconds)
        segment_path = segments_dir / f"segment_{idx:04d}.opus"
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
                    str(segment_path),
                ]
            )
        except MediaError as exc:
            raise MediaError("ASR_SEGMENT_SPLIT_FAILED", "ASR 分段切片失败", exc.detail or exc.message) from exc
        output.append((idx, int(start_sec * 1000), segment_path))

    return output


def _transcribe_segment(
    segment_index: int, segment_start_ms: int, segment_path: Path, asr_model: str
) -> tuple[int, list[dict[str, Any]], int | None]:
    asr_result = transcribe_audio_file(str(segment_path), model=asr_model)
    segment_payload = asr_result["asr_result_json"]
    usage_seconds = asr_result.get("usage_seconds")
    segment_sentences = extract_sentences(segment_payload)
    shifted: list[dict[str, Any]] = []
    for item in segment_sentences:
        shifted.append(
            {
                "text": item["text"],
                "begin_ms": int(item["begin_ms"]) + segment_start_ms,
                "end_ms": int(item["end_ms"]) + segment_start_ms,
            }
        )
    return segment_index, shifted, int(usage_seconds) if isinstance(usage_seconds, int) and usage_seconds > 0 else None


class LessonService:
    @staticmethod
    def generate_from_upload(
        upload_file: UploadFile,
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        db: Session,
        progress_callback: ProgressCallback | None = None,
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
        segment_seconds: int,
        max_concurrency: int,
        progress_callback: ProgressCallback | None,
    ) -> dict[str, Any]:
        duration_seconds = max(1, math.ceil(source_duration_ms / 1000))
        estimate_total_subtitles = max(1, int(round(duration_seconds / 3.2)))

        should_parallel = (
            parallel_enabled
            and duration_seconds >= max(1, parallel_threshold_seconds)
            and segment_seconds > 0
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

        segments = _split_audio_segments(opus_path, req_dir / "asr_segments", segment_seconds, source_duration_ms)
        total_segments = len(segments)
        if total_segments <= 0:
            raise MediaError("ASR_SEGMENT_EMPTY", "ASR 分段失败", "未生成任何分段")

        logger.info(
            "[DEBUG] lesson.parallel_asr enabled=true duration_seconds=%s threshold=%s segment_seconds=%s concurrency=%s total_segments=%s",
            duration_seconds,
            parallel_threshold_seconds,
            segment_seconds,
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

        merged: list[tuple[int, list[dict[str, Any]], int | None]] = []
        completed_segments = 0

        with ThreadPoolExecutor(max_workers=max(1, min(max_concurrency, total_segments))) as executor:
            future_map = {
                executor.submit(_transcribe_segment, segment_index, segment_start_ms, segment_path, asr_model): segment_index
                for segment_index, segment_start_ms, segment_path in segments
            }
            for future in as_completed(future_map):
                segment_index, segment_sentences, usage_seconds = future.result()
                merged.append((segment_index, segment_sentences, usage_seconds))
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
                    "[DEBUG] lesson.parallel_asr.segment_done idx=%s done=%s total=%s sentences=%s",
                    segment_index,
                    completed_segments,
                    total_segments,
                    len(segment_sentences),
                )

        merged.sort(key=lambda item: item[0])
        ordered_sentences: list[dict[str, Any]] = []
        usage_values: list[int] = []
        for _, segment_sentences, usage_seconds in merged:
            ordered_sentences.extend(segment_sentences)
            if isinstance(usage_seconds, int) and usage_seconds > 0:
                usage_values.append(usage_seconds)
        ordered_sentences.sort(key=lambda item: (int(item["begin_ms"]), int(item["end_ms"])))

        if not ordered_sentences:
            raise MediaError("ASR_SENTENCE_MISSING", "ASR 返回结果缺少句级信息", "并发分段后未提取到任何句子")

        _emit_progress(
            progress_callback,
            stage_key="asr_transcribe",
            stage_status="completed",
            overall_percent=_progress_percent_by_stage("asr_transcribe", 1.0),
            current_text=f"转写字幕 {len(ordered_sentences)}/约{estimate_total_subtitles}",
            counters={
                "asr_done": len(ordered_sentences),
                "asr_estimated": estimate_total_subtitles,
                "translate_done": 0,
                "translate_total": 0,
                "segment_done": total_segments,
                "segment_total": total_segments,
            },
        )

        usage_total_seconds = sum(usage_values) if len(usage_values) == total_segments else None
        return {
            "asr_payload": _build_parallel_payload(source_duration_ms, ordered_sentences),
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

            asr_transcribe = LessonService._transcribe_with_optional_parallel(
                opus_path=opus_path,
                req_dir=req_dir,
                asr_model=asr_model,
                source_duration_ms=reserved_duration_ms,
                parallel_enabled=bool(getattr(rate, "parallel_enabled", False)),
                parallel_threshold_seconds=max(1, int(getattr(rate, "parallel_threshold_seconds", 600))),
                segment_seconds=max(1, int(getattr(rate, "segment_seconds", 300))),
                max_concurrency=max(1, int(getattr(rate, "max_concurrency", 2))),
                progress_callback=progress_callback,
            )
            asr_payload = asr_transcribe["asr_payload"]
            usage_seconds = asr_transcribe.get("usage_seconds")

            sentences = extract_sentences(asr_payload)
            if not sentences:
                raise MediaError("ASR_SENTENCE_MISSING", "ASR 返回结果缺少句级信息", "未找到 transcripts[].sentences[]")

            translate_total = len(sentences)
            _emit_progress(
                progress_callback,
                stage_key="translate_zh",
                stage_status="running",
                overall_percent=_progress_percent_by_stage("translate_zh", 0.0),
                current_text=f"翻译字幕 0/{translate_total}",
                counters={
                    "asr_done": len(sentences),
                    "asr_estimated": len(sentences),
                    "translate_done": 0,
                    "translate_total": translate_total,
                },
            )

            def _on_translation_progress(done: int, total: int) -> None:
                _emit_progress(
                    progress_callback,
                    stage_key="translate_zh",
                    stage_status="running",
                    overall_percent=_progress_percent_by_stage("translate_zh", done / max(total, 1)),
                    current_text=f"翻译字幕 {done}/{total}",
                    counters={
                        "asr_done": len(sentences),
                        "asr_estimated": len(sentences),
                        "translate_done": done,
                        "translate_total": total,
                    },
                )

            zh_list, failed_count = translate_sentences_to_zh(
                [x["text"] for x in sentences],
                DASHSCOPE_API_KEY,
                progress_callback=_on_translation_progress,
            )

            _emit_progress(
                progress_callback,
                stage_key="translate_zh",
                stage_status="completed",
                overall_percent=_progress_percent_by_stage("translate_zh", 1.0),
                current_text=f"翻译字幕 {translate_total}/{translate_total}",
                counters={
                    "asr_done": len(sentences),
                    "asr_estimated": len(sentences),
                    "translate_done": translate_total,
                    "translate_total": translate_total,
                },
            )

            failed_ratio = failed_count / max(len(sentences), 1)
            lesson_status = "partial_ready" if failed_ratio >= 0.3 else "ready"
            duration_ms = estimate_duration_ms(asr_payload, sentences)
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
                    "asr_done": len(sentences),
                    "asr_estimated": len(sentences),
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

            for idx, sentence in enumerate(sentences):
                db.add(
                    LessonSentence(
                        lesson_id=lesson.id,
                        idx=idx,
                        begin_ms=int(sentence["begin_ms"]),
                        end_ms=int(sentence["end_ms"]),
                        text_en=sentence["text"],
                        text_zh=zh_list[idx] if idx < len(zh_list) else "",
                        tokens_json=tokenize_sentence(sentence["text"]),
                        audio_clip_path=None,
                    )
                )

            create_progress(db, lesson_id=lesson.id, user_id=owner_id)
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

            _emit_progress(
                progress_callback,
                stage_key="write_lesson",
                stage_status="completed",
                overall_percent=100,
                current_text="课程生成完成",
                counters={
                    "asr_done": len(sentences),
                    "asr_estimated": len(sentences),
                    "translate_done": translate_total,
                    "translate_total": translate_total,
                },
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
