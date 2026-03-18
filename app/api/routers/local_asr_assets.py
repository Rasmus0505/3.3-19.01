from __future__ import annotations

import logging
import os
import shutil
import subprocess
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.core.config import BASE_DATA_DIR, BASE_TMP_DIR


router = APIRouter(prefix="/api/local-asr-assets", tags=["local-asr-assets"])
logger = logging.getLogger(__name__)

LOCAL_ASR_ASSET_REPO_URL = (
    "https://www.modelscope.cn/studios/csukuangfj/"
    "web-assembly-vad-asr-sherpa-onnx-zh-en-jp-ko-cantonese-sense-voice.git"
)
LOCAL_ASR_ALLOWED_FILES: tuple[str, ...] = (
    "sherpa-onnx-asr.js",
    "sherpa-onnx-vad.js",
    "sherpa-onnx-wasm-main-vad-asr.js",
    "sherpa-onnx-wasm-main-vad-asr.wasm",
    "sherpa-onnx-wasm-main-vad-asr.data",
)
LOCAL_ASR_CACHE_DIR = BASE_DATA_DIR / "local_asr_assets"
LOCAL_ASR_DOWNLOAD_ROOT = BASE_TMP_DIR / "local_asr_assets"
LOCAL_ASR_CACHE_VERSION = "sensevoice-small-20260318-v1"
LOCAL_ASR_CACHE_VERSION_FILE = ".cache_version"
LOCAL_ASR_CACHE_HEADERS = {
    "Cache-Control": "public, max-age=86400",
}
_asset_lock = threading.Lock()
_prefetch_lock = threading.Lock()
_prefetch_thread: threading.Thread | None = None


def _asset_media_type(asset_name: str) -> str:
    suffix = Path(asset_name).suffix.lower()
    if suffix == ".js":
        return "application/javascript; charset=utf-8"
    if suffix == ".wasm":
        return "application/wasm"
    if suffix == ".data":
        return "application/octet-stream"
    return "application/octet-stream"


def _cache_version_path() -> Path:
    return LOCAL_ASR_CACHE_DIR / LOCAL_ASR_CACHE_VERSION_FILE


def _missing_asset_files() -> list[str]:
    return [name for name in LOCAL_ASR_ALLOWED_FILES if not (LOCAL_ASR_CACHE_DIR / name).exists()]


def _read_cache_version() -> str:
    version_path = _cache_version_path()
    if not version_path.exists():
        return ""
    try:
        return version_path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def _write_cache_version() -> None:
    _cache_version_path().write_text(LOCAL_ASR_CACHE_VERSION, encoding="utf-8")


def has_local_asr_asset_cache() -> bool:
    return not _missing_asset_files()


def is_local_asr_asset_cache_current() -> bool:
    return has_local_asr_asset_cache() and _read_cache_version() == LOCAL_ASR_CACHE_VERSION


def local_asr_asset_prefetch_needed() -> bool:
    return not has_local_asr_asset_cache() or not is_local_asr_asset_cache_current()


def _run_local_asr_cmd(
    cmd: list[str],
    *,
    cwd: Path | None = None,
    timeout_seconds: int = 1800,
    extra_env: dict[str, str] | None = None,
) -> None:
    env = os.environ.copy()
    env["GIT_LFS_SKIP_SMUDGE"] = "0"
    if extra_env:
        env.update({str(key): str(value) for key, value in extra_env.items()})
    proc = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        env=env,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()[:1200]
        raise RuntimeError(detail or f"command failed: {' '.join(cmd)}")


def _command_available(name: str) -> bool:
    return shutil.which(name) is not None


def _git_lfs_ready() -> bool:
    if not _command_available("git"):
        return False
    proc = subprocess.run(
        ["git", "lfs", "version"],
        capture_output=True,
        text=True,
        timeout=60,
        env=os.environ.copy(),
    )
    return proc.returncode == 0


def _ensure_git_dependencies() -> None:
    if _command_available("git") and _git_lfs_ready():
        return

    if not _command_available("apt-get"):
        raise RuntimeError("git missing and apt-get unavailable")
    if hasattr(os, "geteuid") and os.geteuid() != 0:
        raise RuntimeError("git missing and runtime user is not root")

    logger.warning("[DEBUG] local_asr.assets.install_git start")
    install_env = {
        "DEBIAN_FRONTEND": "noninteractive",
    }
    _run_local_asr_cmd(["apt-get", "update"], timeout_seconds=900, extra_env=install_env)
    _run_local_asr_cmd(
        ["apt-get", "install", "-y", "--no-install-recommends", "git", "git-lfs"],
        timeout_seconds=1800,
        extra_env=install_env,
    )
    _run_local_asr_cmd(["git", "lfs", "install", "--skip-repo"], timeout_seconds=120)

    if not _command_available("git") or not _git_lfs_ready():
        raise RuntimeError("git/git-lfs installation finished but commands are still unavailable")
    logger.warning("[DEBUG] local_asr.assets.install_git done")


