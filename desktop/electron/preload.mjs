const { contextBridge, ipcRenderer, webUtils } = require("electron");
const { createLocalDbBridge } = require("../src/db/local-db.cjs");

let _syncEngine = null;

function getSyncEngineBridge() {
  if (_syncEngine) return _syncEngine;
  const { SyncEngine } = require("../src/sync/sync-engine.mjs");
  _syncEngine = new SyncEngine({
    localDb: localDbBridge,
    desktopRuntime: {
      auth: {
        getAccessToken: async (options = {}) => {
          const response = await ipcRenderer.invoke("desktop:auth-get-access-token", options);
          return trimText(response?.accessToken);
        },
      },
      getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
    },
  });
  return _syncEngine;
}
const LOCAL_ASR_DEFAULT_MODEL_KEY = "faster-whisper-medium";
const LOCAL_ASR_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

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

function emitPreloadSignal(channel, payload = {}) {
  try {
    ipcRenderer.send(channel, payload);
  } catch (_) {
    // If IPC is unavailable, the main process will still receive preload-error.
  }
}

function createLocalAsrError(message, extra = {}) {
  const error = new Error(message);
  Object.assign(error, extra);
  return error;
}

async function getLocalAsrBaseUrl() {
  const runtimeInfo = await ipcRenderer.invoke("desktop:get-runtime-info");
  const helperBaseUrl = trimText(runtimeInfo?.helperBaseUrl);
  const fallbackPort = Number(runtimeInfo?.localAsrPort || runtimeInfo?.backendPort || 0);
  if (helperBaseUrl) {
    return helperBaseUrl.replace(/\/+$/, "");
  }
  if (Number.isInteger(fallbackPort) && fallbackPort > 0) {
    return `http://127.0.0.1:${fallbackPort}`;
  }
  throw createLocalAsrError("本地 ASR 服务尚未启动，请先确认桌面 Helper 已正常运行。", {
    code: "LOCAL_ASR_HELPER_UNAVAILABLE",
  });
}

