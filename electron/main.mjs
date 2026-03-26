import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { openAsBlob } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDesktopRuntimeConfig } from "./runtime-config.mjs";
import { resolvePackagedDesktopRuntime, selectDesktopModelDir } from "./helper-runtime.mjs";
import { computeModelUpdateDelta, readLocalManifest, performIncrementalModelUpdate } from "./model-updater.mjs";


const __filename = fileURLToPath(import.meta.url);
const electronRoot = path.dirname(__filename);
const desktopRoot = path.resolve(electronRoot, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const DESKTOP_ASR_API_BASE = "/api/desktop-asr";
const DESKTOP_URL_IMPORT_API_BASE = "/api/desktop-asr/url-import";
const DESKTOP_MODEL_UPDATE_KEY = "faster-whisper-medium";
const DESKTOP_URL_IMPORT_TASKS_PATH = "/api/desktop-asr/url-import/tasks";
const DESKTOP_MEDIA_FILE_FILTERS = [
  {
    name: "Media Files",
    extensions: ["mp3", "mp4", "m4a", "wav", "flac", "ogg", "aac", "webm", "mkv", "mov"],
  },
];

let mainWindow = null;
let desktopRuntimeConfig = null;
let desktopPackagedRuntime = null;
let desktopHelperProcess = null;
let desktopServerStatus = {
  reachable: false,
  lastCheckedAt: "",
  latencyMs: null,
  statusCode: 0,
  endpoint: "",
  reason: "not_checked",
};
let desktopHelperStatus = {
  ok: false,
  healthy: false,
  modelReady: false,
  modelStatus: "helper_not_started",
  helperMode: "",
  pythonVersion: "",
  statusCode: 0,
  lastCheckedAt: "",
};
let desktopClientUpdateState = {
  status: "idle",
  currentVersion: app.getVersion(),
  localVersion: app.getVersion(),
  remoteVersion: "",
  updateAvailable: false,
  updating: false,
  metadataUrl: "",
  entryUrl: "",
  releaseName: "",
  lastCheckedAt: "",
  message: "",
};
let desktopModelUpdateState = {
  modelKey: DESKTOP_MODEL_UPDATE_KEY,
  status: "idle",
  updateAvailable: false,
  updating: false,
  totalFiles: 0,
  completedFiles: 0,
  localVersion: "",
  remoteVersion: "",
  lastCheckedAt: "",
  message: "",
  lastError: "",
};
const activeCloudRequests = new Map();


function trimText(value) {
  return String(value ?? "").trim();
}

function isHttpUrl(value) {
  const normalized = trimText(value).toLowerCase();
  return normalized.startsWith("http://") || normalized.startsWith("https://");
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  new Headers(headers || {}).forEach((value, key) => {
    normalized[key] = value;
  });
  return normalized;
}

function pathExists(targetPath) {
  return fs
    .access(targetPath)
    .then(() => true)
    .catch(() => false);
}

function resolveCommand(command) {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function runtimeConfigPath() {
  return path.join(app.getPath("userData"), "desktop-runtime.json");
}

function authCachePath() {
  return path.join(app.getPath("userData"), "desktop-auth-session.json");
}

function frontendEntryPath() {
  return path.resolve(desktopRoot, ".cache", "frontend-dist", "index.html");
}

function helperBaseUrl() {
  const helperPort = Number(process.env.DESKTOP_LOCAL_HELPER_PORT || 18765);
  return `http://127.0.0.1:${helperPort}`;
}

async function readJsonFile(filePath) {
  try {
    const payload = JSON.parse(await fs.readFile(filePath, "utf8"));
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function emitClientUpdateState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("desktop:client-update-status-changed", desktopClientUpdateState);
}

function emitModelUpdateState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("desktop:model-update-progress", desktopModelUpdateState);
}

function runtimeCloudBaseUrl() {
  return trimText(desktopRuntimeConfig?.cloud?.apiBaseUrl) || trimText(desktopRuntimeConfig?.cloud?.appBaseUrl);
}

function helperModeLabel() {
  return app.isPackaged ? "bundled-runtime" : "system-python";
}

function buildRuntimeInfo() {
  return {
    cloud: desktopRuntimeConfig?.cloud || {},
    local: desktopRuntimeConfig?.local || {},
    helperMode: app.isPackaged ? "bundled-runtime" : "system-python",
    serverStatus: desktopServerStatus,
    helperStatus: desktopHelperStatus,
    clientUpdate: desktopClientUpdateState,
    modelUpdate: desktopModelUpdateState,
  };
}

async function initializeDesktopRuntimeConfig() {
  const userDataDir = app.getPath("userData");
  const defaultConfigPath = app.isPackaged ? path.join(process.resourcesPath, "runtime-defaults.json") : path.resolve(desktopRoot, ".cache", "runtime-defaults.json");
  if (app.isPackaged) {
    desktopPackagedRuntime = resolvePackagedDesktopRuntime(process.resourcesPath);
  }
  const selectedModelDir = app.isPackaged
    ? selectDesktopModelDir(process.resourcesPath, path.join(userDataDir, "models", "faster-distil-small.en"))
    : trimText(process.env.DESKTOP_MODEL_DIR) || path.join(userDataDir, "models", "faster-distil-small.en");
  desktopRuntimeConfig = resolveDesktopRuntimeConfig({
    configPath: runtimeConfigPath(),
    userDataDir,
    cacheDir: path.join(userDataDir, "cache"),
    logDir: path.join(userDataDir, "logs"),
    tempDir: path.join(userDataDir, "tmp"),
    defaultConfigPath,
    env: {
      ...process.env,
      DESKTOP_MODEL_DIR: selectedModelDir,
    },
  });
  desktopClientUpdateState = {
    ...desktopClientUpdateState,
    metadataUrl: trimText(desktopRuntimeConfig?.clientUpdate?.metadataUrl),
    entryUrl: trimText(desktopRuntimeConfig?.clientUpdate?.entryUrl),
  };
}

async function cacheAuthSession(session = {}) {
  const payload = {
    access_token: trimText(session?.access_token),
    refresh_token: trimText(session?.refresh_token),
    user: session?.user && typeof session.user === "object" ? session.user : null,
  };
  await writeJsonFile(authCachePath(), payload);
  return { ok: true };
}

async function restoreAuthSession(options = {}) {
  const session = await readJsonFile(authCachePath());
  const forceRefresh = Boolean(options?.forceRefresh);
  const refreshToken = trimText(session?.refresh_token);
  const cachedUser = session?.user || null;

  if (forceRefresh) {
    const baseUrl = runtimeCloudBaseUrl();
    if (!refreshToken || !baseUrl) {
      await writeJsonFile(authCachePath(), { user: cachedUser });
      return {
        status: "expired",
        auth: null,
        user: cachedUser,
        restored: false,
        refreshed: false,
        message: "登录状态已过期，请联网重新登录",
      };
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      });
      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (response.ok && trimText(payload?.access_token)) {
        const refreshedSession = {
          access_token: trimText(payload?.access_token),
          refresh_token: trimText(payload?.refresh_token) || refreshToken,
          user: payload?.user && typeof payload.user === "object" ? payload.user : cachedUser,
        };
        await writeJsonFile(authCachePath(), refreshedSession);
        return {
          status: "active",
          auth: refreshedSession,
          user: refreshedSession.user || null,
          restored: true,
          refreshed: true,
          message: "",
        };
      }
    } catch {
      // Fall through to the expired result below.
    }

    await writeJsonFile(authCachePath(), { user: cachedUser });
    return {
      status: "expired",
      auth: null,
      user: cachedUser,
      restored: false,
      refreshed: false,
      message: "登录状态已过期，请联网重新登录",
    };
  }

  if (trimText(session?.access_token)) {
    return {
      status: "active",
      auth: session,
      user: cachedUser,
      restored: true,
      refreshed: false,
      message: "",
    };
  }
  return {
    status: "anonymous",
    auth: null,
    user: cachedUser,
    restored: false,
    refreshed: false,
    message: "",
  };
}

