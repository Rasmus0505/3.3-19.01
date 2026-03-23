from __future__ import annotations

import json
import shutil
import subprocess
import textwrap
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
RUNTIME_CONFIG_MODULE = (REPO_ROOT / "desktop-client" / "electron" / "runtime-config.mjs").resolve().as_uri()
HELPER_RUNTIME_MODULE = (REPO_ROOT / "desktop-client" / "electron" / "helper-runtime.mjs").resolve().as_uri()
MODEL_UPDATER_MODULE = (REPO_ROOT / "desktop-client" / "electron" / "model-updater.mjs").resolve().as_uri()
PRELOAD_FILE = REPO_ROOT / "desktop-client" / "electron" / "preload.mjs"
ASR_STRATEGY_MODULE = (REPO_ROOT / "frontend" / "src" / "features" / "upload" / "asrStrategy.js").resolve().as_uri()


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


def test_packaged_runtime_prefers_user_model_dir_when_local_override_exists(tmp_path):
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
    fallback_model_dir.mkdir(parents=True, exist_ok=True)
    (fallback_model_dir / "config.json").write_text("{}", encoding="utf-8")

    script = textwrap.dedent(
        f"""
        import {{ selectDesktopModelDir }} from {json.dumps(HELPER_RUNTIME_MODULE)};
        console.log(JSON.stringify({{
          selectedModelDir: selectDesktopModelDir({json.dumps(str(resources_dir))}, {json.dumps(str(fallback_model_dir))}),
        }}));
        """
    )

    payload = _run_node_json(script)

    assert payload["selectedModelDir"] == str(fallback_model_dir.resolve())


def test_preload_exposes_helper_status_bridge():
    preload_source = PRELOAD_FILE.read_text(encoding="utf-8")

    assert 'getHelperStatus: () => ipcRenderer.invoke("desktop:get-helper-status")' in preload_source
    assert 'getServerStatus: () => ipcRenderer.invoke("desktop:get-server-status")' in preload_source
    assert 'probeServerNow: () => ipcRenderer.invoke("desktop:probe-server-now")' in preload_source
    assert 'ipcRenderer.on("desktop:helper-restarting", handler)' in preload_source
    assert 'ipcRenderer.on("desktop:server-status-changed", handler)' in preload_source


def test_preload_exposes_model_update_bridge():
    preload_source = PRELOAD_FILE.read_text(encoding="utf-8")

    assert 'getModelUpdateStatus: () => ipcRenderer.invoke("desktop:get-model-update-status")' in preload_source
    assert 'checkModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:check-model-update", modelKey)' in preload_source
    assert 'startModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:start-model-update", modelKey)' in preload_source
    assert 'cancelModelUpdate: () => ipcRenderer.invoke("desktop:cancel-model-update")' in preload_source
    assert 'ipcRenderer.on("desktop:model-update-progress", handler)' in preload_source


def test_preload_exposes_server_status_bridge():
    preload_source = PRELOAD_FILE.read_text(encoding="utf-8")

    assert 'getServerStatus: () => ipcRenderer.invoke("desktop:get-server-status")' in preload_source
    assert 'probeServerNow: () => ipcRenderer.invoke("desktop:probe-server-now")' in preload_source
    assert 'ipcRenderer.on("desktop:server-status-changed", handler)' in preload_source


def test_model_updater_delta_detects_missing_and_changed_files():
    script = textwrap.dedent(
        f"""
        import {{ computeModelUpdateDelta }} from {json.dumps(MODEL_UPDATER_MODULE)};
        const delta = computeModelUpdateDelta(
          {{
            files: [
              {{ name: "config.json", size_bytes: 10, sha256: "aaa" }},
              {{ name: "model.bin", size_bytes: 20, sha256: "bbb" }},
            ],
          }},
          {{
            files: [
              {{ name: "config.json", size_bytes: 10, sha256: "aaa" }},
              {{ name: "model.bin", size_bytes: 20, sha256: "ccc" }},
              {{ name: "tokens.txt", size_bytes: 5, sha256: "ddd" }},
            ],
          }},
        );
        console.log(JSON.stringify(delta));
        """
    )

    payload = _run_node_json(script)

    assert [item["name"] for item in payload["missing"]] == ["tokens.txt"]
    assert [item["name"] for item in payload["changed"]] == ["model.bin"]


