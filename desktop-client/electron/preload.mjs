import { contextBridge, ipcRenderer } from "electron";

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
