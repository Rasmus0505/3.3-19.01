import { app, BrowserWindow, Notification, dialog, ipcMain, safeStorage, shell, protocol, net } from "electron";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DESKTOP_RUNTIME_CONFIG_FILE_NAME,
  resolveDesktopRuntimeConfig,
  validateDesktopRuntimeConfig,
} from "./runtime-config.mjs";
import {
  registerAppProtocolClient,
  registerAppFileProtocol,
  hasLocalDistBundle,
  APP_PROTOCOL_NAME,
  getLocalDistRoot,
} from "./app-protocol.mjs";
import { resolvePackagedDesktopRuntime, selectDesktopModelDir } from "./helper-runtime.mjs";
import { computeModelUpdateDelta, fetchRemoteManifest, performIncrementalModelUpdate, readLocalManifest } from "./model-updater.mjs";
import { buildOfflineRestoreDecision, normalizeCachedUser, readJwtExpiryIso } from "../src/auth/offline-auth.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const iconPath = path.join(path.resolve(currentDir, ".."), "build", "icon.ico");
const LOCAL_HELPER_ALLOWED_PREFIXES = [
  "/api/local-asr",
  "/api/local-asr-assets",
  "/api/desktop-asr",
  "/api/desktop-asr/url-import",
  "/health",
  "/health/ready",
];
const LOCAL_ASR_DEFAULT_PORT = 18765;
const DESKTOP_MODEL_UPDATE_KEY = "faster-whisper-medium";
const DESKTOP_APP_ID = "com.bottle.desktop";
const DESKTOP_MEDIA_FILE_FILTERS = [
  {
    name: "Media Files",
    extensions: ["mp4", "mov", "mkv", "avi", "webm", "mp3", "wav", "m4a", "flac", "aac", "ogg"],
  },
  {
    name: "All Files",
    extensions: ["*"],
  },
];
const DESKTOP_MEDIA_MIME_TYPES = {
  ".aac": "audio/aac",
  ".avi": "video/x-msvideo",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "video/webm",
};
const DESKTOP_ALLOWED_MEDIA_EXTENSIONS = new Set(Object.keys(DESKTOP_MEDIA_MIME_TYPES));
const DESKTOP_MEDIA_FILE_TOKEN_TTL_MS = 5 * 60 * 1000;
const DESKTOP_AUTH_SESSION_FILE_NAME = "desktop-auth-session.json";
const DESKTOP_AUTH_SESSION_KEY = "desktop-session";

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
let lastClientUpdatePromptKey = "";
let desktopAuthSession = null;
const fileSessionTokens = new Map();

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

let desktopClientUpdateState = {
  checking: false,
  available: false,
  currentVersion: "",
  latestVersion: "",
  metadataUrl: "",
  actionUrl: "",
  checkOnLaunch: true,
  checkedAt: "",
  promptedAt: "",
  lastError: "",
  statusText: "",
  releaseName: "",
  releaseNotes: "",
  publishedAt: "",
};

const MAX_BACKEND_RESTART_COUNT = 3;
const HEALTH_POLL_INTERVAL_MS = 30_000;
const HEALTH_POLL_MAX_FAILURES = 3;
const EXTERNAL_PROTOCOL_WHITELIST = new Set(["http:", "https:"]);

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

