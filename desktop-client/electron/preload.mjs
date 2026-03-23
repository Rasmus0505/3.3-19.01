import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopRuntime", {
  isDesktop: true,
  platform: "electron",
  getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
  openLogsDirectory: () => ipcRenderer.invoke("desktop:open-logs-directory"),
  requestLocalHelper: (request) => ipcRenderer.invoke("desktop:request-local-helper", request),
});
