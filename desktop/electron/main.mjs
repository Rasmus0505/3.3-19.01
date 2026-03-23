import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DESKTOP_RUNTIME_CONFIG_FILE_NAME,
  resolveDesktopRuntimeConfig,
  validateDesktopRuntimeConfig,
} from "./runtime-config.mjs";
import { resolvePackagedDesktopRuntime, selectDesktopModelDir } from "./helper-runtime.mjs";
import { computeModelUpdateDelta, fetchRemoteManifest, performIncrementalModelUpdate, readLocalManifest } from "./model-updater.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const iconPath = path.join(path.resolve(currentDir, ".."), "build", "icon.ico");
const LOCAL_HELPER_ALLOWED_PREFIXES = ["/api/local-asr-assets", "/api/desktop-asr", "/api/desktop-asr/url-import", "/health", "/health/ready"];
const DESKTOP_MODEL_UPDATE_KEY = "faster-whisper-medium";

let mainWindow = null;
let backendProcess = null;
let backendPort = null;
let backendLogPath = "";
let backendLogHandle = null;
let backendRoot = "";
let desktopConfigPath = "";
let desktopRuntimeConfig = null;
let packagedDesktopRuntime = null;
let backendRestartCount = 0;
let healthPollTimer = null;
let healthPollFailureCount = 0;
let backendRestartInFlight = false;
let backendShutdownExpected = false;
let modelUpdateAbortController = null;
let latestRemoteModelManifest = null;

let desktopModelUpdateState = {
  checking: false,
  updateAvailable: false,
  updating: false,
  cancellable: false,
  modelKey: DESKTOP_MODEL_UPDATE_KEY,
  localVersion: "",
  remoteVersion: "",
  totalFiles: 0,
  completedFiles: 0,
  currentFile: "",
  missingFiles: [],
  changedFiles: [],
  lastCheckedAt: "",
  lastCompletedAt: "",
  lastError: "",
  message: "",
};

const MAX_BACKEND_RESTART_COUNT = 3;
const HEALTH_POLL_INTERVAL_MS = 30_000;
const HEALTH_POLL_MAX_FAILURES = 3;

let lastHelperHealth = {
  ok: false,
  healthy: false,
  modelReady: false,
  modelStatus: "helper_not_started",
  helperMode: "",
  pythonVersion: "",
  lastCheckedAt: "",
  statusCode: 0,
};
let serverReachabilityTimer = null;
let lastCloudServerStatus = {
  reachable: true,
  lastCheckedAt: "",
  latencyMs: null,
};
let preloadDiagnostics = {
  preloadPath: "",
  exists: false,
  size: 0,
  mtime: "",
  inspectError: "",
  appPath: "",
  resourcesPath: "",
  lastResolvedAt: "",
  sandbox: true,
  contextIsolation: true,
  lastNavigationAt: "",
  lastNavigationUrl: "",
  lastDidFinishLoadAt: "",
  lastPreloadReadyAt: "",
  lastPreloadStage: "",
  lastPreloadHref: "",
  lastPreloadError: "",
  lastPreloadErrorAt: "",
  lastBridgeProbeAt: "",
  lastBridgeProbeReason: "",
  lastBridgeProbeError: "",
  lastBridgeSnapshot: null,
};

function nowIso() {
  return new Date().toISOString();
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error",
      stack: error.stack || "",
    };
  }
  return {
    name: "Error",
    message: String(error || "Unknown error"),
    stack: "",
  };
}

function inspectFile(filePath) {
  const resolvedPath = String(filePath || "").trim();
  if (!resolvedPath) {
    return {
      preloadPath: "",
      exists: false,
      size: 0,
      mtime: "",
      inspectError: "preload path is empty",
    };
  }
  try {
    const stat = fs.statSync(resolvedPath);
    return {
      preloadPath: resolvedPath,
      exists: stat.isFile(),
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      inspectError: "",
    };
  } catch (error) {
    return {
      preloadPath: resolvedPath,
      exists: false,
      size: 0,
      mtime: "",
      inspectError: error instanceof Error ? error.message : String(error),
    };
  }
}

function updatePreloadDiagnostics(nextPatch = {}) {
  preloadDiagnostics = {
    ...preloadDiagnostics,
    ...nextPatch,
  };
  return preloadDiagnostics;
}

function appendDesktopDiagnostic(eventName, payload = {}) {
  const serializedPayload = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ");
  appendBackendLog(`[desktop] ${eventName}${serializedPayload ? ` ${serializedPayload}` : ""}`);
}

function ensureIsoString(value) {
  const text = String(value || "").trim();
  return text || nowIso();
}

function ensureLogFile(logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "", { encoding: "utf8" });
  }
}

function appendBackendLog(message) {
  if (!backendLogPath) {
    return;
  }
  ensureLogFile(backendLogPath);
  fs.appendFileSync(backendLogPath, `[${nowIso()}] ${message}\n`, "utf8");
}

