export const ASR_MODEL_KEYS = {
  sensevoiceServer: "sensevoice-small",
  sensevoiceBrowser: "local-sensevoice-small",
  fasterWhisper: "faster-whisper-medium",
  qwen: "qwen3-asr-flash-filetrans",
};

export const FALLBACK_ASR_MODEL_CATALOG = {
  [ASR_MODEL_KEYS.fasterWhisper]: {
    model_key: ASR_MODEL_KEYS.fasterWhisper,
    display_name: "Bottle 1.0",
    subtitle: "More accurate subtitles, slower than Bottle 2.0.",
    runtime_kind: "server_cached",
    runtime_label: "Server Cached",
    prepare_mode: "auto_on_demand",
    cache_scope: "server",
    supports_upload: true,
    supports_preview: false,
    supports_transcribe_api: true,
    source_model_id: "Systran/faster-distil-whisper-small.en",
    deploy_path: "D:\\3.3-19.01\\asr-test\\models\\faster-distil-small.en",
    note: "Fixed local bundle path.",
  },
  [ASR_MODEL_KEYS.qwen]: {
    model_key: ASR_MODEL_KEYS.qwen,
    display_name: "Bottle 2.0",
    subtitle: "Start immediately with cloud transcription.",
    runtime_kind: "cloud_api",
    runtime_label: "Cloud API",
    prepare_mode: "none",
    cache_scope: "cloud",
    supports_upload: true,
    supports_preview: false,
    supports_transcribe_api: true,
    note: "No local model preparation required.",
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
    readyLabel = "Available",
    missingLabel = "Not ready",
    loadingLabel = "Preparing",
    errorLabel = "Error",
    unsupportedLabel = "Unavailable",
  } = options;
  const status = String(modelState?.status || "").trim().toLowerCase();
  if (status === "unsupported") return unsupportedLabel;
  if (status === "error") return errorLabel;
  if (isAsrModelPreparing(modelState)) return loadingLabel;
  if (isAsrModelReady(modelState)) return readyLabel;
  return missingLabel;
}