async function clearAuthSession() {
  try {
    await fs.rm(authCachePath(), { force: true });
  } catch {
    // Ignore auth cache cleanup failure.
  }
  return { ok: true };
}

function helperSpawnCommand() {
  const helperPort = Number(process.env.DESKTOP_LOCAL_HELPER_PORT || 18765);
  const helperEnv = {
    ...process.env,
    DESKTOP_BACKEND_ROOT: repoRoot,
    DESKTOP_USER_DATA_DIR: trimText(desktopRuntimeConfig?.local?.userDataDir),
    DESKTOP_MODEL_DIR: trimText(desktopRuntimeConfig?.local?.modelDir),
    DESKTOP_CACHE_DIR: trimText(desktopRuntimeConfig?.local?.cacheDir),
    DESKTOP_LOG_DIR: trimText(desktopRuntimeConfig?.local?.logDir),
    DESKTOP_TEMP_DIR: trimText(desktopRuntimeConfig?.local?.tempDir),
    DESKTOP_PREINSTALLED_MODEL_DIR: app.isPackaged ? trimText(desktopPackagedRuntime?.bundledModelDir) : trimText(process.env.DESKTOP_PREINSTALLED_MODEL_DIR),
    DESKTOP_FFMPEG_BIN_DIR: app.isPackaged ? trimText(desktopPackagedRuntime?.ffmpegDir) : trimText(process.env.DESKTOP_FFMPEG_BIN_DIR),
    DESKTOP_YTDLP_PATH: app.isPackaged ? trimText(desktopPackagedRuntime?.ytdlpPath) : trimText(process.env.DESKTOP_YTDLP_PATH),
    PYTHONUNBUFFERED: "1",
  };

  if (app.isPackaged && desktopPackagedRuntime?.helperExists) {
    return {
      command: trimText(desktopPackagedRuntime.helperExePath),
      args: ["--host", "127.0.0.1", "--port", String(helperPort)],
      env: helperEnv,
      cwd: trimText(desktopPackagedRuntime.helperDir) || process.resourcesPath,
    };
  }

  const pythonExecutable = trimText(process.env.DESKTOP_PYTHON_EXECUTABLE) || resolveCommand("python");
  return {
    command: pythonExecutable,
    args: [path.resolve(repoRoot, "scripts", "run_desktop_backend.py"), "--host", "127.0.0.1", "--port", String(helperPort)],
    env: helperEnv,
    cwd: repoRoot,
  };
}

