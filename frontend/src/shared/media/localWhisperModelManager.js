import { getLocalAsrPreviewState, saveLocalAsrPreviewState } from "./localAsrPreviewStore";

const DEFAULT_ASSET_BASE_URL = "/api/local-whisper-browser-assets";
const BROWSER_CACHE_PREFIX = "english-trainer-local-whisper-assets";
const FALLBACK_SPECS = {
  "local-whisper-base-en": {
    model_key: "local-whisper-base-en",
    cache_version: "onnx-whisper-base-en-timestamped-20260318-v1",
    model_path: "/api/local-whisper-browser-assets/local-whisper-base-en",
    allowed_files: [
      "added_tokens.json",
      "config.json",
      "generation_config.json",
      "merges.txt",
      "preprocessor_config.json",
      "special_tokens_map.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "vocab.json",
      "onnx/encoder_model_quantized.onnx",
      "onnx/decoder_model_merged_quantized.onnx",
    ],
  },
  "local-whisper-small-en": {
    model_key: "local-whisper-small-en",
    cache_version: "onnx-whisper-small-en-timestamped-20260318-v1",
    model_path: "/api/local-whisper-browser-assets/local-whisper-small-en",
    allowed_files: [
      "added_tokens.json",
      "config.json",
      "generation_config.json",
      "merges.txt",
      "preprocessor_config.json",
      "special_tokens_map.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "vocab.json",
      "onnx/encoder_model_quantized.onnx",
      "onnx/decoder_model_merged_quantized.onnx",
    ],
  },
};

function normalizeModelId(modelId) {
  return String(modelId || "").trim();
}

function normalizeAssetBaseUrl(assetBaseUrl) {
  return String(assetBaseUrl || DEFAULT_ASSET_BASE_URL).trim().replace(/\/+$/, "") || DEFAULT_ASSET_BASE_URL;
}

function buildAssetUrl(modelPath, fileName) {
  return `${String(modelPath || "").replace(/\/+$/, "")}/${String(fileName || "").replace(/^\/+/, "")}`;
}

function browserCacheName(modelId, cacheVersion) {
  return `${BROWSER_CACHE_PREFIX}:${normalizeModelId(modelId)}:${String(cacheVersion || "unknown").trim() || "unknown"}`;
}

async function fetchWhisperAssetStatus(assetBaseUrl) {
  const normalizedBaseUrl = normalizeAssetBaseUrl(assetBaseUrl);
  const response = await fetch(`${normalizedBaseUrl}/status`, { method: "GET", cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Whisper 资产状态读取失败: ${response.status}`);
  }
  const payload = await response.json();
  const modelMap = Object.fromEntries((Array.isArray(payload?.models) ? payload.models : []).map((item) => [String(item?.model_key || "").trim(), item]));
  return {
    assetBaseUrl: normalizedBaseUrl,
    modelMap,
  };
}

async function getManifest(modelId, assetBaseUrl = DEFAULT_ASSET_BASE_URL) {
  const normalizedModelId = normalizeModelId(modelId);
  try {
    const payload = await fetchWhisperAssetStatus(assetBaseUrl);
    const item = payload.modelMap[normalizedModelId];
    if (!item) {
      throw new Error(`Whisper 模型未配置: ${normalizedModelId}`);
    }
    return {
      model_key: normalizedModelId,
      cache_version: String(item?.cache_version || ""),
      model_path: String(item?.model_path || `${payload.assetBaseUrl}/${normalizedModelId}`),
      allowed_files: Array.isArray(item?.allowed_files) ? item.allowed_files.map((entry) => String(entry || "").trim()).filter(Boolean) : [],
      asset_base_url: payload.assetBaseUrl,
    };
  } catch (_) {
    const fallback = FALLBACK_SPECS[normalizedModelId];
    if (!fallback) {
      throw _;
    }
    return {
      ...fallback,
      asset_base_url: normalizeAssetBaseUrl(assetBaseUrl),
    };
  }
}

export async function getLocalWhisperWorkerConfig(modelId, assetBaseUrl = DEFAULT_ASSET_BASE_URL) {
  const manifest = await getManifest(modelId, assetBaseUrl);
  return {
    modelPath: manifest.model_path,
    cacheName: browserCacheName(modelId, manifest.cache_version),
    cacheVersion: manifest.cache_version,
    allowedFiles: manifest.allowed_files,
  };
}

export async function verifyLocalWhisperModel(modelId, assetBaseUrl = DEFAULT_ASSET_BASE_URL) {
  const manifest = await getManifest(modelId, assetBaseUrl);
  const cacheName = browserCacheName(modelId, manifest.cache_version);
  const cache = await caches.open(cacheName);
  const missingFiles = [];
  for (const fileName of manifest.allowed_files) {
    const response = await cache.match(buildAssetUrl(manifest.model_path, fileName));
    if (!response || !response.ok) {
      missingFiles.push(fileName);
    }
  }
  const ready = missingFiles.length === 0;
  const record = (await getLocalAsrPreviewState(normalizeModelId(modelId))) || {};
  await saveLocalAsrPreviewState(normalizeModelId(modelId), {
    status: ready ? "ready" : "idle",
    runtime: "wasm",
    browser_supported: true,
    webgpu_supported: Boolean(record.webgpu_supported),
    last_error: "",
    user_agent: String(typeof navigator !== "undefined" ? navigator.userAgent || "" : ""),
    storage_mode: "browser-persistent-cache",
    cache_version: manifest.cache_version,
    asset_base_url: manifest.model_path,
    asset_manifest: manifest,
    verification_status: ready ? "ready" : "missing",
    directory_binding_enabled: false,
    directory_name: "",
    directory_handle: null,
    last_verified_at: Date.now(),
    storage_summary: "浏览器持久缓存",
  });
  return {
    ready,
    status: ready ? (String(record.status || "") === "ready" ? "cached" : "ready") : "idle",
    runtime: "wasm",
    error: "",
    message: ready ? "Whisper 模型已缓存到浏览器持久缓存" : "Whisper 模型尚未下载完成",
    missingFiles,
    storageMode: "browser-persistent-cache",
    storageSummary: "浏览器持久缓存",
    directoryName: "",
    directoryBound: false,
    cacheVersion: manifest.cache_version,
    assetManifest: manifest,
  };
}

export async function removeLocalWhisperModel(modelId, assetBaseUrl = DEFAULT_ASSET_BASE_URL) {
  const manifest = await getManifest(modelId, assetBaseUrl);
  await caches.delete(browserCacheName(modelId, manifest.cache_version));
  const keys = await caches.keys();
  await Promise.all(keys.filter((name) => name.startsWith(`${BROWSER_CACHE_PREFIX}:${normalizeModelId(modelId)}:`)).map((name) => caches.delete(name)));
  await saveLocalAsrPreviewState(normalizeModelId(modelId), {
    status: "idle",
    runtime: "",
    browser_supported: true,
    webgpu_supported: false,
    last_error: "",
    user_agent: String(typeof navigator !== "undefined" ? navigator.userAgent || "" : ""),
    storage_mode: "browser-persistent-cache",
    cache_version: manifest.cache_version,
    asset_base_url: manifest.model_path,
    asset_manifest: manifest,
    verification_status: "missing",
    directory_binding_enabled: false,
    directory_name: "",
    directory_handle: null,
    last_verified_at: Date.now(),
    storage_summary: "浏览器持久缓存",
  });
  return verifyLocalWhisperModel(modelId, assetBaseUrl);
}
