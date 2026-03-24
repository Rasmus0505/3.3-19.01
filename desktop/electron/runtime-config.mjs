import fs from "node:fs";
import path from "node:path";

export const DESKTOP_RUNTIME_CONFIG_VERSION = 1;
export const DESKTOP_RUNTIME_CONFIG_FILE_NAME = "desktop-runtime.json";

function trimText(value) {
  return String(value ?? "").trim();
}

function normalizeDirectoryPath(value, fallbackPath) {
  const candidate = trimText(value) || trimText(fallbackPath);
  return path.resolve(candidate);
}

function normalizeHttpUrl(value) {
  const text = trimText(value);
  if (!text) return "";
  const url = new URL(text);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Desktop runtime URL must use http or https: ${text}`);
  }
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function inferApiBaseUrl(appBaseUrl) {
  const normalized = normalizeHttpUrl(appBaseUrl);
  if (!normalized) return "";
  return normalized;
}

function inferAppBaseUrl(apiBaseUrl) {
  const normalized = normalizeHttpUrl(apiBaseUrl);
  if (!normalized) return "";
  const url = new URL(normalized);
  return url.origin;
}

function inferClientUpdateMetadataUrl(appBaseUrl) {
  const normalized = normalizeHttpUrl(appBaseUrl);
  if (!normalized) return "";
  return new URL("/desktop/client/latest.json", normalized).toString().replace(/\/+$/, "");
}

function inferClientUpdateEntryUrl(appBaseUrl) {
  const normalized = normalizeHttpUrl(appBaseUrl);
  if (!normalized) return "";
  return new URL("/download/desktop", normalized).toString().replace(/\/+$/, "");
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

function normalizeStandaloneMode(value, fallbackValue = false) {
  return normalizeBoolean(value, fallbackValue);
}

function readJsonFile(configPath) {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = fs.readFileSync(configPath, "utf8");
  if (!trimText(raw)) {
    return {};
  }
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function buildDefaultConfig({ userDataDir, cacheDir, logDir, tempDir, env = process.env, defaultConfigPath = "" }) {
  const packagedDefaults = trimText(defaultConfigPath) ? readJsonFile(defaultConfigPath) : {};
  const packagedCloud = packagedDefaults?.cloud && typeof packagedDefaults.cloud === "object" ? packagedDefaults.cloud : {};
  const packagedLocal = packagedDefaults?.local && typeof packagedDefaults.local === "object" ? packagedDefaults.local : {};
  const packagedClientUpdate =
    packagedDefaults?.clientUpdate && typeof packagedDefaults.clientUpdate === "object" ? packagedDefaults.clientUpdate : {};
  const packagedAppBaseUrl = trimText(packagedCloud.appBaseUrl);
  const packagedApiBaseUrl = trimText(packagedCloud.apiBaseUrl);
  const defaultAppBaseUrl = trimText(env.DESKTOP_CLOUD_APP_URL || env.DESKTOP_APP_URL || env.DESKTOP_WEB_BASE_URL || packagedAppBaseUrl);
  const defaultApiBaseUrl = trimText(env.DESKTOP_CLOUD_API_BASE_URL || env.DESKTOP_API_BASE_URL || packagedApiBaseUrl || inferApiBaseUrl(defaultAppBaseUrl));
  const resolvedDefaultAppBaseUrl = normalizeHttpUrl(defaultAppBaseUrl || inferAppBaseUrl(defaultApiBaseUrl));
  const resolvedDefaultApiBaseUrl = normalizeHttpUrl(defaultApiBaseUrl || inferApiBaseUrl(defaultAppBaseUrl));
  const defaultClientUpdateMetadataUrl = trimText(
    env.DESKTOP_CLIENT_UPDATE_METADATA_URL ||
      env.DESKTOP_CLIENT_UPDATE_MANIFEST_URL ||
      packagedClientUpdate.metadataUrl ||
      packagedCloud.clientUpdateManifestUrl ||
      inferClientUpdateMetadataUrl(resolvedDefaultAppBaseUrl),
  );
  const defaultClientUpdateEntryUrl = trimText(
    env.DESKTOP_CLIENT_UPDATE_ENTRY_URL ||
      env.DESKTOP_CLIENT_UPDATE_DOWNLOAD_URL ||
      packagedClientUpdate.entryUrl ||
      packagedCloud.clientUpdateDownloadUrl ||
      inferClientUpdateEntryUrl(resolvedDefaultAppBaseUrl) ||
      resolvedDefaultAppBaseUrl,
  );
  const localUserDataDir = normalizeDirectoryPath(userDataDir, userDataDir);
  const defaultStandaloneMode = normalizeStandaloneMode(
    env.DESKTOP_STANDALONE_MODE,
    packagedDefaults?.standaloneMode ?? false,
  );
  return {
    schemaVersion: DESKTOP_RUNTIME_CONFIG_VERSION,
    cloud: {
      appBaseUrl: resolvedDefaultAppBaseUrl,
      apiBaseUrl: resolvedDefaultApiBaseUrl,
    },
    local: {
      userDataDir: localUserDataDir,
      modelDir: normalizeDirectoryPath(
        env.DESKTOP_MODEL_DIR,
        packagedLocal?.preinstalledModelDir || path.join(localUserDataDir, "models", "faster-distil-small.en"),
      ),
      cacheDir: normalizeDirectoryPath(env.DESKTOP_CACHE_DIR, cacheDir),
      logDir: normalizeDirectoryPath(env.DESKTOP_LOG_DIR, logDir),
      tempDir: normalizeDirectoryPath(env.DESKTOP_TEMP_DIR, tempDir),
    },
    clientUpdate: {
      metadataUrl: normalizeHttpUrl(defaultClientUpdateMetadataUrl),
      entryUrl: normalizeHttpUrl(defaultClientUpdateEntryUrl),
      checkOnLaunch: normalizeBoolean(env.DESKTOP_CLIENT_UPDATE_CHECK_ON_LAUNCH, packagedClientUpdate.checkOnLaunch ?? true),
    },
    standaloneMode: defaultStandaloneMode,
  };
}

function mergeConfig(defaultConfig, storedConfig) {
  const storedCloud = storedConfig?.cloud && typeof storedConfig.cloud === "object" ? storedConfig.cloud : {};
  const storedLocal = storedConfig?.local && typeof storedConfig.local === "object" ? storedConfig.local : {};
  const storedClientUpdate = storedConfig?.clientUpdate && typeof storedConfig.clientUpdate === "object" ? storedConfig.clientUpdate : {};
  const appBaseUrl = normalizeHttpUrl(storedCloud.appBaseUrl || defaultConfig.cloud.appBaseUrl || inferAppBaseUrl(storedCloud.apiBaseUrl || defaultConfig.cloud.apiBaseUrl));
  const apiBaseUrl = normalizeHttpUrl(storedCloud.apiBaseUrl || defaultConfig.cloud.apiBaseUrl || inferApiBaseUrl(appBaseUrl));
  const metadataUrl = normalizeHttpUrl(
    storedClientUpdate.metadataUrl ||
      storedCloud.clientUpdateManifestUrl ||
      defaultConfig.clientUpdate?.metadataUrl ||
      inferClientUpdateMetadataUrl(appBaseUrl),
  );
  const entryUrl = normalizeHttpUrl(
    storedClientUpdate.entryUrl ||
      storedCloud.clientUpdateDownloadUrl ||
      defaultConfig.clientUpdate?.entryUrl ||
      inferClientUpdateEntryUrl(appBaseUrl) ||
      appBaseUrl,
  );
  const standaloneMode =
    storedConfig.standaloneMode !== undefined
      ? normalizeStandaloneMode(storedConfig.standaloneMode)
      : normalizeStandaloneMode(defaultConfig.standaloneMode, false);
  return {
    schemaVersion: DESKTOP_RUNTIME_CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    cloud: {
      appBaseUrl,
      apiBaseUrl,
    },
    local: {
      userDataDir: normalizeDirectoryPath(storedLocal.userDataDir, defaultConfig.local.userDataDir),
      modelDir: normalizeDirectoryPath(storedLocal.modelDir, defaultConfig.local.modelDir),
      cacheDir: normalizeDirectoryPath(storedLocal.cacheDir, defaultConfig.local.cacheDir),
      logDir: normalizeDirectoryPath(storedLocal.logDir, defaultConfig.local.logDir),
      tempDir: normalizeDirectoryPath(storedLocal.tempDir, defaultConfig.local.tempDir),
    },
    clientUpdate: {
      metadataUrl,
      entryUrl,
      checkOnLaunch: normalizeBoolean(storedClientUpdate.checkOnLaunch, defaultConfig.clientUpdate?.checkOnLaunch ?? true),
    },
    standaloneMode,
  };
}

export function resolveDesktopRuntimeConfig({
  configPath,
  userDataDir,
  cacheDir,
  logDir,
  tempDir,
  env = process.env,
  defaultConfigPath = "",
}) {
  const defaults = buildDefaultConfig({
    configPath,
    userDataDir,
    cacheDir,
    logDir,
    tempDir,
    env,
    defaultConfigPath,
  });
  const storedConfig = readJsonFile(configPath);
  const resolvedConfig = mergeConfig(defaults, storedConfig);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(resolvedConfig, null, 2)}\n`, "utf8");
  return resolvedConfig;
}

export function validateDesktopRuntimeConfig(config, configPath) {
  const appBaseUrl = trimText(config?.cloud?.appBaseUrl);
  const apiBaseUrl = trimText(config?.cloud?.apiBaseUrl);
  if (appBaseUrl && apiBaseUrl) {
    return;
  }
  throw new Error(
    [
      "Desktop cloud target is not configured.",
      `Edit ${configPath} and set cloud.appBaseUrl / cloud.apiBaseUrl,`,
      "or start once with DESKTOP_CLOUD_APP_URL and DESKTOP_CLOUD_API_BASE_URL.",
    ].join(" "),
  );
}