async function startDesktopHelper() {
  if (desktopHelperProcess && !desktopHelperProcess.killed) {
    return;
  }
  const spawnConfig = helperSpawnCommand();
  desktopHelperProcess = spawn(spawnConfig.command, spawnConfig.args, {
    cwd: spawnConfig.cwd,
    env: spawnConfig.env,
    stdio: "ignore",
    windowsHide: true,
  });
  desktopHelperProcess.on("exit", () => {
    desktopHelperStatus = {
      ...desktopHelperStatus,
      ok: false,
      healthy: false,
      modelReady: false,
      modelStatus: "helper_not_started",
    };
  });
}

async function helperRequest(request = {}) {
  const pathname = trimText(request?.path);
  const method = trimText(request?.method || "GET").toUpperCase() || "GET";
  const responseType = trimText(request?.responseType || "json").toLowerCase() || "json";
  const targetUrl = `${helperBaseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  const headers = {};
  let body = request?.body;
  if (body && typeof body === "object" && !(body instanceof Uint8Array) && !Buffer.isBuffer(body)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(targetUrl, { method, headers, body });
  if (responseType === "text") {
    return { ok: response.ok, status: response.status, data: await response.text() };
  }
  if (responseType === "arrayBuffer") {
    const bytes = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      bodyBase64: bytes.toString("base64"),
      contentType: response.headers.get("content-type") || "application/octet-stream",
    };
  }
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { ok: response.ok, status: response.status, data };
}

async function requestLocalHelper(request = {}) {
  return helperRequest(request);
}

function resolveCloudRequestUrl(request = {}) {
  const rawUrl = trimText(request?.url || request?.path);
  if (!rawUrl) {
    throw new Error("Desktop cloud request URL is required.");
  }
  if (isHttpUrl(rawUrl)) {
    return rawUrl;
  }
  const baseUrl = trimText(request?.baseUrl) || runtimeCloudBaseUrl();
  if (!baseUrl) {
    throw new Error("Desktop cloud API base URL is not configured.");
  }
  return `${baseUrl.replace(/\/+$/, "")}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
}

