from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.api.routers import local_whisper_assets as local_whisper_assets_router
from app.main import create_app


def _apply_test_whisper_spec(monkeypatch, tmp_path: Path) -> dict[str, dict[str, object]]:
    spec = {
        "whisper-base": {
            "repo_id": "openai/whisper-base",
            "revision": "main",
            "cache_version": "test-whisper-base-v1",
            "files": ("config.json", "model.safetensors"),
        },
        "whisper-small": {
            "repo_id": "openai/whisper-small",
            "revision": "main",
            "cache_version": "test-whisper-small-v1",
            "files": ("config.json", "model.safetensors"),
        },
    }
    monkeypatch.setattr(local_whisper_assets_router, "WHISPER_MODEL_SPECS", spec)
    monkeypatch.setattr(local_whisper_assets_router, "WHISPER_MIRROR_MODELS", ("whisper-base", "whisper-small"))
    monkeypatch.setattr(local_whisper_assets_router, "WHISPER_PREFETCH_ON_START", True)
    monkeypatch.setattr(local_whisper_assets_router, "WHISPER_MIRROR_ROOT", tmp_path / "local_whisper_assets")
    local_whisper_assets_router._model_locks.clear()
    local_whisper_assets_router._prefetching_models.clear()
    local_whisper_assets_router._prefetch_errors.clear()
    monkeypatch.setattr(local_whisper_assets_router, "_prefetch_thread", None)
    return spec


def test_local_whisper_status_route_reports_ready_model(monkeypatch, tmp_path):
    spec = _apply_test_whisper_spec(monkeypatch, tmp_path)
    cache_dir = tmp_path / "local_whisper_assets" / "whisper-base"
    cache_dir.mkdir(parents=True, exist_ok=True)
    for asset_name in spec["whisper-base"]["files"]:
        (cache_dir / str(asset_name)).write_text(f"asset:{asset_name}", encoding="utf-8")
    (cache_dir / local_whisper_assets_router.WHISPER_CACHE_VERSION_FILE).write_text(
        str(spec["whisper-base"]["cache_version"]),
        encoding="utf-8",
    )

    app = create_app(enable_lifespan=False)
    with TestClient(app) as client:
        resp = client.get("/api/local-whisper-assets/status")

    assert resp.status_code == 200
    payload = resp.json()
    assert payload["cache_root"] == str(tmp_path / "local_whisper_assets")
    assert payload["enabled_models"] == ["whisper-base", "whisper-small"]
    ready_entry = next(item for item in payload["models"] if item["model_key"] == "whisper-base")
    assert ready_entry["current"] is True
    assert ready_entry["status"] == "ready"
    missing_entry = next(item for item in payload["models"] if item["model_key"] == "whisper-small")
    assert missing_entry["current"] is False
    assert missing_entry["status"] == "missing"


def test_local_whisper_asset_route_serves_cached_asset(monkeypatch, tmp_path):
    _apply_test_whisper_spec(monkeypatch, tmp_path)
    cache_dir = tmp_path / "local_whisper_assets" / "whisper-base"
    cache_dir.mkdir(parents=True, exist_ok=True)
    asset_path = cache_dir / "config.json"
    asset_path.write_text('{"model":"whisper-base"}', encoding="utf-8")
    monkeypatch.setattr(local_whisper_assets_router, "_ensure_model_cache_populated", lambda _model_key: None)

    app = create_app(enable_lifespan=False)
    with TestClient(app) as client:
        resp = client.get("/api/local-whisper-assets/whisper-base/config.json")

    assert resp.status_code == 200
    assert resp.json()["model"] == "whisper-base"
    assert resp.headers["content-type"].startswith("application/json")


def test_local_whisper_asset_route_rejects_non_whitelisted_asset(monkeypatch, tmp_path):
    _apply_test_whisper_spec(monkeypatch, tmp_path)
    app = create_app(enable_lifespan=False)

    with TestClient(app) as client:
        resp = client.get("/api/local-whisper-assets/whisper-base/../../secret.txt")

    assert resp.status_code == 404


def test_local_whisper_asset_download_caches_files_and_writes_version(monkeypatch, tmp_path):
    spec = _apply_test_whisper_spec(monkeypatch, tmp_path)
    calls: list[str] = []

    class FakeResponse:
        def __init__(self, url: str):
            self.url = url

        def raise_for_status(self) -> None:
            return None

        def iter_content(self, chunk_size: int = 0):
            assert chunk_size > 0
            asset_name = self.url.split("/resolve/main/", 1)[1].split("?", 1)[0]
            yield f"payload:{asset_name}".encode("utf-8")

        def close(self) -> None:
            return None

    def fake_get(url: str, *, stream: bool, timeout):
        assert stream is True
        assert timeout == (20, 600)
        calls.append(url)
        return FakeResponse(url)

    monkeypatch.setattr(local_whisper_assets_router.requests, "get", fake_get)

    local_whisper_assets_router._download_model_cache("whisper-base", force_refresh=True)

    cache_dir = tmp_path / "local_whisper_assets" / "whisper-base"
    for asset_name in spec["whisper-base"]["files"]:
        assert (cache_dir / str(asset_name)).read_text(encoding="utf-8") == f"payload:{asset_name}"
    assert (cache_dir / local_whisper_assets_router.WHISPER_CACHE_VERSION_FILE).read_text(encoding="utf-8").strip() == "test-whisper-base-v1"
    assert calls == [
        "https://huggingface.co/openai/whisper-base/resolve/main/config.json?download=true",
        "https://huggingface.co/openai/whisper-base/resolve/main/model.safetensors?download=true",
    ]


def test_startup_schedules_local_whisper_prefetch(monkeypatch, tmp_path):
    from app import main as app_main

    tmp_base = tmp_path / "startup"
    whisper_prefetch_called = {"count": 0}

    monkeypatch.setattr(app_main, "BASE_TMP_DIR", tmp_base)
    monkeypatch.setattr(app_main, "BASE_DATA_DIR", tmp_base / "data")
    monkeypatch.setattr(app_main, "DASHSCOPE_API_KEY", "")
    monkeypatch.setattr(app_main, "_refresh_optional_runtime_status", lambda _app: None)
    monkeypatch.setattr(app_main.local_asr_assets, "schedule_local_asr_asset_prefetch", lambda: False)
    monkeypatch.setattr(
        app_main.local_whisper_assets,
        "schedule_local_whisper_asset_prefetch",
        lambda: whisper_prefetch_called.__setitem__("count", whisper_prefetch_called["count"] + 1) or True,
    )

    async def fake_bootstrap(app):
        runtime_status = app_main._ensure_runtime_status(app)
        runtime_status.db_ready = True
        runtime_status.checked_at = "2026-03-18T00:00:00+00:00"

    monkeypatch.setattr(app_main, "_bootstrap_runtime_state", fake_bootstrap)

    app = app_main.create_app(enable_lifespan=True)
    with TestClient(app) as client:
        resp = client.get("/health")

    assert resp.status_code == 200
    assert resp.json()["ready"] is True
    assert whisper_prefetch_called["count"] == 1
