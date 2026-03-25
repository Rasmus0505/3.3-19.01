import { spawn } from "child_process";
import { ipcMain, app } from "electron";
import { join } from "path";
import { l as log } from "../main.js";
import "fs";
import "constants";
import "stream";
import "util";
import "assert";
import "events";
import "crypto";
import "tty";
import "os";
import "url";
import "zlib";
import "http";
import "https";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const MAX_RESTARTS = 3;
class AsrProcessManager {
  process = null;
  messageBuffer = "";
  pendingRequests = /* @__PURE__ */ new Map();
  nextId = 1;
  restartCount = 0;
  ready = false;
  scriptPath;
  constructor() {
    this.scriptPath = app.isPackaged ? join(app.getAppPath(), "..", "..", "app.asar.unpacked", "addon", "sherpa-onnx", "asr_offline_process.js") : join(app.getAppPath(), "addon", "sherpa-onnx", "asr_offline_process.js");
  }
  /**
   * Start the ASR child process and initialize the recognizer.
   */
  async start() {
    if (this.process) return;
    return new Promise((resolve, reject) => {
      log.info("[ASR] Starting child process:", this.scriptPath);
      let nodeModulesPath;
      if (app.isPackaged) {
        nodeModulesPath = join(app.getAppPath(), "..", "..", "app.asar.unpacked", "node_modules");
      } else {
        nodeModulesPath = join(app.getAppPath(), "node_modules");
      }
      const env = { ...process.env, NODE_PATH: nodeModulesPath };
      this.process = spawn(process.execPath, [this.scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env,
        windowsHide: true
      });
      this.process.stdout?.on("data", (data) => {
        this.handleStdout(data);
      });
      this.process.stderr?.on("data", (data) => {
        log.warn("[ASR] stderr:", data.toString());
      });
      this.process.on("error", (err) => {
        log.error("[ASR] Process error:", err);
        this.handleCrash();
      });
      this.process.on("exit", (code, signal) => {
        log.warn(`[ASR] Process exited with code=${code}, signal=${signal}`);
        if (this.ready) {
          this.handleCrash();
        }
      });
      this.sendRequest("init", {}).then((result) => {
        log.info("[ASR] Recognizer initialized:", result);
        this.ready = true;
        this.restartCount = 0;
        resolve();
      }).catch((err) => {
        log.error("[ASR] Init failed:", err);
        this.process = null;
        reject(err);
      });
    });
  }
  /**
   * Transcribe an audio file using Sherpa-ONNX.
   * @param audioFilePath Absolute path to a 16kHz mono WAV file
   */
  async transcribe(audioFilePath) {
    if (!this.process || !this.ready) {
      await this.start();
    }
    return this.sendRequest("transcribe", { audioFilePath });
  }
  /**
   * Check ASR health status.
   */
  async healthcheck() {
    if (!this.process) {
      return { status: "error", modelPath: "", tokensPath: "", error: "Process not started" };
    }
    return this.sendRequest("healthcheck", {});
  }
  /**
   * Stop the ASR process.
   */
  stop() {
    if (this.process) {
      log.info("[ASR] Stopping child process");
      this.process.kill();
      this.process = null;
      this.ready = false;
    }
  }
  handleStdout(data) {
    this.messageBuffer += data.toString();
    let newlineIndex;
    while ((newlineIndex = this.messageBuffer.indexOf("\n")) !== -1) {
      const raw = this.messageBuffer.slice(0, newlineIndex);
      this.messageBuffer = this.messageBuffer.slice(newlineIndex + 1);
      if (!raw.trim()) continue;
      try {
        const msg = JSON.parse(raw);
        this.handleMessage(msg);
      } catch (e) {
        log.warn("[ASR] Failed to parse message:", raw);
      }
    }
  }
  handleMessage(msg) {
    if (msg.method && !msg.id) {
      this.handleNotification(msg);
      return;
    }
    if (msg.id !== void 0) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }
  }
  handleNotification(msg) {
    const { method, params } = msg;
    if (method === "progress") {
      log.info("[ASR] Progress:", params);
      const progressParams = params;
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("asr-progress", progressParams);
      }
    }
  }
  sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error("ASR process not started"));
        return;
      }
      const id = this.nextId++;
      this.pendingRequests.set(id, { resolve, reject });
      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.process.stdin.write(payload);
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out after 300s`));
        }
      }, 3e5);
      this.pendingRequests.get(id)?.reject;
      const originalReject = reject;
      this.pendingRequests.set(id, {
        resolve,
        reject: (err) => {
          clearTimeout(timeout);
          originalReject(err);
        }
      });
    });
  }
  handleCrash() {
    this.process = null;
    this.ready = false;
    this.messageBuffer = "";
    this.pendingRequests.forEach(({ reject }) => reject(new Error("ASR process crashed")));
    this.pendingRequests.clear();
    if (this.restartCount < MAX_RESTARTS) {
      this.restartCount++;
      log.info(`[ASR] Restarting (attempt ${this.restartCount}/${MAX_RESTARTS})`);
      setTimeout(() => this.start().catch((e) => log.error("[ASR] Restart failed:", e)), 2e3);
    } else {
      log.error("[ASR] Max restarts exceeded, giving up");
    }
  }
  getMainWindow() {
    const { BrowserWindow } = require2("electron");
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  }
}
const asrProcessManager = new AsrProcessManager();
function registerAsrIpcHandlers() {
  ipcMain.handle("asr:start", async () => {
    await asrProcessManager.start();
    return { status: "started" };
  });
  ipcMain.handle("asr:transcribe", async (_, audioFilePath) => {
    return asrProcessManager.transcribe(audioFilePath);
  });
  ipcMain.handle("asr:healthcheck", async () => {
    return asrProcessManager.healthcheck();
  });
  ipcMain.handle("asr:stop", () => {
    asrProcessManager.stop();
    return { status: "stopped" };
  });
}
export {
  AsrProcessManager,
  asrProcessManager,
  registerAsrIpcHandlers
};
