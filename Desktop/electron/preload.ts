import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getIsDev: () => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  showOpenDialog: (options?: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  onDesktopRuntimeMessage: (callback: (event: unknown, data: unknown) => void) => void;
  sendDesktopRuntimeMessage: (channel: string, data: unknown) => void;
  // ASR IPC
  asrStart: () => Promise<{ status: string }>;
  asrTranscribe: (audioFilePath: string) => Promise<{
    text: string;
    duration: number;
    elapsedMs: number;
    rtf: number;
    segments: Array<{ text: string; start: number; end: number }>;
  }>;
  asrHealthcheck: () => Promise<{
    status: string;
    modelPath: string;
    tokensPath: string;
  }>;
  asrStop: () => Promise<{ status: string }>;
  onAsrProgress: (callback: (event: unknown, data: unknown) => void) => void;
}

const api: ElectronAPI = {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getIsDev: () => ipcRenderer.invoke("get-is-dev"),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  showOpenDialog: (options?: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke("show-open-dialog", options),
  onDesktopRuntimeMessage: (callback) => {
    ipcRenderer.on("desktop-runtime-message", callback);
  },
  sendDesktopRuntimeMessage: (channel: string, data: unknown) => {
    ipcRenderer.send("desktop-runtime-message", { channel, data });
  },
  // ASR
  asrStart: () => ipcRenderer.invoke("asr:start"),
  asrTranscribe: (audioFilePath: string) =>
    ipcRenderer.invoke("asr:transcribe", audioFilePath),
  asrHealthcheck: () => ipcRenderer.invoke("asr:healthcheck"),
  asrStop: () => ipcRenderer.invoke("asr:stop"),
  onAsrProgress: (callback) => {
    ipcRenderer.on("asr-progress", callback);
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
