/**
 * ASR Process Manager
 *
 * Manages the Sherpa-ONNX ASR child process. Spawns it, communicates via
 * JSON-RPC over stdin/stdout, handles restarts on crash.
 *
 * Architecture: Electron Main Process -> Node.js Child Process -> Sherpa-ONNX NAPI
 */

import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { ipcMain, app } from "electron";
import { join } from "path";
import log from "electron-log";

export interface AsrProgressEvent {
  status: string;
  audioFilePath: string;
}

export interface AsrResult {
  text: string;
  duration: number;
  elapsedMs: number;
  rtf: number;
  segments: Array<{
    text: string;
    start: number;
    end: number;
  }>;
}

export interface AsrHealthStatus {
  status: "ready" | "not_initialized" | "error";
  modelPath: string;
  tokensPath: string;
  error?: string;
}

interface RpcMessage {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

const MAX_RESTARTS = 3;

export class AsrProcessManager {
  private process: ChildProcessWithoutNullStreams | null = null;
  private messageBuffer = "";
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  private nextId = 1;
  private restartCount = 0;
  private ready = false;
  private scriptPath: string;

  constructor() {
    // Path to the ASR child process script
    // In packaged: app.asar is inside resources/. We need addon from app.asar.unpacked.
    // addon/ is at: resources/app.asar.unpacked/addon/
    // app.getAppPath() returns resources/app.asar, so we need to go up twice.
    // In dev: addon/ is in the project root.
    this.scriptPath = app.isPackaged
      ? join(app.getAppPath(), "..", "..", "app.asar.unpacked", "addon", "sherpa-onnx", "asr_offline_process.js")
      : join(app.getAppPath(), "addon", "sherpa-onnx", "asr_offline_process.js");
  }

  /**
   * Start the ASR child process and initialize the recognizer.
   */
  async start(): Promise<void> {
    if (this.process) return;

    return new Promise((resolve, reject) => {
      log.info("[ASR] Starting child process:", this.scriptPath);

      // NODE_PATH must point to the unpacked node_modules so the child
      // process can find sherpa-onnx-node without bundling it.
      // In packaged: app.asar is inside resources/, app.asar.unpacked is at resources/app.asar.unpacked.
      // app.getAppPath() returns resources/app.asar, so we need ../../ to go up to resources, then app.asar.unpacked.
      // In dev: node_modules is in the project root.
      let nodeModulesPath: string;
      if (app.isPackaged) {
        nodeModulesPath = join(app.getAppPath(), "..", "..", "app.asar.unpacked", "node_modules");
      } else {
        nodeModulesPath = join(app.getAppPath(), "node_modules");
      }
      const env = { ...process.env, NODE_PATH: nodeModulesPath };

      this.process = spawn(process.execPath, [this.scriptPath], {
        stdio: ["pipe", "pipe", "pipe"],
        env,
        windowsHide: true,
      });

      this.process.stdout?.on("data", (data: Buffer) => {
        this.handleStdout(data);
      });

      this.process.stderr?.on("data", (data: Buffer) => {
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

      // Send init request
      this.sendRequest("init", {})
        .then((result) => {
          log.info("[ASR] Recognizer initialized:", result);
          this.ready = true;
          this.restartCount = 0;
          resolve();
        })
        .catch((err) => {
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
  async transcribe(audioFilePath: string): Promise<AsrResult> {
    if (!this.process || !this.ready) {
      await this.start();
    }

    return this.sendRequest("transcribe", { audioFilePath }) as Promise<AsrResult>;
  }

  /**
   * Check ASR health status.
   */
  async healthcheck(): Promise<AsrHealthStatus> {
    if (!this.process) {
      return { status: "error", modelPath: "", tokensPath: "", error: "Process not started" };
    }
    return this.sendRequest("healthcheck", {}) as Promise<AsrHealthStatus>;
  }

  /**
   * Stop the ASR process.
   */
  stop(): void {
    if (this.process) {
      log.info("[ASR] Stopping child process");
      this.process.kill();
      this.process = null;
      this.ready = false;
    }
  }

  private handleStdout(data: Buffer): void {
    this.messageBuffer += data.toString();
    let newlineIndex;
    while ((newlineIndex = this.messageBuffer.indexOf("\n")) !== -1) {
      const raw = this.messageBuffer.slice(0, newlineIndex);
      this.messageBuffer = this.messageBuffer.slice(newlineIndex + 1);
      if (!raw.trim()) continue;

      try {
        const msg: RpcMessage = JSON.parse(raw);
        this.handleMessage(msg);
      } catch (e) {
        log.warn("[ASR] Failed to parse message:", raw);
      }
    }
  }

  private handleMessage(msg: RpcMessage): void {
    // Handle notifications (no id)
    if (msg.method && !msg.id) {
      this.handleNotification(msg);
      return;
    }

    // Handle responses (has id and either result or error)
    if (msg.id !== undefined) {
      const pending = this.pendingRequests.get(msg.id as number);
      if (pending) {
        this.pendingRequests.delete(msg.id as number);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
      return;
    }
  }

  private handleNotification(msg: RpcMessage): void {
    const { method, params } = msg;
    if (method === "progress") {
      log.info("[ASR] Progress:", params);
      // Forward progress to renderer via IPC
      const progressParams = params as unknown as AsrProgressEvent;
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("asr-progress", progressParams);
      }
    }
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error("ASR process not started"));
        return;
      }

      const id = this.nextId++;
      this.pendingRequests.set(id, { resolve, reject });

      const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.process.stdin.write(payload);

      // Timeout: 5 minutes for transcription
      const timeout = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out after 300s`));
        }
      }, 300_000);

      this.pendingRequests.get(id)?.reject; // keep reference for cleanup
      const originalReject = reject;
      this.pendingRequests.set(id, {
        resolve,
        reject: (err: Error) => {
          clearTimeout(timeout);
          originalReject(err);
        },
      });
    });
  }

  private handleCrash(): void {
    this.process = null;
    this.ready = false;
    this.messageBuffer = "";
    this.pendingRequests.forEach(({ reject }) => reject(new Error("ASR process crashed")));
    this.pendingRequests.clear();

    if (this.restartCount < MAX_RESTARTS) {
      this.restartCount++;
      log.info(`[ASR] Restarting (attempt ${this.restartCount}/${MAX_RESTARTS})`);
      setTimeout(() => this.start().catch((e) => log.error("[ASR] Restart failed:", e)), 2000);
    } else {
      log.error("[ASR] Max restarts exceeded, giving up");
    }
  }

  private getMainWindow(): Electron.BrowserWindow | null {
    const { BrowserWindow } = require("electron");
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  }
}

// Singleton instance
export const asrProcessManager = new AsrProcessManager();

// IPC handlers for renderer communication
export function registerAsrIpcHandlers(): void {
  ipcMain.handle("asr:start", async () => {
    await asrProcessManager.start();
    return { status: "started" };
  });

  ipcMain.handle("asr:transcribe", async (_, audioFilePath: string) => {
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