function trimText(value) {
  return String(value ?? "").trim();
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

function decodePlaintextSecret(ciphertext = "") {
  if (!trimText(ciphertext)) {
    return "";
  }
  return Buffer.from(String(ciphertext || ""), "base64").toString("utf8");
}

function encryptDesktopSecret(secret = "") {
  const normalizedSecret = String(secret || "");
  if (!normalizedSecret) {
    return {
      ciphertext: "",
      storageMode: "none",
    };
  }
  if (typeof safeStorage?.isEncryptionAvailable === "function" && safeStorage.isEncryptionAvailable()) {
    return {
      ciphertext: safeStorage.encryptString(normalizedSecret).toString("base64"),
      storageMode: "safeStorage",
    };
  }
  throw new Error("SafeStorage unavailable, refuse to cache auth data");
}

function decryptDesktopSecret(ciphertext = "", storageMode = "none") {
  const normalizedCiphertext = String(ciphertext || "");
  const normalizedMode = trimText(storageMode || "none");
  if (!normalizedCiphertext) {
    return "";
  }
  if (normalizedMode === "safeStorage") {
    return safeStorage.decryptString(Buffer.from(normalizedCiphertext, "base64"));
  }
  if (normalizedMode === "plaintext-base64") {
    return decodePlaintextSecret(normalizedCiphertext);
  }
  return "";
}

function getDesktopAuthSessionFilePath() {
  const userDataDir = trimText(desktopRuntimeConfig?.local?.userDataDir || "");
  if (!userDataDir) {
    throw new Error("Desktop runtime userDataDir is unavailable.");
  }
  return path.join(userDataDir, DESKTOP_AUTH_SESSION_FILE_NAME);
}

function normalizeDesktopAuthUser(user = {}) {
  const normalized = normalizeCachedUser(user);
  return normalized.id > 0 && normalized.email ? normalized : null;
}

function buildDesktopAuthView(status = "anonymous", user = null, message = "") {
  const normalizedUser = normalizeDesktopAuthUser(user);
  return {
    status,
    message: trimText(message),
    session: {
      isLoggedIn: status === "active" && Boolean(normalizedUser),
      userId: normalizedUser?.id || 0,
      userName: normalizedUser?.email || "",
      userEmail: normalizedUser?.email || "",
      isAdmin: Boolean(normalizedUser?.is_admin),
      user: normalizedUser,
    },
    user: normalizedUser,
  };
}

function buildDesktopAuthMemorySession(accessToken = "", refreshToken = "", user = null) {
  const normalizedUser = normalizeDesktopAuthUser(user);
  if (!trimText(accessToken) || !trimText(refreshToken) || !normalizedUser) {
    return null;
  }
  return {
    accessToken: trimText(accessToken),
    refreshToken: trimText(refreshToken),
    user: normalizedUser,
    accessTokenExpiresAt: readJwtExpiryIso(accessToken),
    refreshTokenExpiresAt: readJwtExpiryIso(refreshToken),
    updatedAt: nowIso(),
  };
}

async function saveDesktopAuthSession(session = null) {
  const sessionFile = getDesktopAuthSessionFilePath();
  await fs.promises.mkdir(path.dirname(sessionFile), { recursive: true });
  if (!session) {
    desktopAuthSession = null;
    await fs.promises.rm(sessionFile, { force: true });
    return;
  }
  const encryptedAccess = encryptDesktopSecret(session.accessToken);
  const encryptedRefresh = encryptDesktopSecret(session.refreshToken);
  const payload = {
    schemaVersion: 1,
    cacheKey: DESKTOP_AUTH_SESSION_KEY,
    user: session.user,
    access_token_ciphertext: encryptedAccess.ciphertext,
    access_token_storage_mode: encryptedAccess.storageMode,
    access_token_expires_at: session.accessTokenExpiresAt || readJwtExpiryIso(session.accessToken),
    refresh_token_ciphertext: encryptedRefresh.ciphertext,
    refresh_token_storage_mode: encryptedRefresh.storageMode,
    refresh_token_expires_at: session.refreshTokenExpiresAt || readJwtExpiryIso(session.refreshToken),
    updated_at: session.updatedAt || nowIso(),
  };
  await fs.promises.writeFile(sessionFile, JSON.stringify(payload, null, 2), "utf8");
  desktopAuthSession = {
    ...session,
    accessTokenExpiresAt: payload.access_token_expires_at,
    refreshTokenExpiresAt: payload.refresh_token_expires_at,
    updatedAt: payload.updated_at,
  };
}

async function loadDesktopAuthSession() {
  if (desktopAuthSession?.accessToken && desktopAuthSession?.refreshToken) {
    return desktopAuthSession;
  }
  const sessionFile = getDesktopAuthSessionFilePath();
  try {
    const raw = await fs.promises.readFile(sessionFile, "utf8");
    const payload = JSON.parse(raw);
    const nextSession = buildDesktopAuthMemorySession(
      decryptDesktopSecret(payload?.access_token_ciphertext, payload?.access_token_storage_mode),
      decryptDesktopSecret(payload?.refresh_token_ciphertext, payload?.refresh_token_storage_mode),
      payload?.user,
    );
    if (!nextSession) {
      return null;
    }
    desktopAuthSession = {
      ...nextSession,
      accessTokenExpiresAt: trimText(payload?.access_token_expires_at) || nextSession.accessTokenExpiresAt,
      refreshTokenExpiresAt: trimText(payload?.refresh_token_expires_at) || nextSession.refreshTokenExpiresAt,
      updatedAt: trimText(payload?.updated_at) || nextSession.updatedAt,
    };
    return desktopAuthSession;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function clearDesktopAuthSession() {
  await saveDesktopAuthSession(null);
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
  const text = trimText(value);
  return text || nowIso();
}

function normalizeOptionalIsoString(value, fallbackValue = "") {
  const text = trimText(value);
  return text || fallbackValue;
}

function safeNormalizeHttpUrl(value) {
  const text = trimText(value);
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch (_) {
    return "";
  }
}

function normalizeExternalHttpUrl(value) {
  const text = trimText(value);
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    if (!EXTERNAL_PROTOCOL_WHITELIST.has(url.protocol)) {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function pickFirstNonEmpty(...values) {
  for (const value of values.flat()) {
    const text = trimText(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function getDesktopClientVersion() {
  return trimText(app.getVersion()) || "0.0.0";
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

function getDesktopClientUpdateConfig() {
  const configured = desktopRuntimeConfig?.clientUpdate && typeof desktopRuntimeConfig.clientUpdate === "object" ? desktopRuntimeConfig.clientUpdate : {};
  const legacyCloudConfig = desktopRuntimeConfig?.cloud && typeof desktopRuntimeConfig.cloud === "object" ? desktopRuntimeConfig.cloud : {};
  return {
    metadataUrl: safeNormalizeHttpUrl(configured.metadataUrl || legacyCloudConfig.clientUpdateManifestUrl),
    entryUrl: safeNormalizeHttpUrl(
      configured.entryUrl || legacyCloudConfig.clientUpdateDownloadUrl || legacyCloudConfig.appBaseUrl || "",
    ),
    checkOnLaunch: configured.checkOnLaunch !== false,
  };
}

function normalizeClientUpdateState(nextPatch = {}) {
  const metadataUrl = nextPatch.metadataUrl === undefined ? desktopClientUpdateState.metadataUrl : nextPatch.metadataUrl;
  const actionUrl = nextPatch.actionUrl === undefined ? desktopClientUpdateState.actionUrl : nextPatch.actionUrl;
  return {
    ...desktopClientUpdateState,
    ...nextPatch,
    checking: Boolean(nextPatch.checking ?? desktopClientUpdateState.checking),
    available: Boolean(nextPatch.available ?? desktopClientUpdateState.available),
    currentVersion: trimText(nextPatch.currentVersion || desktopClientUpdateState.currentVersion || getDesktopClientVersion()),
    latestVersion: trimText(nextPatch.latestVersion ?? desktopClientUpdateState.latestVersion),
    metadataUrl: safeNormalizeHttpUrl(metadataUrl),
    actionUrl: safeNormalizeHttpUrl(actionUrl),
    checkOnLaunch: nextPatch.checkOnLaunch == null ? Boolean(desktopClientUpdateState.checkOnLaunch) : Boolean(nextPatch.checkOnLaunch),
    checkedAt:
      nextPatch.checkedAt === ""
        ? ""
        : normalizeOptionalIsoString(nextPatch.checkedAt, desktopClientUpdateState.checkedAt),
    promptedAt:
      nextPatch.promptedAt === ""
        ? ""
        : normalizeOptionalIsoString(nextPatch.promptedAt, desktopClientUpdateState.promptedAt),
    lastError: trimText(nextPatch.lastError ?? desktopClientUpdateState.lastError),
    statusText: trimText(nextPatch.statusText ?? desktopClientUpdateState.statusText),
    releaseName: trimText(nextPatch.releaseName ?? desktopClientUpdateState.releaseName),
    releaseNotes: trimText(nextPatch.releaseNotes ?? desktopClientUpdateState.releaseNotes),
    publishedAt: trimText(nextPatch.publishedAt ?? desktopClientUpdateState.publishedAt),
  };
}

function broadcastClientUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("desktop:client-update-status-changed", desktopClientUpdateState);
  }
}

function updateDesktopClientUpdateState(nextPatch = {}, shouldBroadcast = true) {
  desktopClientUpdateState = normalizeClientUpdateState(nextPatch);
  if (shouldBroadcast) {
    broadcastClientUpdateState();
  }
  return desktopClientUpdateState;
}

function parseDesktopClientVersion(version) {
  const normalizedVersion = trimText(version).replace(/^v/i, "");
  if (!normalizedVersion) {
    return {
      core: [0],
      prerelease: [],
    };
  }
  const [corePart, prereleasePart = ""] = normalizedVersion.split("-", 2);
  const core = corePart
    .split(".")
    .map((segment) => {
      const parsed = Number.parseInt(segment, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    })
    .filter((segment, index, segments) => Number.isFinite(segment) || index < segments.length);
  const prerelease = prereleasePart
    ? prereleasePart
        .split(".")
        .filter(Boolean)
        .map((segment) => {
          if (/^\d+$/.test(segment)) {
            return { numeric: true, value: Number.parseInt(segment, 10) };
          }
          return { numeric: false, value: segment.toLowerCase() };
        })
    : [];
  return {
    core: core.length > 0 ? core : [0],
    prerelease,
  };
}

function compareVersionIdentifiers(left, right) {
  if (left.numeric && right.numeric) {
    return left.value - right.value;
  }
  if (left.numeric && !right.numeric) {
    return -1;
  }
  if (!left.numeric && right.numeric) {
    return 1;
  }
  if (left.value === right.value) {
    return 0;
  }
  return left.value > right.value ? 1 : -1;
}

function compareDesktopClientVersions(leftVersion, rightVersion) {
  const left = parseDesktopClientVersion(leftVersion);
  const right = parseDesktopClientVersion(rightVersion);
  const coreLength = Math.max(left.core.length, right.core.length);
  for (let index = 0; index < coreLength; index += 1) {
    const leftValue = left.core[index] ?? 0;
    const rightValue = right.core[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) {
    return 0;
  }
  if (left.prerelease.length === 0) {
    return 1;
  }
  if (right.prerelease.length === 0) {
    return -1;
  }
  const prereleaseLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < prereleaseLength; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (!leftIdentifier) {
      return -1;
    }
    if (!rightIdentifier) {
      return 1;
    }
    const comparison = compareVersionIdentifiers(leftIdentifier, rightIdentifier);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

async function fetchDesktopClientReleaseMetadata(metadataUrl) {
  const response = await fetch(metadataUrl, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-bottle-client-version": getDesktopClientVersion(),
    },
  });
  const rawText = await response.text();
  let payload = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch (_) {
      throw new Error("Client update metadata is not valid JSON.");
    }
  }
  if (!response.ok) {
    throw new Error(pickFirstNonEmpty(payload?.detail, payload?.message, response.statusText) || `Client update metadata request failed with ${response.status}`);
  }
  return {
    payload,
    resolvedUrl: trimText(response.url) || metadataUrl,
  };
}

function extractDesktopClientRelease(payload = {}, fallbackConfig = {}) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const nestedRelease = safePayload.release && typeof safePayload.release === "object" ? safePayload.release : {};
  const assets = Array.isArray(safePayload.assets) ? safePayload.assets : Array.isArray(nestedRelease.assets) ? nestedRelease.assets : [];
  const firstAsset = assets.find((item) => item && typeof item === "object") || {};
  const latestVersion = pickFirstNonEmpty(
    safePayload.latestVersion,
    safePayload.version,
    safePayload.tag_name,
    nestedRelease.latestVersion,
    nestedRelease.version,
    nestedRelease.tag_name,
  );
  if (!latestVersion) {
    throw new Error("Client update metadata is missing version.");
  }
  return {
    latestVersion: latestVersion.replace(/^v/i, ""),
    actionUrl: safeNormalizeHttpUrl(
      pickFirstNonEmpty(
        safePayload.entryUrl,
        safePayload.downloadUrl,
        safePayload.html_url,
        safePayload.releaseUrl,
        nestedRelease.entryUrl,
        nestedRelease.downloadUrl,
        nestedRelease.html_url,
        firstAsset.browser_download_url,
        fallbackConfig.entryUrl,
      ),
    ),
    releaseName: pickFirstNonEmpty(safePayload.name, safePayload.title, nestedRelease.name, nestedRelease.title),
    releaseNotes: pickFirstNonEmpty(
      safePayload.releaseNotes,
      safePayload.notes,
      safePayload.body,
      nestedRelease.releaseNotes,
      nestedRelease.notes,
      nestedRelease.body,
    ),
    publishedAt: pickFirstNonEmpty(safePayload.publishedAt, safePayload.published_at, nestedRelease.publishedAt, nestedRelease.published_at),
  };
}

async function openDesktopClientUpdateLink(preferredUrl = "") {
  const config = getDesktopClientUpdateConfig();
  const targetUrl = safeNormalizeHttpUrl(preferredUrl || desktopClientUpdateState.actionUrl || config.entryUrl);
  if (!targetUrl) {
    return false;
  }
  return openExternalWithWhitelist(targetUrl);
}

async function promptDesktopClientUpdate(clientUpdateState, reason = "manual") {
  if (!clientUpdateState.available || !trimText(clientUpdateState.latestVersion)) {
    return false;
  }
  const promptKey = `${trimText(clientUpdateState.latestVersion)}|${trimText(clientUpdateState.actionUrl)}`;
  if (promptKey && lastClientUpdatePromptKey === promptKey && reason === "startup") {
    return false;
  }
  lastClientUpdatePromptKey = promptKey;
  const promptedState = updateDesktopClientUpdateState(
    {
      promptedAt: nowIso(),
      statusText: `发现新的 Bottle 客户端版本 ${clientUpdateState.latestVersion}`,
    },
    true,
  );
  const notificationBody = [
    `当前版本 ${promptedState.currentVersion}`,
    `最新版本 ${promptedState.latestVersion}`,
    promptedState.actionUrl ? "点击通知打开更新入口" : "",
  ]
    .filter(Boolean)
    .join("，");
  const notificationSupported = typeof Notification.isSupported === "function" ? Notification.isSupported() : true;
  if (!notificationSupported) {
    return false;
  }
  const notificationOptions = {
    title: "Bottle 客户端有新版本",
    body: notificationBody,
  };
  if (fs.existsSync(iconPath)) {
    notificationOptions.icon = iconPath;
  }
  const notification = new Notification(notificationOptions);
  notification.on("click", () => {
    void openDesktopClientUpdateLink(promptedState.actionUrl);
  });
  notification.show();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.flashFrame(true);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.flashFrame(false);
      }
    }, 5000);
  }
  return true;
}

async function checkDesktopClientUpdate({ reason = "manual", notify = true } = {}) {
  const normalizedReason = trimText(reason) || "manual";
  const clientUpdateConfig = getDesktopClientUpdateConfig();
  updateDesktopClientUpdateState({
    checking: true,
    available: false,
    currentVersion: getDesktopClientVersion(),
    metadataUrl: clientUpdateConfig.metadataUrl,
    actionUrl: clientUpdateConfig.entryUrl,
    checkOnLaunch: clientUpdateConfig.checkOnLaunch,
    lastError: "",
    statusText: "正在检查客户端新版本",
  });
  if (!clientUpdateConfig.metadataUrl) {
    return updateDesktopClientUpdateState({
      checking: false,
      available: false,
      checkedAt: nowIso(),
      lastError: "客户端更新元数据地址未配置",
      statusText: "客户端更新元数据地址未配置",
      latestVersion: "",
      releaseName: "",
      releaseNotes: "",
      publishedAt: "",
    });
  }
  try {
    const metadata = await fetchDesktopClientReleaseMetadata(clientUpdateConfig.metadataUrl);
    const release = extractDesktopClientRelease(metadata.payload, { entryUrl: clientUpdateConfig.entryUrl });
    const currentVersion = getDesktopClientVersion();
    const available = compareDesktopClientVersions(release.latestVersion, currentVersion) > 0;
    const nextState = updateDesktopClientUpdateState({
      checking: false,
      available,
      currentVersion,
      latestVersion: release.latestVersion,
      metadataUrl: metadata.resolvedUrl,
      actionUrl: release.actionUrl || clientUpdateConfig.entryUrl,
      checkOnLaunch: clientUpdateConfig.checkOnLaunch,
      checkedAt: nowIso(),
      lastError: "",
      statusText: available ? "发现新的 Bottle 客户端版本" : "当前客户端已是最新版本",
      releaseName: release.releaseName,
      releaseNotes: release.releaseNotes,
      publishedAt: release.publishedAt,
    });
    if (available && notify) {
      await promptDesktopClientUpdate(nextState, normalizedReason);
    }
    return nextState;
  } catch (error) {
    appendBackendLog(`[desktop] client update check failed: ${error instanceof Error ? error.message : String(error)}`);
    return updateDesktopClientUpdateState({
      checking: false,
      available: false,
      currentVersion: getDesktopClientVersion(),
      metadataUrl: clientUpdateConfig.metadataUrl,
      actionUrl: clientUpdateConfig.entryUrl,
      checkOnLaunch: clientUpdateConfig.checkOnLaunch,
      checkedAt: nowIso(),
      latestVersion: "",
      releaseName: "",
      releaseNotes: "",
      publishedAt: "",
      lastError: error instanceof Error ? error.message : String(error),
      statusText: "检查客户端版本失败",
    });
  }
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

if (process.platform === "win32") {
  app.setAppUserModelId(DESKTOP_APP_ID);
}

function isStandaloneModeEnabled() {
  if (desktopRuntimeConfig && desktopRuntimeConfig.standaloneMode === true) {
    return true;
  }
  return hasLocalDistBundle();
}

function getMainWindowMode() {
  return isStandaloneModeEnabled() ? "standalone" : "cloud-linked";
}

function resolveMainWindowEntry() {
  const mode = getMainWindowMode();
  if (mode === "standalone") {
    const filePath = path.join(getLocalDistRoot(), "index.html");
    appendDesktopDiagnostic("window-load-target", { mode, filePath });
    return {
      mode,
      preloadPath: path.join(currentDir, "preload.mjs"),
      loadKind: "file",
      filePath,
    };
  }
  const cloudUrl = String(desktopRuntimeConfig?.cloud?.appBaseUrl || "").trim();
  if (!cloudUrl) {
    throw new Error(`Desktop cloud app URL is empty. Update ${desktopConfigPath}.`);
  }
  appendDesktopDiagnostic("window-load-target", { mode, url: cloudUrl });
  return {
    mode,
    preloadPath: path.join(currentDir, "preload-cloud.mjs"),
    loadKind: "url",
    url: cloudUrl,
  };
}

function getIpcSenderUrl(event) {
  return trimText(event?.senderFrame?.url || event?.sender?.getURL?.() || "");
}

function isTrustedLocalRendererUrl(value) {
  const text = trimText(value);
  if (!text) {
    return false;
  }
  try {
    const url = new URL(text);
    if (url.protocol === "file:") {
      return true;
    }
    if (url.protocol === `${APP_PROTOCOL_NAME}:`) {
      return trimText(url.hostname).toLowerCase() === "local";
    }
  } catch (_) {
    return false;
  }
  return false;
}

function assertLocalRenderer(event) {
  const senderUrl = getIpcSenderUrl(event);
  if (isTrustedLocalRendererUrl(senderUrl)) {
    return senderUrl;
  }
  appendDesktopDiagnostic("ipc-access-denied", {
    senderUrl,
  });
  throw new Error(`Access denied for renderer origin: ${senderUrl || "unknown"}`);
}

function handleLocalRenderer(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertLocalRenderer(event);
    return handler(event, ...args);
  });
}

async function openExternalWithWhitelist(targetUrl) {
  const normalizedUrl = normalizeExternalHttpUrl(targetUrl);
  if (!normalizedUrl) {
    appendDesktopDiagnostic("open-external-blocked", {
      targetUrl,
    });
    return false;
  }
  await shell.openExternal(normalizedUrl);
  return true;
}

function setupCorsProxyForAppProtocol() {
  if (!app.isPackaged) return;
  const ALLOWED_CLOUD_ORIGINS = [
    desktopRuntimeConfig?.cloud?.appBaseUrl ? new URL(desktopRuntimeConfig.cloud.appBaseUrl).origin : null,
    desktopRuntimeConfig?.cloud?.apiBaseUrl ? new URL(desktopRuntimeConfig.cloud.apiBaseUrl).origin : null,
  ].filter(Boolean);

  protocol.handle("https", (request) => {
    const requestOrigin = new URL(request.url).origin;
    if (ALLOWED_CLOUD_ORIGINS.includes(requestOrigin)) {
      return net.fetch(request);
    }
    return new Response("Forbidden", { status: 403 });
  });
  appendDesktopDiagnostic("cors-proxy", { registered: true, origins: ALLOWED_CLOUD_ORIGINS });
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

function resolveLocalAsrPort() {
  const configured = Number.parseInt(trimText(process.env.DESKTOP_LOCAL_ASR_PORT), 10);
  if (Number.isInteger(configured) && configured > 0 && configured <= 65535) {
    return configured;
  }
  return LOCAL_ASR_DEFAULT_PORT;
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
  const clientUpdateConfig = getDesktopClientUpdateConfig();
  updateDesktopClientUpdateState(
    {
      currentVersion: getDesktopClientVersion(),
      metadataUrl: clientUpdateConfig.metadataUrl,
      actionUrl: clientUpdateConfig.entryUrl,
      checkOnLaunch: clientUpdateConfig.checkOnLaunch,
      statusText: clientUpdateConfig.checkOnLaunch ? "" : "客户端启动时版本检查已关闭",
    },
    false,
  );
}

async function startBackend() {
  if (!desktopRuntimeConfig) {
    throw new Error("Desktop runtime config has not been initialized.");
  }
  backendRoot = getBackendRoot();
  backendPort = resolveLocalAsrPort();
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
    if (!packagedRuntime.ffmpegExists || !packagedRuntime.ffprobeExists || !packagedRuntime.ytdlpExists) {
      throw new Error(
        [
          "Bundled desktop runtime tools are incomplete.",
          `ffmpeg=${packagedRuntime.ffmpegExecutablePath}`,
          `ffprobe=${packagedRuntime.ffprobeExecutablePath}`,
          `yt-dlp=${packagedRuntime.ytdlpExecutablePath}`,
        ].join(" "),
      );
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
    DESKTOP_FFMPEG_BIN_DIR: packagedRuntime?.ffmpegBinDir || "",
    DESKTOP_YTDLP_PATH: packagedRuntime?.ytdlpExecutablePath || "",
    DESKTOP_CLOUD_APP_URL: trimText(desktopRuntimeConfig.cloud?.appBaseUrl || ""),
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
    localAsrPort: backendPort || resolveLocalAsrPort(),
    backendRoot,
    backendLogPath,
    configPath: desktopConfigPath,
    helperBaseUrl: backendPort ? `http://127.0.0.1:${backendPort}` : "",
    helperStatus: lastHelperHealth,
    preload: preloadDiagnostics,
    clientUpdate: desktopClientUpdateState,
    modelUpdate: desktopModelUpdateState,
    serverStatus: lastCloudServerStatus,
    cloud: desktopRuntimeConfig?.cloud || {},
    local: desktopRuntimeConfig?.local || {},
    clientUpdateConfig: desktopRuntimeConfig?.clientUpdate || {},
    standaloneMode: isStandaloneModeEnabled(),
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

function buildPublicRuntimeInfo() {
  return {
    isPackaged: app.isPackaged,
    helperMode: app.isPackaged ? "bundled-runtime" : "system-python",
    standaloneMode: isStandaloneModeEnabled(),
    mode: getMainWindowMode(),
    helperStatus: {
      ok: Boolean(lastHelperHealth.ok),
      healthy: Boolean(lastHelperHealth.healthy),
      modelReady: Boolean(lastHelperHealth.modelReady),
      modelStatus: trimText(lastHelperHealth.modelStatus),
      lastCheckedAt: trimText(lastHelperHealth.lastCheckedAt),
      statusCode: Number(lastHelperHealth.statusCode || 0),
    },
    serverStatus: {
      reachable: Boolean(lastCloudServerStatus.reachable),
      lastCheckedAt: trimText(lastCloudServerStatus.lastCheckedAt),
      latencyMs: lastCloudServerStatus.latencyMs == null ? null : Number(lastCloudServerStatus.latencyMs),
    },
    clientUpdate: {
      available: Boolean(desktopClientUpdateState.available),
      currentVersion: trimText(desktopClientUpdateState.currentVersion),
      latestVersion: trimText(desktopClientUpdateState.latestVersion),
      checkedAt: trimText(desktopClientUpdateState.checkedAt),
      statusText: trimText(desktopClientUpdateState.statusText),
      releaseName: trimText(desktopClientUpdateState.releaseName),
      publishedAt: trimText(desktopClientUpdateState.publishedAt),
    },
    modelUpdate: {
      checking: Boolean(desktopModelUpdateState.checking),
      updateAvailable: Boolean(desktopModelUpdateState.updateAvailable),
      updating: Boolean(desktopModelUpdateState.updating),
      cancellable: Boolean(desktopModelUpdateState.cancellable),
      modelKey: trimText(desktopModelUpdateState.modelKey),
      localVersion: trimText(desktopModelUpdateState.localVersion),
      remoteVersion: trimText(desktopModelUpdateState.remoteVersion),
      totalFiles: Math.max(0, Number(desktopModelUpdateState.totalFiles || 0)),
      completedFiles: Math.max(0, Number(desktopModelUpdateState.completedFiles || 0)),
      currentFile: trimText(desktopModelUpdateState.currentFile),
      lastCheckedAt: trimText(desktopModelUpdateState.lastCheckedAt),
      lastCompletedAt: trimText(desktopModelUpdateState.lastCompletedAt),
      lastError: trimText(desktopModelUpdateState.lastError),
      message: trimText(desktopModelUpdateState.message),
    },
    preload: {
      configured: Boolean(preloadDiagnostics.exists),
      lastResolvedAt: trimText(preloadDiagnostics.lastResolvedAt),
      lastNavigationAt: trimText(preloadDiagnostics.lastNavigationAt),
      lastNavigationUrl: trimText(preloadDiagnostics.lastNavigationUrl),
      lastDidFinishLoadAt: trimText(preloadDiagnostics.lastDidFinishLoadAt),
      lastPreloadReadyAt: trimText(preloadDiagnostics.lastPreloadReadyAt),
      lastPreloadStage: trimText(preloadDiagnostics.lastPreloadStage),
      lastPreloadError: trimText(preloadDiagnostics.lastPreloadError),
    },
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

function inferDesktopMediaMimeType(filePath) {
  return DESKTOP_MEDIA_MIME_TYPES[String(path.extname(String(filePath || "")).toLowerCase())] || "application/octet-stream";
}

function inspectDesktopMediaFile(filePath) {
  const normalizedPath = trimText(filePath);
  if (!normalizedPath) {
    throw new Error("Desktop media file path is required.");
  }
  const resolvedPath = path.resolve(normalizedPath);
  const extension = String(path.extname(resolvedPath || "")).toLowerCase();
  if (!DESKTOP_ALLOWED_MEDIA_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported desktop media file type: ${extension || "unknown"}`);
  }
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Desktop media path is not a file: ${resolvedPath}`);
  }
  return {
    resolvedPath,
    stat,
  };
}

function clearExpiredDesktopMediaFileTokens(nowMs = Date.now()) {
  for (const [token, session] of fileSessionTokens.entries()) {
    if (!session || Number(session.expiresAt || 0) <= nowMs) {
      fileSessionTokens.delete(token);
    }
  }
}

function issueDesktopMediaFileToken(filePath) {
  const { resolvedPath, stat } = inspectDesktopMediaFile(filePath);
  const expiresAtMs = Date.now() + DESKTOP_MEDIA_FILE_TOKEN_TTL_MS;
  const token = randomUUID();
  clearExpiredDesktopMediaFileTokens();
  fileSessionTokens.set(token, {
    filePath: resolvedPath,
    expiresAt: expiresAtMs,
  });
  return {
    token,
    resolvedPath,
    stat,
    expiresAtMs,
  };
}

function resolveDesktopMediaFileToken(fileToken = "") {
  const normalizedToken = trimText(fileToken);
  clearExpiredDesktopMediaFileTokens();
  if (!normalizedToken) {
    throw new Error("Desktop media file token is required.");
  }
  const session = fileSessionTokens.get(normalizedToken);
  if (!session) {
    throw new Error("Desktop media file token is invalid or expired.");
  }
  if (Number(session.expiresAt || 0) <= Date.now()) {
    fileSessionTokens.delete(normalizedToken);
    throw new Error("Desktop media file token is invalid or expired.");
  }
  const { resolvedPath, stat } = inspectDesktopMediaFile(session.filePath);
  return {
    token: normalizedToken,
    resolvedPath,
    stat,
    expiresAtMs: Number(session.expiresAt || 0),
  };
}

function buildDesktopMediaFilePayload(filePath, stat) {
  const resolvedPath = path.resolve(String(filePath || ""));
  return {
    name: path.basename(resolvedPath),
    fileName: path.basename(resolvedPath),
    size: Math.max(0, Number(stat?.size || 0)),
    fileSize: Math.max(0, Number(stat?.size || 0)),
    lastModifiedMs: Math.max(0, Number(stat?.mtimeMs || Date.now())),
    type: inferDesktopMediaMimeType(resolvedPath),
  };
}

async function selectLocalMediaFile(options = {}) {
  const dialogResult = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: trimText(options?.title) || "选择本地媒体",
    buttonLabel: trimText(options?.buttonLabel) || "选择",
    properties: ["openFile"],
    filters: DESKTOP_MEDIA_FILE_FILTERS,
  });
  if (dialogResult.canceled || !Array.isArray(dialogResult.filePaths) || !dialogResult.filePaths[0]) {
    return {
      canceled: true,
      token: "",
      fileName: "",
      fileSize: 0,
    };
  }
  const { token, resolvedPath, stat, expiresAtMs } = issueDesktopMediaFileToken(dialogResult.filePaths[0]);
  const fileSelection = {
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ...buildDesktopMediaFilePayload(resolvedPath, stat),
  };
  return {
    canceled: false,
    ...fileSelection,
  };
}

async function readLocalMediaFile(fileToken = "") {
  const { resolvedPath, stat, token, expiresAtMs } = resolveDesktopMediaFileToken(fileToken);
  const bytes = await fs.promises.readFile(resolvedPath);
  return {
    ok: true,
    file: {
      token,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ...buildDesktopMediaFilePayload(resolvedPath, stat),
      bodyBase64: bytes.toString("base64"),
    },
  };
}

function resolveDesktopCloudRequestUrl(inputUrl = "") {
  const normalizedUrl = trimText(inputUrl);
  if (!normalizedUrl) {
    throw new Error("Desktop auth request URL is required.");
  }
  if (/^https?:\/\//i.test(normalizedUrl)) {
    return normalizedUrl;
  }
  const apiBaseUrl = trimText(desktopRuntimeConfig?.cloud?.apiBaseUrl || desktopRuntimeConfig?.cloud?.appBaseUrl || "");
  if (!apiBaseUrl) {
    throw new Error("桌面端未配置 cloud.apiBaseUrl。");
  }
  return new URL(normalizedUrl, `${apiBaseUrl.replace(/\/+$/, "")}/`).toString();
}

async function parseDesktopAuthResponse(response) {
  const rawText = await response.text();
  if (!rawText) {
    return {};
  }
  try {
    return JSON.parse(rawText);
  } catch (_) {
    return {
      message: rawText,
      raw: rawText,
    };
  }
}

function normalizeDesktopAuthPayload(payload = {}) {
  const nextSession = buildDesktopAuthMemorySession(payload?.access_token, payload?.refresh_token, payload?.user);
  if (!nextSession) {
    throw new Error("桌面端认证响应缺少有效 token 或用户信息。");
  }
  return nextSession;
}

async function submitDesktopAuthRequest(endpoint, credentials = {}) {
  const targetUrl = resolveDesktopCloudRequestUrl(endpoint);
  const response = await fetch(targetUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      email: trimText(credentials?.email),
      password: String(credentials?.password || ""),
    }),
  });
  const payload = await parseDesktopAuthResponse(response);
  if (!response.ok) {
    const error = new Error(trimText(payload?.message || payload?.detail?.message || payload?.detail) || "桌面端登录失败");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  const session = normalizeDesktopAuthPayload(payload);
  await saveDesktopAuthSession(session);
  return buildDesktopAuthView("active", session.user, "");
}

async function refreshDesktopAuthSessionInMain(refreshToken = "") {
  const targetUrl = resolveDesktopCloudRequestUrl("/api/auth/refresh");
  const response = await fetch(targetUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ refresh_token: trimText(refreshToken) }),
  });
  const payload = await parseDesktopAuthResponse(response);
  if (!response.ok) {
    const error = new Error(trimText(payload?.message || payload?.detail?.message || payload?.detail) || "桌面端刷新登录失败");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  const session = normalizeDesktopAuthPayload(payload);
  await saveDesktopAuthSession(session);
  return session;
}

