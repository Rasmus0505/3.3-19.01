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
    assert "下载桌面客户端" in upload_panel_source
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
    assert "仅支持公开单条视频链接，不支持 cookies、登录态、手动 cookie、播放列表或批量链接。粘贴分享文案时会自动提取第一条有效链接。" not in upload_panel_source
    assert "onNavigateToLesson?.(data.lesson.id)" in upload_panel_source
    assert 'loadLessonDetail(lessonId, { autoEnterImmersive: true })' in learning_shell_source


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

    assert 'const cardStatusLabel = isDesktopBundleLoading ? "检查中" : desktopBundlePreparable ? "可准备" : cardStatusAvailable ? "可用" : "不可用";' in upload_panel_source
    assert "if (!bundleSummary?.available && bundleSummary?.installAvailable) {" in upload_panel_source
    assert "bundleSummary = await installDesktopBundledAsrModel(FASTER_WHISPER_MODEL);" in upload_panel_source


def test_upload_panel_resolves_desktop_source_path_before_local_course_generation():
    upload_panel_source = UPLOAD_PANEL_FILE.read_text(encoding="utf-8")

    assert "resolveDesktopSelectedSourcePath(sourceFile) || resolveDesktopSelectedSourcePath(file) || \"\"" in upload_panel_source
    assert "当前素材缺少桌面本机路径，请重新选择一次文件后再试。" in upload_panel_source
    assert "const selectedSourceFile = attachDesktopSourcePath(" in upload_panel_source
    assert "resolveDesktopSelectedSourcePath(options?.sourceFile ?? file) || resolveDesktopSelectedSourcePath(file)" in upload_panel_source


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

    expected_message = "云端暂时无法访问已上传的文件，请稍后重试；若再次失败，请重新上传当前素材。"
    assert payload["direct"]["code"] == "CLOUD_FILE_ACCESS_FORBIDDEN"
    assert payload["direct"]["message"] == expected_message
    assert payload["nested"]["code"] == "CLOUD_FILE_ACCESS_FORBIDDEN"
    assert payload["nested"]["message"] == expected_message
    assert payload["mappedMessage"] == expected_message
