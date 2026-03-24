from __future__ import annotations

import os
import shutil
from pathlib import Path

from app.core.config import PROJECT_DIR


_EXECUTABLE_SUFFIX = ".exe" if os.name == "nt" else ""
_LOCAL_FFMPEG_BIN_DIR = PROJECT_DIR / "tools" / "ffmpeg" / "bin"
_LOCAL_YTDLP_DIR = PROJECT_DIR / "tools" / "yt-dlp"


def _normalize_path(raw_value: str | os.PathLike[str] | None) -> Path | None:
    text = str(raw_value or "").strip()
    if not text:
        return None
    return Path(text).expanduser().resolve(strict=False)


def _candidate_executable_names(command: str) -> tuple[str, ...]:
    normalized = str(command or "").strip()
    if not normalized:
        return tuple()
    if normalized.lower().endswith(_EXECUTABLE_SUFFIX.lower()):
        return (normalized,)
    if _EXECUTABLE_SUFFIX:
        return (normalized, f"{normalized}{_EXECUTABLE_SUFFIX}")
    return (normalized,)


def _unique_paths(paths: list[Path]) -> list[Path]:
    unique: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        key = str(path).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def _ffmpeg_bin_dir_candidates() -> list[Path]:
    candidates: list[Path] = []
    env_dir = _normalize_path(os.getenv("DESKTOP_FFMPEG_BIN_DIR"))
    if env_dir:
        candidates.append(env_dir)
    candidates.append(_LOCAL_FFMPEG_BIN_DIR.resolve(strict=False))
    return _unique_paths(candidates)


def _ytdlp_file_candidates() -> list[Path]:
    candidates: list[Path] = []
    env_file = _normalize_path(os.getenv("DESKTOP_YTDLP_PATH"))
    if env_file:
        candidates.append(env_file)
    for name in _candidate_executable_names("yt-dlp"):
        candidates.append((_LOCAL_YTDLP_DIR / name).resolve(strict=False))
    return _unique_paths(candidates)


def get_ffmpeg_bin_dir() -> Path | None:
    for candidate in _ffmpeg_bin_dir_candidates():
        if candidate.exists() and candidate.is_dir():
            return candidate
    return None


def describe_command_candidates(command: str) -> list[str]:
    normalized = str(command or "").strip()
    if normalized in {"ffmpeg", "ffprobe"}:
        candidates = []
        for directory in _ffmpeg_bin_dir_candidates():
            for name in _candidate_executable_names(normalized):
                candidates.append(str((directory / name).resolve(strict=False)))
        system_match = shutil.which(normalized)
        if system_match:
            candidates.append(system_match)
        return list(dict.fromkeys(candidates))

    if normalized in {"yt-dlp", "yt_dlp"}:
        candidates = [str(path) for path in _ytdlp_file_candidates()]
        system_match = shutil.which("yt-dlp") or shutil.which("yt-dlp.exe")
        if system_match:
            candidates.append(system_match)
        return list(dict.fromkeys(candidates))

    system_match = shutil.which(normalized)
    return [system_match] if system_match else []


def resolve_command_path(command: str) -> str:
    normalized = str(command or "").strip()
    if normalized in {"ffmpeg", "ffprobe"}:
        for directory in _ffmpeg_bin_dir_candidates():
            for name in _candidate_executable_names(normalized):
                candidate = (directory / name).resolve(strict=False)
                if candidate.exists() and candidate.is_file():
                    return str(candidate)
        return normalized

    if normalized in {"yt-dlp", "yt_dlp"}:
        for candidate in _ytdlp_file_candidates():
            if candidate.exists() and candidate.is_file():
                return str(candidate)
        system_match = shutil.which("yt-dlp") or shutil.which("yt-dlp.exe")
        return system_match or "yt-dlp"

    return normalized


def resolve_ytdlp_command() -> str:
    return resolve_command_path("yt-dlp")


def get_ytdlp_command() -> str | None:
    resolved = resolve_ytdlp_command()
    found = shutil.which(resolved) if resolved == "yt-dlp" else (resolved if Path(resolved).exists() else None)
    return str(found) if found else None
