from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile
from hashlib import sha256
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.core.config import ASR_BUNDLE_ROOT_DIR, BASE_TMP_DIR, FASTER_WHISPER_MODEL_DIR


router = APIRouter(prefix="/api/local-asr-assets", tags=["local-asr-assets"])

LEGACY_LOCAL_ASR_CACHE_VERSION = "browser-local-asr-disabled"
LEGACY_LOCAL_ASR_ALLOWED_FILES: tuple[str, ...] = ()
DOWNLOADABLE_MODELS: dict[str, dict[str, object]] = {
    "faster-whisper-medium": {
        "model_key": "faster-whisper-medium",
        "display_name": "Bottle 1.0",
        "subtitle": "Higher accuracy, slower than Bottle 2.0.",
        "source_model_id": "Systran/faster-distil-whisper-small.en",
        "bundle_dir": FASTER_WHISPER_MODEL_DIR,
        "archive_name": "Bottle-1.0.zip",
    },
}
ACTIVE_DOWNLOADABLE_MODEL_KEYS: tuple[str, ...] = ("faster-whisper-medium",)
DOWNLOAD_BUILD_ROOT = BASE_TMP_DIR / "downloadable_asr_models"
MODEL_VERSION_FILE_NAME = ".model-version.json"


def _sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _read_model_version_payload(bundle_dir: Path) -> dict[str, object]:
    version_path = bundle_dir / MODEL_VERSION_FILE_NAME
    if not version_path.exists() or not version_path.is_file():
        return {}
    try:
        payload = json.loads(version_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _resolve_model_version(spec: dict[str, object], bundle_dir: Path, files: list[dict[str, object]]) -> str:
    payload = _read_model_version_payload(bundle_dir)
    explicit_version = str(payload.get("model_version") or "").strip()
    if explicit_version:
        return explicit_version
    latest_mtime_ns = 0
    for item in files:
        candidate = bundle_dir / str(item["name"])
        try:
            latest_mtime_ns = max(latest_mtime_ns, int(candidate.stat().st_mtime_ns))
        except Exception:
            continue
    model_id = str(spec.get("source_model_id") or spec.get("model_key") or "unknown-model").strip() or "unknown-model"
    if latest_mtime_ns <= 0:
        return f"{model_id}-unversioned"
    return f"{model_id}-{latest_mtime_ns}"


def _build_model_manifest(spec: dict[str, object], bundle_dir: Path, files: list[dict[str, object]] | None = None) -> dict[str, object]:
    manifest_files = list(files) if files is not None else _bundle_files(bundle_dir)
    return {
        "model_key": str(spec["model_key"]),
        "model_version": _resolve_model_version(spec, bundle_dir, manifest_files),
        "bundle_dir": str(bundle_dir),
        "file_count": len(manifest_files),
        "total_size_bytes": sum(int(item["size_bytes"]) for item in manifest_files),
        "files": manifest_files,
    }


def _write_model_version_file(spec: dict[str, object], bundle_dir: Path, files: list[dict[str, object]] | None = None) -> dict[str, object]:
    manifest = _build_model_manifest(spec, bundle_dir, files)
    version_path = bundle_dir / MODEL_VERSION_FILE_NAME
    version_path.parent.mkdir(parents=True, exist_ok=True)
    version_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def _legacy_status_payload() -> dict[str, object]:
    return {
        "ok": True,
        "model_key": "",
        "cache_version": LEGACY_LOCAL_ASR_CACHE_VERSION,
        "allowed_files": list(LEGACY_LOCAL_ASR_ALLOWED_FILES),
        "cache_dir": str(BASE_TMP_DIR / "local_asr_assets_disabled"),
        "cached": False,
        "current": False,
        "missing_files": [],
    }


def schedule_local_asr_asset_prefetch() -> bool:
    return False


def _bundle_spec(model_key: str) -> dict[str, object]:
    normalized_model_key = str(model_key or "").strip()
    if normalized_model_key not in ACTIVE_DOWNLOADABLE_MODEL_KEYS:
        raise HTTPException(status_code=404, detail="Model bundle not found")
    spec = DOWNLOADABLE_MODELS.get(normalized_model_key)
    if spec is None:
        raise HTTPException(status_code=404, detail="Model bundle not found")
    return spec


def _bundle_dir(spec: dict[str, object]) -> Path:
    return Path(str(spec["bundle_dir"]))


def _source_bundle_dir() -> Path:
    configured = os.getenv("DESKTOP_PREINSTALLED_MODEL_DIR", "").strip() or os.getenv("DESKTOP_BUNDLED_MODEL_DIR", "").strip()
    if configured:
        return Path(configured)
    return Path("__desktop_bundled_model_missing__")


def _desktop_install_state() -> dict[str, object]:
    state_path = Path(os.getenv("DESKTOP_INSTALL_STATE_PATH", "").strip())
    if not str(state_path).strip() or not state_path.exists() or not state_path.is_file():
        return {}
    try:
        payload = json.loads(state_path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _bundle_files(bundle_dir: Path) -> list[dict[str, object]]:
    if not bundle_dir.exists() or not bundle_dir.is_dir():
        return []
    files: list[dict[str, object]] = []
    for path in sorted(bundle_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.name == MODEL_VERSION_FILE_NAME:
            continue
        files.append(
            {
                "name": str(path.relative_to(bundle_dir)).replace("\\", "/"),
                "size_bytes": int(path.stat().st_size),
                "sha256": _sha256_file(path),
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
    source_bundle_dir = _source_bundle_dir()
    source_files = _bundle_files(source_bundle_dir)
    install_state = _desktop_install_state()
    model_key = str(spec["model_key"])
    manifest = _build_model_manifest(spec, bundle_dir, files)
    missing_reason = _bundle_missing_reason(bundle_dir, files)
    source_missing_reason = _bundle_missing_reason(source_bundle_dir, source_files)
    install_selected = install_state.get("bottle1Preinstalled")
    runtime_source = "installer_bundle" if bundle_dir.resolve() == source_bundle_dir.resolve() else "user_data"
    return {
        "model_key": model_key,
        "display_name": str(spec["display_name"]),
        "subtitle": str(spec["subtitle"]),
        "source_model_id": str(spec["source_model_id"]),
        "bundle_dir": str(bundle_dir),
        "archive_name": str(spec["archive_name"]),
        "model_version": str(manifest["model_version"]),
        "directory_exists": bundle_dir.exists(),
        "directory_is_dir": bundle_dir.is_dir(),
        "available": bool(files),
        "missing_reason": missing_reason,
        "source_bundle_dir": str(source_bundle_dir),
        "source_available": bool(source_files),
        "source_missing_reason": source_missing_reason,
        "install_available": bool(source_files),
        "install_selected": install_selected if isinstance(install_selected, bool) else None,
        "install_choice": str(install_state.get("bottle1InstallChoice") or "").strip() or None,
        "preinstalled": bool(files) and runtime_source == "installer_bundle",
        "runtime_source": runtime_source,
        "file_count": int(manifest["file_count"]),
        "total_size_bytes": int(manifest["total_size_bytes"]),
        "download_url": f"/api/local-asr-assets/download-models/{model_key}/download",
        "files": files,
    }


def _bundle_manifest(spec: dict[str, object]) -> dict[str, object]:
    summary = _bundle_summary(spec)
    return {
        "ok": True,
        **_build_model_manifest(spec, _bundle_dir(spec), list(summary["files"])),
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
    manifest_payload = _build_model_manifest(spec, bundle_dir, files)
    with zipfile.ZipFile(archive_path, mode="w", compression=zipfile.ZIP_STORED) as archive:
        for item in files:
            relative_name = str(item["name"])
            source_path = bundle_dir / relative_name
            archive.write(source_path, arcname=f"{bundle_dir.name}/{relative_name}")
        archive.writestr(
            f"{bundle_dir.name}/{MODEL_VERSION_FILE_NAME}",
            json.dumps(manifest_payload, ensure_ascii=False, indent=2) + "\n",
        )
    return archive_path


def _install_bundle_from_source(spec: dict[str, object]) -> dict[str, object]:
    source_bundle_dir = _source_bundle_dir()
    source_files = _bundle_files(source_bundle_dir)
    if not source_files:
        source_missing_reason = _bundle_missing_reason(source_bundle_dir, source_files)
        raise HTTPException(status_code=404, detail=f"Bundled model source missing: {source_bundle_dir} ({source_missing_reason})")

    target_bundle_dir = _bundle_dir(spec)
    if target_bundle_dir.resolve() == source_bundle_dir.resolve():
        return _bundle_summary(spec)
    target_bundle_dir.parent.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(target_bundle_dir, ignore_errors=True)
    shutil.copytree(source_bundle_dir, target_bundle_dir)
    _write_model_version_file(spec, target_bundle_dir)
    return _bundle_summary(spec)


@router.get("/status")
def get_local_asr_asset_status():
    try:
        summaries = get_downloadable_model_bundle_summaries()
        if summaries:
            first = summaries[0]
            return {
                "ok": True,
                "model_key": str(first.get("model_key", "")),
                "cache_version": str(first.get("model_version", "")),
                "allowed_files": [f["name"] for f in first.get("files", [])],
                "cache_dir": str(first.get("bundle_dir", "")),
                "cached": bool(first.get("available", False)),
                "current": bool(first.get("available", False)),
                "missing_files": [],
            }
    except Exception:
        pass
    return _legacy_status_payload()


@router.get("/download-models")
def list_downloadable_model_bundles():
    return {
        "ok": True,
        "bundle_root_dir": str(ASR_BUNDLE_ROOT_DIR),
        "models": [_bundle_summary(_bundle_spec(model_key)) for model_key in ACTIVE_DOWNLOADABLE_MODEL_KEYS],
    }


def get_downloadable_model_bundle_summaries() -> list[dict[str, object]]:
    return [_bundle_summary(_bundle_spec(model_key)) for model_key in ACTIVE_DOWNLOADABLE_MODEL_KEYS]


@router.get("/download-models/{model_key}")
def get_downloadable_model_bundle(model_key: str):
    return {"ok": True, **_bundle_summary(_bundle_spec(model_key))}


@router.get("/download-models/{model_key}/manifest")
def get_downloadable_model_bundle_manifest(model_key: str):
    return _bundle_manifest(_bundle_spec(model_key))


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


@router.post("/download-models/{model_key}/install")
def install_downloadable_model_bundle(model_key: str):
    spec = _bundle_spec(model_key)
    summary = _install_bundle_from_source(spec)
    return {
        "ok": True,
        "installed": True,
        **summary,
    }


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