async function deserializeCloudRequestBody(body = null) {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const kind = trimText(body.kind);
  if (!kind || kind === "none") {
    return undefined;
  }
  if (kind === "text") {
    return String(body.text ?? "");
  }
  if (kind === "bytes") {
    return Buffer.from(String(body.base64 || ""), "base64");
  }
  if (kind === "file-path") {
    const sourcePath = trimText(body.sourcePath);
    if (!sourcePath) {
      return undefined;
    }
    return await openAsBlob(sourcePath, {
      type: trimText(body.contentType) || "application/octet-stream",
    });
  }
  if (kind === "form-data") {
    const form = new FormData();
    const entries = Array.isArray(body.entries) ? body.entries : [];
    for (const entry of entries) {
      const name = trimText(entry?.name);
      if (!name) {
        continue;
      }
      const entryKind = trimText(entry?.kind);
      if (entryKind === "text") {
        form.append(name, String(entry?.value ?? ""));
        continue;
      }
      if (entryKind === "file-path") {
        const sourcePath = trimText(entry?.sourcePath);
        if (!sourcePath) {
          continue;
        }
        const fileBlob = await openAsBlob(sourcePath, {
          type: trimText(entry?.contentType) || "application/octet-stream",
        });
        form.append(name, fileBlob, trimText(entry?.filename) || path.basename(sourcePath));
        continue;
      }
      if (entryKind === "file-bytes") {
        const fileBlob = new Blob([Buffer.from(String(entry?.base64 || ""), "base64")], {
          type: trimText(entry?.contentType) || "application/octet-stream",
        });
        form.append(name, fileBlob, trimText(entry?.filename) || "upload.bin");
      }
    }
    return form;
  }
  return undefined;
}

async function serializeCloudResponse(response) {
  const headers = normalizeHeaders(response.headers);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    headers,
    bodyBase64: bytes.toString("base64"),
    contentType: response.headers.get("content-type") || "",
  };
}

async function requestCloudApi(request = {}) {
  const requestId = trimText(request?.requestId);
  const controller = new AbortController();
  if (requestId) {
    activeCloudRequests.set(requestId, controller);
  }
  try {
    const targetUrl = resolveCloudRequestUrl(request);
    const response = await fetch(targetUrl, {
      method: trimText(request?.method || "GET").toUpperCase() || "GET",
      headers: normalizeHeaders(request?.headers || {}),
      body: await deserializeCloudRequestBody(request?.body),
      signal: controller.signal,
    });
    return await serializeCloudResponse(response);
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        status: 0,
        statusText: "",
        url: trimText(request?.url || request?.path),
        headers: {},
        bodyBase64: "",
        contentType: "",
        aborted: true,
        errorMessage: "Request aborted",
      };
    }
    throw error;
  } finally {
    if (requestId) {
      activeCloudRequests.delete(requestId);
    }
  }
}

function cancelCloudRequest(requestId = "") {
  const normalizedRequestId = trimText(requestId);
  if (!normalizedRequestId) {
    return false;
  }
  const controller = activeCloudRequests.get(normalizedRequestId);
  if (!controller) {
    return false;
  }
  controller.abort();
  activeCloudRequests.delete(normalizedRequestId);
  return true;
}

async function withTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshHelperStatus() {
  try {
    const startedAt = Date.now();
    const response = await withTimeout(`${helperBaseUrl()}/health/ready`, {}, 5000);
    const payload = await response.json();
    desktopHelperStatus = {
      ok: payload?.ok !== false,
      healthy: payload?.ok !== false && response.ok,
      modelReady: Boolean(payload?.model_ready ?? payload?.status?.model_ready),
      modelStatus: trimText(payload?.model_status ?? payload?.status?.model_status) || "unknown",
      helperMode: trimText(payload?.helper_mode ?? payload?.status?.helper_mode) || helperModeLabel(),
      pythonVersion: trimText(payload?.python_version ?? payload?.status?.python_version),
      statusCode: response.status,
      lastCheckedAt: payload?.checked_at || new Date(startedAt).toISOString(),
    };
  } catch (error) {
    desktopHelperStatus = {
      ...desktopHelperStatus,
      ok: false,
      healthy: false,
      modelReady: false,
      modelStatus: "helper_unreachable",
      helperMode: helperModeLabel(),
      statusCode: 0,
      lastCheckedAt: new Date().toISOString(),
    };
  }
  return desktopHelperStatus;
}

