import { contextBridge, ipcRenderer, webUtils } from "electron";


function serializeFileLike(file) {
  if (!file || typeof file !== "object") {
    return file;
  }
  let sourcePath = "";
  try {
    sourcePath = webUtils.getPathForFile(file);
  } catch {
    sourcePath = "";
  }
  return {
    name: String(file.name || "").trim(),
    type: String(file.type || "").trim(),
    size: Number(file.size || 0),
    lastModified: Number(file.lastModified || 0),
    path: sourcePath,
    sourcePath,
  };
}


function serializeLocalRequest(request = {}) {
  const payload = request && typeof request === "object" ? { ...request } : {};
  if (payload.file) {
    payload.file = serializeFileLike(payload.file);
  }
  return payload;
}


contextBridge.exposeInMainWorld("desktopRuntime", {
  getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  requestCloudApi: (request) => ipcRenderer.invoke("desktop:request-cloud-api", request),
  cancelCloudRequest: (requestId) => ipcRenderer.send("desktop:cancel-cloud-request", requestId),
  requestLocalHelper: (request) => ipcRenderer.invoke("desktop:request-local-helper", request),
  transcribeLocalMedia: (request) => ipcRenderer.invoke("desktop:transcribe-local-media", serializeLocalRequest(request)),
  getHelperStatus: () => ipcRenderer.invoke("desktop:get-helper-status"),
  getServerStatus: () => ipcRenderer.invoke("desktop:get-server-status"),
  probeServerNow: () => ipcRenderer.invoke("desktop:probe-server-now"),
  selectLocalMediaFile: (options) => ipcRenderer.invoke("desktop:select-local-media-file", options),
  readLocalMediaFile: (sourcePath) => ipcRenderer.invoke("desktop:read-local-media-file", sourcePath),
  getPathForFile: (file) => {
    return webUtils.getPathForFile(file);
  },
  openLogsDirectory: () => ipcRenderer.invoke("desktop:open-logs-directory"),
  getClientUpdateStatus: () => ipcRenderer.invoke("desktop:get-client-update-status"),
  checkClientUpdate: () => ipcRenderer.invoke("desktop:check-client-update"),
  openClientUpdateLink: (preferredUrl) => ipcRenderer.invoke("desktop:open-client-update-link", preferredUrl),
  getModelUpdateStatus: () => ipcRenderer.invoke("desktop:get-model-update-status"),
  checkModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:check-model-update", modelKey),
  startModelUpdate: (modelKey) => ipcRenderer.invoke("desktop:start-model-update", modelKey),
  cancelModelUpdate: () => ipcRenderer.invoke("desktop:cancel-model-update"),
  onHelperRestarting: (callback) => {
    const handler = (_event, payload) => callback?.(payload);
    ipcRenderer.on("desktop:helper-restarting", handler);
    return () => ipcRenderer.removeListener("desktop:helper-restarting", handler);
  },
  onServerStatusChanged: (callback) => {
    const handler = (_event, payload) => callback?.(payload);
    ipcRenderer.on("desktop:server-status-changed", handler);
    return () => ipcRenderer.removeListener("desktop:server-status-changed", handler);
  },
  onClientUpdateStatusChanged: (callback) => {
    const handler = (_event, payload) => callback?.(payload);
    ipcRenderer.on("desktop:client-update-status-changed", handler);
    return () => ipcRenderer.removeListener("desktop:client-update-status-changed", handler);
  },
  onModelUpdateProgress: (callback) => {
    const handler = (_event, payload) => callback?.(payload);
    ipcRenderer.on("desktop:model-update-progress", handler);
    return () => ipcRenderer.removeListener("desktop:model-update-progress", handler);
  },
  auth: {
    cacheSession: (session) => ipcRenderer.invoke("desktop:auth-cache-session", session),
    restoreSession: (options) => ipcRenderer.invoke("desktop:auth-restore-session", options),
    clearSession: () => ipcRenderer.invoke("desktop:auth-clear-session"),
  },
});


contextBridge.exposeInMainWorld("localAsr", {
  generateCourse: (request) => ipcRenderer.invoke("local-asr:generate-course", serializeLocalRequest(request)),
});
