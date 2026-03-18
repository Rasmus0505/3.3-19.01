import { getLocalAsrPreviewState, saveLocalAsrPreviewState } from "./localAsrPreviewStore";

export const LOCAL_ASR_STORAGE_MODE_BROWSER = "browser-persistent-cache";
export const LOCAL_ASR_STORAGE_MODE_DIRECTORY = "bound-local-directory";

const DEFAULT_ASSET_BASE_URL = "/api/local-asr-assets";
const APP_DIRECTORY_NAME = "english-trainer-models";
const DIRECTORY_MANIFEST_FILE = ".local-asr-manifest.json";
const BROWSER_CACHE_PREFIX = "english-trainer-local-asr-assets";
const MATERIALIZED_URLS = new Map();
const FALLBACK_STATUS = {
  model_key: "local-sensevoice-small",
  cache_version: "sensevoice-small-20260318-v1",
  allowed_files: [
    "sherpa-onnx-asr.js",
    "sherpa-onnx-vad.js",
    "sherpa-onnx-wasm-main-vad-asr.js",
    "sherpa-onnx-wasm-main-vad-asr.wasm",
    "sherpa-onnx-wasm-main-vad-asr.data",
  ],
};
const WORKER_REQUIRED_FILES = [
  "sherpa-onnx-asr.js",
  "sherpa-onnx-wasm-main-vad-asr.js",
  "sherpa-onnx-wasm-main-vad-asr.wasm",
  "sherpa-onnx-wasm-main-vad-asr.data",
];

function nowMs() {
  return Date.now();
}

function normalizeModelId(modelId) {
  return String(modelId || "").trim();
}

function normalizeAssetBaseUrl(assetBaseUrl) {
  return String(assetBaseUrl || DEFAULT_ASSET_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_ASSET_BASE_URL;
}

function buildAssetUrl(assetBaseUrl, fileName) {
  return `${normalizeAssetBaseUrl(assetBaseUrl)}/${String(fileName || "").replace(/^\/+/, "")}`;
}

function toErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error || "未知错误");
}

function browserCacheName(modelId, cacheVersion) {
  return `${BROWSER_CACHE_PREFIX}:${normalizeModelId(modelId)}:${String(cacheVersion || "unknown").trim() || "unknown"}`;
}

function normalizeManifest(statusPayload, assetBaseUrl) {
  const normalizedBaseUrl = normalizeAssetBaseUrl(assetBaseUrl);
  const allowedFiles = Array.isArray(statusPayload?.allowed_files) && statusPayload.allowed_files.length ? statusPayload.allowed_files : FALLBACK_STATUS.allowed_files;
  const modelId = normalizeModelId(statusPayload?.model_key || FALLBACK_STATUS.model_key);
  const cacheVersion = String(statusPayload?.cache_version || FALLBACK_STATUS.cache_version).trim() || FALLBACK_STATUS.cache_version;
  return {
    model_key: modelId,
    cache_version: cacheVersion,
    allowed_files: allowedFiles.map((item) => String(item || "").trim()).filter(Boolean),
    asset_base_url: normalizedBaseUrl,
  };
}

async function fetchLocalAsrAssetStatus(assetBaseUrl) {
  const normalizedBaseUrl = normalizeAssetBaseUrl(assetBaseUrl);
  try {
    const response = await fetch(`${normalizedBaseUrl}/status`, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`status request failed: ${response.status}`);
    }
    const payload = await response.json();
    return normalizeManifest(payload, normalizedBaseUrl);
  } catch (_) {
    return normalizeManifest(FALLBACK_STATUS, normalizedBaseUrl);
  }
}

function directoryBindingSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

async function queryHandlePermission(handle, mode = "readwrite") {
  if (!handle || typeof handle.queryPermission !== "function") return "granted";
  return handle.queryPermission({ mode });
}

async function requestHandlePermission(handle, mode = "readwrite") {
  if (!handle || typeof handle.requestPermission !== "function") return "granted";
  return handle.requestPermission({ mode });
}

async function ensureHandlePermission(handle, mode = "readwrite") {
  const current = await queryHandlePermission(handle, mode);
  if (current === "granted") return current;
  return requestHandlePermission(handle, mode);
}