async function refreshServerStatus() {
  const baseUrl = runtimeCloudBaseUrl();
  if (!baseUrl) {
    desktopServerStatus = {
      reachable: false,
      lastCheckedAt: new Date().toISOString(),
      latencyMs: null,
      statusCode: 0,
      endpoint: "",
      reason: "cloud_base_url_missing",
    };
    sendToRenderer("desktop:server-status-changed", desktopServerStatus);
    return desktopServerStatus;
  }
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/health`;
  const startedAt = Date.now();
  try {
    const response = await withTimeout(endpoint, {}, 5000);
    desktopServerStatus = {
      reachable: response.ok,
      lastCheckedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
      endpoint,
      reason: response.ok ? "" : `HTTP ${response.status}`,
    };
  } catch (error) {
    desktopServerStatus = {
      reachable: false,
      lastCheckedAt: new Date().toISOString(),
      latencyMs: null,
      statusCode: 0,
      endpoint,
      reason: error instanceof Error ? error.message : "network_error",
    };
  }
  sendToRenderer("desktop:server-status-changed", desktopServerStatus);
  return desktopServerStatus;
}

async function openLogsDirectory() {
  const logDir = trimText(desktopRuntimeConfig?.local?.logDir);
  if (!logDir) {
    return false;
  }
  await fs.mkdir(logDir, { recursive: true });
  const result = await shell.openPath(logDir);
  return !trimText(result);
}

function resolveRequestedSourcePath(request = {}) {
  const directPath = trimText(request?.filePath || request?.sourcePath || request?.path);
  if (directPath) {
    return directPath;
  }
  return trimText(request?.file?.path || request?.file?.sourcePath || request?.file?.source_path);
}

async function readLocalMediaFile(sourcePath = "") {
  const resolvedSourcePath = path.resolve(trimText(sourcePath));
  const fileBytes = await fs.readFile(resolvedSourcePath);
  const stat = await fs.stat(resolvedSourcePath);
  return {
    ok: true,
    file: {
      name: path.basename(resolvedSourcePath),
      type: "",
      size: stat.size,
      lastModifiedMs: stat.mtimeMs,
      bodyBase64: fileBytes.toString("base64"),
    },
  };
}

async function selectLocalMediaFile(options = {}) {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: DESKTOP_MEDIA_FILE_FILTERS,
  });
  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }
  const selectedPath = result.filePaths[0];
  const stat = await fs.stat(selectedPath);
  return {
    ok: true,
    path: selectedPath,
    sourcePath: selectedPath,
    name: path.basename(selectedPath),
    size: stat.size,
    lastModifiedMs: stat.mtimeMs,
    options,
  };
}

async function transcribeLocalMedia(request = {}) {
  const sourcePath = resolveRequestedSourcePath(request);
  if (!sourcePath) {
    return { ok: false, message: "Desktop source path is required." };
  }
  const payload = {
    model_key: trimText(request?.modelKey || request?.model_key) || DESKTOP_MODEL_UPDATE_KEY,
    source_path: sourcePath,
    source_filename: trimText(request?.file?.name || request?.sourceFilename) || path.basename(sourcePath),
  };
  const response = await requestLocalHelper({
    path: `${DESKTOP_ASR_API_BASE}/transcribe`,
    method: "POST",
    responseType: "json",
    body: payload,
  });
  return response?.data || response;
}

async function cloudApiRequest(pathname, options = {}) {
  const session = await restoreAuthSession();
  const accessToken = trimText(session?.auth?.access_token);
  if (!accessToken) {
    return { ok: false, status: 401, data: { message: "请先登录后再生成课程" } };
  }
  const baseUrl = runtimeCloudBaseUrl();
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${pathname}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
    body: options.body,
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  return { ok: response.ok, status: response.status, data };
}

async function generateLocalCourse(request = {}) {
  const sourcePath = resolveRequestedSourcePath(request);
  if (!sourcePath) {
    return { ok: false, message: "Desktop source path is required." };
  }
  const helperResponse = await requestLocalHelper({
    path: `${DESKTOP_ASR_API_BASE}/generate`,
    method: "POST",
    responseType: "json",
    body: {
      model_key: trimText(request?.modelKey || request?.model_key) || DESKTOP_MODEL_UPDATE_KEY,
      source_path: sourcePath,
      source_filename: trimText(request?.sourceFilename || request?.file?.name) || path.basename(sourcePath),
      runtime_kind: trimText(request?.runtimeKind || request?.runtime_kind) || "desktop_local",
    },
  });
  const helperPayload = helperResponse?.data || {};
  if (!helperResponse?.ok) {
    return helperPayload;
  }

  const persistedResponse = await cloudApiRequest("/api/lessons/local-asr/complete", {
    method: "POST",
    body: JSON.stringify({
      asr_model: trimText(request?.modelKey || request?.model_key) || DESKTOP_MODEL_UPDATE_KEY,
      source_filename: trimText(request?.sourceFilename || request?.file?.name) || path.basename(sourcePath),
      source_duration_ms: Number(helperPayload?.source_duration_ms || 0),
      runtime_kind: trimText(request?.runtimeKind || request?.runtime_kind) || "desktop_local",
      asr_payload: helperPayload?.asr_payload || {},
    }),
  });
  const persistedPayload = persistedResponse?.data || {};
  if (!persistedResponse?.ok) {
    return {
      ok: false,
      message: trimText(persistedPayload?.message) || "本地生成结果写入云端失败",
      detail: persistedPayload,
    };
  }

  const lesson = persistedPayload?.lesson || {};
  const sentences = Array.isArray(lesson?.sentences) ? lesson.sentences : [];
  const translationPending =
    trimText(persistedPayload?.result_kind) === "asr_only" ||
    trimText(persistedPayload?.partial_failure_stage) === "translate_zh" ||
    trimText(helperPayload?.local_generation_result?.lesson_status).startsWith("partial");

  return {
    ok: true,
    course_id: String(lesson?.id || ""),
    course: {
      id: lesson?.id,
      title: trimText(lesson?.title),
      source_filename: trimText(lesson?.source_filename),
      source_duration_ms: Number(lesson?.source_duration_ms || 0),
      asr_model: trimText(lesson?.asr_model),
      runtime_kind: trimText((persistedPayload?.subtitle_cache_seed || {}).runtime_kind) || "desktop_local",
    },
    lesson,
    sentences,
    usage_seconds: Number(helperPayload?.usage_seconds || 0),
    translation_pending: translationPending,
    lesson_status: translationPending ? "partial_ready" : "ready",
    data: persistedPayload,
  };
}

async function checkDesktopClientUpdate({ reason = "manual", notify = false } = {}) {
  const metadataUrl = trimText(desktopRuntimeConfig?.clientUpdate?.metadataUrl);
  desktopClientUpdateState = {
    ...desktopClientUpdateState,
    status: "checking",
    message: "",
  };
  emitClientUpdateState();
  if (!metadataUrl) {
    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "idle",
      message: "Update metadata URL is not configured.",
      lastCheckedAt: new Date().toISOString(),
    };
    emitClientUpdateState();
    return desktopClientUpdateState;
  }

  try {
    const response = await withTimeout(metadataUrl, {}, 5000);
    const payload = await response.json();
    const remoteVersion = trimText(payload?.latestVersion || payload?.version);
    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "ready",
      localVersion: app.getVersion(),
      remoteVersion,
      updateAvailable: Boolean(remoteVersion && remoteVersion !== app.getVersion()),
      metadataUrl,
      entryUrl: trimText(payload?.entryUrl) || trimText(payload?.downloadUrl) || trimText(desktopRuntimeConfig?.clientUpdate?.entryUrl),
      releaseName: trimText(payload?.releaseName),
      lastCheckedAt: new Date().toISOString(),
      message: notify && reason === "manual" ? "Client update check completed." : "",
    };
  } catch (error) {
    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "error",
      message: error instanceof Error ? error.message : "Client update check failed.",
      lastCheckedAt: new Date().toISOString(),
    };
  }
  emitClientUpdateState();
  return desktopClientUpdateState;
}

async function openClientUpdateLink(preferredUrl = "") {
  const targetUrl = trimText(preferredUrl) || trimText(desktopClientUpdateState?.entryUrl) || trimText(desktopRuntimeConfig?.clientUpdate?.entryUrl);
  if (!targetUrl) {
    return false;
  }
  await shell.openExternal(targetUrl);
  return true;
}

async function fetchRemoteModelManifest(modelKey = DESKTOP_MODEL_UPDATE_KEY) {
  const baseUrl = runtimeCloudBaseUrl();
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/local-asr-assets/download-models/${encodeURIComponent(trimText(modelKey))}/manifest`);
  if (!response.ok) {
    throw new Error(`Model manifest request failed: ${response.status}`);
  }
  return await response.json();
}