async function restoreDesktopAuthSessionInMain(options = {}) {
  const cached = await loadDesktopAuthSession();
  if (!cached) {
    return buildDesktopAuthView("anonymous", null, "");
  }
  const online = options.online !== false;
  const forceRefresh = Boolean(options.forceRefresh);
  const decision = buildOfflineRestoreDecision({
    accessToken: cached.accessToken,
    refreshToken: cached.refreshToken,
    online,
  });
  if (forceRefresh || decision.shouldRefresh) {
    try {
      const refreshed = await refreshDesktopAuthSessionInMain(cached.refreshToken);
      return buildDesktopAuthView("active", refreshed.user, "");
    } catch (error) {
      return buildDesktopAuthView("expired", cached.user, trimText(error?.message) || "登录状态已失效，请重新登录");
    }
  }
  if (decision.status === "active") {
    desktopAuthSession = cached;
    return buildDesktopAuthView("active", cached.user, "");
  }
  return buildDesktopAuthView("expired", cached.user, online ? "登录状态已失效，请重新登录" : "登录状态已过期，请联网重新登录");
}

async function ensureDesktopAuthSessionForRequest() {
  const restored = await restoreDesktopAuthSessionInMain({ online: true });
  if (restored.status !== "active") {
    return null;
  }
  return loadDesktopAuthSession();
}

