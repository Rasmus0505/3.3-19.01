from __future__ import annotations

import json
import shutil
import subprocess
import textwrap
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
RUNTIME_CONFIG_MODULE = (REPO_ROOT / "desktop-client" / "electron" / "runtime-config.mjs").resolve().as_uri()
HELPER_RUNTIME_MODULE = (REPO_ROOT / "desktop-client" / "electron" / "helper-runtime.mjs").resolve().as_uri()


def _run_node_json(script: str) -> dict:
    node_bin = shutil.which("node")
    if not node_bin:
        raise AssertionError("node is required for desktop runtime contract tests")
    result = subprocess.run(
        [node_bin, "--input-type=module", "-e", script],
        cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=30,
        check=True,
    )
    return json.loads(result.stdout)


def test_runtime_config_persists_cloud_targets_and_local_paths(tmp_path):
    config_path = tmp_path / "desktop-runtime.json"
    user_data_dir = tmp_path / "user-data"
    cache_dir = tmp_path / "cache"
    log_dir = tmp_path / "logs"
    temp_dir = tmp_path / "tmp"
    model_dir = tmp_path / "models" / "faster-distil-small.en"

    script = textwrap.dedent(
        f"""
        import {{ resolveDesktopRuntimeConfig }} from {json.dumps(RUNTIME_CONFIG_MODULE)};
        const config = resolveDesktopRuntimeConfig({{
          configPath: {json.dumps(str(config_path))},
          userDataDir: {json.dumps(str(user_data_dir))},
          cacheDir: {json.dumps(str(cache_dir))},
          logDir: {json.dumps(str(log_dir))},
          tempDir: {json.dumps(str(temp_dir))},
          env: {{
            DESKTOP_CLOUD_APP_URL: "https://preview.example.com/app",
            DESKTOP_CLOUD_API_BASE_URL: "https://preview.example.com",
            DESKTOP_MODEL_DIR: {json.dumps(str(model_dir))},
          }},
        }});
        console.log(JSON.stringify(config));
        """
    )

    payload = _run_node_json(script)
    saved = json.loads(config_path.read_text(encoding="utf-8"))

    assert payload == saved
    assert payload["cloud"]["appBaseUrl"] == "https://preview.example.com/app"
    assert payload["cloud"]["apiBaseUrl"] == "https://preview.example.com"
    assert payload["local"]["userDataDir"] == str(user_data_dir.resolve())
    assert payload["local"]["modelDir"] == str(model_dir.resolve())
    assert payload["local"]["cacheDir"] == str(cache_dir.resolve())
    assert payload["local"]["logDir"] == str(log_dir.resolve())
    assert payload["local"]["tempDir"] == str(temp_dir.resolve())


