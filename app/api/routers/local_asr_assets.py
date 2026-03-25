from __future__ import annotations

from io import BytesIO
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any
import zipfile

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from app.services.faster_whisper_asr import FASTER_WHISPER_ASR_MODEL


router = APIRouter(prefix="/api/local-asr-assets", tags=["local-asr-assets"])

DOWNLOADABLE_MODELS: dict[str, dict[str, Any]] = {
    FASTER_WHISPER_ASR_MODEL: {
        "model_key": FASTER_WHISPER_ASR_MODEL,
        "display_name": "Bottle 1.0",
        "subtitle": "Reusable faster-whisper local bundle.",
        "source_model_id": "Systran/faster-distil-whisper-small.en",
        "bundle_dir": Path(
            __import__("os").getenv("DESKTOP_PREINSTALLED_MODEL_DIR", "").strip()
            or str((Path(__file__).resolve().parents[3] / "asr-test" / "models" / "faster-distil-small.en"))
        ).resolve(strict=False),
        "archive_name": "faster-distil-small.en.zip",
    }
}
ACTIVE_DOWNLOADABLE_MODEL_KEYS: tuple[str, ...] = (FASTER_WHISPER_ASR_MODEL,)


def _runtime_model_dir() -> Path:
    import os

    configured = os.getenv("FASTER_WHISPER_MODEL_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve(strict=False)
    user_data_dir = Path(os.getenv("DESKTOP_USER_DATA_DIR", "")).expanduser()
    if not str(user_data_dir).strip():
        user_data_dir = Path.home() / "AppData" / "Roaming" / "Bottle"
    return (user_data_dir / "models" / "faster-distil-small.en").resolve(strict=False)


def _resolve_model_entry(model_key: str) -> dict[str, Any]:
    normalized_model_key = str(model_key or "").strip()
    if normalized_model_key not in ACTIVE_DOWNLOADABLE_MODEL_KEYS or normalized_model_key not in DOWNLOADABLE_MODELS:
        raise HTTPException(status_code=404, detail="Local desktop ASR bundle is unavailable")
    return dict(DOWNLOADABLE_MODELS[normalized_model_key])


def _resolve_bundle_dir(model_key: str) -> Path:
    entry = _resolve_model_entry(model_key)
    return Path(entry["bundle_dir"]).expanduser().resolve(strict=False)


def _build_missing_reason(bundle_dir: Path) -> str:
    if not bundle_dir.exists():
        return "bundle directory does not exist"
    if not bundle_dir.is_dir():
        return "bundle path is not a directory"
    return ""


def _iter_bundle_files(bundle_dir: Path) -> list[Path]:
    if not bundle_dir.exists() or not bundle_dir.is_dir():
        return []
    return sorted(item for item in bundle_dir.rglob("*") if item.is_file() and item.name != ".model-version.json")


def _sha256_for_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_manifest_payload(bundle_dir: Path, model_key: str) -> dict[str, Any]:
    version_file = bundle_dir / ".model-version.json"
    version_payload = {}
    if version_file.is_file():
        try:
            version_payload = json.loads(version_file.read_text(encoding="utf-8"))
        except Exception:
            version_payload = {}
    files = [
        {
            "name": item.relative_to(bundle_dir).as_posix(),
            "size_bytes": item.stat().st_size,
            "sha256": _sha256_for_file(item),
        }
        for item in _iter_bundle_files(bundle_dir)
    ]
    model_version = str(version_payload.get("model_version") or "").strip()
    if not model_version:
        model_version = "bundle-unavailable" if not files else "bundle-local"
    return {
        "ok": True,
        "model_key": str(version_payload.get("model_key") or model_key).strip() or model_key,
        "model_version": model_version,
        "file_count": len(files),
        "files": files,
    }


def _copy_bundle(source_dir: Path, target_dir: Path) -> None:
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    backup_dir = target_dir.parent / f"{target_dir.name}.backup"
    if backup_dir.exists():
        shutil.rmtree(backup_dir, ignore_errors=True)
    if target_dir.exists():
        shutil.move(str(target_dir), str(backup_dir))
    shutil.copytree(source_dir, target_dir)


def _build_downloadable_model_summary(model_key: str) -> dict[str, Any]:
    entry = _resolve_model_entry(model_key)
    bundle_dir = Path(entry["bundle_dir"]).resolve(strict=False)
    runtime_model_dir = _runtime_model_dir()
    source_files = _iter_bundle_files(bundle_dir)
    target_files = _iter_bundle_files(runtime_model_dir)
    source_available = bool(source_files)
    available = bool(target_files)
    runtime_source = "bundled" if available and runtime_model_dir == bundle_dir else "user_data"
    install_available = source_available and runtime_model_dir != bundle_dir
    install_choice = "preinstalled" if runtime_source == "bundled" and available else ""
    return {
        "ok": True,
        "model_key": str(entry.get("model_key") or model_key),
        "display_name": str(entry.get("display_name") or model_key),
        "subtitle": str(entry.get("subtitle") or ""),
        "source_model_id": str(entry.get("source_model_id") or ""),
        "archive_name": str(entry.get("archive_name") or f"{model_key}.zip"),
        "bundle_dir": str(bundle_dir),
        "directory_exists": bundle_dir.exists(),
        "directory_is_dir": bundle_dir.is_dir(),
        "missing_reason": _build_missing_reason(bundle_dir),
        "available": available,
        "install_available": install_available,
        "source_available": source_available,
        "preinstalled": available and runtime_source == "bundled",
        "runtime_source": runtime_source,
        "install_selected": None,
        "install_choice": install_choice,
        "source_bundle_dir": str(bundle_dir),
        "target_bundle_dir": str(runtime_model_dir),
        "file_count": len(target_files),
    }


@router.get("/sherpa-onnx-asr.js")
def browser_local_asset_disabled():
    raise HTTPException(status_code=404, detail="Browser-local ASR assets are disabled")


@router.get("/download-models")
def list_downloadable_models() -> dict[str, Any]:
    return {
        "ok": True,
        "models": [_build_downloadable_model_summary(model_key) for model_key in ACTIVE_DOWNLOADABLE_MODEL_KEYS],
    }


@router.get("/download-models/{model_key}")
def get_downloadable_model_summary(model_key: str) -> dict[str, Any]:
    return _build_downloadable_model_summary(model_key)


@router.get("/download-models/{model_key}/manifest")
def get_downloadable_model_manifest(model_key: str) -> dict[str, Any]:
    bundle_dir = _resolve_bundle_dir(model_key)
    return _read_manifest_payload(bundle_dir, model_key)


@router.get("/download-models/{model_key}/download")
def download_model_bundle(model_key: str):
    entry = _resolve_model_entry(model_key)
    bundle_dir = Path(entry["bundle_dir"]).resolve(strict=False)
    if not bundle_dir.exists() or not bundle_dir.is_dir():
        raise HTTPException(status_code=404, detail="Local desktop ASR bundle is unavailable")

    buffer = BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for item in _iter_bundle_files(bundle_dir):
            archive.write(item, arcname=item.relative_to(bundle_dir).as_posix())
    buffer.seek(0)
    archive_name = str(entry.get("archive_name") or f"{model_key}.zip")
    headers = {"Content-Disposition": f'attachment; filename="{archive_name}"'}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)


@router.get("/download-models/{model_key}/files/{relative_path:path}")
def download_model_bundle_file(model_key: str, relative_path: str):
    bundle_dir = _resolve_bundle_dir(model_key)
    candidate = (bundle_dir / relative_path).resolve(strict=False)
    try:
        candidate.relative_to(bundle_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid bundle file path") from exc
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Bundle file does not exist")
    return FileResponse(candidate)


@router.post("/download-models/{model_key}/install")
def install_downloadable_model_bundle(model_key: str) -> dict[str, Any]:
    bundle_dir = _resolve_bundle_dir(model_key)
    if not bundle_dir.exists() or not bundle_dir.is_dir():
        raise HTTPException(status_code=404, detail="Local desktop ASR bundle is unavailable")
    runtime_model_dir = _runtime_model_dir()
    _copy_bundle(bundle_dir, runtime_model_dir)
    return _build_downloadable_model_summary(model_key)