function updateLastHelperHealth(nextStatus = {}) {
  lastHelperHealth = {
    ...lastHelperHealth,
    ...nextStatus,
    lastCheckedAt: ensureIsoString(nextStatus.lastCheckedAt ?? lastHelperHealth.lastCheckedAt),
  };
  return lastHelperHealth;
}

function getStoppedHelperHealthSnapshot(modelStatus = "helper_not_running") {
  return updateLastHelperHealth({
    ok: false,
    healthy: false,
    modelReady: false,
    modelStatus,
    helperMode: lastHelperHealth.helperMode || (app.isPackaged ? "bundled-runtime" : "system-python"),
    pythonVersion: lastHelperHealth.pythonVersion || "",
    statusCode: 0,
    lastCheckedAt: nowIso(),
  });
}

function updateCloudServerStatus(nextPatch = {}) {
  lastCloudServerStatus = {
    ...lastCloudServerStatus,
    ...nextPatch,
    reachable: Boolean(nextPatch.reachable ?? lastCloudServerStatus.reachable),
    lastCheckedAt: ensureIsoString(nextPatch.lastCheckedAt ?? lastCloudServerStatus.lastCheckedAt),
    latencyMs:
      nextPatch.latencyMs == null
        ? lastCloudServerStatus.latencyMs
        : Math.max(0, Number(nextPatch.latencyMs || 0)),
  };
  return lastCloudServerStatus;
}

async function checkCloudServerReachable() {
  const startedAt = Date.now();
  try {
    const response = await fetch(buildCloudApiUrl("api/health"), { cache: "no-store" });
    return updateCloudServerStatus({
      reachable: response.ok,
      latencyMs: Date.now() - startedAt,
      lastCheckedAt: nowIso(),
    });
  } catch (_) {
    return updateCloudServerStatus({
      reachable: false,
      latencyMs: null,
      lastCheckedAt: nowIso(),
    });
  }
}

async function probeCloudServerAndNotify() {
  const previousReachable = Boolean(lastCloudServerStatus.reachable);
  const nextStatus = await checkCloudServerReachable();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:server-status-changed", nextStatus);
  }
  if (previousReachable !== Boolean(nextStatus.reachable)) {
    appendBackendLog(`[desktop] cloud reachability changed reachable=${String(nextStatus.reachable)}`);
  }
  return nextStatus;
}

function startServerReachabilityPolling() {
  stopServerReachabilityPolling();
  void probeCloudServerAndNotify();
  serverReachabilityTimer = setInterval(() => {
    void probeCloudServerAndNotify();
  }, 60_000);
}

function stopServerReachabilityPolling() {
  if (serverReachabilityTimer) {
    clearInterval(serverReachabilityTimer);
    serverReachabilityTimer = null;
  }
}

function normalizeHelperHealthPayload(payload = {}, options = {}) {
  const statusPayload = payload && typeof payload.status === "object" ? payload.status : {};
  const responseOk = options.responseOk !== false;
  const statusCode = Number(options.statusCode || 0);
  const healthy = Boolean(responseOk && payload?.ok === true && payload?.ready !== false);
  const modelReady = Boolean(
    payload?.model_ready ??
      payload?.asr_model_ready ??
      statusPayload?.model_ready ??
      statusPayload?.asr_model_ready ??
      false,
  );
  const modelStatus = String(
    payload?.model_status ||
      payload?.model_status_message ||
      statusPayload?.model_status ||
      statusPayload?.model_status_message ||
      payload?.message ||
      "",
  ).trim();
  return updateLastHelperHealth({
    ok: Boolean(payload?.ok),
    healthy,
    modelReady,
    modelStatus: modelStatus || (healthy ? "ready" : "unreachable"),
    helperMode: String(payload?.helper_mode || statusPayload?.helper_mode || ""),
    pythonVersion: String(payload?.python_version || statusPayload?.python_version || ""),
    statusCode,
    lastCheckedAt: ensureIsoString(payload?.checked_at || statusPayload?.checked_at),
  });
}

function getResolvedDesktopModelDir() {
  if (!desktopRuntimeConfig) {
    throw new Error("Desktop runtime config has not been initialized.");
  }
  const packagedRuntime = getPackagedDesktopRuntime();
  return app.isPackaged && packagedRuntime
    ? selectDesktopModelDir(process.resourcesPath, desktopRuntimeConfig.local.modelDir)
    : desktopRuntimeConfig.local.modelDir;
}

function getDesktopModelUpdateTargetDir() {
  if (!desktopRuntimeConfig) {
    throw new Error("Desktop runtime config has not been initialized.");
  }
  return desktopRuntimeConfig.local.modelDir;
}

