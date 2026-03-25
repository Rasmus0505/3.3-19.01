import fs from "node:fs";
import path from "node:path";


function readJsonFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return {};
    }
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

function ensureParentDir(filePath) {
  const parentDir = path.dirname(filePath);
  fs.mkdirSync(parentDir, { recursive: true });
}

function trimText(value) {
  return String(value ?? "").trim();
}

function toAbsoluteDir(dirPath) {
  return path.resolve(String(dirPath || ""));
}

function deriveAppBaseUrl(apiBaseUrl = "") {
  const normalized = trimText(apiBaseUrl);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function resolveEnvValue(env, key, fallback = "") {
  return trimText(env?.[key] ?? fallback);
}

export function resolveDesktopRuntimeConfig({
  configPath,
  userDataDir,
  cacheDir,
  logDir,
  tempDir,
  defaultConfigPath = "",
  env = process.env,
}) {
  const resolvedConfigPath = path.resolve(String(configPath || ""));
  const storedConfig = readJsonFile(resolvedConfigPath);
  const defaultConfig = readJsonFile(defaultConfigPath ? path.resolve(String(defaultConfigPath)) : "");

  const cloudApiBaseUrl =
    resolveEnvValue(env, "DESKTOP_CLOUD_API_BASE_URL") ||
    trimText(storedConfig?.cloud?.apiBaseUrl) ||
    trimText(defaultConfig?.cloud?.apiBaseUrl);

  const cloudAppBaseUrl =
    resolveEnvValue(env, "DESKTOP_CLOUD_APP_URL") ||
    trimText(storedConfig?.cloud?.appBaseUrl) ||
    trimText(defaultConfig?.cloud?.appBaseUrl) ||
    deriveAppBaseUrl(cloudApiBaseUrl);

  const modelDir =
    resolveEnvValue(env, "DESKTOP_MODEL_DIR") ||
    trimText(storedConfig?.local?.modelDir) ||
    trimText(defaultConfig?.local?.modelDir) ||
    path.join(toAbsoluteDir(userDataDir), "models", "faster-distil-small.en");

  const resolvedConfig = {
    schemaVersion: 1,
    cloud: {
      appBaseUrl: cloudAppBaseUrl,
      apiBaseUrl: cloudApiBaseUrl || deriveAppBaseUrl(cloudAppBaseUrl),
    },
    local: {
      userDataDir: toAbsoluteDir(userDataDir),
      modelDir: toAbsoluteDir(modelDir),
      cacheDir: toAbsoluteDir(trimText(storedConfig?.local?.cacheDir) || cacheDir),
      logDir: toAbsoluteDir(trimText(storedConfig?.local?.logDir) || logDir),
      tempDir: toAbsoluteDir(trimText(storedConfig?.local?.tempDir) || tempDir),
    },
    clientUpdate: {
      metadataUrl:
        resolveEnvValue(env, "DESKTOP_CLIENT_UPDATE_METADATA_URL") ||
        trimText(storedConfig?.clientUpdate?.metadataUrl) ||
        trimText(defaultConfig?.clientUpdate?.metadataUrl) ||
        "",
      entryUrl:
        resolveEnvValue(env, "DESKTOP_CLIENT_UPDATE_ENTRY_URL") ||
        trimText(storedConfig?.clientUpdate?.entryUrl) ||
        trimText(defaultConfig?.clientUpdate?.entryUrl) ||
        "",
      checkOnLaunch: (() => {
        const envValue = resolveEnvValue(env, "DESKTOP_CLIENT_UPDATE_CHECK_ON_LAUNCH");
        if (envValue) {
          return !["0", "false", "no", "off"].includes(envValue.toLowerCase());
        }
        if (typeof storedConfig?.clientUpdate?.checkOnLaunch === "boolean") {
          return storedConfig.clientUpdate.checkOnLaunch;
        }
        if (typeof defaultConfig?.clientUpdate?.checkOnLaunch === "boolean") {
          return defaultConfig.clientUpdate.checkOnLaunch;
        }
        return true;
      })(),
    },
  };

  ensureParentDir(resolvedConfigPath);
  fs.writeFileSync(resolvedConfigPath, JSON.stringify(resolvedConfig, null, 2), "utf8");
  return resolvedConfig;
}
