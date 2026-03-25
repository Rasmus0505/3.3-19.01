import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(__filename), "..");
const outputPath = path.resolve(desktopRoot, ".cache", "runtime-defaults.json");
const configuredCloudAppUrl = String(process.env.DESKTOP_CLOUD_APP_URL || "").trim();
const configuredCloudApiBaseUrl = String(process.env.DESKTOP_CLOUD_API_BASE_URL || "").trim();
const normalizedCloudApiBaseUrl = configuredCloudApiBaseUrl.replace(/\/+$/, "");

const payload = {
  schemaVersion: 1,
  cloud: {
    appBaseUrl: configuredCloudAppUrl,
    apiBaseUrl: configuredCloudApiBaseUrl,
  },
  clientUpdate: {
    metadataUrl:
      String(process.env.DESKTOP_CLIENT_UPDATE_METADATA_URL || "").trim() ||
      (normalizedCloudApiBaseUrl ? `${normalizedCloudApiBaseUrl}/desktop/client/latest.json` : ""),
    entryUrl:
      String(process.env.DESKTOP_CLIENT_UPDATE_ENTRY_URL || "").trim() ||
      (normalizedCloudApiBaseUrl ? `${normalizedCloudApiBaseUrl}/download/desktop` : ""),
    checkOnLaunch: !["0", "false", "no", "off"].includes(String(process.env.DESKTOP_CLIENT_UPDATE_CHECK_ON_LAUNCH || "true").trim().toLowerCase()),
  },
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
