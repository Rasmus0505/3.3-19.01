import { app, protocol } from "electron";
import fs from "node:fs";
import path from "node:path";

export const APP_PROTOCOL_NAME = "app";

/**
 * Resolve the local static assets directory inside the asar package.
 * Returns the path to the dist/ folder containing the bundled frontend build.
 */
export function getLocalDistRoot() {
  const appPath = app.isPackaged ? app.getAppPath() : path.join(app.getAppPath(), "..");
  return path.join(appPath, "dist");
}

/**
 * Check if the local static dist bundle exists (standalone mode indicator).
 */
export function hasLocalDistBundle() {
  try {
    const distRoot = getLocalDistRoot();
    const indexPath = path.join(distRoot, "index.html");
    return fs.existsSync(indexPath);
  } catch {
    return false;
  }
}

/**
 * Map an app:// URL path to an absolute filesystem path within the asar.
 *
 * Rules:
 *   app://local/index.html  ->  {appPath}/dist/index.html
 *   app://local/assets/x.js ->  {appPath}/dist/assets/x.js
 *   app://local/            ->  {appPath}/dist/
 */
export function resolveAppProtocolPath(urlPath) {
  const rawPath = String(urlPath || "/").replace(/^\/+/, "");
  const segments = rawPath.split("/");
  if (segments[0] === "local" || segments[0] === "") {
    const relative = segments.slice(segments[0] === "local" ? 1 : 0).join("/");
    return path.join(getLocalDistRoot(), relative || "index.html");
  }
  return path.join(getLocalDistRoot(), rawPath);
}

/**
 * Register app:// as the default protocol client (so the OS can open app:// links).
 * Safe to call multiple times; each call on Windows re-registers the client.
 */
export function registerAppProtocolClient() {
  if (process.platform === "win32") {
    const result = app.setAsDefaultProtocolClient(APP_PROTOCOL_NAME);
    if (result) {
      console.log("[app-protocol] registered as default protocol client: app://");
    } else {
      console.warn("[app-protocol] failed to register as default protocol client");
    }
    return result;
  }
  return false;
}

/**
 * Register a custom Electron protocol handler for app:// so that BrowserWindow
 * can load local HTML / assets packaged inside the asar.
 *
 * Registered before app.whenReady() so the scheme is available immediately.
 */
export function registerAppFileProtocol() {
  if (app.isReady()) {
    registerAppFileProtocolNow();
  } else {
    app.whenReady().then(registerAppFileProtocolNow);
  }
}

function registerAppFileProtocolNow() {
  if (process.type === "browser") {
    protocol.registerFileProtocol(APP_PROTOCOL_NAME, (request, callback) => {
      try {
        const rawPath = request.url.replace(/^app:\/\//, "");
        const filePath = resolveAppProtocolPath(rawPath);
        if (!fs.existsSync(filePath)) {
          const fallback = path.join(getLocalDistRoot(), "index.html");
          if (fs.existsSync(fallback)) {
            callback({ path: fallback });
          } else {
            callback({ error: -6 });
          }
          return;
        }
        callback({ path: filePath });
      } catch (err) {
        console.error("[app-protocol] protocol handler error:", err);
        callback({ error: -2 });
      }
    });
    console.log("[app-protocol] registered file protocol handler for app://");
  }
}

/**
 * Build the local app:// URL for the bundled index.html.
 */
export function buildLocalAppUrl(pathname = "/index.html") {
  const normalized = pathname.replace(/^\/+/, "");
  return `${APP_PROTOCOL_NAME}://local/${normalized}`;
}

/**
 * Check if a given URL string is an app:// protocol URL.
 */
export function isAppProtocolUrl(url) {
  return String(url || "").startsWith(`${APP_PROTOCOL_NAME}://`);
}
