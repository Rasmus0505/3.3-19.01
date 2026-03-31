from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


FEIJI_DOWNLOAD_URL = "https://share.feijipan.com/s/1n2mH6fh"
UPLOAD_PANEL_PATH = Path(__file__).resolve().parents[2] / "frontend" / "src" / "features" / "upload" / "UploadPanel.jsx"


def _write_release_registry(tmp_path: Path) -> Path:
    payload = {
        "schemaVersion": 1,
        "channels": {
            "stable": {
                "channel": "stable",
                "version": "2.2.0",
                "releaseName": "Bottle Desktop 2.2.0",
                "publishedAt": "2026-04-01T09:00:00+08:00",
                "entryUrl": FEIJI_DOWNLOAD_URL,
                "notes": "正式桌面版本通过小飞机网盘分发。",
                "signatureRequired": True,
                "signed": True,
                "artifacts": [{"kind": "windows-installer", "url": FEIJI_DOWNLOAD_URL}],
                "configured": True,
            },
            "preview": {
                "channel": "preview",
                "version": "2.2.0-preview.1",
                "releaseName": "Bottle Desktop Preview",
                "publishedAt": "2026-03-31T18:00:00+08:00",
                "entryUrl": "https://preview.example.com/bottle.exe",
                "notes": "legacy preview record that should stay unsupported",
                "signatureRequired": False,
                "signed": False,
                "artifacts": [{"kind": "windows-installer", "url": "https://preview.example.com/bottle.exe"}],
                "configured": True,
            },
        },
    }
    release_file = tmp_path / "desktop-releases.json"
    release_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return release_file


def test_desktop_release_routes_expose_stable_only(tmp_path, monkeypatch):
    release_file = _write_release_registry(tmp_path)
    monkeypatch.setenv("DESKTOP_CLIENT_RELEASES_FILE", str(release_file))
    app = create_app(enable_lifespan=False)

    with TestClient(app) as client:
        stable = client.get("/desktop/client/channels/stable.json")
        preview = client.get("/desktop/client/channels/preview.json")
        latest = client.get("/desktop/client/latest.json")

    assert stable.status_code == 200
    assert preview.status_code == 404
    assert latest.status_code == 200

    stable_payload = stable.json()
    latest_payload = latest.json()

    assert stable_payload["channel"] == "stable"
    assert stable_payload["version"] == "2.2.0"
    assert stable_payload["entryUrl"] == FEIJI_DOWNLOAD_URL
    assert stable_payload["releaseName"] == "Bottle Desktop 2.2.0"
    assert stable_payload["signatureRequired"] is True
    assert stable_payload["metadataUrl"].endswith("/desktop/client/channels/stable.json")

    assert latest_payload["channel"] == "stable"
    assert latest_payload["latestVersion"] == "2.2.0"
    assert latest_payload["version"] == "2.2.0"
    assert latest_payload["entryUrl"] == FEIJI_DOWNLOAD_URL
    assert latest_payload["metadataUrl"].endswith("/desktop/client/latest.json")


def test_desktop_download_entry_redirects_to_feijipan(tmp_path, monkeypatch):
    release_file = _write_release_registry(tmp_path)
    monkeypatch.setenv("DESKTOP_CLIENT_RELEASES_FILE", str(release_file))
    app = create_app(enable_lifespan=False)

    with TestClient(app) as client:
        response = client.get("/download/desktop", follow_redirects=False)
        preview_response = client.get("/download/desktop?channel=preview", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == FEIJI_DOWNLOAD_URL
    assert preview_response.status_code == 404


def test_desktop_download_entry_falls_back_to_feijipan_when_registry_is_missing(monkeypatch):
    monkeypatch.delenv("DESKTOP_CLIENT_RELEASES_FILE", raising=False)
    monkeypatch.delenv("DESKTOP_CLIENT_RELEASES_JSON", raising=False)
    monkeypatch.delenv("DESKTOP_CLIENT_LATEST_VERSION", raising=False)
    monkeypatch.delenv("DESKTOP_CLIENT_ENTRY_URL", raising=False)
    monkeypatch.delenv("DESKTOP_CLIENT_PUBLIC_DOWNLOAD_URL", raising=False)
    app = create_app(enable_lifespan=False)

    with TestClient(app) as client:
        response = client.get("/download/desktop", follow_redirects=False)
        stable = client.get("/desktop/client/channels/stable.json")

    assert response.status_code == 302
    assert response.headers["location"] == FEIJI_DOWNLOAD_URL
    assert stable.status_code == 200
    assert stable.json()["entryUrl"] == FEIJI_DOWNLOAD_URL


def test_upload_panel_keeps_one_unified_desktop_entrypoint():
    source = UPLOAD_PANEL_PATH.read_text(encoding="utf-8")

    assert "VITE_DESKTOP_CLIENT_ENTRY_URL" in source
    assert '"/download/desktop"' in source
    assert "下载桌面端" in source or "获取桌面端" in source