async function checkDesktopModelUpdate(modelKey = DESKTOP_MODEL_UPDATE_KEY) {
  desktopModelUpdateState = {
    ...desktopModelUpdateState,
    modelKey,
    status: "checking",
    message: "",
  };
  emitModelUpdateState();
  try {
    const localManifest = await readLocalManifest(trimText(desktopRuntimeConfig?.local?.modelDir), modelKey);
    const remoteManifest = await fetchRemoteModelManifest(modelKey);
    const delta = computeModelUpdateDelta(localManifest, remoteManifest);
    const fileCount = delta.missing.length + delta.changed.length;
    desktopModelUpdateState = {
      ...desktopModelUpdateState,
      modelKey,
      status: "ready",
      updateAvailable: fileCount > 0,
      updating: false,
      totalFiles: fileCount,
      completedFiles: 0,
      localVersion: trimText(localManifest?.model_version),
      remoteVersion: trimText(remoteManifest?.model_version),
      lastCheckedAt: new Date().toISOString(),
      message: fileCount > 0 ? "New Bottle 1.0 model update is available." : "Bottle 1.0 model is up to date.",
      lastError: "",
    };
  } catch (error) {
    desktopModelUpdateState = {
      ...desktopModelUpdateState,
      modelKey,
      status: "error",
      updating: false,
      lastCheckedAt: new Date().toISOString(),
      message: "",
      lastError: error instanceof Error ? error.message : "Model update check failed.",
    };
  }
  emitModelUpdateState();
  return desktopModelUpdateState;
}

