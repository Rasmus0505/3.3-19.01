from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import _read_frontend_build_marker, create_app


def test_learning_shell_routes_refresh_to_spa_shell():
    app = create_app(enable_lifespan=False)
    build_marker = _read_frontend_build_marker()

    with TestClient(app) as client:
        for path in ("/upload", "/stats", "/redeem", "/getting-started", "/wordbook"):
            resp = client.get(path)
            assert resp.status_code == 200
            assert "text/html" in resp.headers["content-type"].lower()
            assert "no-store" in resp.headers["cache-control"].lower()
            assert resp.headers["x-frontend-build"] == build_marker


def test_api_not_found_paths_keep_backend_404_payload():
    app = create_app(enable_lifespan=False)

    with TestClient(app) as client:
        resp = client.get("/api/does-not-exist")
        assert resp.status_code == 404
        assert resp.json() == {"detail": "Not Found"}


def test_file_like_paths_do_not_fall_back_to_spa_shell():
    app = create_app(enable_lifespan=False)

    with TestClient(app) as client:
        resp = client.get("/robots.txt")
        assert resp.status_code == 404
        assert resp.json() == {"detail": "Not Found"}
