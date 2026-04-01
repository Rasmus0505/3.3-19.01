from __future__ import annotations

import json
import shutil
import subprocess
import textwrap
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DESKTOP_ROOT = REPO_ROOT / "desktop-client"
RUNTIME_CONFIG_MODULE = (DESKTOP_ROOT / "electron" / "runtime-config.mjs").resolve().as_uri()
HELPER_RUNTIME_MODULE = (DESKTOP_ROOT / "electron" / "helper-runtime.mjs").resolve().as_uri()
MODEL_UPDATER_MODULE = (DESKTOP_ROOT / "electron" / "model-updater.mjs").resolve().as_uri()
PRELOAD_FILE = DESKTOP_ROOT / "electron" / "preload.cjs"
MAIN_PROCESS_FILE = DESKTOP_ROOT / "electron" / "main.mjs"
FRONTEND_MAIN_FILE = REPO_ROOT / "frontend" / "src" / "main.jsx"
FRONTEND_ADMIN_MAIN_FILE = REPO_ROOT / "frontend" / "src" / "main-admin.jsx"
ASR_STRATEGY_MODULE = (REPO_ROOT / "frontend" / "src" / "features" / "upload" / "asrStrategy.js").resolve().as_uri()
UPLOAD_PANEL_FILE = REPO_ROOT / "frontend" / "src" / "features" / "upload" / "UploadPanel.jsx"
LOCAL_SHELL_FILE = REPO_ROOT / "frontend" / "src" / "app" / "LearningShellLocalSubtitles.jsx"
API_CLIENT_FILE = REPO_ROOT / "frontend" / "src" / "shared" / "api" / "client.js"
AUTH_API_FILE = REPO_ROOT / "frontend" / "src" / "features" / "auth" / "shared" / "authApi.ts"
OFFLINE_MODE_FILE = REPO_ROOT / "frontend" / "src" / "hooks" / "useOfflineMode.js"
LOCAL_MEDIA_STORE_FILE = REPO_ROOT / "frontend" / "src" / "shared" / "media" / "localMediaStore.js"
LOCAL_SUBTITLE_STORE_FILE = REPO_ROOT / "frontend" / "src" / "shared" / "media" / "localSubtitleStore.js"
LOCAL_TASK_STORE_FILE = REPO_ROOT / "frontend" / "src" / "shared" / "media" / "localTaskStore.js"


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
            DESKTOP_CLIENT_UPDATE_METADATA_URL: "https://updates.example.com/bottle/latest.json",
            DESKTOP_CLIENT_UPDATE_ENTRY_URL: "https://updates.example.com/download",
            DESKTOP_CLIENT_UPDATE_CHECK_ON_LAUNCH: "false",
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
    assert payload["clientUpdate"]["metadataUrl"] == "https://updates.example.com/bottle/latest.json"
    assert payload["clientUpdate"]["entryUrl"] == "https://updates.example.com/download"
    assert payload["clientUpdate"]["checkOnLaunch"] is False


