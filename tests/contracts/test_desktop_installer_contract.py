from __future__ import annotations

import json
import subprocess
import textwrap
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DESKTOP_ROOT = REPO_ROOT / "desktop-client"
PACKAGE_JSON_PATH = DESKTOP_ROOT / "package.json"
PACKAGE_WIN_SCRIPT_PATH = DESKTOP_ROOT / "scripts" / "package-win.mjs"
MAIN_PROCESS_PATH = DESKTOP_ROOT / "electron" / "main.mjs"
PRELOAD_PATH = DESKTOP_ROOT / "electron" / "preload.cjs"
HELPER_RUNTIME_PATH = DESKTOP_ROOT / "electron" / "helper-runtime.mjs"
MODEL_UPDATER_PATH = DESKTOP_ROOT / "electron" / "model-updater.mjs"
INSTALLER_SCRIPT_PATH = DESKTOP_ROOT / "build" / "installer.nsh"
RUNTIME_CONFIG_MODULE = (DESKTOP_ROOT / "electron" / "runtime-config.mjs").resolve().as_uri()
FRONTEND_VITE_CONFIG_PATH = REPO_ROOT / "frontend" / "vite.config.js"


def _load_package_json() -> dict:
    return json.loads(PACKAGE_JSON_PATH.read_text(encoding="utf-8"))


def _run_node_json(script: str) -> dict:
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=30,
        check=True,
    )
    return json.loads(result.stdout)


def test_package_json_targets_nsis_installer_with_bundled_runtime_resources():
    package_json = _load_package_json()
    build_config = package_json["build"]
    scripts = package_json["scripts"]
    extra_resources = {str(item["to"]): str(item["from"]) for item in build_config["extraResources"]}

    assert scripts["package:win"] == "node ./scripts/package-win.mjs dir"
    assert scripts["package:release"] == "node ./scripts/package-win.mjs nsis"
    assert build_config["win"]["target"] == ["nsis"]
    assert build_config["nsis"]["oneClick"] is False
    assert build_config["nsis"]["allowToChangeInstallationDirectory"] is True
    assert build_config["nsis"]["createDesktopShortcut"] in (True, "always")
    assert build_config["nsis"]["createStartMenuShortcut"] is True
    assert build_config["nsis"]["runAfterFinish"] is True
    assert build_config["nsis"]["include"] == "build/installer.nsh"
    assert extra_resources["desktop-helper-runtime/BottleLocalHelper"] == ".cache/helper-runtime/BottleLocalHelper"
    assert extra_resources["runtime-defaults.json"] == ".cache/runtime-defaults.json"
    assert extra_resources["runtime-tools/ffmpeg"] == "../tools/ffmpeg/bin"
    assert extra_resources["runtime-tools/yt-dlp"] == "../tools/yt-dlp"
    assert extra_resources["preinstalled-models/faster-distil-small.en"] == "../asr-test/models/faster-distil-small.en"


def test_package_win_script_builds_runtime_defaults_and_helper_before_target_build():
    script_text = PACKAGE_WIN_SCRIPT_PATH.read_text(encoding="utf-8")

    assert "write-runtime-defaults.mjs" in script_text
    assert "build-helper-runtime.mjs" in script_text
    assert 'const requestedTarget = (process.argv[2] || "dir").trim();' in script_text
    assert 'const supportedTargets = new Set(["dir", "nsis"]);' in script_text
    assert '["--win", requestedTarget, "--x64"]' in script_text
    assert 'requestedTarget === "dir" ? "win-unpacked bundle" : "NSIS installer"' in script_text
    assert "bundledModelSourceDir" in script_text


def test_build_helper_runtime_script_collects_dynamic_app_modules():
    script_text = (DESKTOP_ROOT / "scripts" / "build-helper-runtime.mjs").read_text(encoding="utf-8")

    assert '"--paths"' in script_text
    assert '"--hidden-import"' in script_text
    assert '"--collect-submodules"' in script_text
    assert '"--collect-data"' in script_text
    assert '"app"' in script_text
    assert '"faster_whisper"' in script_text
    assert "repoRoot" in script_text


def test_desktop_build_script_marks_frontend_build_as_desktop_renderer():
    script_text = (DESKTOP_ROOT / "scripts" / "build.mjs").read_text(encoding="utf-8")
    vite_config_text = FRONTEND_VITE_CONFIG_PATH.read_text(encoding="utf-8")

    assert "BOTTLE_DESKTOP_RENDERER_BUILD" in script_text
    assert "VITE_DESKTOP_RENDERER_BUILD" in script_text
    assert 'base: desktopRendererBuild ? "./" : "/static/"' in vite_config_text