function normalizeModelUpdateState(nextPatch = {}) {
  return {
    ...desktopModelUpdateState,
    ...nextPatch,
    modelKey: String(nextPatch.modelKey || desktopModelUpdateState.modelKey || DESKTOP_MODEL_UPDATE_KEY),
    totalFiles: Math.max(0, Number(nextPatch.totalFiles ?? desktopModelUpdateState.totalFiles ?? 0)),
    completedFiles: Math.max(0, Number(nextPatch.completedFiles ?? desktopModelUpdateState.completedFiles ?? 0)),
    missingFiles: Array.isArray(nextPatch.missingFiles ?? desktopModelUpdateState.missingFiles)
      ? [...(nextPatch.missingFiles ?? desktopModelUpdateState.missingFiles)]
      : [],
    changedFiles: Array.isArray(nextPatch.changedFiles ?? desktopModelUpdateState.changedFiles)
      ? [...(nextPatch.changedFiles ?? desktopModelUpdateState.changedFiles)]
      : [],
    lastCheckedAt: ensureIsoString(nextPatch.lastCheckedAt ?? desktopModelUpdateState.lastCheckedAt),
    lastCompletedAt: nextPatch.lastCompletedAt === "" ? "" : ensureIsoString(nextPatch.lastCompletedAt ?? desktopModelUpdateState.lastCompletedAt),
  };
}

function broadcastModelUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:model-update-progress", desktopModelUpdateState);
  }
}

function updateDesktopModelUpdateState(nextPatch = {}, shouldBroadcast = true) {
  desktopModelUpdateState = normalizeModelUpdateState(nextPatch);
  if (shouldBroadcast) {
    broadcastModelUpdateState();
  }
  return desktopModelUpdateState;
}

function buildCloudApiUrl(relativePath) {
  const apiBaseUrl = String(desktopRuntimeConfig?.cloud?.apiBaseUrl || "").trim();
  if (!apiBaseUrl) {
    throw new Error("Desktop cloud API base URL is empty.");
  }
  return new URL(relativePath, apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`).toString();
}

async function checkDesktopModelUpdate(modelKey = DESKTOP_MODEL_UPDATE_KEY) {
  const resolvedModelKey = String(modelKey || DESKTOP_MODEL_UPDATE_KEY).trim() || DESKTOP_MODEL_UPDATE_KEY;
  updateDesktopModelUpdateState({
    checking: true,
    lastError: "",
    message: "正在检查本机模型更新",
    modelKey: resolvedModelKey,
    message: "Checking Bottle 1.0 updates...",
  });
  try {
    const remoteManifest = await fetchRemoteManifest(buildCloudApiUrl(""), resolvedModelKey);
    const localManifest = await readLocalManifest(getResolvedDesktopModelDir(), resolvedModelKey);
    latestRemoteModelManifest = remoteManifest;
    const delta = computeModelUpdateDelta(localManifest, remoteManifest);
    const totalFiles = delta.missing.length + delta.changed.length;
    const versionChanged = String(localManifest.model_version || "") !== String(remoteManifest.model_version || "");
    return updateDesktopModelUpdateState({
      checking: false,
      updateAvailable: versionChanged || totalFiles > 0,
      updating: false,
      cancellable: false,
      localVersion: String(localManifest.model_version || ""),
      remoteVersion: String(remoteManifest.model_version || ""),
      totalFiles,
      completedFiles: 0,
      currentFile: "",
      missingFiles: delta.missing.map((item) => item.name),
      changedFiles: delta.changed.map((item) => item.name),
      lastError: "",
      message: totalFiles > 0 ? "发现新的 Bottle 1.0 模型版本" : "本机模型已是最新版本",
    });
  } catch (error) {
    latestRemoteModelManifest = null;
    return updateDesktopModelUpdateState({
      checking: false,
      updateAvailable: false,
      updating: false,
      cancellable: false,
      currentFile: "",
      totalFiles: 0,
      completedFiles: 0,
      missingFiles: [],
      changedFiles: [],
      lastError: error instanceof Error ? error.message : String(error),
      message: "检查本机模型更新失败",
    });
  }
}

async function startDesktopModelUpdate(modelKey = DESKTOP_MODEL_UPDATE_KEY) {
  const resolvedModelKey = String(modelKey || DESKTOP_MODEL_UPDATE_KEY).trim() || DESKTOP_MODEL_UPDATE_KEY;
  if (desktopModelUpdateState.updating) {
    return desktopModelUpdateState;
  }
  const currentState = desktopModelUpdateState.updateAvailable ? desktopModelUpdateState : await checkDesktopModelUpdate(resolvedModelKey);
  if (!currentState.updateAvailable || !latestRemoteModelManifest) {
    return currentState;
  }
  modelUpdateAbortController = new AbortController();
  updateDesktopModelUpdateState({
    checking: false,
    updating: true,
    cancellable: true,
    completedFiles: 0,
    currentFile: "",
    lastError: "",
    message: "正在更新 Bottle 1.0 本机模型",
  });
  try {
    const sourceModelDir = getResolvedDesktopModelDir();
    const targetModelDir = getDesktopModelUpdateTargetDir();
    await performIncrementalModelUpdate({
      apiBaseUrl: buildCloudApiUrl(""),
      modelKey: resolvedModelKey,
      remoteManifest: latestRemoteModelManifest,
      baseModelDir: sourceModelDir,
      targetModelDir,
      signal: modelUpdateAbortController.signal,
      onProgress: (payload) => {
        const phase = String(payload?.phase || "").trim();
        const currentFile = String(payload?.currentFile || "");
        const totalFiles = Math.max(0, Number(payload?.totalFiles || 0));
        const completedFiles = Math.max(0, Number(payload?.completedFiles || 0));
        let message = "正在更新 Bottle 1.0 本机模型";
        if (phase === "downloading") {
          message = currentFile ? `正在下载 ${currentFile}` : "正在下载模型文件";
        } else if (phase === "applying") {
          message = currentFile ? `正在应用 ${currentFile}` : "正在应用模型更新";
        } else if (phase === "completed") {
          message = "Bottle 1.0 本机模型已更新";
        }
        updateDesktopModelUpdateState({
          updating: phase !== "completed",
          cancellable: phase !== "completed",
          totalFiles,
          completedFiles: phase === "completed" ? totalFiles : completedFiles,
          currentFile,
          remoteVersion: String(payload?.modelVersion || latestRemoteModelManifest?.model_version || desktopModelUpdateState.remoteVersion || ""),
          message,
        });
      },
    });
    if (backendPort && path.resolve(sourceModelDir) !== path.resolve(targetModelDir)) {
      appendBackendLog(`[desktop] helper restart requested reason=model updated target=${targetModelDir}`);
      await scheduleBackendRestart("local model updated");
    }
    const refreshedState = await checkDesktopModelUpdate(resolvedModelKey);
    return updateDesktopModelUpdateState({
      ...refreshedState,
      updating: false,
      cancellable: false,
      updateAvailable: false,
      completedFiles: Math.max(refreshedState.totalFiles, desktopModelUpdateState.totalFiles),
      lastCompletedAt: nowIso(),
      lastError: "",
      message: "Bottle 1.0 本机模型已更新",
    });
  } catch (error) {
    const aborted = error?.name === "AbortError";
    if (!aborted) {
      appendBackendLog(`[desktop] model update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const refreshedState = await checkDesktopModelUpdate(resolvedModelKey);
    return updateDesktopModelUpdateState({
      ...refreshedState,
      updating: false,
      cancellable: false,
      currentFile: "",
      completedFiles: 0,
      lastError: aborted ? "" : error instanceof Error ? error.message : String(error),
      message: aborted ? "模型更新已取消" : "模型更新失败，已回滚到上一版本",
    });
  } finally {
    modelUpdateAbortController = null;
  }
}