async function getModelRootDirectoryHandle(rootHandle, modelId, create = false) {
  const appDir = await rootHandle.getDirectoryHandle(APP_DIRECTORY_NAME, { create });
  return appDir.getDirectoryHandle(normalizeModelId(modelId), { create });
}

async function writeDirectoryBlob(dirHandle, fileName, blob) {
  const fileHandle = await dirHandle.getFileHandle(String(fileName || "").trim(), { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

async function readDirectoryBlob(dirHandle, fileName) {
  const fileHandle = await dirHandle.getFileHandle(String(fileName || "").trim(), { create: false });
  const file = await fileHandle.getFile();
  return file;
}

async function removeDirectoryEntries(dirHandle) {
  for await (const entry of dirHandle.values()) {
    await dirHandle.removeEntry(entry.name, { recursive: true });
  }
}

async function writeDirectoryManifest(dirHandle, manifest) {
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  await writeDirectoryBlob(dirHandle, DIRECTORY_MANIFEST_FILE, blob);
}

async function readDirectoryManifest(dirHandle) {
  try {
    const blob = await readDirectoryBlob(dirHandle, DIRECTORY_MANIFEST_FILE);
    return JSON.parse(await blob.text());
  } catch (_) {
    return null;
  }
}

async function clearOldBrowserCaches(modelId, keepCacheName = "") {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(`${BROWSER_CACHE_PREFIX}:${normalizeModelId(modelId)}:`) && name !== keepCacheName)
      .map((name) => caches.delete(name)),
  );
}

async function fetchBlobWithProgress(url, onProgress) {
  const response = await fetch(url, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`下载失败: ${response.status}`);
  }
  if (!response.body) {
    const blob = await response.blob();
    onProgress?.(blob.size, blob.size);
    return blob;
  }
  const reader = response.body.getReader();
  const total = Number(response.headers.get("content-length") || 0);
  let loaded = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength || value.length || 0;
      onProgress?.(loaded, total);
    }
  }
  return new Blob(chunks);
}

function toProgressPercent(loaded, total) {
  if (!Number.isFinite(Number(loaded)) || !Number.isFinite(Number(total)) || Number(total) <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((Number(loaded) / Number(total)) * 100)));
}

async function verifyBrowserCache(record, manifest) {
  if (typeof caches === "undefined") {
    return {
      ready: false,
      state: "error",
      error: "当前浏览器不支持 Cache Storage",
      message: "当前浏览器不支持模型缓存",
    };
  }
  const expectedCacheName = browserCacheName(manifest.model_key, manifest.cache_version);
  const cache = await caches.open(expectedCacheName);
  const missingFiles = [];
  for (const fileName of manifest.allowed_files) {
    const response = await cache.match(buildAssetUrl(manifest.asset_base_url, fileName));
    if (!response || !response.ok) {
      missingFiles.push(fileName);
    }
  }
  if (missingFiles.length) {
    return {
      ready: false,
      state: "idle",
      error: "",
      message: "浏览器缓存未就绪，需要下载模型",
      missingFiles,
    };
  }
  return {
    ready: true,
    state: record?.status === "ready" ? "cached" : "ready",
    error: "",
    message: "模型已缓存到浏览器持久缓存",
    missingFiles: [],
  };
}

async function verifyBoundDirectory(record, manifest) {
  if (!record?.directory_handle) {
    return {
      ready: false,
      state: "error",
      error: "已启用目录绑定，但当前没有可用目录",
      message: "请重新选择模型目录",
    };
  }
  const permission = await queryHandlePermission(record.directory_handle, "readwrite");
  if (permission !== "granted") {
    return {
      ready: false,
      state: "error",
      error: "绑定目录权限已失效，请重新授权",
      message: "绑定目录权限已失效",
    };
  }
  let modelDirHandle;
  try {
    modelDirHandle = await getModelRootDirectoryHandle(record.directory_handle, manifest.model_key, false);
  } catch (_) {
    return {
      ready: false,
      state: "idle",
      error: "",
      message: "目录已绑定，尚未下载模型",
    };
  }
  const missingFiles = [];
  for (const fileName of manifest.allowed_files) {
    try {
      await readDirectoryBlob(modelDirHandle, fileName);
    } catch (_) {
      missingFiles.push(fileName);
    }
  }
  const manifestFile = await readDirectoryManifest(modelDirHandle);
  const versionMatch = String(manifestFile?.cache_version || "") === String(manifest.cache_version || "");
  if (!missingFiles.length && versionMatch) {
    return {
      ready: true,
      state: record?.status === "ready" ? "cached" : "ready",
      error: "",
      message: "模型已写入绑定目录",
      missingFiles: [],
    };
  }
  if (!missingFiles.length) {
    return {
      ready: false,
      state: "idle",
      error: "",
      message: "目录中的模型版本已过期，需要重新下载",
      missingFiles: [],
    };
  }
  return {
    ready: false,
    state: "idle",
    error: "",
    message: "目录已绑定，尚未下载完整模型",
    missingFiles,
  };
}

