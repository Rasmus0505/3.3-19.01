import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const desktopRoot = path.resolve(scriptsDir, "..");
const outputPath = path.join(desktopRoot, ".cache", "runtime-defaults.json");

function trimText(value) {
  return String(value ?? "").trim();
}

function normalizeHttpUrl(value, label) {
  const text = trimText(value);
  if (!text) return "";
  let url;
  try {
    url = new URL(text);
  } catch (error) {
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

const configuredAppBaseUrl = trimText(process.env.DESKTOP_CLOUD_APP_URL || process.env.DESKTOP_APP_URL || process.env.DESKTOP_WEB_BASE_URL);
const configuredApiBaseUrl = trimText(process.env.DESKTOP_CLOUD_API_BASE_URL || process.env.DESKTOP_API_BASE_URL);
const appBaseUrl = normalizeHttpUrl(configuredAppBaseUrl || inferAppBaseUrl(configuredApiBaseUrl), "DESKTOP_CLOUD_APP_URL");
const apiBaseUrl = normalizeHttpUrl(configuredApiBaseUrl || appBaseUrl, "DESKTOP_CLOUD_API_BASE_URL");

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
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`wrote packaged runtime defaults: ${path.relative(desktopRoot, outputPath)}`);