function normalizeDesktopProxyHeaders(headers = {}) {
  const nextHeaders = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalizedKey = trimText(key);
    if (!normalizedKey || value == null) {
      continue;
    }
    nextHeaders[normalizedKey] = String(value);
  }
  return nextHeaders;
}

async function buildDesktopProxyBody(body = {}) {
  const normalizedBody = body && typeof body === "object" ? body : {};
  const kind = trimText(normalizedBody.kind || "none");
  if (!kind || kind === "none") {
    return undefined;
  }
  if (kind === "text") {
    return String(normalizedBody.text || "");
  }
  throw new Error(`Unsupported desktop auth request body kind: ${kind}`);
}

async function buildDesktopProxyFormData(fields = []) {
  const form = new FormData();
  for (const field of Array.isArray(fields) ? fields : []) {
    const name = trimText(field?.name);
    if (!name) {
      continue;
    }
    if (field?.kind === "text") {
      form.append(name, String(field?.value || ""));
      continue;
    }
    if (field?.kind === "file") {
      let bytes = null;
      if (trimText(field?.filePath)) {
        bytes = await fs.promises.readFile(trimText(field.filePath));
      } else if (trimText(field?.bodyBase64)) {
        bytes = Buffer.from(String(field.bodyBase64 || ""), "base64");
      }
      if (!bytes) {
        throw new Error(`Desktop auth upload field ${name} is missing file bytes.`);
      }
      form.append(
        name,
        new Blob([bytes], { type: trimText(field?.contentType) || "application/octet-stream" }),
        trimText(field?.filename) || "upload.bin",
      );
      continue;
    }
    throw new Error(`Unsupported desktop auth upload field kind: ${field?.kind || "unknown"}`);
  }
  return form;
}