function buildVerificationSummary(storageMode, record) {
  if (storageMode === LOCAL_ASR_STORAGE_MODE_DIRECTORY) {
    return record?.directory_name ? `绑定目录: ${record.directory_name}` : "绑定本地目录";
  }
  return "浏览器持久缓存";
}

function buildVerificationResult(record, manifest, result) {
  const storageMode = String(record?.storage_mode || LOCAL_ASR_STORAGE_MODE_BROWSER);
  return {
    ready: Boolean(result?.ready),
    status: String(result?.state || "idle"),
    runtime: "wasm",
    error: String(result?.error || ""),
    message: String(result?.message || ""),
    missingFiles: Array.isArray(result?.missingFiles) ? result.missingFiles : [],
    storageMode,
    storageSummary: buildVerificationSummary(storageMode, record),
    directoryName: String(record?.directory_name || ""),
    directoryBound: Boolean(record?.directory_binding_enabled && record?.directory_handle),
    cacheVersion: String(manifest?.cache_version || ""),
    assetManifest: manifest,
  };
}

export async function verifyLocalAsrModel(modelId, assetBaseUrl = DEFAULT_ASSET_BASE_URL) {
  const normalizedModelId = normalizeModelId(modelId);
  const manifest = await fetchLocalAsrAssetStatus(assetBaseUrl);
  const record = (await getLocalAsrPreviewState(normalizedModelId)) || { model_id: normalizedModelId, storage_mode: LOCAL_ASR_STORAGE_MODE_BROWSER };
  const storageMode = String(record.storage_mode || LOCAL_ASR_STORAGE_MODE_BROWSER);
  const verification =
    storageMode === LOCAL_ASR_STORAGE_MODE_DIRECTORY ? await verifyBoundDirectory(record, manifest) : await verifyBrowserCache(record, manifest);
  const payload = buildVerificationResult(record, manifest, verification);
  await saveLocalAsrPreviewState(normalizedModelId, {
    status: payload.ready ? "ready" : verification.state === "error" ? "error" : "idle",
    runtime: record.runtime || "wasm",
    browser_supported: true,
    webgpu_supported: Boolean(record.webgpu_supported),
    last_error: payload.error,
    user_agent: String(typeof navigator !== "undefined" ? navigator.userAgent || "" : record.user_agent || ""),
    storage_mode: storageMode,
    cache_version: payload.cacheVersion,
    asset_base_url: manifest.asset_base_url,
    asset_manifest: manifest,
    verification_status: payload.ready ? "ready" : verification.state === "error" ? "invalid" : "missing",
    directory_binding_enabled: Boolean(record.directory_binding_enabled),
    directory_name: payload.directoryName,
    directory_handle: record.directory_handle ?? null,
    last_verified_at: nowMs(),
    storage_summary: payload.storageSummary,
  });
  return payload;
}

async function ensureBrowserCacheReady(modelId, manifest, onProgress) {
  const cacheName = browserCacheName(modelId, manifest.cache_version);
  const cache = await caches.open(cacheName);
  await clearOldBrowserCaches(modelId, cacheName);
  let downloadedCount = 0;
  for (const fileName of manifest.allowed_files) {
    const url = buildAssetUrl(manifest.asset_base_url, fileName);
    const blob = await fetchBlobWithProgress(url, (loaded, total) => {
      const filePercent = toProgressPercent(loaded, total);
      const overall = Math.round((((downloadedCount + (filePercent == null ? 0 : filePercent / 100)) / Math.max(1, manifest.allowed_files.length)) * 100));
      onProgress?.({
        file: fileName,
        progress: filePercent,
        overallProgress: overall,
        statusText: filePercent == null ? `正在下载 ${fileName}` : `正在下载 ${fileName} ${filePercent}%`,
      });
    });
    await cache.put(url, new Response(blob));
    downloadedCount += 1;
    onProgress?.({
      file: fileName,
      progress: 100,
      overallProgress: Math.round((downloadedCount / Math.max(1, manifest.allowed_files.length)) * 100),
      statusText: `已缓存 ${fileName}`,
    });
  }
}