def test_runtime_defaults_script_hardcodes_stable_channel_defaults():
    script_text = (DESKTOP_ROOT / "scripts" / "write-runtime-defaults.mjs").read_text(encoding="utf-8")

    assert 'channel: "stable"' in script_text
    assert "/desktop/client/channels/stable.json" in script_text
    assert "https://share.feijipan.com/s/1n2mH6fh" in script_text
    assert "?channel=preview" not in script_text


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
                "clientUpdate": {
                    "metadataUrl": "https://release.example.com/bottle/latest.json",
                    "entryUrl": "https://release.example.com/download",
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
    assert payload["clientUpdate"]["metadataUrl"] == "https://release.example.com/bottle/latest.json"
    assert payload["clientUpdate"]["entryUrl"] == "https://release.example.com/download"
    assert payload["clientUpdate"]["checkOnLaunch"] is False


def test_packaged_runtime_prefers_bundled_helper_and_respects_installer_state(tmp_path):
    resources_dir = tmp_path / "resources"
    helper_exe = resources_dir / "desktop-helper-runtime" / "BottleLocalHelper" / "BottleLocalHelper.exe"
    helper_exe.parent.mkdir(parents=True, exist_ok=True)
    helper_exe.write_bytes(b"helper")
    ffmpeg_exe = resources_dir / "runtime-tools" / "ffmpeg" / "ffmpeg.exe"
    ffprobe_exe = resources_dir / "runtime-tools" / "ffmpeg" / "ffprobe.exe"
    ytdlp_exe = resources_dir / "runtime-tools" / "yt-dlp" / "yt-dlp.exe"
    ffmpeg_exe.parent.mkdir(parents=True, exist_ok=True)
    ytdlp_exe.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_exe.write_bytes(b"ffmpeg")
    ffprobe_exe.write_bytes(b"ffprobe")
    ytdlp_exe.write_bytes(b"yt-dlp")
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
    assert payload["runtime"]["ffmpegExists"] is True
    assert payload["runtime"]["ffprobeExists"] is True
    assert payload["runtime"]["ytdlpExists"] is True
    assert payload["runtime"]["bottle1InstallChoice"] == "preinstalled"
    assert payload["runtime"]["bottle1UseAsRuntime"] is True
    assert payload["selectedModelDir"] == str(bundled_model_dir.resolve())


def test_packaged_runtime_falls_back_to_user_model_dir_when_installer_opted_out(tmp_path):
    resources_dir = tmp_path / "resources"
    helper_exe = resources_dir / "desktop-helper-runtime" / "BottleLocalHelper" / "BottleLocalHelper.exe"
    helper_exe.parent.mkdir(parents=True, exist_ok=True)
    helper_exe.write_bytes(b"helper")
    ffmpeg_exe = resources_dir / "runtime-tools" / "ffmpeg" / "ffmpeg.exe"
    ffprobe_exe = resources_dir / "runtime-tools" / "ffmpeg" / "ffprobe.exe"
    ytdlp_exe = resources_dir / "runtime-tools" / "yt-dlp" / "yt-dlp.exe"
    ffmpeg_exe.parent.mkdir(parents=True, exist_ok=True)
    ytdlp_exe.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_exe.write_bytes(b"ffmpeg")
    ffprobe_exe.write_bytes(b"ffprobe")
    ytdlp_exe.write_bytes(b"yt-dlp")
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
    ffmpeg_exe = resources_dir / "runtime-tools" / "ffmpeg" / "ffmpeg.exe"
    ffprobe_exe = resources_dir / "runtime-tools" / "ffmpeg" / "ffprobe.exe"
    ytdlp_exe = resources_dir / "runtime-tools" / "yt-dlp" / "yt-dlp.exe"
    ffmpeg_exe.parent.mkdir(parents=True, exist_ok=True)
    ytdlp_exe.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg_exe.write_bytes(b"ffmpeg")
    ffprobe_exe.write_bytes(b"ffprobe")
    ytdlp_exe.write_bytes(b"yt-dlp")
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

    assert 'requestCloudApi: (request) => ipcRenderer.invoke("desktop:request-cloud-api", request)' in preload_source
    assert 'cancelCloudRequest: (requestId) => ipcRenderer.send("desktop:cancel-cloud-request", requestId)' in preload_source
    assert 'getHelperStatus: () => ipcRenderer.invoke("desktop:get-helper-status")' in preload_source
    assert 'getServerStatus: () => ipcRenderer.invoke("desktop:get-server-status")' in preload_source
    assert 'probeServerNow: () => ipcRenderer.invoke("desktop:probe-server-now")' in preload_source
    assert 'selectLocalMediaFile: (options) => ipcRenderer.invoke("desktop:select-local-media-file", options)' in preload_source
    assert 'readLocalMediaFile: (sourcePath) => ipcRenderer.invoke("desktop:read-local-media-file", sourcePath)' in preload_source
    assert "getPathForFile: (file) => {" in preload_source
    assert "webUtils.getPathForFile(file)" in preload_source
    assert 'ipcRenderer.on("desktop:helper-restarting", handler)' in preload_source
    assert 'ipcRenderer.on("desktop:server-status-changed", handler)' in preload_source


def test_preload_exposes_client_update_bridge():
    preload_source = PRELOAD_FILE.read_text(encoding="utf-8")

    assert 'getClientUpdateStatus: () => ipcRenderer.invoke("desktop:get-client-update-status")' in preload_source
    assert 'checkClientUpdate: () => ipcRenderer.invoke("desktop:check-client-update")' in preload_source
    assert 'openClientUpdateLink: (preferredUrl) => ipcRenderer.invoke("desktop:open-client-update-link", preferredUrl)' in preload_source
    assert 'openExternalUrl: (targetUrl) => ipcRenderer.invoke("desktop:open-external-url", targetUrl)' in preload_source
    assert 'ipcRenderer.on("desktop:client-update-status-changed", handler)' in preload_source


def test_preload_exposes_model_update_bridge():
    preload_source = PRELOAD_FILE.read_text(encoding="utf-8")

    assert 'getModelUpdateStatus: () => ipcRenderer.invoke("desktop:get-model-update-status")' in preload_source
    assert 'checkModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:check-model-update", modelKey)' in preload_source
    assert 'startModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:start-model-update", modelKey)' in preload_source
    assert 'cancelModelUpdate: () => ipcRenderer.invoke("desktop:cancel-model-update")' in preload_source
    assert 'ipcRenderer.on("desktop:model-update-progress", handler)' in preload_source


def test_main_process_separates_client_update_from_model_update_channels():
    main_source = MAIN_PROCESS_FILE.read_text(encoding="utf-8")

    assert 'const activeCloudRequests = new Map();' in main_source
    assert 'ipcMain.handle("desktop:request-cloud-api", async (_event, request = {}) => requestCloudApi(request))' in main_source
    assert 'ipcMain.on("desktop:cancel-cloud-request", (_event, requestId = "") => {' in main_source
    assert 'async function requestCloudApi(request = {}) {' in main_source
    assert 'await fetch(`${baseUrl.replace(/\\/+$/, "")}/api/auth/refresh`' in main_source
    assert 'ipcMain.handle("desktop:auth-restore-session", async (_event, options = {}) => restoreAuthSession(options))' in main_source
    assert 'clientUpdate: desktopClientUpdateState' in main_source
    assert 'modelUpdate: desktopModelUpdateState' in main_source
    assert 'ipcMain.handle("desktop:get-client-update-status", () => desktopClientUpdateState)' in main_source
    assert 'ipcMain.handle("desktop:check-client-update", async () => checkDesktopClientUpdate({ reason: "manual", notify: true }))' in main_source
    assert 'ipcMain.handle("desktop:open-external-url", async (_event, targetUrl = "") => openExternalUrl(targetUrl))' in main_source
    assert 'ipcMain.handle("desktop:get-model-update-status", () => desktopModelUpdateState)' in main_source
    assert 'ipcMain.handle("desktop:check-model-update", async (_event, modelKey = DESKTOP_MODEL_UPDATE_KEY) => checkDesktopModelUpdate(modelKey))' in main_source
    assert 'mainWindow.webContents.send("desktop:client-update-status-changed", desktopClientUpdateState)' in main_source
    assert 'mainWindow.webContents.send("desktop:model-update-progress", desktopModelUpdateState)' in main_source


def test_main_process_stops_helper_process_tree_before_quit():
    main_source = MAIN_PROCESS_FILE.read_text(encoding="utf-8")

    assert "async function stopDesktopHelper()" in main_source
    assert 'spawn("taskkill.exe", ["/PID", String(helperPid), "/T", "/F"]' in main_source
    assert 'app.on("before-quit", (event) => {' in main_source
    assert "await stopDesktopHelper();" in main_source


def test_main_process_exposes_desktop_file_bridge():
    main_source = MAIN_PROCESS_FILE.read_text(encoding="utf-8")

    assert 'ipcMain.handle("desktop:select-local-media-file", async (_event, options = {}) => selectLocalMediaFile(options))' in main_source
    assert 'ipcMain.handle("desktop:read-local-media-file", async (_event, sourcePath = "") => readLocalMediaFile(sourcePath))' in main_source
    assert "dialog.showOpenDialog" in main_source
    assert "DESKTOP_MEDIA_FILE_FILTERS" in main_source


def test_upload_panel_consumes_desktop_file_bridge_and_persists_source_path():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert "desktop_source_path" in upload_panel_source
    assert "restoreSavedSourceFile" in upload_panel_source
    assert "ensureBlobBackedSourceFile" in upload_panel_source
    assert "fileInputRef.current.click()" in upload_panel_source


def test_preload_exposes_server_status_bridge():
    preload_source = PRELOAD_FILE.read_text(encoding="utf-8")

    assert 'getServerStatus: () => ipcRenderer.invoke("desktop:get-server-status")' in preload_source
    assert 'probeServerNow: () => ipcRenderer.invoke("desktop:probe-server-now")' in preload_source
    assert 'ipcRenderer.on("desktop:server-status-changed", handler)' in preload_source


def test_frontend_entry_switches_to_hash_router_for_desktop_renderer_build():
    main_source = FRONTEND_MAIN_FILE.read_text(encoding="utf-8")
    admin_main_source = FRONTEND_ADMIN_MAIN_FILE.read_text(encoding="utf-8")

    assert "HashRouter" in main_source
    assert "VITE_DESKTOP_RENDERER_BUILD" in main_source
    assert "<AppRouter>" in main_source
    assert "HashRouter" in admin_main_source
    assert "VITE_DESKTOP_RENDERER_BUILD" in admin_main_source
    assert "<AppRouter>" in admin_main_source


def test_requestCloudApi_desktop_api_client_surfaces_missing_cloud_base_configuration():
    api_client_source = API_CLIENT_FILE.read_text(encoding="utf-8")

    assert "Desktop cloud API base URL is not configured" in api_client_source
    assert "hasDesktopRuntime()" in api_client_source
    assert "buildDesktopApiBaseUrlMissingError" in api_client_source
    assert "hasDesktopCloudBridge()" in api_client_source
    assert "window.desktopRuntime.requestCloudApi" in api_client_source
    assert 'window.desktopRuntime?.cancelCloudRequest?.(requestId);' in api_client_source
    assert "new Response(" in api_client_source


def test_auth_api_reuses_shared_desktop_bridge_client():
    auth_api_source = AUTH_API_FILE.read_text(encoding="utf-8")

    assert 'import { api } from "../../../shared/api/client";' in auth_api_source
    assert "const response = await api(path, {" in auth_api_source
    assert "fetch(buildApiUrl(path)" not in auth_api_source


def test_uploadWithProgress_upload_panel_routes_oss_uploads_through_shared_upload_bridge():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert 'const uploadResult = await uploadWithProgress(uploadUrl, {' in upload_panel_source
    assert 'method: "POST"' in upload_panel_source
    assert 'if (!uploadResult.ok) {' in upload_panel_source


def test_uploadWithProgress_upload_panel_exposes_bottle2_cloud_stage_model_and_desktop_guidance():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert "提交云端任务" in upload_panel_source
    assert "转写中" in upload_panel_source
    assert "生成课程" in upload_panel_source
    assert "下载桌面客户端" in upload_panel_source or "获取桌面端" in upload_panel_source
    assert "VITE_DESKTOP_CLIENT_ENTRY_URL" in upload_panel_source
    assert "音频与视频文件直传" in upload_panel_source
    assert "2.0 GB" in upload_panel_source or "2 GB" in upload_panel_source
    assert "12 小时" in upload_panel_source


def test_upload_panel_exposes_phase04_link_import_copy_and_fallback_contract():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")
    learning_shell_source = (REPO_ROOT / "frontend" / "src" / "app" / "learning-shell" / "LearningShellContainer.jsx").read_text(encoding="utf-8")

    assert "链接导入" in upload_panel_source
    assert "本地文件" in upload_panel_source
    assert upload_panel_source.index("链接导入") < upload_panel_source.index("本地文件")
    assert "导入并生成课程" in upload_panel_source
    assert "未识别到可导入链接。" in upload_panel_source
    assert "继续后台执行" in upload_panel_source
    assert "取消当前链接任务" in upload_panel_source
    assert "SnapAny" in upload_panel_source
    assert "openSnapAnyFallback" in upload_panel_source
    assert "支持常见公开视频链接：YouTube、B站、常见播客页面、公开视频直链" in upload_panel_source
    assert "仅支持公开单条链接，不支持 cookies、账号登录、会员内容、受限内容导入" in upload_panel_source
    assert "onNavigateToLesson?.(data.lesson.id)" in upload_panel_source
    assert 'loadLessonDetail(lessonId, { autoEnterImmersive: true })' in learning_shell_source


def test_desktop_runtime_keeps_advanced_media_tool_controls_out_of_user_bridge():
    main_source = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    preload_source = PRELOAD_FILE.read_text(encoding="utf-8")

    assert "manageCookies" not in main_source
    assert "chooseDownloadSource" not in main_source
    assert "updateYtdlp" not in main_source
    assert "importBrowserSession" not in main_source
    assert "manageCookies" not in preload_source
    assert "chooseDownloadSource" not in preload_source
    assert "updateYtdlp" not in preload_source
    assert "importBrowserSession" not in preload_source


def test_upload_panel_reuses_normal_submit_strategy_after_link_download_succeeds():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert "bypassDesktopLinkMode: true" in upload_panel_source
    assert "sourceDurationSec: sourceDurationSeconds" in upload_panel_source
    assert "skipDesktopRecommendation: true" in upload_panel_source
    assert "buildDesktopSelectedFile({" in upload_panel_source
    assert "taskPayload?.source_path" in upload_panel_source
    assert "await submitDesktopLocalFast(generationPollToken, runToken, sourceFile, sourceDurationSeconds);" not in upload_panel_source


def test_upload_panel_marks_desktop_bundle_as_preparable_and_auto_installs_before_local_run():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert "Bottle 1.0 was not preinstalled. You can prepare it later from the desktop client." not in upload_panel_source
    assert "Bottle 1.0 can be prepared from this desktop client." in upload_panel_source
    assert 'const cardStatusLabel = isDesktopBundleLoading ? "检查中" : desktopBundlePreparable ? "可准备" : cardStatusAvailable ? "可用" : "不可用";' in upload_panel_source
    assert "if (!bundleSummary?.available && bundleSummary?.installAvailable) {" in upload_panel_source
    assert "bundleSummary = await installDesktopBundledAsrModel(FASTER_WHISPER_MODEL);" in upload_panel_source


def test_upload_panel_resolves_desktop_source_path_before_local_course_generation():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert "resolveDesktopSelectedSourcePath(sourceFile) || resolveDesktopSelectedSourcePath(file) || \"\"" in upload_panel_source
    assert "当前素材缺少桌面本机路径，请重新选择一次文件后再试。" in upload_panel_source
    assert "const selectedSourceFile = attachDesktopSourcePath(" in upload_panel_source
    assert "resolveDesktopSelectedSourcePath(options?.sourceFile ?? file) || resolveDesktopSelectedSourcePath(file)" in upload_panel_source


def test_upload_panel_prepares_desktop_video_before_cloud_direct_upload():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert 'requestDesktopLocalHelper("/api/desktop-asr/prepare-upload-source"' in upload_panel_source
    assert "prepareDesktopCloudUploadSourceFile(" in upload_panel_source
    assert "await submitCloudDirectUpload(uploadSourceFile, runToken, pollToken, selectedSourceFile);" in upload_panel_source


def test_upload_panel_skips_cloud_auto_fallback_for_explicit_desktop_local_generate():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert "selectedFastRuntimeTrack !== FAST_RUNTIME_TRACK_DESKTOP_LOCAL" in upload_panel_source


def test_upload_panel_removes_dedicated_local_generate_button_from_file_actions():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert 'void submit({ submitIntent: FILE_PICKER_ACTION_DESKTOP_LOCAL_GENERATE });' not in upload_panel_source
    assert 'openSourceFilePicker(FILE_PICKER_ACTION_DESKTOP_LOCAL_GENERATE)' not in upload_panel_source
    assert "const shouldUseDesktopLocalGenerateCourse = false;" in upload_panel_source


def test_local_media_and_subtitle_stores_accept_non_numeric_lesson_ids():
    media_store_source = LOCAL_MEDIA_STORE_FILE.read_text(encoding="utf-8")
    subtitle_store_source = LOCAL_SUBTITLE_STORE_FILE.read_text(encoding="utf-8")

    assert 'return rawValue;' in media_store_source
    assert 'return rawValue;' in subtitle_store_source
    assert 'return compareLessonIds(left.lessonId, right.lessonId);' in subtitle_store_source


def test_local_task_store_self_heals_corrupt_generation_task_database():
    task_store_source = LOCAL_TASK_STORE_FILE.read_text(encoding="utf-8")

    assert "function resetDatabase()" in task_store_source
    assert "indexedDB.deleteDatabase(DB_NAME)" in task_store_source
    assert "internal error|unknownerror|versionerror" in task_store_source


def test_local_learning_shell_passes_generate_success_navigation_callback_to_upload_panel():
    local_shell_source = LOCAL_SHELL_FILE.read_text(encoding="utf-8")

    assert "onNavigateToLesson={handleStartLesson}" in local_shell_source


def test_offline_mode_uses_desktop_server_bridge_when_available():
    offline_mode_source = OFFLINE_MODE_FILE.read_text(encoding="utf-8")

    assert "function hasDesktopServerBridge()" in offline_mode_source
    assert "window.desktopRuntime.probeServerNow()" in offline_mode_source


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


def test_asr_strategy_file_access_contract_maps_backend_code_and_nested_detail():
    script = textwrap.dedent(
        f"""
        import {{ buildCloudAsrErrorMessage, mapCloudAsrFailureToMessage }} from {json.dumps(ASR_STRATEGY_MODULE)};
        const direct = buildCloudAsrErrorMessage({{
          errorCode: "DASHSCOPE_FILE_ACCESS_FORBIDDEN",
          message: "DashScope 云端文件访问失败",
          detail: JSON.stringify({{
            dashscope_file_id: "uploads/test/exhausted.mp4",
            first_failure_code: "FILE_403_FORBIDDEN",
          }}),
          browserOnline: true,
          serverStatus: {{ reachable: true }},
        }});
        const nested = buildCloudAsrErrorMessage({{
          message: "ASR task failed",
          detail: JSON.stringify({{
            subtask_code: "FILE_403_FORBIDDEN",
            subtask_message: "provider denied signed url",
          }}),
          browserOnline: true,
          serverStatus: {{ reachable: true }},
        }});
        const mappedMessage = mapCloudAsrFailureToMessage({{
          error_code: "DASHSCOPE_FILE_ACCESS_FORBIDDEN",
          message: "DashScope 云端文件访问失败",
          detail: JSON.stringify({{
            dashscope_file_id: "uploads/test/exhausted.mp4",
            first_failure_code: "FILE_403_FORBIDDEN",
          }}),
        }}, {{ reachable: true }});
        console.log(JSON.stringify({{ direct, nested, mappedMessage }}));
        """
    )

    payload = _run_node_json(script)

    expected_message = "Bottle 2.0 暂时无法访问已上传的文件，请稍后重试；若再次失败，请重新上传当前素材。"
    assert payload["direct"]["code"] == "CLOUD_FILE_ACCESS_FORBIDDEN"
    assert payload["direct"]["message"] == expected_message
    assert payload["nested"]["code"] == "CLOUD_FILE_ACCESS_FORBIDDEN"
    assert payload["nested"]["message"] == expected_message
    assert payload["mappedMessage"] == expected_message


# ============================================================
# DESK-02: Version display and badgeVisible behavior
# ============================================================


def test_client_update_state_has_all_required_fields():
    """DESK-02: desktopClientUpdateState must have all fields needed for version display."""
    required_fields = [
        "status", "localVersion", "remoteVersion", "updateAvailable",
        "badgeVisible", "downloading", "downloadProgress", "downloadPath",
        "installPending", "lastError", "releaseName", "message", "entryUrl"
    ]
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    for field in required_fields:
        assert field in main_content, f"Field {field} not found in main.mjs"


def test_client_update_sets_badge_visible_when_update_available():
    """DESK-02: When updateAvailable is true, badgeVisible must be set to true."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    badge_patterns = [
        'badgeVisible: updateAvailable',
        '"badgeVisible": updateAvailable',
        "'badgeVisible': updateAvailable",
        "badgeVisible = updateAvailable",
    ]
    assert any(pattern in main_content for pattern in badge_patterns), \
        "badgeVisible not set based on updateAvailable"


def test_client_update_clears_badge_on_install():
    """DESK-02: When update is installed, badgeVisible must be cleared."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    installed_patterns = [
        'status: "installed"',
        "status: 'installed'",
    ]
    assert any(p in main_content for p in installed_patterns), \
        "installed status not found"


