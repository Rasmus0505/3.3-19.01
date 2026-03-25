import { contextBridge, ipcRenderer } from "electron";
const api = {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getIsDev: () => ipcRenderer.invoke("get-is-dev"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  showOpenDialog: (options) => ipcRenderer.invoke("show-open-dialog", options),
  onDesktopRuntimeMessage: (callback) => {
    ipcRenderer.on("desktop-runtime-message", callback);
  },
  sendDesktopRuntimeMessage: (channel, data) => {
    ipcRenderer.send("desktop-runtime-message", { channel, data });
  },
  // ASR
  asrStart: () => ipcRenderer.invoke("asr:start"),
  asrTranscribe: (audioFilePath) => ipcRenderer.invoke("asr:transcribe", audioFilePath),
  asrHealthcheck: () => ipcRenderer.invoke("asr:healthcheck"),
  asrStop: () => ipcRenderer.invoke("asr:stop"),
  onAsrProgress: (callback) => {
    ipcRenderer.on("asr-progress", callback);
  }
};
contextBridge.exposeInMainWorld("electronAPI", api);