async function ensureBoundDirectoryReady(modelId, record, manifest, onProgress) {
  if (!record?.directory_handle) {
    throw new Error("请先选择模型目录");
  }
  const permission = await ensureHandlePermission(record.directory_handle, "readwrite");
  if (permission !== "granted") {
    throw new Error("模型目录未授权，无法继续使用");
  }
  const modelDir = await getModelRootDirectoryHandle(record.directory_handle, modelId, true);
  let downloadedCount = 0;
  for (const fileName of manifest.allowed_files) {
    const url = buildAssetUrl(manifest.asset_base_url, fileName);
    const blob = await fetchBlobWithProgress(url, (loaded, total) => {
      const filePercent = toProgressPercent(loaded, total);
      const overall = Math.round((((downloadedCount + (filePercent == null ? 0 : filePercent / 100)) / Math.max(1, manifest.allowed_files.length)) * 100));
      onProgress?.({
        file: fileName,
        progress: filePercent,
        overallProgress: overall,
        statusText: filePercent == null ? `正在下载 ${fileName}` : `正在下载 ${fileName} ${filePercent}%`,
      });
    });
    await writeDirectoryBlob(modelDir, fileName, blob);
    downloadedCount += 1;
    onProgress?.({
      file: fileName,
      progress: 100,
      overallProgress: Math.round((downloadedCount / Math.max(1, manifest.allowed_files.length)) * 100),
      statusText: `已写入 ${fileName}`,
    });
  }
  await writeDirectoryManifest(modelDir, manifest);
}

export async function ensureLocalAsrModel(modelId, assetBaseUrl = DEFAULT_ASSET_BASE_URL, options = {}) {
  const normalizedModelId = normalizeModelId(modelId);
  const manifest = await fetchLocalAsrAssetStatus(assetBaseUrl);
  const record = (await getLocalAsrPreviewState(normalizedModelId)) || { model_id: normalizedModelId, storage_mode: LOCAL_ASR_STORAGE_MODE_BROWSER };
  const storageMode = String(record.storage_mode || LOCAL_ASR_STORAGE_MODE_BROWSER);

  if (storageMode === LOCAL_ASR_STORAGE_MODE_BROWSER) {
    await options.requestPersistentStorage?.();
    await ensureBrowserCacheReady(normalizedModelId, manifest, options.onProgress);
  } else {
    await ensureBoundDirectoryReady(normalizedModelId, record, manifest, options.onProgress);
  }

  const summary = buildVerificationSummary(storageMode, record);
  await saveLocalAsrPreviewState(normalizedModelId, {
    status: "ready",
    runtime: "wasm",
    browser_supported: true,
    webgpu_supported: Boolean(options.webgpuSupported),
    last_error: "",
    user_agent: String(typeof navigator !== "undefined" ? navigator.userAgent || "" : ""),
    storage_mode: storageMode,
    cache_version: manifest.cache_version,
    asset_base_url: manifest.asset_base_url,
    asset_manifest: manifest,
    verification_status: "ready",
    directory_binding_enabled: Boolean(record.directory_binding_enabled),
    directory_name: String(record.directory_name || ""),
    directory_handle: record.directory_handle ?? null,
    last_verified_at: nowMs(),
    storage_summary: summary,
  });

  return verifyLocalAsrModel(normalizedModelId, manifest.asset_base_url);
}