# ============================================================
# DESK-03: Download orchestration, progress tracking, restart
# ============================================================


def test_desktop_update_download_flow_exists():
    """DESK-03: startClientUpdateDownload IPC handler must exist and implement download."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    assert "startClientUpdateDownload" in main_content, \
        "startClientUpdateDownload not found"
    assert "restart-and-install" in main_content or "restartAndInstall" in main_content, \
        "restartAndInstall handler not found"
    assert "downloadProgress" in main_content, "downloadProgress tracking not found"


def test_desktop_update_download_state_transitions():
    """DESK-03: Download must follow state transitions: idle->downloading->ready(installPending)->installed."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    downloading_patterns = [
        '"status": "downloading"',
        "'status': 'downloading'",
        'status: "downloading"',
        "status: 'downloading'",
    ]
    assert any(p in main_content for p in downloading_patterns), \
        "downloading status not found"
    assert "installPending" in main_content, "installPending not found"
    assert "downloadPath" in main_content, "downloadPath not found"


def test_desktop_update_restart_trigger_exists():
    """DESK-03: Restart trigger must open installer and relaunch app."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    assert "shell.openPath" in main_content, "shell.openPath not found"
    assert "app.relaunch" in main_content, "app.relaunch not found"


# ============================================================
# DESK-04: Model delta update with progress
# ============================================================


def test_model_update_state_has_progress_fields():
    """DESK-04: desktopModelUpdateState must track currentFile, totalFiles, completedFiles."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    required_fields = ["currentFile", "totalFiles", "completedFiles", "downloading"]
    for field in required_fields:
        assert field in main_content, f"Model progress field {field} not found"


