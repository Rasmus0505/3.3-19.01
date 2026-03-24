import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const desktopRoot = path.resolve(scriptsDir, "..");
const outputPath = path.join(desktopRoot, ".cache", "runtime-defaults.json");
const DEFAULT_CLIENT_UPDATE_MANIFEST_PATH = "/desktop-client-version.json";

function trimText(value) {
  return String(value ?? "").trim();
}

function normalizeHttpUrl(value, label) {
  const text = trimText(value);
  if (!text) return "";
  let url;
  try {
    url = new URL(text);
  } catch (_) {
    throw new Error(`${label} is not a valid URL: ${text}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use http or https: ${text}`);
  }
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function inferAppBaseUrl(apiBaseUrl) {
  const normalized = normalizeHttpUrl(apiBaseUrl, "DESKTOP_CLOUD_API_BASE_URL");
  if (!normalized) return "";
  const parsed = new URL(normalized);
  return parsed.origin;
}

function deriveClientUpdateManifestUrl(appBaseUrl) {
  const explicitValue = trimText(process.env.DESKTOP_CLIENT_UPDATE_MANIFEST_URL || process.env.DESKTOP_CLIENT_UPDATE_METADATA_URL);
  if (explicitValue) {
    return normalizeHttpUrl(explicitValue, "DESKTOP_CLIENT_UPDATE_MANIFEST_URL");
  }
  return new URL(
    DEFAULT_CLIENT_UPDATE_MANIFEST_PATH,
    appBaseUrl.endsWith("/") ? appBaseUrl : `${appBaseUrl}/`,
  ).toString();
}

function deriveClientUpdateDownloadUrl(appBaseUrl) {
  const explicitValue = trimText(process.env.DESKTOP_CLIENT_UPDATE_DOWNLOAD_URL || process.env.DESKTOP_CLIENT_UPDATE_ENTRY_URL);
  return normalizeHttpUrl(explicitValue || appBaseUrl, "DESKTOP_CLIENT_UPDATE_DOWNLOAD_URL");
}

function normalizeBoolean(value, fallbackValue = true) {
  if (typeof value === "boolean") {
    return value;
  }
  const text = trimText(value).toLowerCase();
  if (!text) {
    return Boolean(fallbackValue);
  }
  if (["1", "true", "yes", "on"].includes(text)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(text)) {
    return false;
  }
  return Boolean(fallbackValue);
}

const configuredAppBaseUrl = trimText(process.env.DESKTOP_CLOUD_APP_URL || process.env.DESKTOP_APP_URL || process.env.DESKTOP_WEB_BASE_URL);
const configuredApiBaseUrl = trimText(process.env.DESKTOP_CLOUD_API_BASE_URL || process.env.DESKTOP_API_BASE_URL);
const appBaseUrl = normalizeHttpUrl(configuredAppBaseUrl || inferAppBaseUrl(configuredApiBaseUrl), "DESKTOP_CLOUD_APP_URL");
const apiBaseUrl = normalizeHttpUrl(configuredApiBaseUrl || appBaseUrl, "DESKTOP_CLOUD_API_BASE_URL");
const clientUpdateManifestUrl = deriveClientUpdateManifestUrl(appBaseUrl);
const clientUpdateDownloadUrl = deriveClientUpdateDownloadUrl(appBaseUrl);
const clientUpdateCheckOnLaunch = normalizeBoolean(process.env.DESKTOP_CLIENT_UPDATE_CHECK_ON_LAUNCH, true);

// The preinstalled model shipped inside the installer at resources/preinstalled-models/faster-distil-small.en.
// This path is baked in at package time and read back at runtime by runtime-config.mjs
// as a fallback when DESKTOP_MODEL_DIR is not configured.
const bundledModelSourceDir = path.resolve(desktopRoot, "..", "asr-test", "models", "faster-distil-small.en");
const bundledModelExists = fs.existsSync(bundledModelSourceDir) && fs.readdirSync(bundledModelSourceDir).length > 0;
const preinstalledModelDir = bundledModelExists ? bundledModelSourceDir : "";

if (!appBaseUrl || !apiBaseUrl) {
  throw new Error(
    "package:win requires DESKTOP_CLOUD_APP_URL and/or DESKTOP_CLOUD_API_BASE_URL so the installed app can open the cloud login page without asking end users for server settings.",
  );
}

const payload = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  cloud: {
    appBaseUrl,
    apiBaseUrl,
    clientUpdateManifestUrl,
    clientUpdateDownloadUrl,
  },
  clientUpdate: {
    metadataUrl: clientUpdateManifestUrl,
    entryUrl: clientUpdateDownloadUrl,
    checkOnLaunch: clientUpdateCheckOnLaunch,
  },
  local: {
    preinstalledModelDir,
  },
  standaloneMode: true,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`wrote packaged runtime defaults: ${path.relative(desktopRoot, outputPath)}`);
