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
LOCAL_ASR_CACHE_HEADERS = {
    "Cache-Control": "public, max-age=86400",
}
_asset_lock = threading.Lock()


def _asset_media_type(asset_name: str) -> str:
    suffix = Path(asset_name).suffix.lower()
    if suffix == ".js":
        return "application/javascript; charset=utf-8"
    if suffix == ".wasm":
        return "application/wasm"
    if suffix == ".data":
        return "application/octet-stream"
    return "application/octet-stream"


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


def _ensure_asset_cache_populated() -> None:
    missing = [name for name in LOCAL_ASR_ALLOWED_FILES if not (LOCAL_ASR_CACHE_DIR / name).exists()]
    if not missing:
        return

    with _asset_lock:
        missing = [name for name in LOCAL_ASR_ALLOWED_FILES if not (LOCAL_ASR_CACHE_DIR / name).exists()]
        if not missing:
            return

        LOCAL_ASR_DOWNLOAD_ROOT.mkdir(parents=True, exist_ok=True)
        LOCAL_ASR_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        temp_dir = LOCAL_ASR_DOWNLOAD_ROOT / f"download_{uuid.uuid4().hex}"
        logger.info("[DEBUG] local_asr.assets.download_start missing=%s", ",".join(missing))
        try:
            _ensure_git_dependencies()
            _run_local_asr_cmd(["git", "lfs", "install", "--skip-repo"], timeout_seconds=120)
            _run_local_asr_cmd(["git", "clone", "--depth", "1", LOCAL_ASR_ASSET_REPO_URL, str(temp_dir)], timeout_seconds=1800)
            for name in LOCAL_ASR_ALLOWED_FILES:
                source_path = temp_dir / name
                if not source_path.exists():
                    raise RuntimeError(f"missing asset in repo: {name}")
                shutil.copy2(source_path, LOCAL_ASR_CACHE_DIR / name)
            logger.info("[DEBUG] local_asr.assets.download_done files=%s", len(LOCAL_ASR_ALLOWED_FILES))
        except Exception as exc:
            logger.exception("[DEBUG] local_asr.assets.download_failed detail=%s", str(exc)[:400])
            raise
        finally:
            if temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)


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
