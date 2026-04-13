import { getAsrModelCatalogItem } from "../../shared/lib/asrModels";
import { formatMoneyYuanPerMinute } from "../../shared/lib/money";
import {
  BOTTLE2_CLOUD_DESKTOP_RECOMMEND_DURATION_SECONDS,
  BOTTLE2_CLOUD_DESKTOP_RECOMMEND_SIZE_BYTES,
  DEFAULT_FAST_UPLOAD_MODEL,
  ESTIMATED_MT_TOKENS_PER_MINUTE,
  FASTER_WHISPER_MODEL,
  LOCAL_MODEL_OPTIONS,
  QWEN_MODEL,
  UPLOAD_MODEL_OPTIONS,
} from "./uploadConstants";

export function formatBinarySize(bytes) {
  const safeBytes = Math.max(0, Number(bytes || 0));
  if (!safeBytes) return "0 B";
  if (safeBytes >= 1024 * 1024 * 1024) {
    return `${(safeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (safeBytes >= 1024 * 1024) {
    return `${Math.max(1, Math.round(safeBytes / (1024 * 1024)))} MB`;
  }
  if (safeBytes >= 1024) {
    return `${Math.max(1, Math.round(safeBytes / 1024))} KB`;
  }
  return `${safeBytes} B`;
}

export function shouldRecommendDesktopForBottle2Cloud(fileLike, durationSeconds) {
  const sizeBytes = Math.max(0, Number(fileLike?.size || 0));
  const safeDurationSeconds = Math.max(0, Number(durationSeconds || 0));
  return sizeBytes >= BOTTLE2_CLOUD_DESKTOP_RECOMMEND_SIZE_BYTES || safeDurationSeconds >= BOTTLE2_CLOUD_DESKTOP_RECOMMEND_DURATION_SECONDS;
}

export function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

export function getRateByModel(rates, modelName) {
  return rates.find((item) => item.model_name === modelName && item.is_active);
}

export function isServerRuntimeModel(rate) {
  return Boolean(rate) && String(rate.runtime_kind || "cloud") !== "local" && String(rate.billing_unit || "minute") === "minute";
}

export function getRatePricePerMinuteYuan(rate) {
  const directYuan = Number(rate?.price_per_minute_yuan ?? 0);
  if (Number.isFinite(directYuan) && directYuan > 0) {
    return directYuan;
  }
  const fallbackCents = Number(rate?.price_per_minute_cents ?? rate?.points_per_minute ?? 0);
  if (!Number.isFinite(fallbackCents) || fallbackCents <= 0) {
    return 0;
  }
  return fallbackCents / 100;
}

export function getRatePricePer1kTokensYuan(rate) {
  const tokenCents = Number(rate?.points_per_1k_tokens ?? 0);
  if (!Number.isFinite(tokenCents) || tokenCents <= 0) {
    return 0;
  }
  return tokenCents / 100;
}

export function calculateChargeCentsBySeconds(seconds, pricePerMinuteYuan) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(pricePerMinuteYuan) || pricePerMinuteYuan <= 0) return 0;
  const roundedSeconds = Math.ceil(seconds);
  const yuanPerMinuteScaled = Math.round(pricePerMinuteYuan * 10000);
  return Math.ceil((roundedSeconds * yuanPerMinuteScaled) / 6000);
}

export function calculateChargeCentsByTokens(totalTokens, centsPer1kTokens) {
  if (!Number.isFinite(totalTokens) || totalTokens <= 0 || !Number.isFinite(centsPer1kTokens) || centsPer1kTokens <= 0) return 0;
  return Math.ceil((Math.ceil(totalTokens) * Math.ceil(centsPer1kTokens)) / 1000);
}

export function estimateMtTokensByDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(1, Math.ceil((Math.ceil(seconds) * ESTIMATED_MT_TOKENS_PER_MINUTE) / 60));
}

export function getLocalModelMeta(modelKey) {
  return LOCAL_MODEL_OPTIONS.find((item) => item.key === modelKey) || LOCAL_MODEL_OPTIONS[0];
}

export function getDefaultBalancedModelKey(configuredModel = "") {
  const normalizedConfiguredModel = String(configuredModel || "").trim();
  const configuredMeta = LOCAL_MODEL_OPTIONS.find((item) => item.key === normalizedConfiguredModel);
  if (configuredMeta?.uploadEnabled) return configuredMeta.key;
  return LOCAL_MODEL_OPTIONS.find((item) => item.uploadEnabled)?.key || LOCAL_MODEL_OPTIONS[0].key;
}

export function getUploadModelMeta(modelKey = "") {
  return UPLOAD_MODEL_OPTIONS.find((item) => item.key === modelKey) || UPLOAD_MODEL_OPTIONS[0];
}

export function getDefaultFastUploadModelKey(configuredModel = "") {
  const normalizedConfiguredModel = String(configuredModel || "").trim();
  if (normalizedConfiguredModel === FASTER_WHISPER_MODEL || normalizedConfiguredModel === QWEN_MODEL) {
    return normalizedConfiguredModel;
  }
  return DEFAULT_FAST_UPLOAD_MODEL;
}

export function getDefaultUploadModelKey(configuredModel = "") {
  const normalizedConfiguredModel = String(configuredModel || "").trim();
  if (normalizedConfiguredModel === FASTER_WHISPER_MODEL || normalizedConfiguredModel === QWEN_MODEL) {
    return normalizedConfiguredModel;
  }
  return QWEN_MODEL;
}

export function isLocalBalancedModelUploadEnabled(modelKey) {
  return Boolean(getLocalModelMeta(modelKey)?.uploadEnabled);
}

export function getLocalBalancedModelUnavailableReason(modelKey) {
  return String(getLocalModelMeta(modelKey)?.unavailableReason || "").trim();
}

export function detectLocalAsrSupport() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "当前环境暂不支持这个模型", browserName: "", webgpuSupported: false };
  }
  const userAgent = String(navigator.userAgent || "");
  const isMobile = Boolean(navigator.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const isEdge = /\bEdg\//.test(userAgent);
  const isChrome = /\bChrome\//.test(userAgent) && !/\bEdg\//.test(userAgent) && !/\bOPR\//.test(userAgent);
  const browserName = isEdge ? "Edge" : isChrome ? "Chrome" : "";
  const webgpuSupported = typeof navigator.gpu !== "undefined";
  if (isMobile) {
    return { supported: false, reason: "请改用桌面端 Chrome 或 Edge", browserName, webgpuSupported };
  }
  if (!browserName) {
    return { supported: false, reason: "请改用桌面端 Chrome 或 Edge", browserName: "", webgpuSupported };
  }
  return { supported: true, reason: "", browserName, webgpuSupported };
}

export function simplifyLongAudioWarning(text) {
  return String(text || "")
    .replace(/WASM 模式会明显较慢，更建议改用高速模式。?/g, "当前素材较长，生成会慢一些。")
    .trim();
}

export function getUploadModelPriceLabel(item, rates) {
  const pricingModelKey = item.mode === "balanced" ? DEFAULT_FAST_UPLOAD_MODEL : item.key;
  const rate = getRateByModel(rates, pricingModelKey) || getRateByModel(rates, item.key);
  const pricePerMinuteYuan = getRatePricePerMinuteYuan(rate);
  return pricePerMinuteYuan > 0 ? formatMoneyYuanPerMinute(pricePerMinuteYuan) : "未设置价格";
}

export function mergeCatalogIntoUploadModelMeta(modelKey, catalogMap) {
  const fallback = getUploadModelMeta(modelKey);
  const catalogItem = getAsrModelCatalogItem(modelKey, catalogMap);
  if (!catalogItem) return fallback;
  return {
    ...fallback,
    title: String(catalogItem.display_name || fallback.title || ""),
    subtitle: String(catalogItem.subtitle || fallback.subtitle || ""),
    note: String(catalogItem.note || fallback.note || ""),
    sourceModelId: String(catalogItem.source_model_id || fallback.sourceModelId || ""),
    deployPath: String(catalogItem.deploy_path || fallback.deployPath || ""),
    runtimeKind: String(catalogItem.runtime_kind || ""),
    runtimeLabel: String(catalogItem.runtime_label || ""),
    prepareMode: String(catalogItem.prepare_mode || ""),
  };
}

export function getUploadCardActionMeta({
  item,
  uploadActionBusy,
  localTranscribing,
  fasterModelReady,
  fasterModelPreparing,
  fasterModelBusy,
}) {
  if (item.key === FASTER_WHISPER_MODEL) {
    return {
      label: fasterModelReady ? "已就绪" : fasterModelPreparing || fasterModelBusy ? "准备中" : "准备模型",
      disabled: fasterModelReady || uploadActionBusy || fasterModelBusy || fasterModelPreparing || localTranscribing,
    };
  }
  return {
    label: "无需准备",
    disabled: true,
  };
}

export function formatDurationLabel(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
}

export function formatSubtitleTimestamp(ms) {
  const safeSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatSubtitleTimeRange(beginMs, endMs) {
  const safeBeginMs = Math.max(0, Number(beginMs || 0));
  const safeEndMs = Math.max(safeBeginMs, Number(endMs || 0));
  if (safeBeginMs <= 0 && safeEndMs <= 0) {
    return "";
  }
  return `${formatSubtitleTimestamp(safeBeginMs)} - ${formatSubtitleTimestamp(safeEndMs)}`;
}

export function formatDateTimeLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatLatencyLabel(latencyMs) {
  if (!Number.isFinite(Number(latencyMs))) {
    return "";
  }
  return `${Math.max(0, Math.round(Number(latencyMs)))} ms`;
}

export function getDiagnosticBadgeClassName(tone = "neutral") {
  if (tone === "success") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  if (tone === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  if (tone === "danger") return "border-rose-500/30 bg-rose-500/10 text-rose-700";
  return "border-slate-500/20 bg-slate-500/10 text-slate-700";
}
