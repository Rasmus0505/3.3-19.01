from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def _write_release_registry(tmp_path: Path) -> Path:
    payload = {
        "schemaVersion": 1,
        "channels": {
            "stable": {
                "channel": "stable",
                "version": "2.2.0",
                "releaseName": "Bottle Desktop 2.2.0",
                "publishedAt": "2026-03-31T20:00:00+08:00",
                "entryUrl": "https://bottle.example.com/downloads/Bottle-2.2.0.exe",
                "notes": "正式桌面发布，提供官方安装包与统一下载入口。",
                "signatureRequired": True,
                "signed": True,
                "artifacts": [{"kind": "windows-installer", "url": "https://bottle.example.com/downloads/Bottle-2.2.0.exe"}],
                "configured": True,
            },
            "preview": {
                "channel": "preview",
                "version": "2.2.0-preview.1",
                "releaseName": "Bottle Desktop 2.2.0 Preview 1",
                "publishedAt": "2026-03-31T18:00:00+08:00",
                "entryUrl": "https://bottle.example.com/downloads/Bottle-2.2.0-preview.1.exe",
                "notes": "内部测试渠道。",
                "signatureRequired": False,
                "signed": False,
                "artifacts": [{"kind": "windows-installer", "url": "https://bottle.example.com/downloads/Bottle-2.2.0-preview.1.exe"}],
                "configured": True,
            },
        },
    }
    release_file = tmp_path / "desktop-releases.json"
    release_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return release_file


def test_desktop_release_channel_routes_expose_stable_and_preview(tmp_path, monkeypatch):
    release_file = _write_release_registry(tmp_path)
    monkeypatch.setenv("DESKTOP_CLIENT_RELEASES_FILE", str(release_file))
    app = create_app(enable_lifespan=False)

    with TestClient(app) as client:
        stable = client.get("/desktop/client/channels/stable.json")
        preview = client.get("/desktop/client/channels/preview.json")
        legacy = client.get("/desktop/client/latest.json")

    assert stable.status_code == 200
    assert preview.status_code == 200
    assert legacy.status_code == 200

    stable_payload = stable.json()
    preview_payload = preview.json()
    legacy_payload = legacy.json()

    assert stable_payload["channel"] == "stable"
    assert stable_payload["version"] == "2.2.0"
    assert stable_payload["entryUrl"] == "https://bottle.example.com/downloads/Bottle-2.2.0.exe"
    assert stable_payload["releaseName"] == "Bottle Desktop 2.2.0"
    assert stable_payload["signatureRequired"] is True

    assert preview_payload["channel"] == "preview"
    assert preview_payload["version"] == "2.2.0-preview.1"
    assert preview_payload["signatureRequired"] is False

    assert legacy_payload["channel"] == "stable"
    assert legacy_payload["latestVersion"] == "2.2.0"
    assert legacy_payload["version"] == "2.2.0"


def test_desktop_download_page_renders_official_release_surface(tmp_path, monkeypatch):
    release_file = _write_release_registry(tmp_path)
    monkeypatch.setenv("DESKTOP_CLIENT_RELEASES_FILE", str(release_file))
    app = create_app(enable_lifespan=False)

    with TestClient(app) as client:
        response = client.get("/download/desktop")

    assert response.status_code == 200
    assert "Bottle Desktop 官方下载" in response.text
    assert "Stable 安装包" in response.text
    assert "Preview 安装包" in response.text
    assert "/desktop/client/latest.json" in response.text
    assert "默认用户渠道" in response.text
    assert "内部测试渠道" in response.text


def test_desktop_download_page_falls_back_to_explicit_not_configured_message(monkeypatch):
    monkeypatch.delenv("DESKTOP_CLIENT_RELEASES_FILE", raising=False)
    monkeypatch.delenv("DESKTOP_CLIENT_RELEASES_JSON", raising=False)
    monkeypatch.delenv("DESKTOP_CLIENT_LATEST_VERSION", raising=False)
    monkeypatch.delenv("DESKTOP_CLIENT_ENTRY_URL", raising=False)
    app = create_app(enable_lifespan=False)

    with TestClient(app) as client:
        response = client.get("/download/desktop")

    assert response.status_code == 200
    assert "尚未配置正式桌面发布信息" in response.text
    assert "Bottle Desktop 官方下载" in response.text
