import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { openAsBlob } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDesktopRuntimeConfig } from "./runtime-config.mjs";
import { resolvePackagedDesktopRuntime, selectDesktopModelDir } from "./helper-runtime.mjs";
import { computeModelUpdateDelta, readLocalManifest, performIncrementalModelUpdate, copyDirectory } from "./model-updater.mjs";


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
let desktopHelperShutdownPromise = null;
let appShutdownStarted = false;
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
  downloading: false,
  downloadProgress: 0,
  downloadPath: "",
  installPending: false,
  lastError: "",
  badgeVisible: false,
};
let desktopModelUpdateState = {
  modelKey: DESKTOP_MODEL_UPDATE_KEY,
  status: "idle",
  updateAvailable: false,
  updating: false,
  downloading: false,
  totalFiles: 0,
  completedFiles: 0,
  currentFile: "",
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
  if (app.isPackaged) {
    // Packaged: .cache/frontend-dist is inside app.asar alongside app.asar.unpacked
    return path.join(process.resourcesPath, "app.asar.unpacked", ".cache", "frontend-dist", "index.html");
  }
  // Dev: use .cache from repo root
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
    desktopHelperProcess = null;
    desktopHelperShutdownPromise = null;
    desktopHelperStatus = {
      ...desktopHelperStatus,
      ok: false,
      healthy: false,
      modelReady: false,
      modelStatus: "helper_not_started",
    };
  });
}

function waitForChildProcessExit(childProcess, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!childProcess || childProcess.exitCode != null || childProcess.killed) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };
    const timer = setTimeout(() => {
      finish();
    }, timeoutMs);
    childProcess.once("exit", () => {
      clearTimeout(timer);
      finish();
    });
    childProcess.once("error", () => {
      clearTimeout(timer);
      finish();
    });
  });
}

async function stopDesktopHelper() {
  if (!desktopHelperProcess) {
    return;
  }
  if (desktopHelperShutdownPromise) {
    await desktopHelperShutdownPromise;
    return;
  }
  const helperProcess = desktopHelperProcess;
  desktopHelperShutdownPromise = (async () => {
    const helperPid = Number(helperProcess?.pid || 0);
    if (helperPid <= 0 || helperProcess.exitCode != null) {
      return;
    }
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn("taskkill.exe", ["/PID", String(helperPid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        killer.once("error", () => {
          try {
            helperProcess.kill();
          } catch {
            // Ignore direct kill fallback failure.
          }
          resolve();
        });
        killer.once("exit", () => {
          resolve();
        });
      });
      await waitForChildProcessExit(helperProcess, 5000);
      return;
    }
    try {
      helperProcess.kill("SIGTERM");
    } catch {
      // Ignore graceful shutdown failure.
    }
    await waitForChildProcessExit(helperProcess, 3000);
    if (helperProcess.exitCode == null) {
      try {
        helperProcess.kill("SIGKILL");
      } catch {
        // Ignore hard shutdown failure.
      }
      await waitForChildProcessExit(helperProcess, 2000);
    }
  })();
  try {
    await desktopHelperShutdownPromise;
  } finally {
    if (desktopHelperProcess === helperProcess) {
      desktopHelperProcess = null;
    }
    desktopHelperShutdownPromise = null;
  }
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
  try {
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
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        error_message: "Local helper is unreachable — is the desktop client running properly?",
        detail: String(error?.message || error || ""),
      },
    };
  }
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
      badgeVisible: false,
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
    const updateAvailable = Boolean(remoteVersion && remoteVersion !== app.getVersion());
    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "ready",
      localVersion: app.getVersion(),
      remoteVersion,
      updateAvailable,
      badgeVisible: updateAvailable,
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
      badgeVisible: false,
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