async function buildLocalAsrUnavailableError(error) {
  const runtimeInfo = await ipcRenderer.invoke("desktop:get-runtime-info").catch(() => null);
  const helperStatus = runtimeInfo?.helperStatus && typeof runtimeInfo.helperStatus === "object" ? runtimeInfo.helperStatus : {};
  const helperState = trimText(helperStatus.modelStatus || helperStatus.modelStatusMessage);
  const backendLogPath = trimText(runtimeInfo?.backendLogPath);
  const baseMessage = error instanceof Error ? trimText(error.message) : trimText(error);
  return createLocalAsrError(
    [
      "无法连接本地 ASR 服务，请确认桌面 Helper 未崩溃。",
      baseMessage ? `原因：${baseMessage}` : "",
      helperState ? `状态：${helperState}` : "",
      backendLogPath ? `日志：${backendLogPath}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    {
      code: "LOCAL_ASR_NETWORK_ERROR",
      helperStatus,
      backendLogPath,
    },
  );
}

async function parseLocalAsrResponse(response) {
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

async function requestLocalAsr(pathname, { method = "GET", body, timeoutMs = LOCAL_ASR_DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const baseUrl = await getLocalAsrBaseUrl();
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      cache: "no-store",
      headers: body == null ? {} : { "content-type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await parseLocalAsrResponse(response);
    if (!response.ok) {
      const detail = payload?.detail && typeof payload.detail === "object" ? payload.detail : {};
      throw createLocalAsrError(
        trimText(detail.message || payload?.message) || `本地 ASR 请求失败（${response.status}）。`,
        {
          code: trimText(detail.code || payload?.code) || "LOCAL_ASR_REQUEST_FAILED",
          status: response.status,
          detail: trimText(detail.detail || payload?.detail || ""),
          payload,
        },
      );
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createLocalAsrError("本地 ASR 请求超时，请稍后重试或检查桌面 Helper 日志。", {
        code: "LOCAL_ASR_TIMEOUT",
      });
    }
    if (error?.code && typeof error.code === "string" && error instanceof Error) {
      throw error;
    }
    throw await buildLocalAsrUnavailableError(error);
  } finally {
    clearTimeout(timer);
  }
}

function requireLocalAsrFilePath(filePath) {
  const normalized = trimText(filePath);
  if (normalized) {
    return normalized;
  }
  throw createLocalAsrError("本地 ASR filePath 不能为空。", {
    code: "LOCAL_ASR_FILE_PATH_REQUIRED",
  });
}

function requireLocalAsrFileToken(fileToken) {
  const normalized = trimText(fileToken);
  if (normalized) {
    return normalized;
  }
  throw createLocalAsrError("本地媒体 token 不能为空。", {
    code: "LOCAL_ASR_FILE_TOKEN_REQUIRED",
  });
}

async function resolveLocalAsrSourcePath({ filePath = "", fileToken = "" } = {}) {
  const normalizedToken = trimText(fileToken);
  if (normalizedToken) {
    const payload = await ipcRenderer.invoke("desktop:resolve-local-media-file-token", requireLocalAsrFileToken(normalizedToken));
    const resolvedPath = trimText(payload?.filePath);
    if (!payload?.ok || !resolvedPath) {
      throw createLocalAsrError("本地媒体 token 无效或已过期，请重新选择文件。", {
        code: "LOCAL_ASR_FILE_TOKEN_INVALID",
      });
    }
    return resolvedPath;
  }
  return requireLocalAsrFilePath(filePath);
}

const preloadContext = {
  emittedAt: nowIso(),
  href: globalThis.location?.href || "",
  origin: globalThis.location?.origin || "",
  sandboxed: Boolean(process?.sandboxed),
  contextIsolation: Boolean(process?.contextIsolated),
  electronVersion: String(process?.versions?.electron || ""),
  chromeVersion: String(process?.versions?.chrome || ""),
  nodeVersion: String(process?.versions?.node || ""),
  processType: String(process?.type || ""),
};

const localDbBridge = createLocalDbBridge();

function wrapLocalDbMethod(methodName) {
  return async (...args) => {
    try {
      return await localDbBridge[methodName](...args);
    } catch (error) {
      throw serializeError(error);
    }
  };
}

function wrapLocalDbSyncMethod(methodName) {
  return async (...args) => {
    try {
      return await localDbBridge.sync[methodName](...args);
    } catch (error) {
      throw serializeError(error);
    }
  };
}

async function listLocalLessons() {
  const courses = await localDbBridge.getCourses();
  return Promise.all(
    (Array.isArray(courses) ? courses : []).map(async (course) => {
      const [sentences, progress] = await Promise.all([
        localDbBridge.getSentences(course.id).catch(() => []),
        localDbBridge.getProgress(course.id).catch(() => null),
      ]);
      return {
        course,
        sentences: Array.isArray(sentences) ? sentences : [],
        progress: progress || null,
      };
    }),
  );
}

async function saveLocalCourseBundle(payload = {}) {
  const course = payload?.course && typeof payload.course === "object" ? payload.course : null;
  if (!course) {
    throw new Error("localDb.saveCourseBundle requires course payload.");
  }
  const sentences = Array.isArray(payload?.sentences) ? payload.sentences : [];
  const progress = payload?.progress && typeof payload.progress === "object" ? payload.progress : null;
  const syncBehavior = trimText(payload?.syncBehavior) || "local";
  const overwriteExisting = Boolean(payload?.overwriteExisting);
  const savedCourse = await localDbBridge.saveCourse(course, { syncBehavior });
  await localDbBridge.saveSentences(savedCourse.id, sentences);
  if (progress) {
    await localDbBridge.saveProgress(savedCourse.id, progress, { syncBehavior });
  }
  if (Boolean(payload?.recordImportSync)) {
    const operation = overwriteExisting ? "UPDATE" : "INSERT";
    await localDbBridge.sync.logSync("lesson_sentences", savedCourse.id, operation, Number(savedCourse?.version || course?.version || 1));
    if (progress) {
      await localDbBridge.sync.logSync("progress", savedCourse.id, operation, Number(progress?.version || savedCourse?.version || 1));
    }
  }
  return {
    course: savedCourse,
    sentences,
    progress,
  };
}

function normalizeBase64Url(value) {
  const normalized = trimText(value).replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) {
    return "";
  }
  const remainder = normalized.length % 4;
  return remainder === 0 ? normalized : `${normalized}${"=".repeat(4 - remainder)}`;
}

function parseJwtPayload(token) {
  const segments = trimText(token).split(".");
  if (segments.length < 2 || !segments[1]) {
    return {};
  }
  try {
    return JSON.parse(Buffer.from(normalizeBase64Url(segments[1]), "base64").toString("utf8"));
  } catch (_) {
    return {};
  }
}

function readJwtExpiryMs(token) {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= 0) {
    return 0;
  }
  return exp * 1000;
}

function readJwtExpiryIso(token) {
  const expiryMs = readJwtExpiryMs(token);
  return expiryMs > 0 ? new Date(expiryMs).toISOString() : "";
}

function isJwtExpired(token, skewMs = 15_000) {
  const expiryMs = readJwtExpiryMs(token);
  if (expiryMs <= 0) {
    return true;
  }
  return expiryMs <= Date.now() + Math.max(0, Number(skewMs || 0));
}

function normalizeAuthUser(user = {}) {
  const userId = Number(user?.id || user?.user_id || 0);
  const email = trimText(user?.email);
  return {
    id: Number.isFinite(userId) && userId > 0 ? userId : 0,
    email,
    is_admin: Boolean(user?.is_admin),
  };
}

function buildAuthPayload(accessToken, refreshToken, user) {
  const normalizedUser = normalizeAuthUser(user);
  return {
    access_token: trimText(accessToken),
    refresh_token: trimText(refreshToken),
    user: normalizedUser.id > 0 && normalizedUser.email ? normalizedUser : null,
  };
}

function toAuthErrorMessage(payload, fallbackMessage) {
  if (payload?.detail && typeof payload.detail === "object") {
    return trimText(payload.detail.message || payload.detail.detail) || fallbackMessage;
  }
  return trimText(payload?.message || payload?.detail) || fallbackMessage;
}

async function getDesktopCloudApiBaseUrl() {
  const runtimeInfo = await ipcRenderer.invoke("desktop:get-runtime-info");
  const apiBaseUrl = trimText(runtimeInfo?.cloud?.apiBaseUrl || runtimeInfo?.cloud?.appBaseUrl);
  if (!apiBaseUrl) {
    throw new Error("桌面端未配置 cloud.apiBaseUrl，无法恢复登录状态。");
  }
  return apiBaseUrl.replace(/\/+$/, "");
}

async function encryptAuthSecret(secret) {
  const payload = await ipcRenderer.invoke("desktop:encrypt-secret", trimText(secret));
  if (!payload?.ok) {
    throw new Error("桌面端密钥保护失败。");
  }
  return {
    ciphertext: trimText(payload.ciphertext),
    storageMode: trimText(payload.storageMode || "none"),
  };
}

async function decryptAuthSecret(ciphertext, storageMode) {
  if (!trimText(ciphertext)) {
    return "";
  }
  const payload = await ipcRenderer.invoke("desktop:decrypt-secret", {
    ciphertext: trimText(ciphertext),
    storageMode: trimText(storageMode || "none"),
  });
  if (!payload?.ok) {
    throw new Error("桌面端密钥解密失败。");
  }
  return trimText(payload.secret);
}

async function readCachedAuthSession() {
  const cached = await localDbBridge.getAuthCache("default");
  if (!cached) {
    return null;
  }
  const refreshToken = await decryptAuthSecret(cached.refresh_token_ciphertext, cached.refresh_token_storage_mode);
  return {
    access_token: trimText(cached.access_token),
    refresh_token: refreshToken,
    user: normalizeAuthUser({
      id: cached.user_id,
      email: cached.email,
      is_admin: cached.is_admin,
    }),
    access_token_expires_at: trimText(cached.access_token_expires_at),
    refresh_token_expires_at: trimText(cached.refresh_token_expires_at),
    cached_at: trimText(cached.cached_at),
    updated_at: trimText(cached.updated_at),
  };
}

async function cacheDesktopAuthSession(payload = {}) {
  const authPayload = buildAuthPayload(payload.access_token, payload.refresh_token, payload.user);
  if (!authPayload.user) {
    throw new Error("桌面端认证缓存缺少用户信息。");
  }
  const encryptedRefresh = await encryptAuthSecret(authPayload.refresh_token);
  await localDbBridge.saveAuthCache({
    cache_key: "default",
    user_id: String(authPayload.user.id),
    email: authPayload.user.email,
    is_admin: authPayload.user.is_admin,
    access_token: authPayload.access_token,
    access_token_expires_at: readJwtExpiryIso(authPayload.access_token),
    refresh_token_ciphertext: encryptedRefresh.ciphertext,
    refresh_token_storage_mode: encryptedRefresh.storageMode,
    refresh_token_expires_at: readJwtExpiryIso(authPayload.refresh_token),
    cached_at: nowIso(),
    updated_at: nowIso(),
  });
  return {
    ok: true,
    auth: authPayload,
  };
}

async function clearDesktopAuthSession() {
  await localDbBridge.clearAuthCache("default");
  return { ok: true };
}

async function refreshDesktopAuthSession(refreshToken) {
  const apiBaseUrl = await getDesktopCloudApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ refresh_token: trimText(refreshToken) }),
  });
  const payload = await parseLocalAsrResponse(response);
  if (!response.ok) {
    throw createLocalAsrError(toAuthErrorMessage(payload, "登录刷新失败"), {
      code: trimText(payload?.code || payload?.detail?.code) || "AUTH_REFRESH_FAILED",
      status: response.status,
      payload,
    });
  }
  const authPayload = buildAuthPayload(payload.access_token, payload.refresh_token, payload.user);
  if (!authPayload.user) {
    throw new Error("刷新登录返回缺少用户信息。");
  }
  await cacheDesktopAuthSession(authPayload);
  return authPayload;
}

async function restoreDesktopAuthSession(options = {}) {
  const cached = await readCachedAuthSession();
  if (!cached) {
    return {
      status: "anonymous",
      auth: null,
      restored: false,
      refreshed: false,
      message: "",
    };
  }

  const online = options.online !== false;
  const forceRefresh = Boolean(options.forceRefresh);
  const accessExpired = isJwtExpired(cached.access_token);
  const refreshExpired = isJwtExpired(cached.refresh_token);

  if (!refreshExpired && (forceRefresh || (online && accessExpired))) {
    try {
      const refreshed = await refreshDesktopAuthSession(cached.refresh_token);
      return {
        status: "active",
        auth: refreshed,
        restored: true,
        refreshed: true,
        message: "",
      };
    } catch (error) {
      return {
        status: "expired",
        auth: null,
        restored: false,
        refreshed: false,
        user: cached.user,
        message: trimText(error?.message) || "登录状态已失效，请重新登录",
      };
    }
  }

  if (!accessExpired) {
    return {
      status: "active",
      auth: cached,
      restored: true,
      refreshed: false,
      message: "",
    };
  }

  if (!refreshExpired && !online) {
    return {
      status: "active",
      auth: cached,
      restored: true,
      refreshed: false,
      staleAccessToken: true,
      message: "",
    };
  }

  return {
    status: "expired",
    auth: null,
    restored: false,
    refreshed: false,
    user: cached.user,
    message: "登录状态已过期，请联网重新登录",
  };
}

async function getDesktopCachedUser() {
  const cached = await readCachedAuthSession();
  return cached?.user || null;
}

const localAsrApi = {
  getBaseUrl: () => getLocalAsrBaseUrl(),
  health: () => requestLocalAsr("/health"),
  getAssetStatus: () => ipcRenderer.invoke("desktop:local-asr-assets-status"),
  getBundledModelSummary: (modelKey) => ipcRenderer.invoke("desktop:local-asr-assets-bundled-summary", modelKey),
  installBundledModel: (modelKey) => ipcRenderer.invoke("desktop:local-asr-assets-install-bundled", modelKey),
  readAssetFile: (assetPath) => ipcRenderer.invoke("desktop:local-asr-read-asset-file", assetPath),
  transcribeDesktop: (payload) => ipcRenderer.invoke("desktop:desktop-asr-transcribe", payload),
  generateDesktop: (payload) => ipcRenderer.invoke("desktop:desktop-asr-generate", payload),
  transcribe: async ({ filePath, fileToken, modelKey = LOCAL_ASR_DEFAULT_MODEL_KEY } = {}) =>
    requestLocalAsr("/api/local-asr/transcribe", {
      method: "POST",
      body: {
        filePath: await resolveLocalAsrSourcePath({ filePath, fileToken }),
        modelKey: trimText(modelKey) || LOCAL_ASR_DEFAULT_MODEL_KEY,
      },
    }),
  generateLesson: async ({ filePath, fileToken, modelKey = LOCAL_ASR_DEFAULT_MODEL_KEY, runtimeKind = "desktop_local" } = {}) =>
    requestLocalAsr("/api/local-asr/generate-lesson", {
      method: "POST",
      body: {
        filePath: await resolveLocalAsrSourcePath({ filePath, fileToken }),
        modelKey: trimText(modelKey) || LOCAL_ASR_DEFAULT_MODEL_KEY,
        runtimeKind: trimText(runtimeKind) || "desktop_local",
      },
    }),
  generateCourse: async ({
    filePath,
    fileToken,
    sourceFilename = "",
    modelKey = LOCAL_ASR_DEFAULT_MODEL_KEY,
    runtimeKind = "desktop_local",
  } = {}) =>
    requestLocalAsr("/api/local-asr/generate-course", {
      method: "POST",
      body: {
        filePath: await resolveLocalAsrSourcePath({ filePath, fileToken }),
        sourceFilename: trimText(sourceFilename) || "",
        modelKey: trimText(modelKey) || LOCAL_ASR_DEFAULT_MODEL_KEY,
        runtimeKind: trimText(runtimeKind) || "desktop_local",
      },
    }),
};

emitPreloadSignal("desktop:preload-ready", {
  ...preloadContext,
  stage: "script-started",
});

try {
  contextBridge.exposeInMainWorld("localAsr", localAsrApi);
  contextBridge.exposeInMainWorld("desktopRuntime", {
    isDesktop: true,
    platform: "electron",
    getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
    auth: {
      getStatus: () => ipcRenderer.invoke("desktop:auth-get-status"),
      login: (credentials) => ipcRenderer.invoke("desktop:auth-login", credentials),
      register: (credentials) => ipcRenderer.invoke("desktop:auth-register", credentials),
      restoreSession: (options) => ipcRenderer.invoke("desktop:auth-restore-session", options),
      logout: () => ipcRenderer.invoke("desktop:auth-logout"),
      request: (request) => ipcRenderer.invoke("desktop:auth-request", request),
      upload: (request) => ipcRenderer.invoke("desktop:auth-upload", request),
    },
    localAsr: localAsrApi,
    getHelperStatus: () => ipcRenderer.invoke("desktop:get-helper-status"),
    getServerStatus: () => ipcRenderer.invoke("desktop:get-server-status"),
    probeServerNow: () => ipcRenderer.invoke("desktop:probe-server-now"),
    getModelUpdateStatus: () => ipcRenderer.invoke("desktop:get-model-update-status"),
    checkModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:check-model-update", modelKey),
    startModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:start-model-update", modelKey),
    cancelModelUpdate: () => ipcRenderer.invoke("desktop:cancel-model-update"),
    getClientUpdateStatus: () => ipcRenderer.invoke("desktop:get-client-update-status"),
    checkClientUpdate: () => ipcRenderer.invoke("desktop:check-client-update"),
    openClientUpdateLink: (preferredUrl) => ipcRenderer.invoke("desktop:open-client-update-link", preferredUrl),
    openLogsDirectory: () => ipcRenderer.invoke("desktop:open-logs-directory"),
    createLocalMediaFileToken: (sourcePath) => ipcRenderer.invoke("desktop:create-local-media-file-token", sourcePath),
    selectLocalMediaFile: (options) => ipcRenderer.invoke("desktop:select-local-media-file", options),
    readLocalMediaFile: (fileToken) => ipcRenderer.invoke("desktop:read-local-media-file", fileToken),
    urlImport: {
      createTask: (payload) => ipcRenderer.invoke("desktop:url-import-create-task", payload),
      getTask: (taskId) => ipcRenderer.invoke("desktop:url-import-get-task", taskId),
      cancelTask: (taskId) => ipcRenderer.invoke("desktop:url-import-cancel-task", taskId),
      downloadFile: (taskId) => ipcRenderer.invoke("desktop:url-import-download-file", taskId),
    },
    getPathForFile: (file) => {
      try {
        return String(webUtils.getPathForFile(file) || "");
      } catch (_) {
        return "";
      }
    },
    onHelperRestarting: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("desktop:helper-restarting", handler);
      return () => {
        ipcRenderer.removeListener("desktop:helper-restarting", handler);
      };
    },
    onServerStatusChanged: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("desktop:server-status-changed", handler);
      return () => {
        ipcRenderer.removeListener("desktop:server-status-changed", handler);
      };
    },
    onModelUpdateProgress: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("desktop:model-update-progress", handler);
      return () => {
        ipcRenderer.removeListener("desktop:model-update-progress", handler);
      };
    },
    onClientUpdateStatusChanged: (callback) => {
      if (typeof callback !== "function") {
        return () => {};
      }
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("desktop:client-update-status-changed", handler);
      return () => {
        ipcRenderer.removeListener("desktop:client-update-status-changed", handler);
      };
    },
  });
  contextBridge.exposeInMainWorld("localDb", {
    init: wrapLocalDbMethod("init"),
    listLessons: () => listLocalLessons(),
    saveCourseBundle: (payload) => saveLocalCourseBundle(payload),
  });

  const syncEngineBridge = getSyncEngineBridge();
  contextBridge.exposeInMainWorld("syncEngine", {
    syncAll: (options) => syncEngineBridge.syncAll(options),
    resolveConflict: (conflictId, strategy) => syncEngineBridge.resolveConflict(conflictId, strategy),
    getStatus: () => syncEngineBridge.getStatus(),
    getConflicts: () => syncEngineBridge.getConflicts(),
    getPendingCounts: () => syncEngineBridge.getPendingCounts(),
    on: (event, callback) => syncEngineBridge.on(event, callback),
  });

  emitPreloadSignal("desktop:preload-ready", {
    ...preloadContext,
    emittedAt: nowIso(),
    stage: "bridges-exposed",
  });
} catch (error) {
  emitPreloadSignal("desktop:preload-error", {
    ...preloadContext,
    failedAt: nowIso(),
    stage: "bridge-expose-failed",
    error: serializeError(error),
  });
  throw error;
}