function cancelDesktopModelUpdate() {
  if (!modelUpdateAbortController) {
    return updateDesktopModelUpdateState({
      updating: false,
      cancellable: false,
      message: desktopModelUpdateState.message || "当前没有进行中的模型更新",
    });
  }
  modelUpdateAbortController.abort();
  return updateDesktopModelUpdateState({
    cancellable: false,
    message: "正在取消模型更新",
  });
}

function getDesktopClientRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(currentDir, "..");
}

function getBackendRoot() {
  if (app.isPackaged) {
    return getPackagedDesktopRuntime().helperAppDir;
  }
  return path.resolve(getDesktopClientRoot(), "..");
}

function getBackendScriptPath() {
  return path.join(getBackendRoot(), "scripts", "run_desktop_backend.py");
}

function getPackagedRuntimeDefaultsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "runtime-defaults.json");
  }
  return path.join(getDesktopClientRoot(), ".cache", "runtime-defaults.json");
}

function getPackagedDesktopRuntime() {
  if (!app.isPackaged) {
    return null;
  }
  if (!packagedDesktopRuntime) {
    packagedDesktopRuntime = resolvePackagedDesktopRuntime(process.resourcesPath);
  }
  return packagedDesktopRuntime;
}

function getPythonCandidates() {
  const configured = String(process.env.DESKTOP_PYTHON_EXECUTABLE || "").trim();
  const candidates = [];
  if (configured) {
    candidates.push({ command: configured, args: [] });
  }
  candidates.push({ command: "py", args: ["-3.11"] });
  candidates.push({ command: "python", args: [] });
  candidates.push({ command: "python3", args: [] });
  return candidates;
}