async function executeDesktopAuthFetch(request = {}, { retryOnRefresh = true } = {}) {
  const session = await ensureDesktopAuthSessionForRequest();
  if (!session?.accessToken) {
    return {
      ok: false,
      status: 401,
      headers: { "content-type": "application/json" },
      contentType: "application/json",
      bodyText: JSON.stringify({ message: "登录状态已失效，请重新登录" }),
    };
  }
  const method = trimText(request.method || "GET").toUpperCase() || "GET";
  const targetUrl = resolveDesktopCloudRequestUrl(request.url || request.path);
  const headers = new Headers(normalizeDesktopProxyHeaders(request.headers));
  if (request.formFields) {
    headers.delete("content-type");
  }
  headers.set("authorization", `Bearer ${session.accessToken}`);
  const response = await fetch(targetUrl, {
    method,
    headers,
    body: request.formFields ? await buildDesktopProxyFormData(request.formFields) : await buildDesktopProxyBody(request.body),
  });
  if ((response.status === 401 || response.status === 403) && retryOnRefresh && trimText(session.refreshToken)) {
    try {
      await refreshDesktopAuthSessionInMain(session.refreshToken);
      return executeDesktopAuthFetch(request, { retryOnRefresh: false });
    } catch (_) {
      await clearDesktopAuthSession();
    }
  }
  const contentType = response.headers.get("content-type") || "application/json";
  const headersPayload = Object.fromEntries(response.headers.entries());
  if (/^text\/|json|javascript|xml/i.test(contentType)) {
    return {
      ok: response.ok,
      status: response.status,
      headers: headersPayload,
      contentType,
      bodyText: await response.text(),
    };
  }
  const bodyBuffer = Buffer.from(await response.arrayBuffer());
  return {
    ok: response.ok,
    status: response.status,
    headers: headersPayload,
    contentType,
    bodyBase64: bodyBuffer.toString("base64"),
  };
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

async function requestLocalHelperJson(pathname, method = "GET", body = undefined) {
  const response = await requestLocalHelper({
    path: pathname,
    method,
    responseType: "json",
    body,
  });
  if (!response?.ok) {
    throw new Error(trimText(response?.data?.message || response?.data?.detail || response?.status) || "Desktop local helper request failed");
  }
  return response.data || {};
}

async function requestLocalHelperBinary(pathname) {
  const response = await requestLocalHelper({
    path: pathname,
    method: "GET",
    responseType: "arrayBuffer",
  });
  if (!response?.ok) {
    throw new Error(trimText(response?.status) || "Desktop local helper binary request failed");
  }
  return response;
}

async function createMainWindow() {
  if (!desktopRuntimeConfig) {
    throw new Error("Desktop runtime config has not been initialized.");
  }
  const windowEntry = resolveMainWindowEntry();
  const preloadPath = windowEntry.preloadPath;
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
    mode: windowEntry.mode,
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
    void openExternalWithWhitelist(url);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  if (windowEntry.loadKind === "file") {
    await mainWindow.loadFile(windowEntry.filePath);
    return;
  }
  await mainWindow.loadURL(windowEntry.url);
}

async function bootstrapDesktopApp() {
  try {
    loadDesktopRuntimeConfigForApp();
    if (app.isPackaged) {
      registerAppProtocolClient();
      registerAppFileProtocol();
      setupCorsProxyForAppProtocol();
    }
    await startBackend();
    startHealthPolling();
    await createMainWindow();
    startServerReachabilityPolling();
    if (desktopClientUpdateState.checkOnLaunch) {
      void checkDesktopClientUpdate({ reason: "startup", notify: true });
    }
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

handleLocalRenderer("desktop:get-runtime-info", () => buildRuntimeInfo());

ipcMain.handle("desktop:get-public-runtime-info", () => buildPublicRuntimeInfo());

handleLocalRenderer("desktop:get-helper-status", async () => {
  if (!backendPort) {
    return getStoppedHelperHealthSnapshot();
  }
  return fetchHelperHealth("/health/ready");
});

handleLocalRenderer("desktop:get-server-status", () => lastCloudServerStatus);

handleLocalRenderer("desktop:probe-server-now", async () => probeCloudServerAndNotify());

handleLocalRenderer("desktop:get-client-update-status", () => desktopClientUpdateState);

handleLocalRenderer("desktop:check-client-update", async () => checkDesktopClientUpdate({ reason: "manual", notify: true }));

handleLocalRenderer("desktop:open-client-update-link", async (_event, preferredUrl = "") =>
  openDesktopClientUpdateLink(preferredUrl),
);

handleLocalRenderer("desktop:get-model-update-status", () => desktopModelUpdateState);

handleLocalRenderer("desktop:check-model-update", async (_event, modelKey = DESKTOP_MODEL_UPDATE_KEY) =>
  checkDesktopModelUpdate(modelKey),
);

handleLocalRenderer("desktop:start-model-update", async (_event, modelKey = DESKTOP_MODEL_UPDATE_KEY) =>
  startDesktopModelUpdate(modelKey),
);

handleLocalRenderer("desktop:cancel-model-update", () => cancelDesktopModelUpdate());

handleLocalRenderer("desktop:open-logs-directory", async () => {
  const folder = String(desktopRuntimeConfig?.local?.logDir || "").trim() || (backendLogPath ? path.dirname(backendLogPath) : "");
  if (!folder) {
    return false;
  }
  await shell.openPath(folder);
  return true;
});

handleLocalRenderer("desktop:auth-login", async (_event, credentials = {}) =>
  submitDesktopAuthRequest("/api/auth/login", credentials),
);

handleLocalRenderer("desktop:auth-register", async (_event, credentials = {}) =>
  submitDesktopAuthRequest("/api/auth/register", credentials),
);

handleLocalRenderer("desktop:auth-restore-session", async (_event, options = {}) =>
  restoreDesktopAuthSessionInMain(options),
);

handleLocalRenderer("desktop:auth-get-status", async () => {
  const restored = await restoreDesktopAuthSessionInMain({ online: false });
  if (restored.status === "active") {
    return restored;
  }
  return buildDesktopAuthView("anonymous", restored.user, restored.message);
});

handleLocalRenderer("desktop:auth-logout", async () => {
  await clearDesktopAuthSession();
  return buildDesktopAuthView("anonymous", null, "");
});

handleLocalRenderer("desktop:auth-request", async (_event, request = {}) => executeDesktopAuthFetch(request));

handleLocalRenderer("desktop:auth-upload", async (_event, request = {}) => executeDesktopAuthFetch(request));

handleLocalRenderer("desktop:auth-get-access-token", async () => {
  const session = await ensureDesktopAuthSessionForRequest();
  return {
    ok: Boolean(session?.accessToken),
    accessToken: trimText(session?.accessToken),
  };
});

handleLocalRenderer("desktop:local-asr-assets-status", async () =>
  requestLocalHelperJson("/api/local-asr-assets/status"),
);

handleLocalRenderer("desktop:local-asr-assets-bundled-summary", async (_event, modelKey = "") => {
  const helperModelKey = encodeURIComponent(trimText(modelKey));
  return requestLocalHelperJson(`/api/local-asr-assets/download-models/${helperModelKey}`);
});

handleLocalRenderer("desktop:local-asr-assets-install-bundled", async (_event, modelKey = "") => {
  const helperModelKey = encodeURIComponent(trimText(modelKey));
  return requestLocalHelperJson(`/api/local-asr-assets/download-models/${helperModelKey}/install`, "POST");
});

handleLocalRenderer("desktop:local-asr-read-asset-file", async (_event, assetPath = "") => {
  const response = await requestLocalHelperBinary(assetPath);
  return {
    ok: true,
    contentType: response.contentType,
    bodyBase64: response.bodyBase64,
  };
});

handleLocalRenderer("desktop:desktop-asr-transcribe", async (_event, payload = {}) =>
  requestLocalHelperJson("/api/desktop-asr/transcribe", "POST", payload),
);

handleLocalRenderer("desktop:desktop-asr-generate", async (_event, payload = {}) =>
  requestLocalHelperJson("/api/desktop-asr/generate", "POST", payload),
);

handleLocalRenderer("desktop:url-import-create-task", async (_event, payload = {}) =>
  requestLocalHelperJson("/api/desktop-asr/url-import/tasks", "POST", payload),
);

handleLocalRenderer("desktop:url-import-get-task", async (_event, taskId = "") =>
  requestLocalHelperJson(`/api/desktop-asr/url-import/tasks/${encodeURIComponent(trimText(taskId))}`),
);

handleLocalRenderer("desktop:url-import-cancel-task", async (_event, taskId = "") =>
  requestLocalHelperJson(`/api/desktop-asr/url-import/tasks/${encodeURIComponent(trimText(taskId))}/cancel`, "POST"),
);

handleLocalRenderer("desktop:url-import-download-file", async (_event, taskId = "") => {
  const response = await requestLocalHelperBinary(`/api/desktop-asr/url-import/tasks/${encodeURIComponent(trimText(taskId))}/file`);
  return {
    ok: true,
    contentType: response.contentType,
    bodyBase64: response.bodyBase64,
  };
});

handleLocalRenderer("desktop:encrypt-secret", async (_event, secret = "") => {
  const { ciphertext, storageMode } = encryptDesktopSecret(secret);
  return {
    ok: true,
    ciphertext,
    storageMode,
  };
});

handleLocalRenderer("desktop:decrypt-secret", async (_event, payload = {}) => {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  return {
    ok: true,
    secret: decryptDesktopSecret(safePayload.ciphertext, safePayload.storageMode),
  };
});

handleLocalRenderer("desktop:create-local-media-file-token", async (_event, sourcePath = "") => {
  const { token, expiresAtMs } = issueDesktopMediaFileToken(sourcePath);
  return {
    ok: true,
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
});

handleLocalRenderer("desktop:resolve-local-media-file-token", async (_event, fileToken = "") => {
  const { resolvedPath, expiresAtMs } = resolveDesktopMediaFileToken(fileToken);
  return {
    ok: true,
    filePath: resolvedPath,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
});

handleLocalRenderer("desktop:select-local-media-file", async (_event, options = {}) => selectLocalMediaFile(options));

handleLocalRenderer("desktop:read-local-media-file", async (_event, fileToken = "") => readLocalMediaFile(fileToken));

handleLocalRenderer("desktop:request-local-helper", async (_event, request) => requestLocalHelper(request));

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