async function startDesktopModelUpdate(modelKey = DESKTOP_MODEL_UPDATE_KEY) {
  desktopModelUpdateState = {
    ...desktopModelUpdateState,
    modelKey,
    status: "updating",
    updating: true,
    completedFiles: 0,
    message: "Updating Bottle 1.0 model...",
    lastError: "",
  };
  emitModelUpdateState();
  try {
    const remoteManifest = await fetchRemoteModelManifest(modelKey);
    const baseModelDir =
      trimText(desktopPackagedRuntime?.bundledModelDir) ||
      trimText(desktopRuntimeConfig?.local?.modelDir);
    const result = await performIncrementalModelUpdate({
      apiBaseUrl: runtimeCloudBaseUrl(),
      modelKey,
      remoteManifest,
      baseModelDir,
      targetModelDir: trimText(desktopRuntimeConfig?.local?.modelDir),
    });
    desktopModelUpdateState = {
      ...desktopModelUpdateState,
      status: "ready",
      updating: false,
      updateAvailable: false,
      totalFiles: Number(remoteManifest?.file_count || remoteManifest?.files?.length || 0),
      completedFiles: Number(remoteManifest?.file_count || remoteManifest?.files?.length || 0),
      remoteVersion: trimText(remoteManifest?.model_version),
      lastCheckedAt: new Date().toISOString(),
      message: result?.updated ? "Bottle 1.0 model updated." : "Bottle 1.0 model is already up to date.",
      lastError: "",
    };
  } catch (error) {
    desktopModelUpdateState = {
      ...desktopModelUpdateState,
      status: "error",
      updating: false,
      lastCheckedAt: new Date().toISOString(),
      message: "",
      lastError: error instanceof Error ? error.message : "Model update failed.",
    };
  }
  emitModelUpdateState();
  return desktopModelUpdateState;
}