function resolvePythonCommand() {
  for (const candidate of getPythonCandidates()) {
    const probe = spawnSync(candidate.command, [...candidate.args, "--version"], {
      stdio: "ignore",
      timeout: 5000,
      windowsHide: true,
    });
    if (probe.status === 0) {
      return candidate;
    }
  }
  throw new Error("No usable Python 3.11 runtime was found. Install Python 3.11 or set DESKTOP_PYTHON_EXECUTABLE.");
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function fetchHelperHealth(pathname = "/health/ready") {
  if (!backendPort) {
    return getStoppedHelperHealthSnapshot();
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}${pathname}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return normalizeHelperHealthPayload(payload, { responseOk: response.ok, statusCode: response.status });
  } catch (error) {
    const modelStatus = error?.name === "AbortError" ? "health_check_timeout" : "health_check_failed";
    return updateLastHelperHealth({
      ok: false,
      healthy: false,
      modelReady: false,
      modelStatus,
      statusCode: 0,
      lastCheckedAt: nowIso(),
    });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForBackendReady(port, timeoutMs = 45000) {
  const startedAt = Date.now();
  const targetUrl = `http://127.0.0.1:${port}/health/ready`;
  while (Date.now() - startedAt < timeoutMs) {
    if (backendProcess && backendProcess.exitCode != null) {
      throw new Error(`The local helper exited before startup completed. Exit code: ${backendProcess.exitCode}`);
    }
    try {
      const response = await fetch(targetUrl, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        const helperStatus = normalizeHelperHealthPayload(payload, { responseOk: response.ok, statusCode: response.status });
        if (helperStatus.ok && helperStatus.healthy) {
          return;
        }
      }
    } catch (_) {
      // Keep waiting until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out while waiting for local helper readiness check: ${targetUrl}`);
}

function closeBackendLogHandle() {
  if (typeof backendLogHandle === "number") {
    fs.closeSync(backendLogHandle);
  }
  backendLogHandle = null;
}

function loadDesktopRuntimeConfigForApp() {
  const userDataDir = app.getPath("userData");
  const cacheDir = app.getPath("sessionData");
  const tempDir = path.join(app.getPath("temp"), "english-trainer-desktop");
  const logDir = app.getPath("logs");
  desktopConfigPath = path.join(userDataDir, DESKTOP_RUNTIME_CONFIG_FILE_NAME);
  desktopRuntimeConfig = resolveDesktopRuntimeConfig({
    configPath: desktopConfigPath,
    userDataDir,
    cacheDir,
    logDir,
    tempDir,
    env: process.env,
    defaultConfigPath: getPackagedRuntimeDefaultsPath(),
  });
  validateDesktopRuntimeConfig(desktopRuntimeConfig, desktopConfigPath);
}

async function startBackend() {
  if (!desktopRuntimeConfig) {
    throw new Error("Desktop runtime config has not been initialized.");
  }
  backendRoot = getBackendRoot();
  backendPort = await pickFreePort();
  backendLogPath = path.join(desktopRuntimeConfig.local.logDir, "desktop-helper.log");
  ensureLogFile(backendLogPath);

  const packagedRuntime = getPackagedDesktopRuntime();
  const resolvedModelDir =
    app.isPackaged && packagedRuntime
      ? selectDesktopModelDir(process.resourcesPath, desktopRuntimeConfig.local.modelDir)
      : desktopRuntimeConfig.local.modelDir;
  let launchCommand = "";
  let launchArgs = [];
  if (app.isPackaged) {
    if (!packagedRuntime?.helperExists) {
      throw new Error(`Bundled local helper runtime is missing: ${packagedRuntime?.helperExecutablePath || "unknown path"}`);
    }
    launchCommand = packagedRuntime.helperExecutablePath;
    launchArgs = ["--host", "127.0.0.1", "--port", String(backendPort)];
  } else {
    const pythonRuntime = resolvePythonCommand();
    const backendScript = getBackendScriptPath();
    launchCommand = pythonRuntime.command;
    launchArgs = [...pythonRuntime.args, backendScript, "--host", "127.0.0.1", "--port", String(backendPort)];
  }
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    DESKTOP_BACKEND_ROOT: backendRoot,
    DESKTOP_CONFIG_PATH: desktopConfigPath,
    DESKTOP_USER_DATA_DIR: desktopRuntimeConfig.local.userDataDir,
    DESKTOP_MODEL_DIR: resolvedModelDir,
    DESKTOP_CACHE_DIR: desktopRuntimeConfig.local.cacheDir,
    DESKTOP_LOG_DIR: desktopRuntimeConfig.local.logDir,
    DESKTOP_TEMP_DIR: desktopRuntimeConfig.local.tempDir,
    DESKTOP_PREINSTALLED_MODEL_DIR: packagedRuntime?.bottle1ModelDir || "",
    DESKTOP_INSTALL_STATE_PATH: packagedRuntime?.installStatePath || "",
  };

  backendShutdownExpected = false;
  backendLogHandle = fs.openSync(backendLogPath, "a");
  backendProcess = spawn(launchCommand, launchArgs, {
    cwd: backendRoot,
    env,
    stdio: ["ignore", backendLogHandle, backendLogHandle],
    windowsHide: true,
  });
  const spawnedProcess = backendProcess;

  spawnedProcess.once("error", (error) => {
    appendBackendLog(`[desktop] helper process error: ${error.message}`);
  });
  spawnedProcess.once("exit", (code, signal) => {
    if (backendProcess === spawnedProcess) {
      backendProcess = null;
      backendPort = null;
    }
    closeBackendLogHandle();
    stopHealthPolling();
    const unexpectedExit = !backendShutdownExpected && (signal != null || Number(code ?? 0) !== 0);
    if (unexpectedExit) {
      void scheduleBackendRestart(`helper exited unexpectedly (code=${String(code ?? "")}, signal=${String(signal ?? "")})`);
    } else if (!backendShutdownExpected) {
      updateLastHelperHealth({
        ok: false,
        healthy: false,
        modelReady: false,
        modelStatus: "helper_stopped",
        statusCode: 0,
        lastCheckedAt: nowIso(),
      });
    }
  });

  await waitForBackendReady(backendPort);
  healthPollFailureCount = 0;
  backendRestartCount = 0;
  await fetchHelperHealth("/health/ready");
}

async function stopBackend() {
  stopHealthPolling();
  if (!backendProcess || backendProcess.exitCode != null) {
    closeBackendLogHandle();
    getStoppedHelperHealthSnapshot();
    return;
  }
  backendShutdownExpected = true;
  const runningProcess = backendProcess;
  backendProcess.kill();
  await new Promise((resolve) => {
    runningProcess.once("exit", () => resolve());
    setTimeout(resolve, 5000);
  });
  backendProcess = null;
  backendPort = null;
  closeBackendLogHandle();
  getStoppedHelperHealthSnapshot();
}

function startHealthPolling() {
  stopHealthPolling();
  healthPollTimer = setInterval(() => {
    void (async () => {
      if (!backendPort || backendRestartInFlight) {
        return;
      }
      const helperStatus = await fetchHelperHealth("/health");
      if (helperStatus.healthy) {
        healthPollFailureCount = 0;
        return;
      }
      healthPollFailureCount += 1;
      appendBackendLog(
        `[desktop] helper health poll failed count=${healthPollFailureCount}/${HEALTH_POLL_MAX_FAILURES} status=${helperStatus.modelStatus}`,
      );
      if (healthPollFailureCount >= HEALTH_POLL_MAX_FAILURES) {
        await scheduleBackendRestart("helper health check failed repeatedly");
      }
    })();
  }, HEALTH_POLL_INTERVAL_MS);
}

function stopHealthPolling() {
  if (healthPollTimer) {
    clearInterval(healthPollTimer);
    healthPollTimer = null;
  }
  healthPollFailureCount = 0;
}

async function scheduleBackendRestart(reason) {
  if (backendRestartInFlight) {
    return;
  }
  backendRestartInFlight = true;
  stopHealthPolling();
  backendRestartCount += 1;
  appendBackendLog(`[desktop] helper restart requested reason=${reason} attempt=${backendRestartCount}/${MAX_BACKEND_RESTART_COUNT}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:helper-restarting", {
      attempt: backendRestartCount,
      maxAttempts: MAX_BACKEND_RESTART_COUNT,
      reason,
      emittedAt: nowIso(),
    });
  }
  if (backendRestartCount > MAX_BACKEND_RESTART_COUNT) {
    await dialog.showMessageBox({
      type: "error",
      title: "Local helper restart failed",
      message: "The desktop local helper could not recover automatically.",
      detail: `Automatic restart exceeded ${MAX_BACKEND_RESTART_COUNT} attempts.\n${backendLogPath ? `Log: ${backendLogPath}` : ""}`.trim(),
    });
    backendRestartInFlight = false;
    return;
  }
  try {
    await stopBackend();
  } catch (error) {
    appendBackendLog(`[desktop] helper stop before restart failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await startBackend();
    startHealthPolling();
    appendBackendLog("[desktop] helper restart completed");
    backendRestartCount = 0;
  } catch (error) {
    appendBackendLog(`[desktop] helper restart failed: ${error instanceof Error ? error.message : String(error)}`);
    if (backendRestartCount >= MAX_BACKEND_RESTART_COUNT) {
      await dialog.showMessageBox({
        type: "error",
        title: "Local helper restart failed",
        message: "The desktop local helper could not recover automatically.",
        detail: `Last error: ${error instanceof Error ? error.message : String(error)}\n${backendLogPath ? `Log: ${backendLogPath}` : ""}`.trim(),
      });
    }
  } finally {
    backendRestartInFlight = false;
  }
}

function buildRuntimeInfo() {
  const packagedRuntime = getPackagedDesktopRuntime();
  return {
    isPackaged: app.isPackaged,
    helperMode: app.isPackaged ? "bundled-runtime" : "system-python",
    backendPort,
    backendRoot,
    backendLogPath,
    configPath: desktopConfigPath,
    helperBaseUrl: backendPort ? `http://127.0.0.1:${backendPort}` : "",
    helperStatus: lastHelperHealth,
    preload: preloadDiagnostics,
    modelUpdate: desktopModelUpdateState,
    serverStatus: lastCloudServerStatus,
    cloud: desktopRuntimeConfig?.cloud || {},
    local: desktopRuntimeConfig?.local || {},
    install: packagedRuntime
      ? {
          bottle1InstallChoice: packagedRuntime.bottle1InstallChoice,
          bottle1Preinstalled: packagedRuntime.bottle1Preinstalled,
          bottle1PreinstallRequested: packagedRuntime.bottle1PreinstallRequested,
          bottle1ModelDir: packagedRuntime.bottle1ModelDir,
          installStatePath: packagedRuntime.installStatePath,
        }
      : {},
  };
}

async function probeDesktopRuntimeBridge(reason = "unspecified") {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }
  try {
    const snapshot = await mainWindow.webContents.executeJavaScript(
      `(() => {
        const runtime = window.desktopRuntime;
        return {
          href: window.location.href,
          title: document.title,
          runtimeType: typeof runtime,
          keys: runtime ? Object.keys(runtime) : [],
          hasRequestLocalHelper: typeof runtime?.requestLocalHelper,
          hasGetRuntimeInfo: typeof runtime?.getRuntimeInfo,
        };
      })()`,
      true,
    );
    updatePreloadDiagnostics({
      lastBridgeProbeAt: nowIso(),
      lastBridgeProbeReason: reason,
      lastBridgeProbeError: "",
      lastBridgeSnapshot: snapshot,
    });
    appendDesktopDiagnostic("runtime-bridge-probe", {
      reason,
      href: snapshot?.href || "",
      runtimeType: snapshot?.runtimeType || "",
      hasRequestLocalHelper: snapshot?.hasRequestLocalHelper || "",
      keys: Array.isArray(snapshot?.keys) ? snapshot.keys : [],
    });
    return snapshot;
  } catch (error) {
    const serialized = serializeError(error);
    updatePreloadDiagnostics({
      lastBridgeProbeAt: nowIso(),
      lastBridgeProbeReason: reason,
      lastBridgeProbeError: serialized.message,
    });
    appendDesktopDiagnostic("runtime-bridge-probe-failed", {
      reason,
      error: serialized.message,
    });
    return null;
  }
}

function attachMainWindowDiagnostics(windowRef) {
  const contents = windowRef.webContents;
  contents.on("preload-error", (_event, preloadPath, error) => {
    const serialized = serializeError(error);
    updatePreloadDiagnostics({
      lastPreloadError: serialized.message,
      lastPreloadErrorAt: nowIso(),
    });
    appendDesktopDiagnostic("preload-error", {
      preloadPath,
      error: serialized.message,
      stack: serialized.stack,
    });
  });
  contents.on("console-message", (_event, level, message, line, sourceId) => {
    const text = String(message || "");
    if (Number(level || 0) < 2 && !/preload|desktopRuntime|desktop:/i.test(text)) {
      return;
    }
    appendDesktopDiagnostic("renderer-console", {
      level,
      message: text,
      line,
      sourceId,
    });
  });
  contents.on("did-start-navigation", (_event, url, isInPlace, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    updatePreloadDiagnostics({
      lastNavigationAt: nowIso(),
      lastNavigationUrl: String(url || ""),
    });
    appendDesktopDiagnostic("navigation-start", {
      url,
      isInPlace: Boolean(isInPlace),
    });
  });
  contents.on("did-navigate", (_event, url, httpResponseCode, httpStatusText) => {
    updatePreloadDiagnostics({
      lastNavigationAt: nowIso(),
      lastNavigationUrl: String(url || ""),
    });
    appendDesktopDiagnostic("navigation-finish", {
      url,
      httpResponseCode,
      httpStatusText,
    });
    void probeDesktopRuntimeBridge("did-navigate");
  });
  contents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    appendDesktopDiagnostic("load-failed", {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });
  contents.on("did-finish-load", () => {
    updatePreloadDiagnostics({
      lastDidFinishLoadAt: nowIso(),
    });
    appendDesktopDiagnostic("did-finish-load", {
      url: contents.getURL(),
      title: contents.getTitle(),
    });
    void probeDesktopRuntimeBridge("did-finish-load");
  });
  contents.on("render-process-gone", (_event, details) => {
    appendDesktopDiagnostic("render-process-gone", details || {});
  });
}

function normalizeLocalHelperPath(requestPath) {
  const rawPath = String(requestPath || "").trim();
  if (!rawPath) {
    throw new Error("Local helper path is required.");
  }
  const candidate = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const allowed = LOCAL_HELPER_ALLOWED_PREFIXES.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`));
  if (!allowed) {
    throw new Error(`Local helper path is not allowed: ${candidate}`);
  }
  return candidate;
}

async function requestLocalHelper(request = {}) {
  if (!backendPort) {
    throw new Error("The local helper is not running.");
  }
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET", "POST"].includes(method)) {
    throw new Error(`Unsupported local helper method: ${method}`);
  }
  const helperPath = normalizeLocalHelperPath(request.path);
  const targetUrl = new URL(helperPath, `http://127.0.0.1:${backendPort}`);
  const headers = {};
  let body = undefined;
  if (method === "POST" && request.body != null) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(request.body);
  }
  const response = await fetch(targetUrl, {
    method,
    cache: "no-store",
    headers,
    body,
  });
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const responseType = request.responseType === "arrayBuffer" ? "arrayBuffer" : "json";
  if (responseType === "arrayBuffer") {
    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      headers: responseHeaders,
      contentType: response.headers.get("content-type") || "application/octet-stream",
      bodyBase64: bodyBuffer.toString("base64"),
    };
  }
  const rawText = await response.text();
  let data = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      data = { raw: rawText };
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: responseHeaders,
    contentType: response.headers.get("content-type") || "application/json",
    data,
  };
}