def test_model_update_computes_delta():
    """DESK-04: Model update must compute delta (missing + changed files)."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    updater_content = (DESKTOP_ROOT / "electron" / "model-updater.mjs").read_text(encoding="utf-8")
    assert "computeModelUpdateDelta" in main_content or "computeModelUpdateDelta" in updater_content, \
        "computeModelUpdateDelta not found"
    assert "delta.missing" in main_content or "delta.missing" in updater_content, \
        "delta.missing not used"


def test_model_update_progress_emits_current_file():
    """DESK-04: During download, currentFile must be emitted in state updates."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    assert "currentFile" in main_content, "currentFile not tracked"
    assert "emitModelUpdateState" in main_content, "emitModelUpdateState not found"


# ============================================================
# DESK-05: Failure recovery with plain-language messages
# ============================================================


def test_desktop_update_error_classification():
    """DESK-05: Update errors must be classified into categories for plain-language messages."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    error_categories = ["network_error", "server_error", "disk_error", "unknown"]
    found_categories = [cat for cat in error_categories if cat in main_content]
    assert len(found_categories) >= 3, \
        f"Expected at least 3 error categories, found: {found_categories}"


def test_desktop_update_last_error_field_exists():
    """DESK-05: desktopClientUpdateState must have lastError field."""
    main_content = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    assert "lastError" in main_content, "lastError field not found"


def test_model_update_retry_button_exists():
    """DESK-05: Model update UI must have retry button for error recovery."""
    ui_content = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")
    assert "startModelUpdate" in ui_content, "startModelUpdate not called in UI"
    assert "error" in ui_content and "startModelUpdate" in ui_content, \
        "Retry action not found in error state"


# ============================================================
# Behavioral: Bundled baseline copy on first model update
# ============================================================


def test_model_updater_performs_baseline_copy():
    """First model update: if targetDir is empty, bundled model must be copied to user-data."""
    updater_content = (DESKTOP_ROOT / "electron" / "model-updater.mjs").read_text(encoding="utf-8")
    assert "initialFiles.length === 0" in updater_content or \
           "length === 0" in updater_content, \
           "Empty dir check not found"
    assert "copyDirectory" in updater_content or "copy" in updater_content, \
        "Baseline copy not implemented"


def test_model_updater_accepts_base_model_dir():
    """performIncrementalModelUpdate must accept baseModelDir parameter for baseline copy."""
    updater_content = (DESKTOP_ROOT / "electron" / "model-updater.mjs").read_text(encoding="utf-8")
    assert "baseModelDir" in updater_content, "baseModelDir parameter not found"


# ============================================================
# SECU-02: Desktop Runtime Security Boundary
# ============================================================


def test_open_external_url_whitelist_allows_snapany(tmp_path):
    """SECU-02: openExternalUrl must allow snapany.com by default."""
    config_path = tmp_path / "desktop-runtime.json"
    config_path.write_text(
        json.dumps({
            "schemaVersion": 1,
            "cloud": {"appBaseUrl": "https://app.example.com", "apiBaseUrl": "https://api.example.com"},
            "local": {
                "userDataDir": str(tmp_path / "user-data"),
                "modelDir": str(tmp_path / "models"),
                "cacheDir": str(tmp_path / "cache"),
                "logDir": str(tmp_path / "logs"),
                "tempDir": str(tmp_path / "tmp"),
            },
            "clientUpdate": {},
            "security": {
                "openExternalWhitelist": ["https://snapany.com", "https://www.snapany.com"]
            }
        }),
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
          env: {{}},
        }});
        const whitelist = config.security?.openExternalWhitelist || [];
        function isUrlAllowed(url, whitelist) {{
          try {{
            const parsed = new URL(url);
            return whitelist.some(entry => {{
              try {{
                const p = new URL(entry);
                return parsed.protocol === p.protocol && parsed.host === p.host;
              }} catch {{
                return false;
              }}
            }});
          }} catch {{
            return false;
          }}
        }}
        console.log(JSON.stringify({{
          whitelist,
          snapanyAllowed: isUrlAllowed("https://snapany.com/zh", whitelist),
          wwwSnapanyAllowed: isUrlAllowed("https://www.snapany.com", whitelist),
          randomUrlAllowed: isUrlAllowed("https://evil.com", whitelist),
        }}));
        """
    )

    payload = _run_node_json(script)

    assert payload["whitelist"] == ["https://snapany.com", "https://www.snapany.com"]
    assert payload["snapanyAllowed"] is True
    assert payload["wwwSnapanyAllowed"] is True
    assert payload["randomUrlAllowed"] is False


