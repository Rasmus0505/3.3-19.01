export const ASR_MODEL_KEYS = {
  qwen: "qwen3-asr-flash-filetrans",
};

export const LLM_MODEL_KEYS = {
  deepseekThinking: "deepseek-v3.2",
  deepseekFast: "deepseek-v3.2-fast",
};

export const FALLBACK_ASR_MODEL_CATALOG = {
  [ASR_MODEL_KEYS.qwen]: {
    model_key: ASR_MODEL_KEYS.qwen,
    display_name: "Bottle 2.0",
    subtitle: "网页端默认路径，上传后即可开始生成。",
    runtime_kind: "cloud_api",
    runtime_label: "Cloud API",
    prepare_mode: "none",
    cache_scope: "cloud",
    supports_upload: true,
    supports_preview: false,
    supports_transcribe_api: true,
    note: "Bottle 2.0 通过 DashScope 云端能力完成识别。",
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