async function readBlobFromStorage(modelId, manifest, fileName) {
  const record = await getLocalAsrPreviewState(modelId);
  const storageMode = String(record?.storage_mode || LOCAL_ASR_STORAGE_MODE_BROWSER);
  if (storageMode === LOCAL_ASR_STORAGE_MODE_DIRECTORY) {
    if (!record?.directory_handle) {
      throw new Error("模型目录未绑定");
    }
    const permission = await queryHandlePermission(record.directory_handle, "readwrite");
    if (permission !== "granted") {
      throw new Error("模型目录权限已失效");
    }
    const modelDir = await getModelRootDirectoryHandle(record.directory_handle, modelId, false);
    return readDirectoryBlob(modelDir, fileName);
  }
  if (typeof caches === "undefined") {
    throw new Error("当前浏览器不支持模型缓存");
  }
  const cache = await caches.open(browserCacheName(modelId, manifest.cache_version));
  const response = await cache.match(buildAssetUrl(manifest.asset_base_url, fileName));
  if (!response || !response.ok) {
    throw new Error(`缓存缺少 ${fileName}`);
  }
  return response.blob();
}

export async function getLocalAsrWorkerAssetPayload(modelId, assetBaseUrl = DEFAULT_ASSET_BASE_URL) {
  const verification = await verifyLocalAsrModel(modelId, assetBaseUrl);
  if (!verification.ready) {
    throw new Error(verification.error || verification.message || "请先下载并校验模型");
  }
  const materializedKey = `${normalizeModelId(modelId)}:${verification.storageMode}:${verification.cacheVersion}:${verification.directoryName || "-"}`;
  const existing = MATERIALIZED_URLS.get(normalizeModelId(modelId));
  if (existing && existing.key === materializedKey) {
    return {
      assetUrls: { ...existing.urls },
      storageMode: verification.storageMode,
    };
  }
  if (existing?.urls) {
    Object.values(existing.urls).forEach((value) => {
      if (typeof value === "string" && value.startsWith("blob:")) {
        URL.revokeObjectURL(value);
      }
    });
  }
  const urls = {};
  for (const fileName of WORKER_REQUIRED_FILES) {
    const blob = await readBlobFromStorage(normalizeModelId(modelId), verification.assetManifest, fileName);
    urls[fileName] = URL.createObjectURL(blob);
  }
  MATERIALIZED_URLS.set(normalizeModelId(modelId), {
    key: materializedKey,
    urls,
  });
  return {
    assetUrls: { ...urls },
    storageMode: verification.storageMode,
  };
}

export function releaseLocalAsrWorkerAssetPayload(modelId) {
  const normalizedModelId = normalizeModelId(modelId);
  const existing = MATERIALIZED_URLS.get(normalizedModelId);
  if (!existing?.urls) return;
  Object.values(existing.urls).forEach((value) => {
    if (typeof value === "string" && value.startsWith("blob:")) {
      URL.revokeObjectURL(value);
    }
  });
  MATERIALIZED_URLS.delete(normalizedModelId);
}

export function releaseAllLocalAsrWorkerAssetPayloads() {
  for (const modelId of [...MATERIALIZED_URLS.keys()]) {
    releaseLocalAsrWorkerAssetPayload(modelId);
  }
}

export async function bindLocalAsrModelDirectory(modelId, assetBaseUrl = DEFAULT_ASSET_BASE_URL) {
  if (!directoryBindingSupported()) {
    throw new Error("当前浏览器不支持选择本地目录");
  }
  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  const permission = await ensureHandlePermission(handle, "readwrite");
  if (permission !== "granted") {
    throw new Error("目录未授权，无法绑定");
  }
  const manifest = await fetchLocalAsrAssetStatus(assetBaseUrl);
  await saveLocalAsrPreviewState(normalizeModelId(modelId), {
    status: "idle",
    runtime: "wasm",
    browser_supported: true,
    webgpu_supported: false,
    last_error: "",
    user_agent: String(typeof navigator !== "undefined" ? navigator.userAgent || "" : ""),
    storage_mode: LOCAL_ASR_STORAGE_MODE_DIRECTORY,
    cache_version: manifest.cache_version,
    asset_base_url: manifest.asset_base_url,
    asset_manifest: manifest,
    verification_status: "missing",
    directory_binding_enabled: true,
    directory_name: String(handle?.name || ""),
    directory_handle: handle,
    last_verified_at: 0,
    storage_summary: `绑定目录: ${String(handle?.name || "")}`,
  });
  releaseLocalAsrWorkerAssetPayload(modelId);
  return verifyLocalAsrModel(modelId, manifest.asset_base_url);
}

