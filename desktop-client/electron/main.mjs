import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DESKTOP_RUNTIME_CONFIG_FILE_NAME,
  resolveDesktopRuntimeConfig,
  validateDesktopRuntimeConfig,
} from "./runtime-config.mjs";
import { resolvePackagedDesktopRuntime, selectDesktopModelDir } from "./helper-runtime.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const iconPath = path.join(path.resolve(currentDir, ".."), "build", "icon.ico");
const LOCAL_HELPER_ALLOWED_PREFIXES = ["/api/local-asr-assets", "/api/desktop-asr", "/health", "/health/ready"];

let mainWindow = null;
let backendProcess = null;
let backendPort = null;
let backendLogPath = "";
let backendLogHandle = null;
let backendRoot = "";
let desktopConfigPath = "";
let desktopRuntimeConfig = null;
let packagedDesktopRuntime = null;

function getDesktopClientRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(currentDir, "..");
}

function getBackendRoot() {
  if (app.isPackaged) {
    return getPackagedDesktopRuntime().helperAppDir;
  }
  return path.resolve(getDesktopClientRoot(), "..");
}

function getBackendScriptPath() {
  return path.join(getBackendRoot(), "scripts", "run_desktop_backend.py");
}

function getPackagedRuntimeDefaultsPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "runtime-defaults.json");
  }
  return path.join(getDesktopClientRoot(), ".cache", "runtime-defaults.json");
}

function getPackagedDesktopRuntime() {
  if (!app.isPackaged) {
    return null;
  }
  if (!packagedDesktopRuntime) {
    packagedDesktopRuntime = resolvePackagedDesktopRuntime(process.resourcesPath);
  }
  return packagedDesktopRuntime;
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
      throw new Error(`The local helper exited before startup completed. Exit code: ${backendProcess.exitCode}`);
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
  throw new Error(`Timed out while waiting for local helper health check: ${targetUrl}`);
}

function ensureLogFile(logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, "", { encoding: "utf8" });
}

function closeBackendLogHandle() {
  if (typeof backendLogHandle === "number") {
    fs.closeSync(backendLogHandle);
  }
  backendLogHandle = null;
}

function loadDesktopRuntimeConfigForApp() {
  const userDataDir = app.getPath("userData");
  const cacheDir = app.getPath("sessionData");
  const tempDir = path.join(app.getPath("temp"), "english-trainer-desktop");
  const logDir = app.getPath("logs");
  desktopConfigPath = path.join(userDataDir, DESKTOP_RUNTIME_CONFIG_FILE_NAME);
  desktopRuntimeConfig = resolveDesktopRuntimeConfig({
    configPath: desktopConfigPath,
    userDataDir,
    cacheDir,
    logDir,
    tempDir,
    env: process.env,
    defaultConfigPath: getPackagedRuntimeDefaultsPath(),
  });
  validateDesktopRuntimeConfig(desktopRuntimeConfig, desktopConfigPath);
}

async function startBackend() {
  if (!desktopRuntimeConfig) {
    throw new Error("Desktop runtime config has not been initialized.");
  }
  backendRoot = getBackendRoot();
  backendPort = await pickFreePort();
  backendLogPath = path.join(desktopRuntimeConfig.local.logDir, "desktop-helper.log");
  ensureLogFile(backendLogPath);

  const packagedRuntime = getPackagedDesktopRuntime();
  const resolvedModelDir =
    app.isPackaged && packagedRuntime
      ? selectDesktopModelDir(process.resourcesPath, desktopRuntimeConfig.local.modelDir)
      : desktopRuntimeConfig.local.modelDir;
  let launchCommand = "";
  let launchArgs = [];
  if (app.isPackaged) {
    if (!packagedRuntime?.helperExists) {
      throw new Error(`Bundled local helper runtime is missing: ${packagedRuntime?.helperExecutablePath || "unknown path"}`);
    }
    launchCommand = packagedRuntime.helperExecutablePath;
    launchArgs = ["--host", "127.0.0.1", "--port", String(backendPort)];
  } else {
    const pythonRuntime = resolvePythonCommand();
    const backendScript = getBackendScriptPath();
    launchCommand = pythonRuntime.command;
    launchArgs = [...pythonRuntime.args, backendScript, "--host", "127.0.0.1", "--port", String(backendPort)];
  }
  const env = {
    ...process.env,
    PYTHONUNBUFFERED: "1",
    DESKTOP_BACKEND_ROOT: backendRoot,
    DESKTOP_CONFIG_PATH: desktopConfigPath,
    DESKTOP_USER_DATA_DIR: desktopRuntimeConfig.local.userDataDir,
    DESKTOP_MODEL_DIR: resolvedModelDir,
    DESKTOP_CACHE_DIR: desktopRuntimeConfig.local.cacheDir,
    DESKTOP_LOG_DIR: desktopRuntimeConfig.local.logDir,
    DESKTOP_TEMP_DIR: desktopRuntimeConfig.local.tempDir,
    DESKTOP_PREINSTALLED_MODEL_DIR: packagedRuntime?.bottle1ModelDir || "",
    DESKTOP_INSTALL_STATE_PATH: packagedRuntime?.installStatePath || "",
  };

  backendLogHandle = fs.openSync(backendLogPath, "a");
  backendProcess = spawn(launchCommand, launchArgs, {
    cwd: backendRoot,
    env,
    stdio: ["ignore", backendLogHandle, backendLogHandle],
    windowsHide: true,
  });

  backendProcess.once("error", (error) => {
    const message = `[desktop] helper process error: ${error.message}\n`;
    fs.appendFileSync(backendLogPath, message, "utf8");
  });
  backendProcess.once("exit", () => {
    closeBackendLogHandle();
  });

  await waitForBackendHealth(backendPort);
}

