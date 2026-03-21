from __future__ import annotations

import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.core.config import ASR_BUNDLE_ROOT_DIR, BASE_TMP_DIR, FASTER_WHISPER_MODEL_DIR, SENSEVOICE_MODEL_DIR


router = APIRouter(prefix="/api/local-asr-assets", tags=["local-asr-assets"])

LEGACY_LOCAL_ASR_CACHE_VERSION = "sensevoice-small-legacy-disabled"
LEGACY_LOCAL_ASR_ALLOWED_FILES: tuple[str, ...] = (
    "sherpa-onnx-asr.js",
    "sherpa-onnx-vad.js",
    "sherpa-onnx-wasm-main-vad-asr.js",
    "sherpa-onnx-wasm-main-vad-asr.wasm",
    "sherpa-onnx-wasm-main-vad-asr.data",
)
DOWNLOADABLE_MODELS: dict[str, dict[str, object]] = {
    "sensevoice-small": {
        "model_key": "sensevoice-small",
        "display_name": "bottle0.1",
        "subtitle": "快速识别字幕",
        "source_model_id": "iic/SenseVoiceSmall",
        "bundle_dir": SENSEVOICE_MODEL_DIR,
        "archive_name": "bottle0.1.zip",
    },
    "faster-whisper-medium": {
        "model_key": "faster-whisper-medium",
        "display_name": "bottle.1.0",
        "subtitle": "识别字幕更精准/耗时加长",
        "source_model_id": "Systran/faster-distil-whisper-small.en",
        "bundle_dir": FASTER_WHISPER_MODEL_DIR,
        "archive_name": "bottle.1.0.zip",
    },
}
DOWNLOAD_BUILD_ROOT = BASE_TMP_DIR / "downloadable_asr_models"


def _legacy_status_payload() -> dict[str, object]:
    return {
        "ok": True,
        "model_key": "local-sensevoice-small",
        "cache_version": LEGACY_LOCAL_ASR_CACHE_VERSION,
        "allowed_files": list(LEGACY_LOCAL_ASR_ALLOWED_FILES),
        "cache_dir": str(BASE_TMP_DIR / "local_asr_assets_disabled"),
        "cached": False,
        "current": False,
        "missing_files": list(LEGACY_LOCAL_ASR_ALLOWED_FILES),
    }


def schedule_local_asr_asset_prefetch() -> bool:
    return False


def _bundle_spec(model_key: str) -> dict[str, object]:
    spec = DOWNLOADABLE_MODELS.get(str(model_key or "").strip())
    if spec is None:
        raise HTTPException(status_code=404, detail="Model bundle not found")
    return spec


def _bundle_dir(spec: dict[str, object]) -> Path:
    return Path(str(spec["bundle_dir"]))


def _bundle_files(bundle_dir: Path) -> list[dict[str, object]]:
    if not bundle_dir.exists() or not bundle_dir.is_dir():
        return []
    files: list[dict[str, object]] = []
    for path in sorted(bundle_dir.rglob("*")):
        if not path.is_file():
            continue
        files.append(
            {
                "name": str(path.relative_to(bundle_dir)).replace("\\", "/"),
                "size_bytes": int(path.stat().st_size),
            }
        )
    return files


def _bundle_missing_reason(bundle_dir: Path, files: list[dict[str, object]]) -> str:
    if not bundle_dir.exists():
        return "bundle directory does not exist"
    if not bundle_dir.is_dir():
        return "bundle path is not a directory"
    if not files:
        return "bundle directory is empty"
    return ""


def _bundle_summary(spec: dict[str, object]) -> dict[str, object]:
    bundle_dir = _bundle_dir(spec)
    files = _bundle_files(bundle_dir)
    total_size_bytes = sum(int(item["size_bytes"]) for item in files)
    model_key = str(spec["model_key"])
    missing_reason = _bundle_missing_reason(bundle_dir, files)
    return {
        "model_key": model_key,
        "display_name": str(spec["display_name"]),
        "subtitle": str(spec["subtitle"]),
        "source_model_id": str(spec["source_model_id"]),
        "bundle_dir": str(bundle_dir),
        "archive_name": str(spec["archive_name"]),
        "directory_exists": bundle_dir.exists(),
        "directory_is_dir": bundle_dir.is_dir(),
        "available": bool(files),
        "missing_reason": missing_reason,
        "file_count": len(files),
        "total_size_bytes": total_size_bytes,
        "download_url": f"/api/local-asr-assets/download-models/{model_key}/download",
        "files": files,
    }


def _build_bundle_zip(spec: dict[str, object]) -> Path:
    bundle_dir = _bundle_dir(spec)
    files = _bundle_files(bundle_dir)
    if not files:
        missing_reason = _bundle_missing_reason(bundle_dir, files)
        raise HTTPException(status_code=404, detail=f"Model bundle missing: {bundle_dir} ({missing_reason})")

    DOWNLOAD_BUILD_ROOT.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="asr_bundle_", dir=str(DOWNLOAD_BUILD_ROOT)))
    archive_path = temp_dir / str(spec["archive_name"])
    with zipfile.ZipFile(archive_path, mode="w", compression=zipfile.ZIP_STORED) as archive:
        for item in files:
            relative_name = str(item["name"])
            source_path = bundle_dir / relative_name
            archive.write(source_path, arcname=f"{bundle_dir.name}/{relative_name}")
    return archive_path


@router.get("/status")
def get_local_asr_asset_status():
    return _legacy_status_payload()


@router.get("/download-models")
def list_downloadable_model_bundles():
    return {
        "ok": True,
        "bundle_root_dir": str(ASR_BUNDLE_ROOT_DIR),
        "models": [_bundle_summary(spec) for spec in DOWNLOADABLE_MODELS.values()],
    }


def get_downloadable_model_bundle_summaries() -> list[dict[str, object]]:
    return [_bundle_summary(spec) for spec in DOWNLOADABLE_MODELS.values()]


@router.get("/download-models/{model_key}")
def get_downloadable_model_bundle(model_key: str):
    return {"ok": True, **_bundle_summary(_bundle_spec(model_key))}


@router.get("/download-models/{model_key}/download")
def download_model_bundle(model_key: str):
    spec = _bundle_spec(model_key)
    archive_path = _build_bundle_zip(spec)
    cleanup_dir = archive_path.parent
    return FileResponse(
        path=archive_path,
        media_type="application/zip",
        filename=str(spec["archive_name"]),
        background=BackgroundTask(lambda: shutil.rmtree(cleanup_dir, ignore_errors=True)),
    )


@router.get("/download-models/{model_key}/files/{file_path:path}")
def download_model_bundle_file(model_key: str, file_path: str):
    spec = _bundle_spec(model_key)
    bundle_dir = _bundle_dir(spec)
    normalized_parts = [part for part in Path(str(file_path)).parts if part not in {"", ".", ".."}]
    candidate = (bundle_dir.joinpath(*normalized_parts)).resolve()
    try:
        candidate.relative_to(bundle_dir.resolve())
    except Exception as exc:  # pragma: no cover - defensive path traversal guard
        raise HTTPException(status_code=400, detail="Invalid file path") from exc
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Model file not found")
    return FileResponse(path=candidate, filename=candidate.name)


@router.get("/{asset_name}")
def get_local_asr_asset(asset_name: str):
    _ = asset_name
    raise HTTPException(status_code=404, detail="Browser-local ASR assets are disabled")