async function startClientUpdateDownload() {
  const entryUrl = desktopClientUpdateState?.entryUrl;
  if (!entryUrl) {
    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "error",
      lastError: "network_error",
      message: "无法获取更新下载地址",
    };
    emitClientUpdateState();
    return desktopClientUpdateState;
  }

  desktopClientUpdateState = {
    ...desktopClientUpdateState,
    status: "downloading",
    downloading: true,
    downloadProgress: 0,
    lastError: "",
    message: "正在下载更新...",
  };
  emitClientUpdateState();

  try {
    const response = await fetch(entryUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    const chunks = [];
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      const received = chunks.reduce((sum, c) => sum + c.length, 0);
      desktopClientUpdateState.downloadProgress = contentLength > 0
        ? Math.round((received / contentLength) * 100) : 0;
      desktopClientUpdateState.message = `正在下载... ${desktopClientUpdateState.downloadProgress}%`;
      emitClientUpdateState();
    }

    const versionedFilename = `bottle-desktop-${desktopClientUpdateState.remoteVersion}.exe`;
    const updatesDir = path.join(app.getPath("userData"), "updates");
    await fs.mkdir(updatesDir, { recursive: true });
    const installerPath = path.join(updatesDir, versionedFilename);
    await fs.writeFile(installerPath, Buffer.concat(chunks));

    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "ready",
      downloading: false,
      downloadProgress: 100,
      downloadPath: installerPath,
      installPending: true,
      message: "下载完成，点击「重启并安装」完成更新",
    };
  } catch (error) {
    let errorCategory = "unknown";
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("fetch") || errorMsg.includes("network") || errorMsg.includes("ENOTFOUND") || errorMsg.includes("ECONNREFUSED")) {
      errorCategory = "network_error";
    } else if (errorMsg.includes("status") || errorMsg.includes("500") || errorMsg.includes("502") || errorMsg.includes("503")) {
      errorCategory = "server_error";
    } else if (errorMsg.includes("space") || errorMsg.includes("disk") || errorMsg.includes("ENOSPC")) {
      errorCategory = "disk_error";
    }

    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "error",
      downloading: false,
      downloadProgress: 0,
      lastError: errorCategory,
      message: "下载失败，请重试",
    };
  }
  emitClientUpdateState();
  return desktopClientUpdateState;
}