async function createMainWindow() {
  if (!desktopRuntimeConfig) {
    throw new Error("Desktop runtime config has not been initialized.");
  }
  const appBaseUrl = String(desktopRuntimeConfig.cloud.appBaseUrl || "").trim();
  if (!appBaseUrl) {
    throw new Error(`Desktop cloud app URL is empty. Update ${desktopConfigPath}.`);
  }
  const preloadPath = path.join(currentDir, "preload.mjs");
  const preloadFile = inspectFile(preloadPath);
  const windowWebPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: preloadPath,
  };
  updatePreloadDiagnostics({
    ...preloadFile,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    lastResolvedAt: nowIso(),
    sandbox: windowWebPreferences.sandbox,
    contextIsolation: windowWebPreferences.contextIsolation,
  });
  appendDesktopDiagnostic("preload-configured", {
    preloadPath,
    exists: preloadFile.exists,
    size: preloadFile.size,
    mtime: preloadFile.mtime,
    inspectError: preloadFile.inspectError,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    sandbox: windowWebPreferences.sandbox,
    contextIsolation: windowWebPreferences.contextIsolation,
    isPackaged: app.isPackaged,
  });
  mainWindow = new BrowserWindow({
    title: "Bottle",
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#111827",
    icon: iconPath,
    show: false,
    webPreferences: {
      ...windowWebPreferences,
    },
  });
  attachMainWindowDiagnostics(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => null);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  await mainWindow.loadURL(appBaseUrl);
}