async function cancelDesktopModelUpdate() {
  desktopModelUpdateState = {
    ...desktopModelUpdateState,
    updating: false,
    status: "idle",
    message: "Model update cancelled.",
  };
  emitModelUpdateState();
  return desktopModelUpdateState;
}

function createMainWindow() {
  const devServerUrl = trimText(process.env.DESKTOP_FRONTEND_DEV_SERVER_URL);
  const usingBundledFileRenderer = !devServerUrl;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.resolve(electronRoot, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: !usingBundledFileRenderer ? true : false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (devServerUrl && !app.isPackaged) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(frontendEntryPath());
  }
}

async function bootstrapRuntime() {
  await initializeDesktopRuntimeConfig();
  await startDesktopHelper();
  await Promise.all([refreshHelperStatus(), refreshServerStatus()]);
  if (desktopRuntimeConfig?.clientUpdate?.checkOnLaunch) {
    void checkDesktopClientUpdate({ reason: "launch", notify: false });
  }
}

ipcMain.handle("desktop:get-runtime-info", async () => buildRuntimeInfo());
ipcMain.handle("desktop:request-cloud-api", async (_event, request = {}) => requestCloudApi(request));
ipcMain.handle("desktop:request-local-helper", async (_event, request = {}) => requestLocalHelper(request));
ipcMain.handle("desktop:transcribe-local-media", async (_event, request = {}) => transcribeLocalMedia(request));
ipcMain.handle("desktop:get-helper-status", async () => refreshHelperStatus());
ipcMain.handle("desktop:get-server-status", async () => desktopServerStatus);
ipcMain.handle("desktop:probe-server-now", async () => refreshServerStatus());
ipcMain.handle("desktop:select-local-media-file", async (_event, options = {}) => selectLocalMediaFile(options));
ipcMain.handle("desktop:read-local-media-file", async (_event, sourcePath = "") => readLocalMediaFile(sourcePath));
ipcMain.handle("desktop:open-logs-directory", async () => openLogsDirectory());
ipcMain.handle("desktop:get-client-update-status", () => desktopClientUpdateState);
ipcMain.handle("desktop:check-client-update", async () => checkDesktopClientUpdate({ reason: "manual", notify: true }));
ipcMain.handle("desktop:open-client-update-link", async (_event, preferredUrl = "") => openClientUpdateLink(preferredUrl));
ipcMain.handle("desktop:get-model-update-status", () => desktopModelUpdateState);
ipcMain.handle("desktop:check-model-update", async (_event, modelKey = DESKTOP_MODEL_UPDATE_KEY) => checkDesktopModelUpdate(modelKey));
ipcMain.handle("desktop:start-model-update", async (_event, modelKey = DESKTOP_MODEL_UPDATE_KEY) => startDesktopModelUpdate(modelKey));
ipcMain.handle("desktop:cancel-model-update", async () => cancelDesktopModelUpdate());
ipcMain.handle("desktop:auth-cache-session", async (_event, session = {}) => cacheAuthSession(session));
ipcMain.handle("desktop:auth-restore-session", async (_event, options = {}) => restoreAuthSession(options));
ipcMain.handle("desktop:auth-clear-session", async () => clearAuthSession());
ipcMain.handle("local-asr:generate-course", async (_event, request = {}) => generateLocalCourse(request));
ipcMain.on("desktop:cancel-cloud-request", (_event, requestId = "") => {
  cancelCloudRequest(requestId);
});

app.whenReady().then(async () => {
  await bootstrapRuntime();
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (desktopHelperProcess && !desktopHelperProcess.killed) {
    desktopHelperProcess.kill();
  }
  for (const controller of activeCloudRequests.values()) {
    controller.abort();
  }
  activeCloudRequests.clear();
});