async function openExternalUrl(targetUrl = "") {
  const normalizedUrl = trimText(targetUrl);
  if (!normalizedUrl) {
    return false;
  }
  const whitelist = desktopRuntimeConfig?.security?.openExternalWhitelist || [];
  let allowed = false;
  try {
    const parsedUrl = new URL(normalizedUrl);
    allowed = whitelist.some((allowedEntry) => {
      try {
        const p = new URL(allowedEntry);
        return parsedUrl.protocol === p.protocol && parsedUrl.host === p.host;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
  if (!allowed) {
    return false;
  }
  await shell.openExternal(normalizedUrl);
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
    downloading: false,
    message: "",
    lastError: "",
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
      downloading: false,
      totalFiles: fileCount,
      completedFiles: 0,
      currentFile: "",
      localVersion: trimText(localManifest?.model_version),
      remoteVersion: trimText(remoteManifest?.model_version),
      lastCheckedAt: new Date().toISOString(),
      message: fileCount > 0 ? "有新的模型更新可用" : "模型已是最新版本",
      lastError: "",
    };
  } catch (error) {
    desktopModelUpdateState = {
      ...desktopModelUpdateState,
      modelKey,
      status: "error",
      updating: false,
      downloading: false,
      lastCheckedAt: new Date().toISOString(),
      message: "",
      lastError: error instanceof Error ? error.message : "模型更新检查失败",
    };
  }
  emitModelUpdateState();
  return desktopModelUpdateState;
}

async function startDesktopModelUpdate(modelKey = DESKTOP_MODEL_UPDATE_KEY) {
  desktopModelUpdateState = {
    ...desktopModelUpdateState,
    modelKey,
    status: "downloading",
    updating: true,
    downloading: true,
    completedFiles: 0,
    currentFile: "",
    message: "正在更新模型...",
    lastError: "",
  };
  emitModelUpdateState();
  try {
    const remoteManifest = await fetchRemoteModelManifest(modelKey);
    const localManifest = await readLocalManifest(trimText(desktopRuntimeConfig?.local?.modelDir), modelKey);
    const delta = computeModelUpdateDelta(localManifest, remoteManifest);
    const remoteFiles = [...delta.missing, ...delta.changed];
    const totalFiles = remoteFiles.length;

    desktopModelUpdateState = {
      ...desktopModelUpdateState,
      totalFiles,
      completedFiles: 0,
    };
    emitModelUpdateState();

    const baseModelDir =
      trimText(desktopPackagedRuntime?.bundledModelDir) ||
      trimText(desktopRuntimeConfig?.local?.modelDir);
    const targetModelDir = trimText(desktopRuntimeConfig?.local?.modelDir);

    // First-run baseline copy: if target dir is empty, copy from bundled base
    if (localManifest.files.length === 0 && baseModelDir) {
      await copyDirectory(baseModelDir, targetModelDir);
      // Re-read local manifest after baseline copy for correct delta computation
      localManifest = await readLocalManifest(targetModelDir, modelKey);
    }

    for (let i = 0; i < remoteFiles.length; i++) {
      const file = remoteFiles[i];
      const relativeName = trimText(file.name);

      desktopModelUpdateState = {
        ...desktopModelUpdateState,
        currentFile: relativeName,
        completedFiles: i,
      };
      emitModelUpdateState();

      const targetPath = path.join(targetModelDir, ...relativeName.split("/"));
      const backupDir = `${targetModelDir}.backup`;
      const backupPath = path.join(backupDir, ...relativeName.split("/"));
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      if (await pathExists(targetPath)) {
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.copyFile(targetPath, backupPath);
      }
      const response = await fetch(
        `${runtimeCloudBaseUrl().replace(/\/+$/, "")}/api/local-asr-assets/download-models/${encodeURIComponent(trimText(modelKey))}/files/${relativeName
          .split("/")
          .map((item) => encodeURIComponent(item))
          .join("/")}`,
      );
      if (!response.ok) {
        throw new Error(`Model update download failed: ${response.status} - ${relativeName}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(targetPath, bytes);

      desktopModelUpdateState = {
        ...desktopModelUpdateState,
        completedFiles: i + 1,
      };
      emitModelUpdateState();
    }

    const nextManifest = {
      model_key: trimText(remoteManifest?.model_key) || trimText(modelKey),
      model_version: trimText(remoteManifest?.model_version) || trimText(localManifest?.model_version),
      file_count: normalizeFiles(remoteManifest).length,
      files: normalizeFiles(remoteManifest),
    };
    await fs.writeFile(path.join(targetModelDir, ".model-version.json"), JSON.stringify(nextManifest, null, 2), "utf8");

    desktopModelUpdateState = {
      ...desktopModelUpdateState,
      status: "installed",
      updating: false,
      downloading: false,
      updateAvailable: false,
      currentFile: "",
      message: `模型更新完成，共更新 ${totalFiles} 个文件`,
      lastError: "",
    };
  } catch (error) {
    let errorCategory = "unknown";
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("fetch") || errorMsg.includes("network") || errorMsg.includes("ENOTFOUND") || errorMsg.includes("ECONNREFUSED") || errorMsg.includes("Failed to fetch")) {
      errorCategory = "network_error";
    } else if (errorMsg.includes("status") && (errorMsg.includes("500") || errorMsg.includes("502") || errorMsg.includes("503"))) {
      errorCategory = "server_error";
    } else if (errorMsg.includes("space") || errorMsg.includes("disk") || errorMsg.includes("ENOSPC") || errorMsg.includes("no space")) {
      errorCategory = "disk_error";
    }

    desktopModelUpdateState = {
      ...desktopModelUpdateState,
      status: "error",
      updating: false,
      downloading: false,
      currentFile: "",
      lastError: errorCategory,
      message: "模型更新失败，请重试",
    };
  }
  emitModelUpdateState();
  return desktopModelUpdateState;
}

async function cancelDesktopModelUpdate() {
  desktopModelUpdateState = {
    ...desktopModelUpdateState,
    updating: false,
    downloading: false,
    currentFile: "",
    status: "idle",
    message: "模型更新已取消",
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
      sandbox: !process.env.DESKTOP_FRONTEND_DEV_SERVER_URL && app.isPackaged,
      webSecurity: true,
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
  if (desktopRuntimeConfig?.modelUpdate?.checkOnLaunch !== false) {
    void checkDesktopModelUpdate();
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
ipcMain.handle("desktop:start-client-update-download", async () => startClientUpdateDownload());
ipcMain.handle("desktop:restart-and-install", async () => {
  const downloadPath = desktopClientUpdateState?.downloadPath;
  if (!downloadPath) return false;
  try {
    await shell.openPath(downloadPath);
    setTimeout(() => {
      app.relaunch();
      app.quit();
    }, 2000);
    desktopClientUpdateState = {
      ...desktopClientUpdateState,
      status: "installed",
      installPending: false,
      badgeVisible: false,
      message: "正在启动安装程序...",
    };
    emitClientUpdateState();
    return true;
  } catch {
    return false;
  }
});
ipcMain.handle("desktop:open-external-url", async (_event, targetUrl = "") => openExternalUrl(targetUrl));
ipcMain.handle("desktop:get-model-update-status", () => desktopModelUpdateState);
ipcMain.handle("desktop:check-model-update", async (_event, modelKey = DESKTOP_MODEL_UPDATE_KEY) => checkDesktopModelUpdate(modelKey));
ipcMain.handle("desktop:start-model-update", async (_event, modelKey = DESKTOP_MODEL_UPDATE_KEY) => startDesktopModelUpdate(modelKey));
ipcMain.handle("desktop:cancel-model-update", async () => cancelDesktopModelUpdate());
ipcMain.handle("desktop:acknowledge-client-update", async () => {
  desktopClientUpdateState = {
    ...desktopClientUpdateState,
    badgeVisible: false,
  };
  emitClientUpdateState();
  return desktopClientUpdateState;
});
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

app.on("before-quit", (event) => {
  if (appShutdownStarted) {
    return;
  }
  appShutdownStarted = true;
  event.preventDefault();
  for (const controller of activeCloudRequests.values()) {
    controller.abort();
  }
  activeCloudRequests.clear();
  void (async () => {
    await stopDesktopHelper();
    app.quit();
  })();
});