async function bootstrapDesktopApp() {
  try {
    loadDesktopRuntimeConfigForApp();
    await startBackend();
    startHealthPolling();
    await createMainWindow();
    startServerReachabilityPolling();
    void checkDesktopModelUpdate(DESKTOP_MODEL_UPDATE_KEY);
  } catch (error) {
    const detail = [
      error instanceof Error ? error.message : String(error),
      desktopConfigPath ? `Config file: ${desktopConfigPath}` : "",
      backendLogPath ? `Local helper log: ${backendLogPath}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await dialog.showMessageBox({
      type: "error",
      title: "Desktop client startup failed",
      message: "Electron could not start the formal desktop runtime.",
      detail,
    });
    await stopBackend();
    app.quit();
  }
}

ipcMain.handle("desktop:get-runtime-info", () => buildRuntimeInfo());

ipcMain.handle("desktop:get-helper-status", async () => {
  if (!backendPort) {
    return getStoppedHelperHealthSnapshot();
  }
  return fetchHelperHealth("/health/ready");
});

ipcMain.handle("desktop:get-server-status", () => lastCloudServerStatus);

ipcMain.handle("desktop:probe-server-now", async () => probeCloudServerAndNotify());

ipcMain.handle("desktop:get-model-update-status", () => desktopModelUpdateState);

ipcMain.handle("desktop:check-model-update", async (_event, modelKey = DESKTOP_MODEL_UPDATE_KEY) => checkDesktopModelUpdate(modelKey));

ipcMain.handle("desktop:start-model-update", async (_event, modelKey = DESKTOP_MODEL_UPDATE_KEY) => startDesktopModelUpdate(modelKey));

ipcMain.handle("desktop:cancel-model-update", () => cancelDesktopModelUpdate());

ipcMain.handle("desktop:open-logs-directory", async () => {
  const folder = String(desktopRuntimeConfig?.local?.logDir || "").trim() || (backendLogPath ? path.dirname(backendLogPath) : "");
  if (!folder) {
    return false;
  }
  await shell.openPath(folder);
  return true;
});

ipcMain.handle("desktop:request-local-helper", async (_event, request) => requestLocalHelper(request));

ipcMain.on("desktop:preload-ready", (_event, payload = {}) => {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  updatePreloadDiagnostics({
    lastPreloadReadyAt: ensureIsoString(safePayload.emittedAt),
    lastPreloadStage: String(safePayload.stage || "ready"),
    lastPreloadHref: String(safePayload.href || ""),
    lastPreloadError: "",
  });
  appendDesktopDiagnostic("preload-ready", {
    stage: safePayload.stage,
    href: safePayload.href,
    sandboxed: safePayload.sandboxed,
    contextIsolation: safePayload.contextIsolation,
    electronVersion: safePayload.electronVersion,
  });
  void probeDesktopRuntimeBridge(`ipc:${String(safePayload.stage || "ready")}`);
});

ipcMain.on("desktop:preload-error", (_event, payload = {}) => {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const serialized = serializeError(safePayload.error);
  updatePreloadDiagnostics({
    lastPreloadError: serialized.message,
    lastPreloadErrorAt: ensureIsoString(safePayload.failedAt),
  });
  appendDesktopDiagnostic("preload-runtime-error", {
    stage: safePayload.stage,
    href: safePayload.href,
    error: serialized.message,
    stack: serialized.stack,
  });
});

app.whenReady().then(async () => {
  await bootstrapDesktopApp();
});

app.on("window-all-closed", async () => {
  stopServerReachabilityPolling();
  await stopBackend();
  app.quit();
});

app.on("before-quit", async () => {
  stopServerReachabilityPolling();
  stopHealthPolling();
  await stopBackend();
});
