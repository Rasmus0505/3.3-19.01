import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

let mainWindow = null;
let backendProcess = null;
let backendPort = null;
let backendLogPath = "";
let backendRoot = "";

function getDesktopClientRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(currentDir, "..");
}

function getBackendRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend");
  }
  return path.resolve(getDesktopClientRoot(), "..");
}

function getBackendScriptPath() {
  return path.join(getBackendRoot(), "scripts", "run_desktop_backend.py");
}

function getPythonCandidates() {
  const configured = String(process.env.DESKTOP_PYTHON_EXECUTABLE || "").trim();
  const candidates = [];
  if (configured) {
    candidates.push({ command: configured, args: [] });
  }
  candidates.push({ command: "py", args: ["-3.11"] });
  candidates.push({ command: "python", args: [] });
  candidates.push({ command: "python3", args: [] });
  return candidates;
}

function resolvePythonCommand() {
  for (const candidate of getPythonCandidates()) {
    const probe = spawnSync(candidate.command, [...candidate.args, "--version"], {
      stdio: "ignore",
      timeout: 5000,
      windowsHide: true,
    });
    if (probe.status === 0) {
      return candidate;
    }
  }
  throw new Error("No usable Python 3.11 runtime was found. Install Python 3.11 or set DESKTOP_PYTHON_EXECUTABLE.");
}

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForBackendHealth(port, timeoutMs = 45000) {
  const startedAt = Date.now();
  const targetUrl = `http://127.0.0.1:${port}/health`;
  while (Date.now() - startedAt < timeoutMs) {
    if (backendProcess && backendProcess.exitCode != null) {
      throw new Error(`The local backend exited before startup completed. Exit code: ${backendProcess.exitCode}`);
    }
    try {
      const response = await fetch(targetUrl, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.ok === true) {
          return;
        }
      }
    } catch (_) {
      // Keep waiting until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out while waiting for backend health check: ${targetUrl}`);
}

function ensureLogFile(logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, "", { encoding: "utf8" });
}

async function startBackend() {
  backendRoot = getBackendRoot();
  backendPort = await pickFreePort();
  backendLogPath = path.join(app.getPath("logs"), "desktop-backend.log");
  ensureLogFile(backendLogPath);

  const pythonRuntime = resolvePythonCommand();
  const backendScript = getBackendScriptPath();
  const userDataDir = app.getPath("userData");
  const cacheDir = app.getPath("sessionData");
  const tempDir = path.join(app.getPath("temp"), "english-trainer-desktop");
  const logDir = app.getPath("logs");

  const env = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    DESKTOP_BACKEND_ROOT: backendRoot,
    DESKTOP_USER_DATA_DIR: userDataDir,
    DESKTOP_CACHE_DIR: cacheDir,
    DESKTOP_LOG_DIR: logDir,
    DESKTOP_TEMP_DIR: tempDir,
  };

  const outputHandle = fs.openSync(backendLogPath, "a");
  backendProcess = spawn(
    pythonRuntime.command,
    [...pythonRuntime.args, backendScript, "--host", "127.0.0.1", "--port", String(backendPort)],
    {
      cwd: backendRoot,
      env,
      stdio: ["ignore", outputHandle, outputHandle],
      windowsHide: true,
    }
  );

  backendProcess.once("error", (error) => {
    const message = `[desktop] backend process error: ${error.message}\n`;
    fs.appendFileSync(backendLogPath, message, "utf8");
  });

  await waitForBackendHealth(backendPort);
}

async function stopBackend() {
  if (!backendProcess || backendProcess.exitCode != null) {
    return;
  }
  backendProcess.kill();
  await new Promise((resolve) => {
    backendProcess.once("exit", () => resolve());
    setTimeout(resolve, 5000);
  });
}

async function createMainWindow() {
  if (!backendPort) {
    throw new Error("The local backend port has not been initialized.");
  }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#111827",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(currentDir, "preload.mjs"),
    },
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  await mainWindow.loadURL(`http://127.0.0.1:${backendPort}`);
}

async function bootstrapDesktopApp() {
  try {
    await startBackend();
    await createMainWindow();
  } catch (error) {
    const detail = [error instanceof Error ? error.message : String(error), backendLogPath ? `Log file: ${backendLogPath}` : ""]
      .filter(Boolean)
      .join("\n");
    await dialog.showMessageBox({
      type: "error",
      title: "Desktop client startup failed",
      message: "Electron could not start the local backend.",
      detail,
    });
    await stopBackend();
    app.quit();
  }
}

ipcMain.handle("desktop:get-runtime-info", () => ({
  isPackaged: app.isPackaged,
  backendPort,
  backendRoot,
  backendLogPath,
  userDataPath: app.getPath("userData"),
}));

ipcMain.handle("desktop:open-logs-directory", async () => {
  if (!backendLogPath) {
    return false;
  }
  const folder = path.dirname(backendLogPath);
  await shell.openPath(folder);
  return true;
});

app.whenReady().then(async () => {
  await bootstrapDesktopApp();
});

app.on("window-all-closed", async () => {
  await stopBackend();
  app.quit();
});

app.on("before-quit", async () => {
  await stopBackend();
});
