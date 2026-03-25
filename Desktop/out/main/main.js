import { app, BrowserWindow, dialog, ipcMain, shell, Menu, nativeImage, Tray } from "electron";
import { join } from "path";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
import("./chunks/asrProcess-CZUUkYSE.js").then(({ registerAsrIpcHandlers }) => {
  registerAsrIpcHandlers();
  log.info("[Main] ASR IPC handlers registered");
}).catch((e) => log.error("[Main] Failed to register ASR IPC handlers:", e));
log.initialize({ preload: true });
log.transports.file.level = "info";
autoUpdater.logger = log;
const isDev = !app.isPackaged;
let mainWindow = null;
let tray = null;
function createTray() {
  try {
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip("Bottle Desktop");
    tray.on("click", () => {
      mainWindow?.show();
    });
  } catch {
  }
}
function buildMenu() {
  const template = [
    {
      label: "文件",
      submenu: [
        {
          label: "退出",
          accelerator: "CmdOrCtrl+Q",
          click: () => app.quit()
        }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "视图",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "关于",
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "关于 Bottle Desktop",
              message: `Bottle Desktop v${app.getVersion()}`,
              detail: "本地 AI 课程生成器"
            });
          }
        },
        ...isDev ? [] : [
          {
            label: "检查更新",
            click: () => autoUpdater.checkForUpdatesAndNotify()
          }
        ]
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
function getRendererUrl() {
  if (isDev) {
    const port = process.env.ELECTRON_RENDERER_URL?.split(":").pop()?.replace(/\D/g, "") || "5173";
    return `http://localhost:${port}`;
  }
  return join(__dirname, "../renderer/index.html");
}
async function createWindow() {
  const preloadPath = isDev ? join(__dirname, "../preload/preload.mjs") : join(__dirname, "preload.mjs");
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Bottle Desktop",
    backgroundColor: "#f9fafb",
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (isDev) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL || getRendererUrl();
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(getRendererUrl());
  }
}
app.whenReady().then(() => {
  app.setAppUserModelId("com.bottle.desktop");
  buildMenu();
  createWindow();
  createTray();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
autoUpdater.on("update-available", () => {
  log.info("update-available");
});
autoUpdater.on("update-downloaded", () => {
  log.info("update-downloaded");
  dialog.showMessageBox({
    type: "info",
    title: "有新版本",
    message: "新版本已下载，是否立即安装并重启？",
    buttons: ["重启", "稍后"]
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});
autoUpdater.on("error", (err) => {
  log.error("autoUpdater error:", err);
});
ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("get-is-dev", () => isDev);
ipcMain.handle("open-external", (_, url) => {
  shell.openExternal(url);
});
ipcMain.handle(
  "show-open-dialog",
  async (_, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  }
);