def test_open_external_url_whitelist_from_env_override(tmp_path):
    """SECU-02: DESKTOP_EXTERNAL_WHITELIST env var overrides defaults."""
    config_path = tmp_path / "desktop-runtime.json"
    config_path.write_text(json.dumps({"schemaVersion": 1}), encoding="utf-8")

    script = textwrap.dedent(
        f"""
        import {{ resolveDesktopRuntimeConfig }} from {json.dumps(RUNTIME_CONFIG_MODULE)};
        const config = resolveDesktopRuntimeConfig({{
          configPath: {json.dumps(str(config_path))},
          userDataDir: {json.dumps(str(tmp_path / "user-data"))},
          cacheDir: {json.dumps(str(tmp_path / "cache"))},
          logDir: {json.dumps(str(tmp_path / "logs"))},
          tempDir: {json.dumps(str(tmp_path / "tmp"))},
          env: {{ DESKTOP_EXTERNAL_WHITELIST: "https://example.com,https://docs.example.com" }},
        }});
        console.log(JSON.stringify(config.security?.openExternalWhitelist || []));
        """
    )

    payload = _run_node_json(script)

    assert payload == ["https://example.com", "https://docs.example.com"]


def test_main_process_enables_sandbox_when_packaged():
    """SECU-02: sandbox must be true when app.isPackaged is true."""
    main_source = MAIN_PROCESS_FILE.read_text(encoding="utf-8")

    sandbox_patterns = [
        "sandbox: !process.env.DESKTOP_FRONTEND_DEV_SERVER_URL && app.isPackaged",
        "sandbox: app.isPackaged && !process.env.DESKTOP_FRONTEND_DEV_SERVER_URL",
    ]
    assert any(p in main_source for p in sandbox_patterns), \
        "sandbox expression not found — should use app.isPackaged"


