export const FALLBACK_AI_MODEL_CATALOG = {
  "qwen3-asr-flash-filetrans": {
    model_key: "qwen3-asr-flash-filetrans",
    display_name: "Bottle 2.0",
    provider: "dashscope",
    capabilities: ["asr"],
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
  "stepaudio-2.5-asr": {
    model_key: "stepaudio-2.5-asr",
    display_name: "StepAudio 2.5 ASR",
    provider: "stepfun",
    capabilities: ["asr"],
    subtitle: "英文素材默认识别路径，使用 StepAudio 2.5 云端识别。",
    runtime_kind: "cloud_api",
    runtime_label: "Cloud API",
    prepare_mode: "none",
    cache_scope: "cloud",
    supports_upload: true,
    supports_preview: false,
    supports_transcribe_api: true,
    note: "默认识别英文，适合英语学习字幕。",
  },
};

export function buildAiModelCatalogMap(models = []) {
  const next = { ...FALLBACK_AI_MODEL_CATALOG };
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

export function getAiModelCatalogItem(modelKey, catalogMap = {}) {
  const normalizedModelKey = String(modelKey || "").trim();
  return catalogMap[normalizedModelKey] || FALLBACK_AI_MODEL_CATALOG[normalizedModelKey] || null;
}

export function getCapabilityModels(catalogMap = {}, capability = "") {
  const normalizedCapability = String(capability || "").trim().toLowerCase();
  return Object.values(catalogMap || {}).filter((item) =>
    Array.isArray(item?.capabilities) && item.capabilities.map((value) => String(value || "").trim().toLowerCase()).includes(normalizedCapability),
  );
}

export function isAiModelPreparing(modelState) {
  const status = String(modelState?.status || "").trim().toLowerCase();
  return Boolean(modelState?.preparing) || ["loading", "preparing", "downloading"].includes(status);
}

export function isAiModelReady(modelState) {
  const status = String(modelState?.status || "").trim().toLowerCase();
  if (Boolean(modelState?.cached) || ["ready", "cached"].includes(status)) return true;
  return Boolean(modelState) && modelState.downloadRequired === false && !isAiModelPreparing(modelState) && status !== "error";
}

export function buildUploadModelOptions(catalogMap = {}) {
  return getCapabilityModels(catalogMap, "asr")
    .filter((item) => item?.supports_upload)
    .map((item) => ({
      key: String(item.model_key || "").trim(),
      title: String(item.display_name || item.model_key || "").trim(),
      subtitle: String(item.subtitle || "").trim(),
      mode: "fast",
      note: String(item.note || "").trim(),
    }))
    .filter((item) => item.key);
}