async function stopBackend() {
  if (!backendProcess || backendProcess.exitCode != null) {
    closeBackendLogHandle();
    return;
  }
  backendProcess.kill();
  await new Promise((resolve) => {
    backendProcess.once("exit", () => resolve());
    setTimeout(resolve, 5000);
  });
  closeBackendLogHandle();
}

function buildRuntimeInfo() {
  const packagedRuntime = getPackagedDesktopRuntime();
  return {
    isPackaged: app.isPackaged,
    helperMode: app.isPackaged ? "bundled-runtime" : "system-python",
    backendPort,
    backendRoot,
    backendLogPath,
    configPath: desktopConfigPath,
    helperBaseUrl: backendPort ? `http://127.0.0.1:${backendPort}` : "",
    cloud: desktopRuntimeConfig?.cloud || {},
    local: desktopRuntimeConfig?.local || {},
    install: packagedRuntime
      ? {
          bottle1InstallChoice: packagedRuntime.bottle1InstallChoice,
          bottle1Preinstalled: packagedRuntime.bottle1Preinstalled,
          bottle1PreinstallRequested: packagedRuntime.bottle1PreinstallRequested,
          bottle1ModelDir: packagedRuntime.bottle1ModelDir,
          installStatePath: packagedRuntime.installStatePath,
        }
      : {},
  };
}

function normalizeLocalHelperPath(requestPath) {
  const rawPath = String(requestPath || "").trim();
  if (!rawPath) {
    throw new Error("Local helper path is required.");
  }
  const candidate = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const allowed = LOCAL_HELPER_ALLOWED_PREFIXES.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`));
  if (!allowed) {
    throw new Error(`Local helper path is not allowed: ${candidate}`);
  }
  return candidate;
}

async function requestLocalHelper(request = {}) {
  if (!backendPort) {
    throw new Error("The local helper is not running.");
  }
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET", "POST"].includes(method)) {
    throw new Error(`Unsupported local helper method: ${method}`);
  }
  const helperPath = normalizeLocalHelperPath(request.path);
  const targetUrl = new URL(helperPath, `http://127.0.0.1:${backendPort}`);
  const headers = {};
  let body = undefined;
  if (method === "POST" && request.body != null) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(request.body);
  }
  const response = await fetch(targetUrl, {
    method,
    cache: "no-store",
    headers,
    body,
  });
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const responseType = request.responseType === "arrayBuffer" ? "arrayBuffer" : "json";
  if (responseType === "arrayBuffer") {
    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    return {
      ok: response.ok,
      status: response.status,
      headers: responseHeaders,
      contentType: response.headers.get("content-type") || "application/octet-stream",
      bodyBase64: bodyBuffer.toString("base64"),
    };
  }
  const rawText = await response.text();
  let data = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      data = { raw: rawText };
    }
  }
  return {
    ok: response.ok,
    status: response.status,
    headers: responseHeaders,
    contentType: response.headers.get("content-type") || "application/json",
    data,
  };
}

async function createMainWindow() {
  if (!desktopRuntimeConfig) {
    throw new Error("Desktop runtime config has not been initialized.");
  }
  const appBaseUrl = String(desktopRuntimeConfig.cloud.appBaseUrl || "").trim();
  if (!appBaseUrl) {
    throw new Error(`Desktop cloud app URL is empty. Update ${desktopConfigPath}.`);
  }
  mainWindow = new BrowserWindow({
    title: "Bottle",
    width: 1440,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#111827",
    icon: iconPath,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(currentDir, "preload.mjs"),
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => null);
    return { action: "deny" };
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  await mainWindow.loadURL(appBaseUrl);
}

async function bootstrapDesktopApp() {
  try {
    loadDesktopRuntimeConfigForApp();
    await startBackend();
    await createMainWindow();
  } catch (error) {
    const detail = [
      error instanceof Error ? error.message : String(error),
      desktopConfigPath ? `Config file: ${desktopConfigPath}` : "",
      backendLogPath ? `Local helper log: ${backendLogPath}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await dialog.showMessageBox({
      type: "error",
      title: "Desktop client startup failed",
      message: "Electron could not start the formal desktop runtime.",
      detail,
    });
    await stopBackend();
    app.quit();
  }
}

ipcMain.handle("desktop:get-runtime-info", () => buildRuntimeInfo());

ipcMain.handle("desktop:open-logs-directory", async () => {
  const folder = String(desktopRuntimeConfig?.local?.logDir || "").trim() || (backendLogPath ? path.dirname(backendLogPath) : "");
  if (!folder) {
    return false;
  }
  await shell.openPath(folder);
  return true;
});

ipcMain.handle("desktop:request-local-helper", async (_event, request) => requestLocalHelper(request));

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
