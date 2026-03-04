from __future__ import annotations

import asyncio
import mimetypes
import os
import shutil
import subprocess
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal, get_db, init_db
from app.deps import get_admin_user, get_current_user
from app.models import BillingModelRate, Lesson, LessonProgress, LessonSentence, MediaAsset, User, WalletAccount, WalletLedger
from app.schemas import (
    AdminBillingRateUpdateRequest,
    AdminBillingRatesResponse,
    AdminUserItem,
    AdminUsersResponse,
    AdminWalletLogsResponse,
    AuthRequest,
    AuthResponse,
    BillingRateItem,
    BillingRatesResponse,
    ErrorResponse,
    LessonCreateResponse,
    LessonDetailResponse,
    LessonItemResponse,
    LessonSentenceResponse,
    LogoutResponse,
    ProgressResponse,
    ProgressUpdateRequest,
    RefreshRequest,
    SuccessResponse,
    TokenCheckRequest,
    TokenCheckResponse,
    TokenResult,
    UserResponse,
    WalletAdjustRequest,
    WalletAdjustResponse,
    WalletLedgerItem,
    WalletMeResponse,
)
from app.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.services.asr_dashscope import AsrError, DEFAULT_MODEL, SUPPORTED_MODELS, setup_dashscope, transcribe_audio_file
from app.services.billing import (
    BillingError,
    calculate_points,
    ensure_default_billing_rates,
    get_model_rate,
    get_or_create_wallet_account,
    list_public_rates,
    manual_adjust,
    record_consume,
    refund_points,
    reserve_points,
)
from app.services.lesson_builder import cut_sentence_audio_clips, estimate_duration_ms, extract_sentences, normalize_token, tokenize_sentence
from app.services.media import (
    MediaError,
    cleanup_dir,
    create_request_dir,
    extract_audio_for_asr,
    probe_audio_duration_ms,
    save_upload_file_stream,
    validate_suffix,
)
from app.services.translation_qwen_mt import translate_sentences_to_zh


SERVICE_NAME = "zeabur3.3-min-asr"
REQUEST_TIMEOUT_SECONDS = 480
UPLOAD_MAX_BYTES = 200 * 1024 * 1024
BASE_TMP_DIR = Path(os.getenv("TMP_WORK_DIR", "/tmp/zeabur3.3"))
BASE_DATA_DIR = BASE_TMP_DIR / "data"
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
LESSON_DEFAULT_ASR_MODEL = os.getenv("LESSON_DEFAULT_ASR_MODEL", "paraformer-v2").strip()

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"


def _ensure_cmd_exists(cmd: str) -> None:
    if shutil.which(cmd) is None:
        raise RuntimeError(f"missing_dependency: `{cmd}` 未安装或不可执行")