export async function switchLocalAsrStorageMode(modelId, nextMode, assetBaseUrl = DEFAULT_ASSET_BASE_URL) {
  const normalizedModelId = normalizeModelId(modelId);
  const record = (await getLocalAsrPreviewState(normalizedModelId)) || {};
  const manifest = await fetchLocalAsrAssetStatus(assetBaseUrl);
  const normalizedMode = nextMode === LOCAL_ASR_STORAGE_MODE_DIRECTORY ? LOCAL_ASR_STORAGE_MODE_DIRECTORY : LOCAL_ASR_STORAGE_MODE_BROWSER;
  await saveLocalAsrPreviewState(normalizedModelId, {
    status: "idle",
    runtime: record.runtime || "wasm",
    browser_supported: true,
    webgpu_supported: Boolean(record.webgpu_supported),
    last_error: "",
    user_agent: String(typeof navigator !== "undefined" ? navigator.userAgent || "" : record.user_agent || ""),
    storage_mode: normalizedMode,
    cache_version: manifest.cache_version,
    asset_base_url: manifest.asset_base_url,
    asset_manifest: manifest,
    verification_status: "unknown",
    directory_binding_enabled: normalizedMode === LOCAL_ASR_STORAGE_MODE_DIRECTORY ? Boolean(record.directory_handle) : Boolean(record.directory_binding_enabled),
    directory_name: String(record.directory_name || ""),
    directory_handle: record.directory_handle ?? null,
    last_verified_at: 0,
    storage_summary: normalizedMode === LOCAL_ASR_STORAGE_MODE_DIRECTORY ? buildVerificationSummary(normalizedMode, record) : "浏览器持久缓存",
  });
  releaseLocalAsrWorkerAssetPayload(normalizedModelId);
  return verifyLocalAsrModel(normalizedModelId, manifest.asset_base_url);
}

export async function removeLocalAsrModel(modelId, assetBaseUrl = DEFAULT_ASSET_BASE_URL) {
  const normalizedModelId = normalizeModelId(modelId);
  const manifest = await fetchLocalAsrAssetStatus(assetBaseUrl);
  const record = await getLocalAsrPreviewState(normalizedModelId);
  const storageMode = String(record?.storage_mode || LOCAL_ASR_STORAGE_MODE_BROWSER);
  if (storageMode === LOCAL_ASR_STORAGE_MODE_DIRECTORY) {
    if (!record?.directory_handle) {
      throw new Error("当前没有可清理的绑定目录");
    }
    const permission = await ensureHandlePermission(record.directory_handle, "readwrite");
    if (permission !== "granted") {
      throw new Error("模型目录未授权，无法清理");
    }
    const modelDir = await getModelRootDirectoryHandle(record.directory_handle, normalizedModelId, true);
    await removeDirectoryEntries(modelDir);
  } else if (typeof caches !== "undefined") {
    await caches.delete(browserCacheName(normalizedModelId, manifest.cache_version));
    await clearOldBrowserCaches(normalizedModelId);
  }
  releaseLocalAsrWorkerAssetPayload(normalizedModelId);
  await saveLocalAsrPreviewState(normalizedModelId, {
    status: "idle",
    runtime: record?.runtime || "",
    browser_supported: true,
    webgpu_supported: Boolean(record?.webgpu_supported),
    last_error: "",
    user_agent: String(typeof navigator !== "undefined" ? navigator.userAgent || "" : record?.user_agent || ""),
    storage_mode: storageMode,
    cache_version: manifest.cache_version,
    asset_base_url: manifest.asset_base_url,
    asset_manifest: manifest,
    verification_status: storageMode === LOCAL_ASR_STORAGE_MODE_DIRECTORY ? "missing" : "unknown",
    directory_binding_enabled: Boolean(record?.directory_binding_enabled),
    directory_name: String(record?.directory_name || ""),
    directory_handle: record?.directory_handle ?? null,
    last_verified_at: nowMs(),
    storage_summary: buildVerificationSummary(storageMode, record),
  });
  return verifyLocalAsrModel(normalizedModelId, manifest.asset_base_url);
}

export function getLocalAsrStorageModeLabel(storageMode) {
  return storageMode === LOCAL_ASR_STORAGE_MODE_DIRECTORY ? "绑定本地目录" : "浏览器持久缓存";
}

export function localAsrDirectoryBindingSupported() {
  return directoryBindingSupported();
}
