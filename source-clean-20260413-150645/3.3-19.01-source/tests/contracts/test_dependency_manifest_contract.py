from __future__ import annotations

import re
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_REQUIREMENTS = PROJECT_ROOT / "requirements.txt"
DEV_REQUIREMENTS = PROJECT_ROOT / "requirements-dev.txt"
README = PROJECT_ROOT / "README.md"
ENV_EXAMPLE = PROJECT_ROOT / ".env.example"
ZEABUR_TEMPLATE = PROJECT_ROOT / "zeabur-template.yaml"

_DIRECT_URL_WHEEL_RE = re.compile(r"/([^/]+?)-\d[^/]*\.whl$", re.IGNORECASE)


def _iter_requirement_lines(path: Path) -> list[str]:
    lines: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return lines


def _requirement_name(line: str) -> str | None:
    normalized = str(line or "").strip()
    if not normalized or normalized.startswith("-r "):
        return None
    match = _DIRECT_URL_WHEEL_RE.search(normalized)
    if match:
        return match.group(1).replace("_", "-").lower()
    package = re.split(r"[<>=!~\\[]", normalized, maxsplit=1)[0].strip()
    if not package:
        return None
    return package.replace("_", "-").lower()


def _requirement_names(path: Path) -> set[str]:
    names = set()
    for line in _iter_requirement_lines(path):
        package_name = _requirement_name(line)
        if package_name:
            names.add(package_name)
    return names


def test_runtime_manifest_contains_only_supported_runtime_packages():
    names = _requirement_names(RUNTIME_REQUIREMENTS)

    forbidden = {"pytest", "httpx", "funasr", "torch", "modelscope"}
    assert forbidden.isdisjoint(names)

    expected = {
        "fastapi",
        "uvicorn",
        "dashscope",
        "faster-whisper",
        "requests",
        "python-multipart",
        "sqlalchemy",
        "psycopg2-binary",
        "passlib",
        "pyjwt",
        "openai",
        "alembic",
        "spacy",
        "en-core-web-sm",
    }
    assert expected.issubset(names)


def test_dev_manifest_extends_runtime_and_restores_test_dependencies():
    dev_lines = _iter_requirement_lines(DEV_REQUIREMENTS)
    assert "-r requirements.txt" in dev_lines

    names = _requirement_names(DEV_REQUIREMENTS)
    assert {"pytest", "httpx"}.issubset(names)


def test_docs_only_describe_supported_bottle_deploy_story():
    readme_text = README.read_text(encoding="utf-8")
    assert "Bottle 1.0" in readme_text
    assert "Bottle 2.0" in readme_text
    assert "requirements-dev.txt" in readme_text
    assert "SenseVoiceSmall" not in readme_text
    assert "sensevoice-small" not in readme_text

    env_text = ENV_EXAMPLE.read_text(encoding="utf-8").lower()
    assert "lesson_default_asr_model=qwen3-asr-flash-filetrans" in env_text
    assert "sensevoice-small" not in env_text
    assert "sensevoice_model_dir" not in env_text

    template_text = ZEABUR_TEMPLATE.read_text(encoding="utf-8")
    assert "Bottle 1.0" in template_text
    assert "Bottle 2.0" in template_text
    assert "SenseVoiceSmall" not in template_text
    assert "sensevoice-small" not in template_text