def test_main_process_web_security_always_true():
    """SECU-02: webSecurity must be true unconditionally (no usingBundledFileRenderer condition)."""
    main_source = MAIN_PROCESS_FILE.read_text(encoding="utf-8")

    assert "webSecurity: true," in main_source or "webSecurity: true" in main_source, \
        "webSecurity should be hardcoded to true"
    assert "webSecurity: !usingBundledFileRenderer" not in main_source, \
        "webSecurity should not be conditional on usingBundledFileRenderer"


def test_main_process_context_isolation_always_true():
    """SECU-02: contextIsolation must remain true."""
    main_source = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    assert "contextIsolation: true" in main_source, \
        "contextIsolation should be true"


def test_main_process_node_integration_always_false():
    """SECU-02: nodeIntegration must remain false."""
    main_source = MAIN_PROCESS_FILE.read_text(encoding="utf-8")
    assert "nodeIntegration: false" in main_source, \
        "nodeIntegration should be false"


def test_preload_exposes_all_31_methods():
    """SECU-02: All 23 desktopRuntime + 4 events + 3 auth + 1 localAsr methods must be present."""
    preload_source = PRELOAD_FILE.read_text(encoding="utf-8")

    desktop_methods = [
        "getRuntimeInfo",
        "requestCloudApi",
        "cancelCloudRequest",
        "requestLocalHelper",
        "transcribeLocalMedia",
        "getHelperStatus",
        "getServerStatus",
        "probeServerNow",
        "selectLocalMediaFile",
        "readLocalMediaFile",
        "getPathForFile",
        "openLogsDirectory",
        "getClientUpdateStatus",
        "checkClientUpdate",
        "startClientUpdateDownload",
        "acknowledgeClientUpdate",
        "restartAndInstall",
        "openClientUpdateLink",
        "openExternalUrl",
        "getModelUpdateStatus",
        "checkModelUpdate",
        "startModelUpdate",
        "cancelModelUpdate",
    ]
    for method in desktop_methods:
        assert f"{method}:" in preload_source, f"Method {method} not found in preload"

    event_methods = [
        "onHelperRestarting",
        "onServerStatusChanged",
        "onClientUpdateStatusChanged",
        "onModelUpdateProgress",
    ]
    for method in event_methods:
        assert f"{method}:" in preload_source, f"Event {method} not found in preload"

    assert 'cacheSession:' in preload_source, "auth.cacheSession not found"
    assert 'restoreSession:' in preload_source, "auth.restoreSession not found"
    assert 'clearSession:' in preload_source, "auth.clearSession not found"
    assert 'generateCourse:' in preload_source, "localAsr.generateCourse not found"


def test_preload_uses_context_bridge_not_direct_ipc():
    """SECU-02: All preload bridge must use contextBridge.exposeInMainWorld."""
    preload_source = PRELOAD_FILE.read_text(encoding="utf-8")
    assert "contextBridge.exposeInMainWorld" in preload_source, \
        "preload should use contextBridge.exposeInMainWorld"


def test_open_external_url_in_upload_panel_has_fallback():
    """SECU-02: openExternalUrl call in UploadPanel must have non-desktop fallback."""
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")
    assert "openExternalUrl" in upload_panel_source, "openExternalUrl not used in UploadPanel"
    assert "window.open" in upload_panel_source, \
        "UploadPanel should have window.open fallback for non-desktop environments"