def test_runtime_config_derives_app_origin_and_preserves_existing_local_overrides(tmp_path):
    config_path = tmp_path / "desktop-runtime.json"
    existing_local_cache = tmp_path / "custom-cache"
    existing_local_logs = tmp_path / "custom-logs"
    config_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "cloud": {
                    "apiBaseUrl": "https://prod.example.com/api",
                },
                "local": {
                    "cacheDir": str(existing_local_cache),
                    "logDir": str(existing_local_logs),
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    script = textwrap.dedent(
        f"""
        import {{ resolveDesktopRuntimeConfig }} from {json.dumps(RUNTIME_CONFIG_MODULE)};
        const config = resolveDesktopRuntimeConfig({{
          configPath: {json.dumps(str(config_path))},
          userDataDir: {json.dumps(str(tmp_path / "user-data"))},
          cacheDir: {json.dumps(str(tmp_path / "default-cache"))},
          logDir: {json.dumps(str(tmp_path / "default-logs"))},
          tempDir: {json.dumps(str(tmp_path / "default-tmp"))},
          env: {{}},
        }});
        console.log(JSON.stringify(config));
        """
    )

    payload = _run_node_json(script)

    assert payload["cloud"]["apiBaseUrl"] == "https://prod.example.com/api"
    assert payload["cloud"]["appBaseUrl"] == "https://prod.example.com"
    assert payload["local"]["cacheDir"] == str(existing_local_cache.resolve())
    assert payload["local"]["logDir"] == str(existing_local_logs.resolve())


def test_packaged_runtime_prefers_bundled_helper_and_respects_installer_state(tmp_path):
    resources_dir = tmp_path / "resources"
    helper_exe = resources_dir / "desktop-helper-runtime" / "BottleLocalHelper" / "BottleLocalHelper.exe"
    helper_exe.parent.mkdir(parents=True, exist_ok=True)
    helper_exe.write_bytes(b"helper")
    bundled_model_dir = resources_dir / "preinstalled-models" / "faster-distil-small.en"
    bundled_model_dir.mkdir(parents=True, exist_ok=True)
    (bundled_model_dir / "config.json").write_text("{}", encoding="utf-8")
    state_path = resources_dir / "desktop-install-state.json"
    state_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "bottle1Preinstalled": True,
                "bottle1InstallChoice": "preinstalled",
            }
        ),
        encoding="utf-8",
    )
    fallback_model_dir = tmp_path / "user-data" / "models" / "faster-distil-small.en"

    script = textwrap.dedent(
        f"""
        import {{ resolvePackagedDesktopRuntime, selectDesktopModelDir }} from {json.dumps(HELPER_RUNTIME_MODULE)};
        const runtime = resolvePackagedDesktopRuntime({json.dumps(str(resources_dir))});
        console.log(JSON.stringify({{
          runtime,
          selectedModelDir: selectDesktopModelDir({json.dumps(str(resources_dir))}, {json.dumps(str(fallback_model_dir))}),
        }}));
        """
    )

    payload = _run_node_json(script)

    assert payload["runtime"]["helperExists"] is True
    assert payload["runtime"]["bottle1InstallChoice"] == "preinstalled"
    assert payload["runtime"]["bottle1UseAsRuntime"] is True
    assert payload["selectedModelDir"] == str(bundled_model_dir.resolve())


def test_packaged_runtime_falls_back_to_user_model_dir_when_installer_opted_out(tmp_path):
    resources_dir = tmp_path / "resources"
    helper_exe = resources_dir / "desktop-helper-runtime" / "BottleLocalHelper" / "BottleLocalHelper.exe"
    helper_exe.parent.mkdir(parents=True, exist_ok=True)
    helper_exe.write_bytes(b"helper")
    bundled_model_dir = resources_dir / "preinstalled-models" / "faster-distil-small.en"
    bundled_model_dir.mkdir(parents=True, exist_ok=True)
    (bundled_model_dir / "config.json").write_text("{}", encoding="utf-8")
    state_path = resources_dir / "desktop-install-state.json"
    state_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "bottle1Preinstalled": False,
                "bottle1InstallChoice": "opted_out",
            }
        ),
        encoding="utf-8",
    )
    fallback_model_dir = tmp_path / "user-data" / "models" / "faster-distil-small.en"

    script = textwrap.dedent(
        f"""
        import {{ resolvePackagedDesktopRuntime, selectDesktopModelDir }} from {json.dumps(HELPER_RUNTIME_MODULE)};
        const runtime = resolvePackagedDesktopRuntime({json.dumps(str(resources_dir))});
        console.log(JSON.stringify({{
          runtime,
          selectedModelDir: selectDesktopModelDir({json.dumps(str(resources_dir))}, {json.dumps(str(fallback_model_dir))}),
        }}));
        """
    )

    payload = _run_node_json(script)

    assert payload["runtime"]["helperExists"] is True
    assert payload["runtime"]["bottle1InstallChoice"] == "opted_out"
    assert payload["runtime"]["bottle1UseAsRuntime"] is False
    assert payload["selectedModelDir"] == str(fallback_model_dir.resolve())
