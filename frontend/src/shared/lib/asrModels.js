import {
  FALLBACK_AI_MODEL_CATALOG,
  buildAiModelCatalogMap,
  getAiModelCatalogItem,
  getCapabilityModels,
  isAiModelPreparing,
  isAiModelReady,
} from "./aiModels";

export const ASR_MODEL_KEYS = {
  qwen: "qwen3-asr-flash-filetrans",
  stepfun: "stepaudio-2.5-asr",
};

export const LLM_MODEL_KEYS = {
  deepseekThinking: "deepseek-v3.2",
  deepseekFast: "deepseek-v3.2",
};

export const FALLBACK_ASR_MODEL_CATALOG = Object.fromEntries(
  Object.entries(FALLBACK_AI_MODEL_CATALOG).filter(([, item]) =>
    Array.isArray(item?.capabilities) && item.capabilities.includes("asr"),
  ),
);

export function buildAsrModelCatalogMap(models = []) {
  const fullMap = buildAiModelCatalogMap(models);
  const filteredEntries = getCapabilityModels(fullMap, "asr").map((item) => [String(item.model_key || "").trim(), item]);
  return {
    ...FALLBACK_ASR_MODEL_CATALOG,
    ...Object.fromEntries(filteredEntries),
  };
}

export function getAsrModelCatalogItem(modelKey, catalogMap = {}) {
  const item = getAiModelCatalogItem(modelKey, catalogMap);
  if (item && Array.isArray(item.capabilities) && item.capabilities.includes("asr")) {
    return item;
  }
  return FALLBACK_ASR_MODEL_CATALOG[String(modelKey || "").trim()] || null;
}

export function isAsrModelPreparing(modelState) {
  return isAiModelPreparing(modelState);
}

export function isAsrModelReady(modelState) {
  return isAiModelReady(modelState);
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
