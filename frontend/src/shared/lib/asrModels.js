export const ASR_MODEL_KEYS = {
  sensevoiceServer: "sensevoice-small",
  sensevoiceBrowser: "local-sensevoice-small",
  fasterWhisper: "faster-whisper-medium",
  qwen: "qwen3-asr-flash-filetrans",
};

export const FALLBACK_ASR_MODEL_CATALOG = {
  [ASR_MODEL_KEYS.sensevoiceServer]: {
    model_key: ASR_MODEL_KEYS.sensevoiceServer,
    display_name: "SenseVoice Small",
    subtitle: "先准备模型，再开始生成。",
    runtime_kind: "server_local",
    runtime_label: "Server Runtime",
    prepare_mode: "auto_on_demand",
    cache_scope: "server",
    supports_upload: true,
    supports_preview: false,
    supports_transcribe_api: true,
    note: "模型准备完成后可直接开始生成；按当前 SenseVoice 配置运行。",
  },
  [ASR_MODEL_KEYS.sensevoiceBrowser]: {
    model_key: ASR_MODEL_KEYS.sensevoiceBrowser,
    display_name: "SenseVoice Small",
    subtitle: "先准备模型，再开始生成。",
    runtime_kind: "browser_local",
    runtime_label: "Browser WASM",
    prepare_mode: "auto_on_demand",
    cache_scope: "browser",
    supports_upload: true,
    supports_preview: true,
    supports_transcribe_api: false,
    note: "模型准备完成后可直接开始生成；模型缓存在当前浏览器。",
  },
  [ASR_MODEL_KEYS.fasterWhisper]: {
    model_key: ASR_MODEL_KEYS.fasterWhisper,
    display_name: "Faster Whisper Medium",
    subtitle: "先准备模型，再开始生成。",
    runtime_kind: "server_cached",
    runtime_label: "Server Cached Model",
    prepare_mode: "auto_on_demand",
    cache_scope: "server",
    supports_upload: true,
    supports_preview: false,
    supports_transcribe_api: true,
    source_model_id: "pengzhendong/faster-whisper-medium",
    deploy_path: "/data/modelscope_whisper/faster-whisper-medium",
    note: "模型准备完成后可直接开始生成；模型缓存在服务端。",
  },
  [ASR_MODEL_KEYS.qwen]: {
    model_key: ASR_MODEL_KEYS.qwen,
    display_name: "Qwen ASR Flash",
    subtitle: "直接开始生成，无需准备模型。",
    runtime_kind: "cloud_api",
    runtime_label: "Cloud API",
    prepare_mode: "none",
    cache_scope: "cloud",
    supports_upload: true,
    supports_preview: false,
    supports_transcribe_api: true,
    note: "无需准备模型，选中文件后可直接开始。",
  },
};

export function buildAsrModelCatalogMap(models = []) {
  const next = { ...FALLBACK_ASR_MODEL_CATALOG };
  for (const item of Array.isArray(models) ? models : []) {
    const modelKey = String(item?.model_key || "").trim();
    if (!modelKey) continue;
    next[modelKey] = {
      ...(next[modelKey] || {}),
      ...(item || {}),
    };
  }
  return next;
}

export function getAsrModelCatalogItem(modelKey, catalogMap = {}) {
  const normalizedModelKey = String(modelKey || "").trim();
  return catalogMap[normalizedModelKey] || FALLBACK_ASR_MODEL_CATALOG[normalizedModelKey] || null;
}

export function isAsrModelPreparing(modelState) {
  const status = String(modelState?.status || "").trim().toLowerCase();
  return Boolean(modelState?.preparing) || ["loading", "preparing", "downloading"].includes(status);
}

export function isAsrModelReady(modelState) {
  const status = String(modelState?.status || "").trim().toLowerCase();
  if (Boolean(modelState?.cached) || ["ready", "cached"].includes(status)) return true;
  return Boolean(modelState) && modelState.downloadRequired === false && !isAsrModelPreparing(modelState) && status !== "error";
}

export function getAsrModelStatusLabel(modelState, options = {}) {
  const {
    readyLabel = "可用",
    missingLabel = "未准备",
    loadingLabel = "准备中",
    errorLabel = "异常",
    unsupportedLabel = "不可用",
  } = options;
  const status = String(modelState?.status || "").trim().toLowerCase();
  if (status === "unsupported") return unsupportedLabel;
  if (status === "error") return errorLabel;
  if (isAsrModelPreparing(modelState)) return loadingLabel;
  if (isAsrModelReady(modelState)) return readyLabel;
  return missingLabel;
}