def test_model_updater_reads_actual_files_even_when_version_manifest_is_stale(tmp_path):
    model_dir = tmp_path / "model"
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    (model_dir / ".model-version.json").write_text(
        json.dumps(
            {
                "model_key": "faster-whisper-medium",
                "model_version": "bundle-v2",
                "files": [
                    {"name": "config.json", "size_bytes": 2, "sha256": "abc"},
                    {"name": "model.bin", "size_bytes": 9, "sha256": "def"},
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    script = textwrap.dedent(
        f"""
        import {{ readLocalManifest }} from {json.dumps(MODEL_UPDATER_MODULE)};
        const manifest = await readLocalManifest({json.dumps(str(model_dir))}, "faster-whisper-medium");
        console.log(JSON.stringify(manifest));
        """
    )

    payload = _run_node_json(script)

    assert payload["model_version"] == "bundle-v2"
    assert [item["name"] for item in payload["files"]] == ["config.json"]
    assert payload["file_count"] == 1


def test_model_updater_can_clone_bundled_source_into_user_model_dir(tmp_path):
    base_model_dir = tmp_path / "bundled-model"
    target_model_dir = tmp_path / "user-model"
    base_model_dir.mkdir(parents=True, exist_ok=True)
    (base_model_dir / "config.json").write_text('{"name":"base"}', encoding="utf-8")
    (base_model_dir / "model.bin").write_bytes(b"old-model")

    script = textwrap.dedent(
        f"""
        import fs from "node:fs/promises";
        import path from "node:path";
        import {{ createHash }} from "node:crypto";
        import {{ performIncrementalModelUpdate }} from {json.dumps(MODEL_UPDATER_MODULE)};

        const baseDir = {json.dumps(str(base_model_dir))};
        const targetDir = {json.dumps(str(target_model_dir))};
        const updatedBytes = Buffer.from("new-model", "utf8");
        const updatedSha = createHash("sha256").update(updatedBytes).digest("hex");
        let fetchCount = 0;

        globalThis.fetch = async () => {{
          fetchCount += 1;
          return new Response(updatedBytes, {{
            status: 200,
            headers: {{"content-type": "application/octet-stream"}},
          }});
        }};

        const configBytes = await fs.readFile(path.join(baseDir, "config.json"));
        const remoteManifest = {{
          model_key: "faster-whisper-medium",
          model_version: "bundle-v3",
          files: [
            {{
              name: "config.json",
              size_bytes: configBytes.length,
              sha256: createHash("sha256").update(configBytes).digest("hex"),
            }},
            {{
              name: "model.bin",
              size_bytes: updatedBytes.length,
              sha256: updatedSha,
            }},
          ],
        }};

        const result = await performIncrementalModelUpdate({{
          apiBaseUrl: "https://desktop.example.com",
          modelKey: "faster-whisper-medium",
          remoteManifest,
          baseModelDir: baseDir,
          targetModelDir: targetDir,
        }});

        const versionPayload = JSON.parse(await fs.readFile(path.join(targetDir, ".model-version.json"), "utf8"));
        console.log(JSON.stringify({{
          result,
          fetchCount,
          configText: await fs.readFile(path.join(targetDir, "config.json"), "utf8"),
          modelText: await fs.readFile(path.join(targetDir, "model.bin"), "utf8"),
          versionPayload,
        }}));
        """
    )

    payload = _run_node_json(script)

    assert payload["result"]["updated"] is True
    assert payload["fetchCount"] == 1
    assert payload["configText"] == '{"name":"base"}'
    assert payload["modelText"] == "new-model"
    assert payload["versionPayload"]["model_version"] == "bundle-v3"


def test_asr_strategy_degrades_to_cloud_when_local_helper_is_unhealthy():
    script = textwrap.dedent(
        f"""
        import {{ resolveAsrStrategy }} from {json.dumps(ASR_STRATEGY_MODULE)};
        const result = resolveAsrStrategy({{
          runtimeTrack: "desktop_local",
          userExplicitTrack: false,
          localHelperStatus: {{ healthy: false, modelReady: false }},
          serverStatus: {{ reachable: true }},
          localFailureCount: 0,
        }});
        console.log(JSON.stringify({{ strategy: result.strategy, degraded: result.degraded, reason: result.reason }}));
        """
    )

    payload = _run_node_json(script)

    assert payload["strategy"] == "bottle2_cloud"
    assert payload["degraded"] is True
