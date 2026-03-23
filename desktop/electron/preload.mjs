const { contextBridge, ipcRenderer } = require("electron");

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

function emitPreloadSignal(channel, payload = {}) {
  try {
    ipcRenderer.send(channel, payload);
  } catch (_) {
    // If IPC is unavailable, the main process will still receive preload-error.
  }
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

emitPreloadSignal("desktop:preload-ready", {
  ...preloadContext,
  stage: "script-started",
});

try {
  contextBridge.exposeInMainWorld("desktopRuntime", {
    isDesktop: true,
    platform: "electron",
    getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
    getHelperStatus: () => ipcRenderer.invoke("desktop:get-helper-status"),
    getServerStatus: () => ipcRenderer.invoke("desktop:get-server-status"),
    probeServerNow: () => ipcRenderer.invoke("desktop:probe-server-now"),
    getModelUpdateStatus: () => ipcRenderer.invoke("desktop:get-model-update-status"),
    checkModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:check-model-update", modelKey),
    startModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:start-model-update", modelKey),
    cancelModelUpdate: () => ipcRenderer.invoke("desktop:cancel-model-update"),
    openLogsDirectory: () => ipcRenderer.invoke("desktop:open-logs-directory"),
    requestLocalHelper: (request) => ipcRenderer.invoke("desktop:request-local-helper", request),
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
  });
  emitPreloadSignal("desktop:preload-ready", {
    ...preloadContext,
    emittedAt: nowIso(),
    stage: "bridge-exposed",
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