def _download_asset_cache(*, force_refresh: bool = False) -> None:
    with _asset_lock:
        missing = _missing_asset_files()
        current = is_local_asr_asset_cache_current()
        if not force_refresh and not missing:
            return
        if force_refresh and not missing and current:
            return

        LOCAL_ASR_DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)
        LOCAL_ASR_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        temp_dir = LOCAL_ASR_DOWNLOAD_ROOT / f"download_{uuid.uuid4().hex}"
        logger.info(
            "[DEBUG] local_asr.assets.download_start missing=%s force_refresh=%s current=%s",
            ",".join(missing),
            force_refresh,
            current,
        )
        try:
            _ensure_git_dependencies()
            _run_local_asr_cmd(["git", "lfs", "install", "--skip-repo"], timeout_seconds=120)
            _run_local_asr_cmd(["git", "clone", "--depth", "1", LOCAL_ASR_ASSET_REPO_URL, str(temp_dir)], timeout_seconds=1800)
            for name in LOCAL_ASR_ALLOWED_FILES:
                source_path = temp_dir / name
                if not source_path.exists():
                    raise RuntimeError(f"missing asset in repo: {name}")
                shutil.copy2(source_path, LOCAL_ASR_CACHE_DIR / name)
            _write_cache_version()
            logger.info("[DEBUG] local_asr.assets.download_done files=%s", len(LOCAL_ASR_ALLOWED_FILES))
        except Exception as exc:
            logger.exception("[DEBUG] local_asr.assets.download_failed detail=%s", str(exc)[:400])
            raise
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)


def _ensure_asset_cache_populated() -> None:
    if has_local_asr_asset_cache():
        return
    _download_asset_cache(force_refresh=False)


def _prefetch_local_asr_assets() -> None:
    try:
        if not local_asr_asset_prefetch_needed():
            logger.info("[DEBUG] local_asr.assets.prefetch_skip reason=cache_ready")
            return
        logger.info(
            "[DEBUG] local_asr.assets.prefetch_start has_cache=%s current=%s",
            has_local_asr_asset_cache(),
            is_local_asr_asset_cache_current(),
        )
        _download_asset_cache(force_refresh=True)
        logger.info("[DEBUG] local_asr.assets.prefetch_done current=%s", is_local_asr_asset_cache_current())
    except Exception as exc:
        logger.exception("[DEBUG] local_asr.assets.prefetch_failed detail=%s", str(exc)[:400])
    finally:
        global _prefetch_thread
        with _prefetch_lock:
            _prefetch_thread = None


def schedule_local_asr_asset_prefetch() -> bool:
    global _prefetch_thread
    if not local_asr_asset_prefetch_needed():
        return False
    with _prefetch_lock:
        if _prefetch_thread and _prefetch_thread.is_alive():
            return False
        _prefetch_thread = threading.Thread(target=_prefetch_local_asr_assets, name="local-asr-prefetch", daemon=True)
        _prefetch_thread.start()
        return True


@router.get("/status")
def get_local_asr_asset_status():
    missing_files = _missing_asset_files()
    return {
        "ok": True,
        "model_key": "local-sensevoice-small",
        "cache_version": LOCAL_ASR_CACHE_VERSION,
        "allowed_files": list(LOCAL_ASR_ALLOWED_FILES),
        "cache_dir": str(LOCAL_ASR_CACHE_DIR),
        "cached": not missing_files,
        "current": is_local_asr_asset_cache_current(),
        "missing_files": missing_files,
    }


@router.get("/{asset_name}")
def get_local_asr_asset(asset_name: str):
    if asset_name not in LOCAL_ASR_ALLOWED_FILES:
        raise HTTPException(status_code=404, detail="Asset not found")
    try:
        _ensure_asset_cache_populated()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LOCAL_ASR_ASSET_FETCH_FAILED: {str(exc)[:1200]}") from exc

    asset_path = LOCAL_ASR_CACHE_DIR / asset_name
    if not asset_path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")

    return FileResponse(path=asset_path, media_type=_asset_media_type(asset_name), filename=asset_name, headers=LOCAL_ASR_CACHE_HEADERS)
