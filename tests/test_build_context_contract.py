from __future__ import annotations

import fnmatch
import shlex
from pathlib import Path, PurePosixPath


REPO_ROOT = Path(__file__).resolve().parents[1]
DOCKERIGNORE_PATH = REPO_ROOT / ".dockerignore"
DOCKERFILE_PATH = REPO_ROOT / "Dockerfile"

REQUIRED_EXCLUSIONS = {
    "asr-test/",
    "Docx/",
    "tools/",
    "tests/",
    "tmp/",
    "tmp_filetrans/",
    "frontend/tmp-admin-verify/",
    "frontend/tmp-admin-verify-2/",
    "*.db",
    "*.log",
}

REQUIRED_IGNORED_PATHS = (
    "asr-test/README.md",
    "Docx/AI分工/after.md",
    "tools/local-bottle1-runner/README.md",
    "tests/test_regression_api.py",
    "tmp_uvicorn.log",
    "app.db",
    "frontend/tmp-admin-verify/report/index.html",
)

REQUIRED_RUNTIME_INPUTS = (
    "requirements.txt",
    "alembic.ini",
    "migrations/env.py",
    "app/main.py",
    "scripts/start.sh",
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/src/main.jsx",
    "frontend/public/sounds/click.wav",
)


def _dockerignore_patterns() -> list[str]:
    return [
        line.strip()
        for line in DOCKERIGNORE_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def _matches_dockerignore(path: str, patterns: list[str]) -> bool:
    normalized_path = PurePosixPath(path).as_posix().strip("/")
    if not normalized_path:
        return False

    parts = normalized_path.split("/")
    ignored = False
    for raw_pattern in patterns:
        negated = raw_pattern.startswith("!")
        pattern = raw_pattern[1:] if negated else raw_pattern
        pattern = pattern.lstrip("./").strip()
        directory_only = pattern.endswith("/")
        pattern = pattern.rstrip("/")
        if not pattern:
            continue

        if directory_only:
            if "/" in pattern:
                matched = normalized_path == pattern or normalized_path.startswith(f"{pattern}/")
            else:
                matched = pattern in parts
        elif "/" in pattern:
            matched = fnmatch.fnmatch(normalized_path, pattern)
        else:
            matched = any(fnmatch.fnmatch(part, pattern) for part in parts)

        if matched:
            ignored = not negated

    return ignored


def _iter_local_copy_sources() -> list[str]:
    sources: list[str] = []
    for raw_line in DOCKERFILE_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line.startswith("COPY "):
            continue

        tokens = shlex.split(line)
        if any(token == "--from" or token.startswith("--from=") for token in tokens[1:]):
            continue

        copy_args = [token for token in tokens[1:] if not token.startswith("--")]
        if len(copy_args) < 2:
            raise AssertionError(f"Unexpected COPY instruction: {line}")
        sources.extend(source.rstrip("/") for source in copy_args[:-1])
    return sources


def test_dockerignore_keeps_required_high_volume_exclusions():
    patterns = set(_dockerignore_patterns())
    missing = sorted(REQUIRED_EXCLUSIONS - patterns)
    assert not missing, f"Missing required .dockerignore exclusions: {missing}"


def test_dockerignore_matches_expected_non_runtime_paths():
    patterns = _dockerignore_patterns()
    not_ignored = [path for path in REQUIRED_IGNORED_PATHS if not _matches_dockerignore(path, patterns)]
    assert not not_ignored, f"Expected non-runtime paths to be ignored: {not_ignored}"


def test_dockerignore_keeps_runtime_inputs_available():
    patterns = _dockerignore_patterns()
    ignored_inputs = [path for path in REQUIRED_RUNTIME_INPUTS if _matches_dockerignore(path, patterns)]
    assert not ignored_inputs, f"Required Docker build inputs are ignored: {ignored_inputs}"


def test_dockerfile_copy_sources_remain_available():
    patterns = _dockerignore_patterns()
    for source in _iter_local_copy_sources():
        matches = sorted(REPO_ROOT.glob(source)) if any(char in source for char in "*?[") else [REPO_ROOT / source]
        assert matches, f"Dockerfile COPY source does not exist in repo: {source}"
        for match in matches:
            relative_path = match.relative_to(REPO_ROOT).as_posix()
            assert not _matches_dockerignore(relative_path, patterns), (
                f"Dockerfile COPY source is blocked by .dockerignore: {relative_path}"
            )
