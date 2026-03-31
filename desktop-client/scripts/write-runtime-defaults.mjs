import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const desktopRoot = path.resolve(path.dirname(__filename), "..");
const outputPath = path.resolve(desktopRoot, ".cache", "runtime-defaults.json");
const configuredCloudAppUrl = String(process.env.DESKTOP_CLOUD_APP_URL || "").trim();
const configuredCloudApiBaseUrl = String(process.env.DESKTOP_CLOUD_API_BASE_URL || "").trim();
const normalizedCloudApiBaseUrl = configuredCloudApiBaseUrl.replace(/\/+$/, "");
const releaseChannel = (() => {
  const value = String(process.env.DESKTOP_RELEASE_CHANNEL || "stable").trim().toLowerCase();
  return value === "preview" ? "preview" : "stable";
})();
const defaultMetadataPath = normalizedCloudApiBaseUrl ? `${normalizedCloudApiBaseUrl}/desktop/client/channels/${releaseChannel}.json` : "";
const defaultEntryPath = normalizedCloudApiBaseUrl
  ? `${normalizedCloudApiBaseUrl}/download/desktop${releaseChannel === "preview" ? "?channel=preview" : ""}`
  : "";

const payload = {
  schemaVersion: 1,
  cloud: {
    appBaseUrl: configuredCloudAppUrl,
    apiBaseUrl: configuredCloudApiBaseUrl,
  },
  clientUpdate: {
    channel: releaseChannel,
    metadataUrl:
      String(process.env.DESKTOP_CLIENT_UPDATE_METADATA_URL || "").trim() ||
      defaultMetadataPath,
    entryUrl:
      String(process.env.DESKTOP_CLIENT_UPDATE_ENTRY_URL || process.env.DESKTOP_CLIENT_ENTRY_URL || "").trim() ||
      defaultEntryPath,
    checkOnLaunch: !["0", "false", "no", "off"].includes(String(process.env.DESKTOP_CLIENT_UPDATE_CHECK_ON_LAUNCH || "true").trim().toLowerCase()),
  },
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