def _ensure_ffmpeg_supports_libopus() -> None:
    try:
        proc = subprocess.run(
            ["ffmpeg", "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception as exc:
        raise RuntimeError(f"ffmpeg 检查失败: {exc}") from exc
    output = (proc.stdout or "") + "\n" + (proc.stderr or "")
    if "libopus" not in output:
        raise RuntimeError("missing_dependency: ffmpeg 未启用 libopus 编码器，请安装支持 libopus 的 ffmpeg")


def _error(status_code: int, code: str, message: str, detail: Any = "") -> JSONResponse:
    payload = ErrorResponse(ok=False, error_code=code, message=message, detail=detail).model_dump()
    return JSONResponse(status_code=status_code, content=payload)


def _map_media_error(exc: MediaError) -> JSONResponse:
    if exc.code == "FILE_TOO_LARGE":
        return _error(413, exc.code, exc.message, exc.detail)
    if exc.code in {"INVALID_FILE_TYPE", "EMPTY_FILE", "SENTENCE_CLIP_FAILED", "FFPROBE_FAILED"}:
        return _error(400, exc.code, exc.message, exc.detail)
    return _error(500, exc.code, exc.message, exc.detail)


def _map_billing_error(exc: BillingError) -> JSONResponse:
    if exc.code in {"INSUFFICIENT_BALANCE", "BILLING_RATE_DISABLED"}:
        return _error(400, exc.code, exc.message, exc.detail)
    if exc.code in {"BILLING_RATE_NOT_FOUND", "INVALID_REASON", "INVALID_POINTS"}:
        return _error(400, exc.code, exc.message, exc.detail)
    return _error(500, exc.code, exc.message, exc.detail)


def _to_user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, created_at=user.created_at)


def _to_sentence_response(lesson_id: int, sentence: LessonSentence) -> LessonSentenceResponse:
    return LessonSentenceResponse(
        idx=sentence.idx,
        begin_ms=sentence.begin_ms,
        end_ms=sentence.end_ms,
        text_en=sentence.text_en,
        text_zh=sentence.text_zh,
        tokens=sentence.tokens_json,
        audio_url=f"/api/lessons/{lesson_id}/sentences/{sentence.idx}/audio",
    )


def _to_lesson_item_response(lesson: Lesson) -> LessonItemResponse:
    return LessonItemResponse(
        id=lesson.id,
        title=lesson.title,
        source_filename=lesson.source_filename,
        asr_model=lesson.asr_model,
        duration_ms=lesson.duration_ms,
        status=lesson.status,
        created_at=lesson.created_at,
    )


def _to_lesson_detail_response(lesson: Lesson, sentences: list[LessonSentence]) -> LessonDetailResponse:
    base = _to_lesson_item_response(lesson)
    return LessonDetailResponse(
        id=base.id,
        title=base.title,
        source_filename=base.source_filename,
        asr_model=base.asr_model,
        duration_ms=base.duration_ms,
        status=base.status,
        created_at=base.created_at,
        sentences=[_to_sentence_response(lesson.id, s) for s in sentences],
    )


def _to_rate_item(rate: BillingModelRate) -> BillingRateItem:
    return BillingRateItem(
        model_name=rate.model_name,
        points_per_minute=rate.points_per_minute,
        is_active=rate.is_active,
        updated_at=rate.updated_at,
    )


def _require_lesson_owner(db: Session, lesson_id: int, user_id: int) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if not lesson or lesson.user_id != user_id:
        raise HTTPException(status_code=404, detail="课程不存在")
    return lesson


def _sync_transcribe_from_uploaded_file(upload_file: UploadFile, req_dir: Path, model: str) -> dict:
    suffix = validate_suffix(upload_file.filename or "")
    input_path = req_dir / f"upload{suffix}"
    save_upload_file_stream(upload_file, input_path, max_bytes=UPLOAD_MAX_BYTES)
    audio_path = req_dir / "input.opus"
    extract_audio_for_asr(input_path, audio_path)
    return transcribe_audio_file(str(audio_path), model=model)


def _sync_generate_lesson(
    upload_file: UploadFile,
    req_dir: Path,
    owner_id: int,
    asr_model: str,
    db: Session,
) -> Lesson:
    suffix = validate_suffix(upload_file.filename or "")
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

        clips_dir = req_dir / "clips"
        clip_paths = cut_sentence_audio_clips(opus_path, clips_dir, sentences)
        duration_ms = estimate_duration_ms(asr_payload, sentences)

        lesson = Lesson(
            user_id=owner_id,
            title=Path(upload_file.filename or "lesson").stem[:200] or "lesson",
            source_filename=(upload_file.filename or "unknown")[:255],
            asr_model=asr_model,
            duration_ms=duration_ms,
            status=lesson_status,
        )
        db.add(lesson)
        db.flush()

        lesson_dir = BASE_DATA_DIR / f"lesson_{lesson.id}"
        lesson_dir.mkdir(parents=True, exist_ok=True)
        stored_original = lesson_dir / f"original{suffix}"
        stored_opus = lesson_dir / "input.opus"
        shutil.copyfile(original_path, stored_original)
        shutil.copyfile(opus_path, stored_opus)

        media_asset = MediaAsset(lesson_id=lesson.id, original_path=str(stored_original), opus_path=str(stored_opus))
        db.add(media_asset)

        clips_store_dir = lesson_dir / "clips"
        clips_store_dir.mkdir(parents=True, exist_ok=True)

        for idx, sentence in enumerate(sentences):
            clip_store_path = clips_store_dir / f"sentence_{idx:04d}.opus"
            shutil.copyfile(clip_paths[idx], clip_store_path)
            db.add(
                LessonSentence(
                    lesson_id=lesson.id,
                    idx=idx,
                    begin_ms=int(sentence["begin_ms"]),
                    end_ms=int(sentence["end_ms"]),
                    text_en=sentence["text"],
                    text_zh=zh_list[idx] if idx < len(zh_list) else "",
                    tokens_json=tokenize_sentence(sentence["text"]),
                    audio_clip_path=str(clip_store_path),
                )
            )

        progress = LessonProgress(lesson_id=lesson.id, user_id=owner_id, current_sentence_idx=0, completed_indexes_json=[], last_played_at_ms=0)
        db.add(progress)
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


@asynccontextmanager
async def lifespan(_: FastAPI):
    _ensure_cmd_exists("ffmpeg")
    _ensure_cmd_exists("ffprobe")
    _ensure_ffmpeg_supports_libopus()
    if not DASHSCOPE_API_KEY:
        raise RuntimeError("missing_env: `DASHSCOPE_API_KEY` 未配置")
    BASE_TMP_DIR.mkdir(parents=True, exist_ok=True)
    BASE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    setup_dashscope(DASHSCOPE_API_KEY)
    init_db()
    seed_db = SessionLocal()
    try:
        ensure_default_billing_rates(seed_db)
    finally:
        seed_db.close()
    yield


app = FastAPI(title=SERVICE_NAME, version="0.2.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
def root_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/admin", include_in_schema=False)
@app.get("/admin/{full_path:path}", include_in_schema=False)
def admin_page(full_path: str = "") -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": SERVICE_NAME}


@app.post("/api/auth/register", response_model=AuthResponse, responses={400: {"model": ErrorResponse}})
def register(payload: AuthRequest, db: Session = Depends(get_db)):
    exists = db.scalar(select(User).where(User.email == payload.email.lower()))
    if exists:
        return _error(400, "EMAIL_EXISTS", "邮箱已注册")
    user = User(email=payload.email.lower(), password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()
    get_or_create_wallet_account(db, user.id, for_update=False)
    db.commit()
    db.refresh(user)
    return AuthResponse(
        ok=True,
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=_to_user_response(user),
    )


@app.post("/api/auth/login", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
def login(payload: AuthRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        return _error(401, "INVALID_CREDENTIALS", "邮箱或密码错误")
    return AuthResponse(
        ok=True,
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=_to_user_response(user),
    )


@app.post("/api/auth/refresh", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)):
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise ValueError("invalid token type")
        user_id = int(decoded.get("sub"))
    except Exception:
        return _error(401, "INVALID_REFRESH_TOKEN", "无效或过期的刷新令牌")

    user = db.get(User, user_id)
    if not user:
        return _error(401, "INVALID_REFRESH_TOKEN", "用户不存在")
    return AuthResponse(
        ok=True,
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=_to_user_response(user),
    )


@app.post("/api/auth/logout", response_model=LogoutResponse)
def logout() -> LogoutResponse:
    return LogoutResponse(ok=True, message="已退出登录")


@app.get("/api/wallet/me", response_model=WalletMeResponse, responses={401: {"model": ErrorResponse}})
def wallet_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    account = get_or_create_wallet_account(db, current_user.id, for_update=False)
    db.commit()
    db.refresh(account)
    return WalletMeResponse(ok=True, balance_points=account.balance_points, updated_at=account.updated_at)


@app.get("/api/billing/rates", response_model=BillingRatesResponse)
def public_billing_rates(db: Session = Depends(get_db)):
    rates = list_public_rates(db)
    return BillingRatesResponse(ok=True, rates=[_to_rate_item(item) for item in rates])


@app.get("/api/admin/users", response_model=AdminUsersResponse, responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}})
def admin_list_users(
    keyword: str = "",
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))

    balance_col = func.coalesce(WalletAccount.balance_points, 0)
    base_stmt = select(User.id, User.email, User.created_at, balance_col.label("balance_points")).outerjoin(
        WalletAccount, WalletAccount.user_id == User.id
    )
    count_stmt = select(func.count(User.id))
    if keyword.strip():
        pattern = f"%{keyword.strip().lower()}%"
        base_stmt = base_stmt.where(func.lower(User.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(User.email).like(pattern))

    sort_key = (sort_by or "created_at").strip().lower()
    sort_desc = (sort_dir or "desc").strip().lower() != "asc"
    if sort_key == "email":
        col = User.email
    elif sort_key == "balance_points":
        col = balance_col
    else:
        col = User.created_at
    order_col = desc(col) if sort_desc else col.asc()

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base_stmt.order_by(order_col, desc(User.id)).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = [
        AdminUserItem(
            id=row.id,
            email=row.email,
            created_at=row.created_at,
            balance_points=int(row.balance_points or 0),
        )
        for row in rows
    ]
    return AdminUsersResponse(ok=True, page=page, page_size=page_size, total=total, items=items)


@app.post(
    "/api/admin/users/{user_id}/wallet-adjust",
    response_model=WalletAdjustResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def admin_wallet_adjust(
    user_id: int,
    payload: WalletAdjustRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    target_user = db.get(User, user_id)
    if not target_user:
        return _error(404, "USER_NOT_FOUND", "用户不存在")
    try:
        ledger = manual_adjust(
            db,
            user_id=user_id,
            operator_user_id=current_admin.id,
            delta_points=payload.delta_points,
            note=payload.reason,
        )
        db.commit()
        return WalletAdjustResponse(ok=True, user_id=user_id, balance_points=ledger.balance_after)
    except BillingError as exc:
        db.rollback()
        return _map_billing_error(exc)
    except Exception as exc:
        db.rollback()
        return _error(500, "INTERNAL_ERROR", "调账失败", str(exc)[:1200])


@app.get(
    "/api/admin/wallet-logs",
    response_model=AdminWalletLogsResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_wallet_logs(
    user_email: str = "",
    event_type: str = "",
    page: int = 1,
    page_size: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_admin_user),
):
    page = max(page, 1)
    page_size = max(1, min(page_size, 100))
    base = select(WalletLedger, User.email).join(User, User.id == WalletLedger.user_id)
    count_stmt = select(func.count(WalletLedger.id)).join(User, User.id == WalletLedger.user_id)

    if user_email.strip():
        pattern = f"%{user_email.strip().lower()}%"
        base = base.where(func.lower(User.email).like(pattern))
        count_stmt = count_stmt.where(func.lower(User.email).like(pattern))

    normalized_event = event_type.strip().lower()
    if normalized_event and normalized_event != "all":
        base = base.where(WalletLedger.event_type == normalized_event)
        count_stmt = count_stmt.where(WalletLedger.event_type == normalized_event)

    if date_from:
        base = base.where(WalletLedger.created_at >= date_from)
        count_stmt = count_stmt.where(WalletLedger.created_at >= date_from)
    if date_to:
        base = base.where(WalletLedger.created_at <= date_to)
        count_stmt = count_stmt.where(WalletLedger.created_at <= date_to)

    total = int(db.scalar(count_stmt) or 0)
    rows = db.execute(
        base.order_by(WalletLedger.created_at.desc(), WalletLedger.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    items = [
        WalletLedgerItem(
            id=ledger.id,
            user_id=ledger.user_id,
            user_email=email,
            operator_user_id=ledger.operator_user_id,
            event_type=ledger.event_type,
            delta_points=int(ledger.delta_points),
            balance_after=int(ledger.balance_after),
            model_name=ledger.model_name,
            duration_ms=ledger.duration_ms,
            lesson_id=ledger.lesson_id,
            note=ledger.note,
            created_at=ledger.created_at,
        )
        for ledger, email in rows
    ]
    return AdminWalletLogsResponse(ok=True, page=page, page_size=page_size, total=total, items=items)


@app.get(
    "/api/admin/billing-rates",
    response_model=AdminBillingRatesResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
)
def admin_billing_rates(db: Session = Depends(get_db), _: User = Depends(get_admin_user)):
    rates = list(db.scalars(select(BillingModelRate).order_by(BillingModelRate.model_name.asc())).all())
    return AdminBillingRatesResponse(ok=True, rates=[_to_rate_item(item) for item in rates])


@app.put(
    "/api/admin/billing-rates/{model_name}",
    response_model=AdminBillingRatesResponse,
    responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def admin_update_billing_rate(
    model_name: str,
    payload: AdminBillingRateUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_admin_user),
):
    rate = db.get(BillingModelRate, model_name)
    if not rate:
        return _error(404, "BILLING_RATE_NOT_FOUND", "计费模型不存在", model_name)
    rate.points_per_minute = payload.points_per_minute
    rate.is_active = payload.is_active
    rate.updated_by_user_id = current_admin.id
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return AdminBillingRatesResponse(ok=True, rates=[_to_rate_item(rate)])


@app.post(
    "/api/transcribe/file",
    response_model=SuccessResponse,
    responses={400: {"model": ErrorResponse}, 413: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def transcribe_file_with_model(video_file: UploadFile = File(...), model: str = Form(DEFAULT_MODEL)):
    selected_model = (model or "").strip() or DEFAULT_MODEL
    started = time.monotonic()
    req_dir = create_request_dir(BASE_TMP_DIR)
    try:
        asr_result = await asyncio.wait_for(
            asyncio.to_thread(_sync_transcribe_from_uploaded_file, video_file, req_dir, selected_model),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        elapsed_ms = int((time.monotonic() - started) * 1000)
        return SuccessResponse(
            ok=True,
            source_type="file",
            model=asr_result["model"],
            task_id=asr_result["task_id"],
            task_status=asr_result["task_status"],
            transcription_url=asr_result["transcription_url"],
            preview_text=asr_result["preview_text"],
            asr_result_json=asr_result["asr_result_json"],
            elapsed_ms=elapsed_ms,
        )
    except asyncio.TimeoutError:
        return _error(504, "REQUEST_TIMEOUT", "请求处理超时", f"超过 {REQUEST_TIMEOUT_SECONDS} 秒")
    except MediaError as exc:
        return _map_media_error(exc)
    except AsrError as exc:
        if exc.code == "INVALID_MODEL":
            return _error(400, exc.code, exc.message, {"supported_models": sorted(SUPPORTED_MODELS), "input_model": exc.detail})
        return _error(502, exc.code, exc.message, exc.detail)
    except Exception as exc:
        return _error(500, "INTERNAL_ERROR", "服务内部错误", str(exc)[:1200])
    finally:
        cleanup_dir(req_dir)
        await video_file.close()


@app.post(
    "/api/lessons",
    response_model=LessonCreateResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def create_lesson(
    video_file: UploadFile = File(...),
    asr_model: str = Form(LESSON_DEFAULT_ASR_MODEL),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    selected_model = (asr_model or "").strip() or LESSON_DEFAULT_ASR_MODEL
    if selected_model not in SUPPORTED_MODELS:
        return _error(400, "INVALID_MODEL", "不支持的模型", {"supported_models": sorted(SUPPORTED_MODELS), "input_model": selected_model})

    req_dir = create_request_dir(BASE_TMP_DIR)
    try:
        lesson = await asyncio.wait_for(
            asyncio.to_thread(_sync_generate_lesson, video_file, req_dir, current_user.id, selected_model, db),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        sentences = db.scalars(select(LessonSentence).where(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc())).all()
        return LessonCreateResponse(ok=True, lesson=_to_lesson_detail_response(lesson, list(sentences)))
    except asyncio.TimeoutError:
        return _error(504, "REQUEST_TIMEOUT", "课程生成超时", f"超过 {REQUEST_TIMEOUT_SECONDS} 秒")
    except MediaError as exc:
        return _map_media_error(exc)
    except BillingError as exc:
        return _map_billing_error(exc)
    except AsrError as exc:
        return _error(502, exc.code, exc.message, exc.detail)
    except Exception as exc:
        db.rollback()
        return _error(500, "INTERNAL_ERROR", "课程生成失败", str(exc)[:1200])
    finally:
        cleanup_dir(req_dir)
        await video_file.close()


@app.get("/api/lessons", response_model=list[LessonItemResponse], responses={401: {"model": ErrorResponse}})
def list_lessons(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lessons = db.scalars(select(Lesson).where(Lesson.user_id == current_user.id).order_by(Lesson.created_at.desc())).all()
    return [_to_lesson_item_response(item) for item in lessons]


@app.get("/api/lessons/{lesson_id}", response_model=LessonDetailResponse, responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
def get_lesson(lesson_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lesson = _require_lesson_owner(db, lesson_id, current_user.id)
    sentences = db.scalars(select(LessonSentence).where(LessonSentence.lesson_id == lesson.id).order_by(LessonSentence.idx.asc())).all()
    return _to_lesson_detail_response(lesson, list(sentences))


@app.get(
    "/api/lessons/{lesson_id}/progress",
    response_model=ProgressResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_progress(lesson_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _require_lesson_owner(db, lesson_id, current_user.id)
    progress = db.scalar(select(LessonProgress).where(LessonProgress.lesson_id == lesson_id, LessonProgress.user_id == current_user.id))
    if not progress:
        return _error(404, "PROGRESS_NOT_FOUND", "学习进度不存在")
    return ProgressResponse(
        ok=True,
        lesson_id=lesson_id,
        current_sentence_index=progress.current_sentence_idx,
        completed_sentence_indexes=list(progress.completed_indexes_json or []),
        last_played_at_ms=int(progress.last_played_at_ms or 0),
        updated_at=progress.updated_at,
    )


@app.post(
    "/api/lessons/{lesson_id}/progress",
    response_model=ProgressResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def update_progress(
    lesson_id: int,
    payload: ProgressUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lesson_owner(db, lesson_id, current_user.id)
    progress = db.scalar(select(LessonProgress).where(LessonProgress.lesson_id == lesson_id, LessonProgress.user_id == current_user.id))
    if not progress:
        return _error(404, "PROGRESS_NOT_FOUND", "学习进度不存在")

    progress.current_sentence_idx = payload.current_sentence_index
    progress.completed_indexes_json = sorted(set(payload.completed_sentence_indexes))
    progress.last_played_at_ms = payload.last_played_at_ms
    db.add(progress)
    db.commit()
    db.refresh(progress)
    return ProgressResponse(
        ok=True,
        lesson_id=lesson_id,
        current_sentence_index=progress.current_sentence_idx,
        completed_sentence_indexes=list(progress.completed_indexes_json or []),
        last_played_at_ms=int(progress.last_played_at_ms or 0),
        updated_at=progress.updated_at,
    )


@app.post(
    "/api/lessons/{lesson_id}/check",
    response_model=TokenCheckResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def check_sentence_tokens(
    lesson_id: int,
    payload: TokenCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lesson_owner(db, lesson_id, current_user.id)
    sentence = db.scalar(select(LessonSentence).where(LessonSentence.lesson_id == lesson_id, LessonSentence.idx == payload.sentence_index))
    if not sentence:
        return _error(404, "SENTENCE_NOT_FOUND", "句子不存在")

    expected_tokens = [normalize_token(tok) for tok in list(sentence.tokens_json or []) if normalize_token(tok)]
    input_tokens = [normalize_token(tok) for tok in payload.user_tokens if normalize_token(tok)]
    max_len = max(len(expected_tokens), len(input_tokens))
    token_results: list[TokenResult] = []
    passed = len(expected_tokens) == len(input_tokens)

    for i in range(max_len):
        expected = expected_tokens[i] if i < len(expected_tokens) else ""
        actual = input_tokens[i] if i < len(input_tokens) else ""
        correct = bool(expected and actual and expected == actual)
        if expected != actual:
            passed = False
        token_results.append(TokenResult(expected=expected, input=actual, correct=correct))

    return TokenCheckResponse(
        ok=True,
        passed=passed,
        token_results=token_results,
        expected_tokens=expected_tokens,
        normalized_expected=" ".join(expected_tokens),
    )


@app.get(
    "/api/lessons/{lesson_id}/media",
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_lesson_media(
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lesson_owner(db, lesson_id, current_user.id)
    media_asset = db.scalar(select(MediaAsset).where(MediaAsset.lesson_id == lesson_id))
    if not media_asset:
        return _error(404, "MEDIA_NOT_FOUND", "课程媒体不存在")

    media_path = Path(media_asset.original_path)
    if not media_path.exists():
        return _error(404, "MEDIA_FILE_MISSING", "课程媒体文件不存在")

    media_type = mimetypes.guess_type(str(media_path))[0] or "application/octet-stream"
    return FileResponse(path=str(media_path), media_type=media_type, filename=media_path.name)


@app.get(
    "/api/lessons/{lesson_id}/sentences/{idx}/audio",
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
)
def get_sentence_audio(
    lesson_id: int,
    idx: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_lesson_owner(db, lesson_id, current_user.id)
    sentence = db.scalar(select(LessonSentence).where(LessonSentence.lesson_id == lesson_id, LessonSentence.idx == idx))
    if not sentence:
        return _error(404, "SENTENCE_NOT_FOUND", "句子不存在")
    clip_path = Path(sentence.audio_clip_path)
    if not clip_path.exists():
        return _error(404, "AUDIO_CLIP_MISSING", "句级音频不存在")
    return FileResponse(path=str(clip_path), media_type="audio/ogg")
