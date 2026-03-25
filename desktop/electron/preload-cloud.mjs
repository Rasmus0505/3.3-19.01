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
    // Ignore diagnostics transport failures.
  }
}

function subscribe(channel, callback) {
  if (typeof callback !== "function") {
    return () => {};
  }
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
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
    mode: "cloud-linked",
    getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-public-runtime-info"),
    getHelperStatus: async () => {
      const info = await ipcRenderer.invoke("desktop:get-public-runtime-info");
      return info?.helperStatus || null;
    },
    getServerStatus: async () => {
      const info = await ipcRenderer.invoke("desktop:get-public-runtime-info");
      return info?.serverStatus || null;
    },
    getModelUpdateStatus: async () => {
      const info = await ipcRenderer.invoke("desktop:get-public-runtime-info");
      return info?.modelUpdate || null;
    },
    getClientUpdateStatus: async () => {
      const info = await ipcRenderer.invoke("desktop:get-public-runtime-info");
      return info?.clientUpdate || null;
    },
    onHelperRestarting: (callback) => subscribe("desktop:helper-restarting", callback),
    onServerStatusChanged: (callback) => subscribe("desktop:server-status-changed", callback),
    onModelUpdateProgress: (callback) => subscribe("desktop:model-update-progress", callback),
    onClientUpdateStatusChanged: (callback) => subscribe("desktop:client-update-status-changed", callback),
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
