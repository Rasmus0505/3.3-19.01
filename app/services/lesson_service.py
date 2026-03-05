from __future__ import annotations

import logging
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.config import DASHSCOPE_API_KEY, UPLOAD_MAX_BYTES
from app.models import Lesson, LessonSentence
from app.repositories.progress import create_progress
from app.services.asr_dashscope import transcribe_audio_file
from app.services.billing_service import calculate_points, get_model_rate, record_consume, refund_points, reserve_points
from app.services.lesson_builder import estimate_duration_ms, extract_sentences, tokenize_sentence
from app.services.media import MediaError, extract_audio_for_asr, probe_audio_duration_ms, save_upload_file_stream, validate_suffix
from app.services.translation_qwen_mt import translate_sentences_to_zh


logger = logging.getLogger(__name__)


class LessonService:
    @staticmethod
    def generate_from_upload(
        upload_file: UploadFile,
        req_dir: Path,
        owner_id: int,
        asr_model: str,
        db: Session,
    ) -> Lesson:
        source_filename = (upload_file.filename or "unknown")[:255]
        suffix = validate_suffix(source_filename)
        original_path = req_dir / f"source{suffix}"
        save_upload_file_stream(upload_file, original_path, max_bytes=UPLOAD_MAX_BYTES)

        opus_path = req_dir / "lesson_input.opus"
        extract_audio_for_asr(original_path, opus_path)
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

            asr_result = transcribe_audio_file(str(opus_path), model=asr_model)
            asr_payload = asr_result["asr_result_json"]

            sentences = extract_sentences(asr_payload)
            if not sentences:
                raise MediaError("ASR_SENTENCE_MISSING", "ASR 返回结果缺少句级信息", "未找到 transcripts[].sentences[]")

            zh_list, failed_count = translate_sentences_to_zh([x["text"] for x in sentences], DASHSCOPE_API_KEY)
            failed_ratio = failed_count / max(len(sentences), 1)
            lesson_status = "partial_ready" if failed_ratio >= 0.3 else "ready"
            duration_ms = estimate_duration_ms(asr_payload, sentences)

            lesson = Lesson(
                user_id=owner_id,
                title=Path(upload_file.filename or "lesson").stem[:200] or "lesson",
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
            record_consume(
                db,
                user_id=owner_id,
                model_name=asr_model,
                duration_ms=duration_ms,
                lesson_id=lesson.id,
                note=f"课程生成完成，预扣流水#{reserve_ledger_id}，预扣点数={reserved_points}",
            )
            db.commit()
            db.refresh(lesson)
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