def test_main_process_uses_bundled_helper_runtime_and_packaged_defaults():
    main_text = MAIN_PROCESS_PATH.read_text(encoding="utf-8")
    preload_text = PRELOAD_PATH.read_text(encoding="utf-8")
    helper_runtime_text = HELPER_RUNTIME_PATH.read_text(encoding="utf-8")
    model_updater_text = MODEL_UPDATER_PATH.read_text(encoding="utf-8")

    assert "resolvePackagedDesktopRuntime" in main_text
    assert "selectDesktopModelDir" in main_text
    assert "desktop:check-model-update" in main_text
    assert "desktop:start-model-update" in main_text
    assert "desktop:check-client-update" in main_text
    assert "desktop:open-client-update-link" in main_text
    assert "desktop:client-update-status-changed" in main_text
    assert "desktop:select-local-media-file" in main_text
    assert "desktop:read-local-media-file" in main_text
    assert '"/api/desktop-asr"' in main_text
    assert '"/api/desktop-asr/url-import"' in main_text
    assert "runtime-defaults.json" in main_text
    assert "DESKTOP_PREINSTALLED_MODEL_DIR" in main_text
    assert "DESKTOP_FFMPEG_BIN_DIR" in main_text
    assert "DESKTOP_YTDLP_PATH" in main_text
    assert 'helperMode: app.isPackaged ? "bundled-runtime" : "system-python"' in main_text
    assert "usingBundledFileRenderer" in main_text
    assert 'preload: path.resolve(electronRoot, "preload.cjs")' in main_text
    assert "sandbox: false" in main_text
    assert "webSecurity: !usingBundledFileRenderer ? true : false" in main_text
    assert "computeModelUpdateDelta" in model_updater_text
    assert ".model-version.json" in model_updater_text
    assert ".backup" in model_updater_text
    assert "desktop:check-client-update" not in model_updater_text
    assert 'ipcRenderer.invoke("desktop:select-local-media-file", options)' in preload_text
    assert 'ipcRenderer.invoke("desktop:read-local-media-file", sourcePath)' in preload_text
    assert "webUtils.getPathForFile(file)" in preload_text
    assert 'ipcRenderer.invoke("desktop:request-local-helper", request)' in preload_text
    assert "BottleLocalHelper.exe" in helper_runtime_text
    assert "desktop-helper-runtime" in helper_runtime_text
    assert "preinstalled-models" in helper_runtime_text
    assert "runtime-tools" in helper_runtime_text
    assert "yt-dlp" in helper_runtime_text


def test_installer_script_contains_bottle_preinstall_checkbox_and_copy_logic():
    installer_text = INSTALLER_SCRIPT_PATH.read_text(encoding="utf-8")

    assert "Preinstall Bottle 1.0 local model bundle (recommended)" in installer_text
    assert "Page custom BottleModelPageCreate BottleModelPageLeave" in installer_text
    assert "desktop-install-state.json" in installer_text
    assert "bottle1Preinstalled" in installer_text


def test_runtime_config_can_bootstrap_cloud_targets_from_packaged_defaults(tmp_path):
    default_config_path = tmp_path / "runtime-defaults.json"
    config_path = tmp_path / "desktop-runtime.json"
    default_config_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "cloud": {
                    "appBaseUrl": "https://desktop.example.com/app",
                    "apiBaseUrl": "https://desktop.example.com",
                },
                "clientUpdate": {
                    "metadataUrl": "https://updates.example.com/bottle/latest.json",
                    "entryUrl": "https://updates.example.com/download",
                    "checkOnLaunch": False,
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
          cacheDir: {json.dumps(str(tmp_path / "cache"))},
          logDir: {json.dumps(str(tmp_path / "logs"))},
          tempDir: {json.dumps(str(tmp_path / "tmp"))},
          defaultConfigPath: {json.dumps(str(default_config_path))},
          env: {{}},
        }});
        console.log(JSON.stringify(config));
        """
    )

    payload = _run_node_json(script)

    assert payload["cloud"]["appBaseUrl"] == "https://desktop.example.com/app"
    assert payload["cloud"]["apiBaseUrl"] == "https://desktop.example.com"
    assert payload["clientUpdate"]["metadataUrl"] == "https://updates.example.com/bottle/latest.json"
    assert payload["clientUpdate"]["entryUrl"] == "https://updates.example.com/download"
    assert payload["clientUpdate"]["checkOnLaunch"] is False
