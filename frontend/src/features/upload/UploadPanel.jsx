import { CheckCircle2, FileJson, Loader2, RefreshCcw, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "../../lib/utils";
import { api, createApiClient, parseResponse, toErrorText, uploadWithProgress } from "../../shared/api/client";
import { ASR_MODEL_KEYS, buildAsrModelCatalogMap, getAsrModelCatalogItem, isAsrModelPreparing, isAsrModelReady } from "../../shared/lib/asrModels";
import { formatMoneyCents, formatMoneyYuan, formatMoneyYuanPerMinute } from "../../shared/lib/money";
import { extractMediaCoverPreview, getLessonMediaPreview, readMediaDurationSeconds, requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import {
  clearActiveGenerationTask,
  clearUploadPanelSuccessSnapshot,
  getActiveGenerationTask,
  getUploadPanelSuccessSnapshot,
  saveActiveGenerationTask,
  saveUploadPanelSuccessSnapshot,
} from "../../shared/media/localTaskStore.js";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, MediaCover, Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui";
import { useAppStore } from "../../store";
import { ASR_STRATEGY_CLOUD, resolveAsrStrategy, mapCloudAsrFailureToMessage } from "./asrStrategy";
import { getUploadModelTone, getUploadRestoreTone, getUploadStageTone, getUploadTaskTone, getUploadToneStyles } from "./uploadStatusTheme";

const QWEN_MODEL = "qwen3-asr-flash-filetrans";
const FASTER_WHISPER_MODEL = "faster-whisper-medium";
const MT_PRICE_MODEL = "qwen-mt-flash";
const ESTIMATED_MT_TOKENS_PER_MINUTE = 320;
const UPLOAD_PROGRESS_PERSIST_INTERVAL_MS = 800;
const ASR_MODELS_API_BASE = "/api/asr-models";
const DESKTOP_CLIENT_OFFLINE_MESSAGE = "离线模式下无法生成课程，请联网后重试";
const DESKTOP_CLIENT_INSUFFICIENT_BALANCE_MESSAGE = "余额不足，请充值";
const DEFAULT_ASR_MODEL_CATALOG_MAP = buildAsrModelCatalogMap();
const DEFAULT_FAST_UPLOAD_MODEL = QWEN_MODEL;
const FAST_RUNTIME_TRACK_CLOUD = "cloud";
const FAST_RUNTIME_TRACK_DESKTOP_LOCAL = "desktop_local";
const DESKTOP_LOCAL_TRANSCRIBING_PHASE = "desktop_local_transcribing";
const DESKTOP_LINK_IMPORTING_PHASE = "desktop_link_importing";
const DESKTOP_LOCAL_GENERATING_PHASE = "desktop_local_generating";
const DESKTOP_UPLOAD_SOURCE_MODE_FILE = "file";
const DESKTOP_UPLOAD_SOURCE_MODE_LINK = "link";
const FILE_PICKER_ACTION_SELECT = "select";
const FILE_PICKER_ACTION_DESKTOP_LOCAL_GENERATE = "desktop_local_generate";

function hasDesktopFileReadBridge() {
  return typeof window !== "undefined" && typeof window.desktopRuntime?.readLocalMediaFile === "function";
}

function hasDesktopRuntimeBridge() {
  return typeof window !== "undefined" && typeof window.desktopRuntime?.requestLocalHelper === "function";
}

function hasDesktopModelUpdateBridge() {
  return desktopModelUpdateSupported();
}

function decodeBase64Bytes(base64Text) {
  const safeText = String(base64Text || "").trim();
  if (!safeText || typeof atob !== "function") {
    return new Uint8Array();
  }
  const decoded = atob(safeText);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

async function requestDesktopLocalHelper(pathname, responseType = "json", options = {}) {
  if (!hasDesktopRuntimeBridge()) {
    throw new Error("Desktop local helper is unavailable");
  }
  const response = await window.desktopRuntime.requestLocalHelper({
    path: String(pathname || ""),
    method: String(options.method || "GET").toUpperCase(),
    responseType,
    body: options.body,
  });
  if (!response?.ok) {
    const detail =
      String(response?.data?.message || "").trim() ||
      String(response?.data?.error_message || "").trim() ||
      String(response?.data?.detail || "").trim() ||
      String(response?.status || "").trim();
    throw new Error(detail || "Desktop local helper request failed");
  }
  return response;
}

async function transcribeDesktopLocalAsr(modelKey, sourceFile) {
  if (!hasDesktopRuntimeBridge()) {
    throw new Error("Desktop runtime bridge is unavailable");
  }
  const response = await window.desktopRuntime.transcribeLocalMedia({
    modelKey: String(modelKey || FASTER_WHISPER_MODEL),
    file: sourceFile,
  });
  if (!response?.ok) {
    const message = String(response?.message || response?.error_message || response?.detail || "Desktop local ASR failed").trim();
    throw new Error(message || "Desktop local ASR failed");
  }
  return {
    asrPayload: response?.asr_payload || response?.asrPayload || response || {},
    sourceFilename: String(sourceFile?.name || ""),
    sourceDurationMs: Math.max(1, Number(response?.source_duration_ms || response?.sourceDurationMs || 0)),
  };
}

async function requestWalletBalance(accessToken = "") {
  const response = await api("/api/wallet/balance", { method: "GET" }, accessToken);
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(toErrorText(payload, "读取余额失败"));
  }
  return {
    ok: payload?.ok !== false,
    balanceAmountCents: Math.max(0, Number(payload?.balance_amount_cents ?? payload?.balance ?? 0)),
    currency: String(payload?.currency || "CNY").trim() || "CNY",
    updatedAt: String(payload?.updated_at || "").trim(),
  };
}

async function reportLocalGenerationUsage(accessToken = "", payload = {}) {
  const response = await api(
    "/api/wallet/consume",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    },
    accessToken,
  );
  const data = await parseResponse(response);
  if (!response.ok) {
    throw new Error(toErrorText(data, "上报本地生成用量失败"));
  }
  return data;
}

function getDefaultFasterWhisperRuntimeTrack() {
  if (hasDesktopRuntimeBridge()) {
    return FAST_RUNTIME_TRACK_DESKTOP_LOCAL;
  }
  if (hasBrowserLocalRuntimeBridge() && !isMobileUploadViewport()) {
    return FAST_RUNTIME_TRACK_BROWSER_LOCAL;
  }
  return FAST_RUNTIME_TRACK_CLOUD;
}

function normalizeServerStatus(payload = {}) {
  return {
    reachable: payload?.reachable !== false,
    lastCheckedAt: String(payload?.lastCheckedAt || ""),
    latencyMs: payload?.latencyMs == null ? null : Math.max(0, Number(payload.latencyMs || 0)),
    statusCode: Math.max(0, Number(payload?.statusCode || payload?.status_code || 0)),
    endpoint: String(payload?.endpoint || ""),
    reason: String(payload?.reason || ""),
  };
}

function getOfflineBannerText(serverStatus) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "当前处于离线模式，部分功能不可用";
  }
  if (serverStatus?.reachable === false) {
    return sanitizeUserFacingText(serverStatus?.reason || "云端服务当前不可达，请稍后重试");
  }
  return "";
}

function getOfflineHintText(isOnline, selectedAsrModel) {
  if (isOnline) return null;
  if (selectedAsrModel === FASTER_WHISPER_MODEL) {
    return "离线模式，仅支持本地生成";
  }
  return "离线模式，云端生成不可用，请联网后重试";
}

function getDesktopSelectionErrorMessage(selection = {}) {
  return sanitizeUserFacingText(
    selection?.error?.message ||
      selection?.error ||
      selection?.message ||
      "",
  );
}

function getCloudFailureMessage(message = "", serverStatus = {}) {
  const normalizedServerStatus = normalizeServerStatus(serverStatus);
  const reason = sanitizeUserFacingText(normalizedServerStatus.reason || "");
  if (normalizedServerStatus.reachable === false && reason) {
    return reason;
  }
  return mapCloudAsrFailureToMessage(message, normalizedServerStatus);
}

const LOCAL_MODEL_OPTIONS = [
  {
    key: ASR_MODEL_KEYS.fasterWhisper,
    workerModelId: ASR_MODEL_KEYS.fasterWhisper,
    title: "Bottle 1.0",
    subtitle: "先准备模型，再开始生成。",
    uploadEnabled: true,
    sizeEstimateMb: { wasm: 180 },
  },
];
const UPLOAD_MODEL_OPTIONS = [
  {
    key: FASTER_WHISPER_MODEL,
    title: "Bottle 1.0",
    subtitle: "识别字幕更精准/耗时加长",
    mode: "fast",
    note: "固定本地目录。",
    sourceModelId: "Systran/faster-distil-whisper-small.en",
    deployPath: "D:\\3.3-19.01\\asr-test\\models\\faster-distil-small.en",
  },
  {
    key: QWEN_MODEL,
    title: "Bottle 2.0",
    subtitle: "直接开始生成",
    mode: "fast",
    note: "无需准备模型，选中文件后可直接开始。",
  },
];
const DISPLAY_STAGES = [
  { key: "convert_audio", label: "抽音频" },
  { key: "asr_transcribe", label: "识别字幕" },
  { key: "build_lesson", label: "生成课程结构" },
  { key: "translate_zh", label: "翻译" },
  { key: "write_lesson", label: "保存完成" },
];
function getStageLabelByKey(stageKey) {
  if (!stageKey) return "";
  const stage = DISPLAY_STAGES.find((item) => item.key === stageKey);
  return stage ? stage.label : stageKey;
}
const STAGE_PROGRESS_BOUNDS = {
  convert_audio: { start: 0, end: 15 },
  asr_transcribe: { start: 15, end: 45 },
  build_lesson: { start: 45, end: 60 },
  translate_zh: { start: 60, end: 85 },
  write_lesson: { start: 85, end: 100 },
};
const SERVER_PREPARABLE_MODELS = new Set([FASTER_WHISPER_MODEL]);
const ACTIVE_SERVER_TASK_STATUSES = new Set(["pending", "running", "pausing", "terminating"]);
const STOPPABLE_SERVER_TASK_STATUSES = new Set(["pending", "running"]);
const RECOVERABLE_SERVER_TASK_STATUSES = new Set(["paused", "terminated"]);
const RESTORE_BANNER_MODES = {
  NONE: "none",
  VERIFYING: "verifying",
  STALE: "stale",
  INTERRUPTED: "interrupted",
};
const BOTTLE_LESSON_SCHEMA_VERSION = "1";
const BOTTLE_LESSON_FILE_SUFFIX = ".bottle-lesson.json";
const LOCAL_LESSON_UPDATE_EVENT = "bottle-local-lessons-updated";
const POLL_RETRY_LIMIT = 3;
const POLL_RETRY_DELAY_MS = 1500;

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function getRateByModel(rates, modelName) {
  return rates.find((item) => item.model_name === modelName && item.is_active);
}

function isServerRuntimeModel(rate) {
  return Boolean(rate) && String(rate.runtime_kind || "cloud") !== "local" && String(rate.billing_unit || "minute") === "minute";
}

function getRatePricePerMinuteYuan(rate) {
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

function getRatePricePer1kTokensYuan(rate) {
  const tokenCents = Number(rate?.points_per_1k_tokens ?? 0);
  if (!Number.isFinite(tokenCents) || tokenCents <= 0) {
    return 0;
  }
  return tokenCents / 100;
}

function calculateChargeCentsBySeconds(seconds, pricePerMinuteYuan) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(pricePerMinuteYuan) || pricePerMinuteYuan <= 0) return 0;
  const roundedSeconds = Math.ceil(seconds);
  const yuanPerMinuteScaled = Math.round(pricePerMinuteYuan * 10000);
  return Math.ceil((roundedSeconds * yuanPerMinuteScaled) / 6000);
}

function calculateChargeCentsByTokens(totalTokens, centsPer1kTokens) {
  if (!Number.isFinite(totalTokens) || totalTokens <= 0 || !Number.isFinite(centsPer1kTokens) || centsPer1kTokens <= 0) return 0;
  return Math.ceil((Math.ceil(totalTokens) * Math.ceil(centsPer1kTokens)) / 1000);
}

function estimateMtTokensByDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.max(1, Math.ceil((Math.ceil(seconds) * ESTIMATED_MT_TOKENS_PER_MINUTE) / 60));
}

function getLocalModelMeta(modelKey) {
  return LOCAL_MODEL_OPTIONS.find((item) => item.key === modelKey) || LOCAL_MODEL_OPTIONS[0];
}

function getDefaultBalancedModelKey(configuredModel = "") {
  const normalizedConfiguredModel = String(configuredModel || "").trim();
  const configuredMeta = LOCAL_MODEL_OPTIONS.find((item) => item.key === normalizedConfiguredModel);
  if (configuredMeta?.uploadEnabled) return configuredMeta.key;
  return LOCAL_MODEL_OPTIONS.find((item) => item.uploadEnabled)?.key || LOCAL_MODEL_OPTIONS[0].key;
}

function getUploadModelMeta(modelKey = "") {
  return UPLOAD_MODEL_OPTIONS.find((item) => item.key === modelKey) || UPLOAD_MODEL_OPTIONS[0];
}

function getDefaultFastUploadModelKey(configuredModel = "") {
  const normalizedConfiguredModel = String(configuredModel || "").trim();
  if (normalizedConfiguredModel === FASTER_WHISPER_MODEL || normalizedConfiguredModel === QWEN_MODEL) {
    return normalizedConfiguredModel;
  }
  return DEFAULT_FAST_UPLOAD_MODEL;
}

function getDefaultUploadModelKey(configuredModel = "") {
  const normalizedConfiguredModel = String(configuredModel || "").trim();
  if (normalizedConfiguredModel === FASTER_WHISPER_MODEL || normalizedConfiguredModel === QWEN_MODEL) {
    return normalizedConfiguredModel;
  }
  return QWEN_MODEL;
}

function isLocalBalancedModelUploadEnabled(modelKey) {
  return Boolean(getLocalModelMeta(modelKey)?.uploadEnabled);
}

function getLocalBalancedModelUnavailableReason(modelKey) {
  return String(getLocalModelMeta(modelKey)?.unavailableReason || "").trim();
}

function detectLocalAsrSupport() {
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

function simplifyLongAudioWarning(text) {
  return String(text || "")
    .replace(/WASM 模式会明显较慢，更建议改用高速模式。?/g, "当前素材较长，生成会慢一些。")
    .trim();
}

function getUploadModelPriceLabel(item, rates) {
  const pricingModelKey = item.mode === "balanced" ? DEFAULT_FAST_UPLOAD_MODEL : item.key;
  const rate = getRateByModel(rates, pricingModelKey) || getRateByModel(rates, item.key);
  const pricePerMinuteYuan = getRatePricePerMinuteYuan(rate);
  return pricePerMinuteYuan > 0 ? `ASR ${formatMoneyYuanPerMinute(pricePerMinuteYuan)}` : "ASR 未设置价格";
}

function mergeCatalogIntoUploadModelMeta(modelKey, catalogMap) {
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

function getUploadCardActionMeta({
  item,
  uploadActionBusy,
  localTranscribing,
  localAsrSupport,
  localWorkerReady,
  localCardBusy,
  localCardDownloaded,
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

function formatDurationLabel(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainSeconds).padStart(2, "0")}`;
}

function formatSubtitleTimestamp(ms) {
  const safeSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSubtitleTimeRange(beginMs, endMs) {
  const safeBeginMs = Math.max(0, Number(beginMs || 0));
  const safeEndMs = Math.max(safeBeginMs, Number(endMs || 0));
  if (safeBeginMs <= 0 && safeEndMs <= 0) {
    return "";
  }
  return `${formatSubtitleTimestamp(safeBeginMs)} - ${formatSubtitleTimestamp(safeEndMs)}`;
}

function formatDateTimeLabel(value) {
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

function hasLocalLessonImportBridge() {
  return (
    typeof window !== "undefined" &&
    typeof window.localDb?.getCourses === "function" &&
    typeof window.localDb?.saveCourse === "function" &&
    typeof window.localDb?.saveSentences === "function" &&
    typeof window.localDb?.saveProgress === "function"
  );
}

function dispatchLocalLessonUpdateEvent() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(LOCAL_LESSON_UPDATE_EVENT));
}

function createImportedLessonId() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

function normalizeImportedLessonPayload(payload = {}) {
  const schemaVersion = String(payload?.schema_version || "").trim();
  if (!schemaVersion) {
    throw new Error("导入文件缺少 schema_version");
  }
  if (schemaVersion !== BOTTLE_LESSON_SCHEMA_VERSION) {
    throw new Error(`暂不支持 schema_version=${schemaVersion} 的课程文件`);
  }
  const lesson = payload?.lesson;
  if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) {
    throw new Error("导入文件缺少 lesson");
  }
  const lessonId = String(lesson.id ?? "").trim();
  if (!lessonId) {
    throw new Error("导入文件中的 lesson.id 不能为空");
  }
  return {
    schemaVersion,
    exportedAt: String(payload?.exported_at || ""),
    appVersion: String(payload?.app_version || ""),
    lesson,
    sentences: Array.isArray(payload?.sentences) ? payload.sentences : [],
    progress: payload?.progress && typeof payload.progress === "object" && !Array.isArray(payload.progress) ? payload.progress : null,
  };
}

function buildImportedCourseRecord(lesson = {}, targetLessonId, meta = {}) {
  const metadata = lesson?.metadata && typeof lesson.metadata === "object" && !Array.isArray(lesson.metadata) ? lesson.metadata : {};
  const importedAt = String(meta.importedAt || new Date().toISOString());
  const sourceDurationMs = Math.max(
    0,
    Number(lesson?.source_duration_ms ?? lesson?.duration_ms ?? metadata?.source_duration_ms ?? 0) || 0,
  );

  return {
    id: String(targetLessonId),
    title: String(lesson?.title || metadata?.title || "导入课程"),
    source_filename: String(lesson?.source_filename || metadata?.source_filename || `${targetLessonId}${BOTTLE_LESSON_FILE_SUFFIX}`),
    duration_ms: sourceDurationMs,
    runtime_kind: String(lesson?.runtime_kind || metadata?.runtime_kind || "local_import"),
    asr_model: String(lesson?.asr_model || metadata?.asr_model || ""),
    created_at: String(lesson?.created_at || importedAt),
    updated_at: String(lesson?.updated_at || importedAt),
    synced_at: null,
    version: Math.max(1, Number(lesson?.version || 1) || 1),
    is_local_only: true,
    metadata: {
      ...metadata,
      source_duration_ms: sourceDurationMs,
      media_storage: String(lesson?.media_storage || metadata?.media_storage || "local_import"),
      import_source: "bottle_lesson_json",
      import_schema_version: String(meta.schemaVersion || ""),
      original_lesson_id: String(lesson?.id ?? ""),
      exported_at: String(meta.exportedAt || ""),
      exported_app_version: String(meta.appVersion || ""),
    },
  };
}

function buildImportedSentenceRecord(courseId, sentence = {}, index = 0) {
  const timestamp = new Date().toISOString();
  return {
    id: `${courseId}:${index}`,
    sentence_index: Math.max(0, Number(sentence?.order_index ?? sentence?.sentence_index ?? index) || index),
    english_text: String(sentence?.text_en || sentence?.english_text || sentence?.text || ""),
    chinese_text: String(sentence?.text_zh || sentence?.chinese_text || sentence?.translation || ""),
    start_ms: Math.max(0, Number(sentence?.begin_ms ?? sentence?.start_ms ?? 0) || 0),
    end_ms: Math.max(0, Number(sentence?.end_ms ?? sentence?.end_time ?? 0) || 0),
    words: Array.isArray(sentence?.tokens) ? sentence.tokens : Array.isArray(sentence?.words) ? sentence.words : [],
    variant_key: String(sentence?.variant_key || ""),
    created_at: String(sentence?.created_at || timestamp),
    updated_at: String(sentence?.updated_at || timestamp),
  };
}

function buildImportedProgressRecord(courseId, progress = null) {
  if (!progress) {
    return null;
  }
  return {
    id: String(progress?.id || `${courseId}:local-desktop-user`),
    user_id: String(progress?.user_id || "local-desktop-user"),
    current_index: Math.max(0, Number(progress?.current_index ?? progress?.current_sentence_index ?? 0) || 0),
    completed_indices: Array.isArray(progress?.completed_indices)
      ? progress.completed_indices
      : Array.isArray(progress?.completed_sentence_indexes)
        ? progress.completed_sentence_indexes
        : [],
    started_at: progress?.started_at || null,
    updated_at: String(progress?.updated_at || new Date().toISOString()),
    synced_at: progress?.synced_at || null,
    version: Math.max(1, Number(progress?.version || 1) || 1),
  };
}

function formatLatencyLabel(latencyMs) {
  if (!Number.isFinite(Number(latencyMs))) {
    return "";
  }
  return `${Math.max(0, Math.round(Number(latencyMs)))} ms`;
}

function getDiagnosticBadgeClassName(tone = "neutral") {
  if (tone === "success") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  if (tone === "warning") return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  if (tone === "danger") return "border-rose-500/30 bg-rose-500/10 text-rose-700";
  return "border-slate-500/20 bg-slate-500/10 text-slate-700";
}

function getDesktopServerDiagnostic(serverStatus = {}, runtimeInfo = null) {
  const normalizedServerStatus = normalizeServerStatus(runtimeInfo?.serverStatus || serverStatus || {});
  const detailParts = [];
  const checkedAtLabel = formatDateTimeLabel(normalizedServerStatus.lastCheckedAt);
  const latencyLabel = formatLatencyLabel(normalizedServerStatus.latencyMs);
  if (latencyLabel) {
    detailParts.push(`延迟 ${latencyLabel}`);
  }
  if (checkedAtLabel) {
    detailParts.push(`检查于 ${checkedAtLabel}`);
  }
  if (!normalizedServerStatus.lastCheckedAt && !runtimeInfo?.serverStatus) {
    return {
      label: "连接中",
      tone: "neutral",
      detail: "正在检查云端服务可用性",
    };
  }
  if (normalizedServerStatus.reachable === false) {
    return {
      label: "不可用",
      tone: "danger",
      detail: detailParts.join(" · ") || "当前无法连接云端服务",
    };
  }
  return {
    label: "已连接",
    tone: "success",
    detail: detailParts.join(" · ") || "云端服务连接正常",
  };
}

function getDesktopHelperDiagnostic(helperStatus = {}, runtimeInfo = null) {
  const safeHelperStatus = runtimeInfo?.helperStatus || helperStatus || {};
  const detailParts = [];
  const modelStatus = String(safeHelperStatus?.modelStatus || "").trim();
  const helperMode = String(safeHelperStatus?.helperMode || runtimeInfo?.helperMode || "").trim();
  const checkedAtLabel = formatDateTimeLabel(safeHelperStatus?.lastCheckedAt);
  if (modelStatus) {
    detailParts.push(modelStatus);
  }
  if (helperMode) {
    detailParts.push(helperMode === "bundled-runtime" ? "正式包运行时" : helperMode);
  }
  if (checkedAtLabel) {
    detailParts.push(`检查于 ${checkedAtLabel}`);
  }
  if (safeHelperStatus?.modelReady) {
    return {
      label: "模型就绪",
      tone: "success",
      detail: detailParts.join(" · ") || "本地 Helper 与模型均已准备完成",
    };
  }
  if (safeHelperStatus?.healthy || safeHelperStatus?.ok) {
    return {
      label: "运行中",
      tone: "warning",
      detail: detailParts.join(" · ") || "本地 Helper 已运行，正在等待模型就绪",
    };
  }
  return {
    label: "未启动",
    tone: "danger",
    detail: detailParts.join(" · ") || "未检测到本地 Helper",
  };
}

function getDesktopClientUpdateDiagnostic(runtimeInfo = null) {
  const updateState = runtimeInfo?.clientUpdate || {};
  const currentVersion = String(updateState?.currentVersion || "").trim();
  const latestVersion = String(updateState?.latestVersion || "").trim();
  const checkedAtLabel = formatDateTimeLabel(updateState?.checkedAt);
  const detailParts = [];
  if (currentVersion) {
    detailParts.push(`当前 ${currentVersion}`);
  }
  if (latestVersion) {
    detailParts.push(`最新 ${latestVersion}`);
  }
  if (checkedAtLabel) {
    detailParts.push(`检查于 ${checkedAtLabel}`);
  }
  if (!runtimeInfo) {
    return {
      label: "连接中",
      tone: "neutral",
      detail: "正在读取客户端版本与更新状态",
    };
  }
  if (updateState?.checking) {
    return {
      label: "检查中",
      tone: "neutral",
      detail: detailParts.join(" · ") || "正在检查客户端更新",
    };
  }
  if (String(updateState?.lastError || "").trim()) {
    return {
      label: "检查更新失败",
      tone: "danger",
      detail: detailParts.join(" · ") || String(updateState.lastError || "").trim(),
    };
  }
  if (updateState?.available) {
    return {
      label: "发现新版本",
      tone: "warning",
      detail: detailParts.join(" · ") || "检测到可用新版本",
    };
  }
  return {
    label: "已是最新",
    tone: "success",
    detail: detailParts.join(" · ") || "当前客户端已是最新版本",
  };
}

function createAbortError(message) {
  const error = new Error(message || "操作已取消");
  error.name = "AbortError";
  return error;
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function buildWorkerRequestId(sequence) {
  return `upload-${Date.now()}-${sequence}`;
}

function getStageItems(taskSnapshot) {
  const map = Object.fromEntries((Array.isArray(taskSnapshot?.stages) ? taskSnapshot.stages : []).map((item) => [item.key, item.status || "pending"]));
  return DISPLAY_STAGES.map((item) => ({ ...item, status: map[item.key] || "pending" }));
}

function getCurrentTaskStageKey(taskSnapshot) {
  const items = getStageItems(taskSnapshot);
  return items.find((item) => item.status === "running")?.key || items.find((item) => item.status === "failed")?.key || items.find((item) => item.status !== "completed")?.key || "write_lesson";
}

function getStageProgressRatioFromOverall(stageKey, overallPercent) {
  const bounds = STAGE_PROGRESS_BOUNDS[stageKey] || { start: 0, end: 100 };
  const safeOverallPercent = clampPercent(overallPercent);
  const span = Math.max(1, Number(bounds.end || 100) - Number(bounds.start || 0));
  if (safeOverallPercent <= bounds.start) return 0;
  if (safeOverallPercent >= bounds.end) return 1;
  return (safeOverallPercent - bounds.start) / span;
}

function buildStageCounterDisplay(done, total, fallbackRatio, fallbackTotal = 0) {
  const safeDone = Math.max(0, Number(done || 0));
  const safeTotal = Math.max(safeDone, Number(total || 0));
  if (safeTotal > 0) {
    return {
      detailText: `${safeDone}/${safeTotal}`,
      progressPercent: clampPercent((safeDone / safeTotal) * 100),
    };
  }
  const safeFallbackRatio = Math.max(0, Math.min(1, Number(fallbackRatio) || 0));
  const normalizedFallbackTotal = Math.max(0, Number(fallbackTotal || 0));
  if (normalizedFallbackTotal <= 0) {
    return {
      detailText: "--",
      progressPercent: clampPercent(safeFallbackRatio * 100),
    };
  }
  const fallbackDone = safeFallbackRatio >= 1 ? normalizedFallbackTotal : Math.max(0, Math.floor(normalizedFallbackTotal * safeFallbackRatio));
  return {
    detailText: `${fallbackDone}/${normalizedFallbackTotal}`,
    progressPercent: clampPercent(safeFallbackRatio * 100),
  };
}

function sanitizeUserFacingText(text) {
  return String(text || "")
    .replace(/(?:funasr|faster-whisper|ctranslate2) import failed:[^\n]*/gi, "当前模型运行环境未就绪，请联系管理员检查服务端依赖。")
    .replace(/No module named ['"][^'"]+['"]/gi, "服务端依赖未安装")
    .replace(/本地识别/g, "识别")
    .replace(/本地模型/g, "模型")
    .replace(/本地 Bottle 1\.0/g, "Bottle 1.0")
    .replace(/本地字幕/g, "字幕")
    .replace(/本地音频/g, "音频")
    .replace(/本地视频/g, "视频")
    .replace(/本地解码/g, "直接解码")
    .replace(/本地解析/g, "解析")
    .replace(/在本地直接/g, "直接")
    .replace(/在本地运行/g, "运行")
    .replace(/本地运行/g, "运行")
    .replace(/本地/g, "")
    .replace(/均衡模式/g, "当前模型")
    .replace(/高速模式/g, "另一个模型")
    .replace(/WASM 模式/g, "当前模式")
    .replace(/WASM/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function trimStageCounterSuffix(text) {
  return sanitizeUserFacingText(text).replace(/\s+\d+\/\d+$/, "").trim();
}

function getStageStatusText(taskSnapshot, stageKey, stageStatus, currentStageKey) {
  const currentText = trimStageCounterSuffix(taskSnapshot?.current_text);
  if (stageStatus === "completed") return "已完成";
  if (stageStatus === "failed") return currentText || "执行失败";
  if (stageStatus === "running") {
    if (stageKey === currentStageKey && currentText) return currentText;
    if (stageKey === "convert_audio") return "抽音频中";
    if (stageKey === "asr_transcribe") return "识别字幕中";
    if (stageKey === "build_lesson") return "生成课程结构中";
    if (stageKey === "translate_zh") return "翻译中";
    if (stageKey === "write_lesson") return "保存中";
  }
  return "等待开始";
}

function getStageDisplayMeta(taskSnapshot, stageKey, stageStatus, currentStageKey) {
  const counters = taskSnapshot?.counters || {};
  const fallbackRatio = stageStatus === "completed" ? 1 : stageStatus === "pending" ? 0 : getStageProgressRatioFromOverall(stageKey, taskSnapshot?.overall_percent);
  let progressMeta;

  if (stageKey === "convert_audio" || stageKey === "build_lesson" || stageKey === "write_lesson") {
    progressMeta = buildStageCounterDisplay(stageStatus === "completed" ? 1 : 0, 1, fallbackRatio, 1);
  } else if (stageKey === "asr_transcribe") {
    const segmentDone = Math.max(0, Number(counters.segment_done || 0));
    const segmentTotal = Math.max(segmentDone, Number(counters.segment_total || 0));
    if (segmentTotal > 0) {
      progressMeta = buildStageCounterDisplay(segmentDone, segmentTotal, fallbackRatio, segmentTotal);
    } else {
      const done = Math.max(0, Number(counters.asr_done || 0));
      const total = Math.max(done, Number(counters.asr_estimated || 0));
      progressMeta = total > 0 ? buildStageCounterDisplay(done, total, fallbackRatio, total) : buildStageCounterDisplay(0, 0, fallbackRatio, 0);
    }
  } else if (stageKey === "translate_zh") {
    const done = Math.max(0, Number(counters.translate_done || 0));
    const total = Math.max(done, Number(counters.translate_total || 0));
    progressMeta = buildStageCounterDisplay(done, total, fallbackRatio, Math.max(1, total));
  } else {
    progressMeta = buildStageCounterDisplay(stageStatus === "completed" ? 1 : 0, 1, fallbackRatio, 1);
  }

  return {
    ...progressMeta,
    statusText: getStageStatusText(taskSnapshot, stageKey, stageStatus, currentStageKey),
  };
}

function getStageDisplayItems(taskSnapshot) {
  const currentStageKey = getCurrentTaskStageKey(taskSnapshot);
  return getStageItems(taskSnapshot).map((item) => ({
    ...item,
    ...getStageDisplayMeta(taskSnapshot, item.key, item.status, currentStageKey),
  }));
}

function getProgressHeadline(phase, uploadPercent, taskSnapshot) {
  if (phase === "uploading") return `上传素材 ${clampPercent(uploadPercent)}%`;
  if (phase === "upload_paused") return `上传素材 ${clampPercent(uploadPercent)}%`;
  if (phase === DESKTOP_LINK_IMPORTING_PHASE) {
    const nextPercent = taskSnapshot ? clampPercent(taskSnapshot?.overall_percent) : clampPercent(uploadPercent);
    return `下载素材 ${nextPercent}%`;
  }
  if (phase === DESKTOP_LOCAL_GENERATING_PHASE) {
    return `本机生成课程 ${clampPercent(uploadPercent)}%`;
  }
  if (!taskSnapshot) return phase === "success" ? "生成课程完成" : phase === "error" ? "生成课程失败" : "等待上传";
  if (phase === "success") return "生成课程完成";
  const taskStatus = String(taskSnapshot.status || "").toLowerCase();
  if (taskStatus === "paused" || taskStatus === "terminated") {
    return sanitizeUserFacingText(taskSnapshot.current_text || taskSnapshot.message || "已停止当前生成");
  }
  const counters = taskSnapshot.counters || {};
  const stageKey = getCurrentTaskStageKey(taskSnapshot);
  if (stageKey === "asr_transcribe") {
    const segmentDone = Math.max(0, Number(counters.segment_done || 0));
    const segmentTotal = Math.max(segmentDone, Number(counters.segment_total || 0));
    if (segmentTotal > 0) return `识别中 ${segmentDone}/${segmentTotal}`;
    const done = Math.max(0, Number(counters.asr_done || 0));
    const total = Math.max(done, Number(counters.asr_estimated || 0));
    if (done > 0 && total > 0) return `识别中 ${done}/${total}`;
    return sanitizeUserFacingText(taskSnapshot.current_text || "识别中");
  }
  if (stageKey === "build_lesson") return sanitizeUserFacingText(taskSnapshot.current_text || "生成课程结构");
  if (stageKey === "translate_zh") {
    const done = Math.max(0, Number(counters.translate_done || 0));
    const total = Math.max(done, Number(counters.translate_total || 0));
    return total > 0 ? `翻译字幕 ${done}/${total}` : sanitizeUserFacingText(taskSnapshot.current_text || "翻译字幕");
  }
  if (stageKey === "convert_audio") return sanitizeUserFacingText(taskSnapshot.current_text || "抽音频");
  if (stageKey === "write_lesson") return sanitizeUserFacingText(taskSnapshot.current_text || "保存完成");
  return sanitizeUserFacingText(taskSnapshot.current_text || "等待处理");
}

function getVisualProgress(phase, uploadPercent, taskSnapshot) {
  if (phase === "success") return 100;
  if (phase === DESKTOP_LINK_IMPORTING_PHASE) {
    return taskSnapshot ? clampPercent(taskSnapshot?.overall_percent) : clampPercent(uploadPercent);
  }
  if (phase === DESKTOP_LOCAL_GENERATING_PHASE) {
    return clampPercent(uploadPercent);
  }
  if (phase === "local_transcribing" || phase === DESKTOP_LOCAL_TRANSCRIBING_PHASE) {
    return taskSnapshot ? clampPercent(taskSnapshot?.overall_percent) : 28;
  }
  if (phase === "processing" || taskSnapshot) return Math.round(42 + clampPercent(taskSnapshot?.overall_percent) * 0.58);
  if (phase === "uploading" || phase === "upload_paused") return Math.round(Math.max(3, Math.min(42, clampPercent(uploadPercent) * 0.42)));
  return 0;
}

function getStageProgressPercent(stageKey, ratio = 1) {
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (stageKey === "convert_audio") return Math.round(15 * safeRatio);
  if (stageKey === "asr_transcribe") return Math.round(15 + 30 * safeRatio);
  if (stageKey === "build_lesson") return Math.round(45 + 15 * safeRatio);
  if (stageKey === "translate_zh") return Math.round(60 + 25 * safeRatio);
  if (stageKey === "write_lesson") return Math.round(85 + 15 * safeRatio);
  return 0;
}

function buildLocalProgressSnapshot({ stageKey, stageStatus = "running", ratio = 0, currentText = "", counters = {} }) {
  const stageIndex = DISPLAY_STAGES.findIndex((item) => item.key === stageKey);
  return {
    overall_percent: getStageProgressPercent(stageKey, ratio),
    current_text: String(currentText || ""),
    counters: { ...(counters || {}) },
    stages: DISPLAY_STAGES.map((item, index) => {
      let status = "pending";
      if (stageIndex >= 0) {
        if (index < stageIndex) status = "completed";
        if (index === stageIndex) status = stageStatus;
      }
      return { key: item.key, status };
    }),
  };
}

function createFileFromBlob(blob, fileName, mediaType) {
  if (!(blob instanceof Blob)) return null;
  try {
    return new File([blob], String(fileName || "source.bin"), { type: String(mediaType || blob.type || ""), lastModified: Date.now() });
  } catch (_) {
    return blob;
  }
}

function isBlobBackedSourceFile(fileLike) {
  return fileLike instanceof Blob && fileLike?.desktopSelectionPlaceholder !== true;
}

function decorateDesktopSourcePath(fileLike, sourcePath) {
  if (!fileLike || !sourcePath) return fileLike;
  try {
    Object.defineProperty(fileLike, "desktopSourcePath", { value: sourcePath, configurable: true });
  } catch (_) {
    try {
      fileLike.desktopSourcePath = sourcePath;
    } catch (_) {
      void 0;
    }
  }
  try {
    Object.defineProperty(fileLike, "sourcePath", { value: sourcePath, configurable: true });
  } catch (_) {
    try {
      fileLike.sourcePath = sourcePath;
    } catch (_) {
      void 0;
    }
  }
  try {
    Object.defineProperty(fileLike, "filePath", { value: sourcePath, configurable: true });
  } catch (_) {
    try {
      fileLike.filePath = sourcePath;
    } catch (_) {
      void 0;
    }
  }
  try {
    Object.defineProperty(fileLike, "path", { value: sourcePath, configurable: true });
  } catch (_) {
    try {
      fileLike.path = sourcePath;
    } catch (_) {
      void 0;
    }
  }
  return fileLike;
}

function resolveDesktopSourcePathCandidate(payload = {}) {
  return (
    String(payload?.desktopSourcePath || "").trim() ||
    String(payload?.sourcePath || "").trim() ||
    String(payload?.path || "").trim() ||
    String(payload?.filePath || "").trim()
  );
}

function buildDesktopSelectedFile(selection = {}) {
  const sourcePath = resolveDesktopSourcePathCandidate(selection);
  if (!sourcePath) {
    return null;
  }
  const fileName = String(selection?.name || sourcePath.split(/[\\/]/).pop() || "desktop-local-source").trim() || "desktop-local-source";
  const mediaType = String(selection?.type || selection?.mediaType || "").trim();
  const lastModified = Math.max(0, Number(selection?.lastModifiedMs || selection?.lastModified || Date.now()));
  const size = Math.max(0, Number(selection?.size || selection?.sizeBytes || 0));
  let nextFile;
  try {
    nextFile = new File([], fileName, { type: mediaType, lastModified });
  } catch (_) {
    nextFile = {
      name: fileName,
      type: mediaType,
      lastModified,
    };
  }
  if (!nextFile) {
    return null;
  }
  try {
    Object.defineProperty(nextFile, "size", { value: size, configurable: true });
  } catch (_) {
    void 0;
  }
  try {
    Object.defineProperty(nextFile, "desktopSelectionPlaceholder", { value: true, configurable: true });
  } catch (_) {
    try {
      nextFile.desktopSelectionPlaceholder = true;
    } catch (_) {
      void 0;
    }
  }
  return decorateDesktopSourcePath(nextFile, sourcePath);
}

async function materializeDesktopSelectedFile(fileLike) {
  const sourcePath = resolveDesktopSourcePathCandidate(fileLike);
  if (!sourcePath || !hasDesktopFileReadBridge()) {
    return fileLike;
  }
  const response = await window.desktopRuntime.readLocalMediaFile(sourcePath);
  const filePayload = response?.file && typeof response.file === "object" ? response.file : response;
  const bodyBase64 = String(filePayload?.bodyBase64 || "").trim();
  if (!bodyBase64) {
    return fileLike;
  }
  const bytes = decodeBase64Bytes(bodyBase64);
  const mediaType = String(filePayload?.type || fileLike?.type || "application/octet-stream");
  const blob = new Blob([bytes], { type: mediaType });
  const nextFile =
    createFileFromBlob(blob, String(filePayload?.name || fileLike?.name || "desktop-local-source"), mediaType) || fileLike;
  if (!nextFile) {
    return fileLike;
  }
  try {
    Object.defineProperty(nextFile, "lastModified", {
      value: Math.max(0, Number(filePayload?.lastModifiedMs || fileLike?.lastModified || Date.now())),
      configurable: true,
    });
  } catch (_) {
    void 0;
  }
  try {
    Object.defineProperty(nextFile, "desktopSelectionPlaceholder", { value: false, configurable: true });
  } catch (_) {
    try {
      nextFile.desktopSelectionPlaceholder = false;
    } catch (_) {
      void 0;
    }
  }
  return decorateDesktopSourcePath(nextFile, sourcePath);
}

function restoreSavedSourceFile(saved = {}) {
  const sourcePath = resolveDesktopSourcePathCandidate(saved);
  const restoredBlobFile = createFileFromBlob(saved?.file_blob, saved?.file_name, saved?.media_type);
  if (restoredBlobFile) {
    return decorateDesktopSourcePath(restoredBlobFile, sourcePath);
  }
  const restoredDescriptor = buildDesktopSelectedFile({
    name: saved?.file_name,
    type: saved?.media_type,
    size: saved?.file_size_bytes,
    lastModifiedMs: saved?.file_last_modified_ms,
    path: sourcePath,
  });
  return decorateDesktopSourcePath(restoredDescriptor, sourcePath);
}

function buildTaskState({ phase, taskId, taskSnapshot, uploadPercent, status }) {
  if (!taskId && !taskSnapshot && phase === "idle") return null;
  return {
    taskId: String(taskId || taskSnapshot?.task_id || ""),
    phase,
    tone: getUploadTaskTone({
      phase,
      resumeAvailable: Boolean(taskSnapshot?.resume_available),
      taskStatus: taskSnapshot?.status,
    }),
    headline: sanitizeUserFacingText(getProgressHeadline(phase, uploadPercent, taskSnapshot)),
    progressPercent: getVisualProgress(phase, uploadPercent, taskSnapshot),
    statusText: sanitizeUserFacingText(status),
    taskSnapshot,
    lessonId: Number(taskSnapshot?.lesson?.id || 0),
    resumeAvailable: Boolean(taskSnapshot?.resume_available),
  };
}

function getRecoveryBannerText(taskSnapshot) {
  const taskStatus = String(taskSnapshot?.status || "").toLowerCase();
  const currentText = sanitizeUserFacingText(String(taskSnapshot?.current_text || taskSnapshot?.message || ""));
  if (taskStatus === "paused") {
    return currentText || "已暂停当前生成，可继续生成或重新开始。";
  }
  if (taskStatus === "terminated") {
    return currentText || "已终止当前生成，素材仍保留，可重新开始。";
  }
  return "";
}

function getInterruptedLocalAsrStatus(hasFile) {
  return hasFile ? "上次生成已中断，请重新开始。" : "";
}

function getTaskStatusCardText(restoreBannerMode, taskSnapshot, statusText = "") {
  if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING) {
    return "正在检查上次任务状态...";
  }
  if (restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED) {
    if (Boolean(taskSnapshot?.resume_available)) {
      return "上次生成已中断，可继续生成或重新开始。";
    }
    return "上次生成已中断，可重新开始或清空这次记录。";
  }
  if (restoreBannerMode === RESTORE_BANNER_MODES.STALE) {
    return String(statusText || "上次生成记录已失效，可重新开始或清空这次记录。");
  }
  return "";
}

function buildSubtitleDraftItems(sentences, { isFinal = false, source = "workspace" } = {}) {
  return (Array.isArray(sentences) ? sentences : [])
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const textEn = String(item.text_en || item.text || "").trim();
      const textZh = String(item.text_zh || "").trim();
      if (!textEn && !textZh) return null;
      return {
        id: String(item.id || item.sentence_id || item.idx || `${source}-${index}`),
        beginMs: Math.max(0, Number(item.begin_ms || item.begin_time || 0)),
        endMs: Math.max(0, Number(item.end_ms || item.end_time || 0)),
        textEn,
        textZh,
        isFinal: Boolean(isFinal),
        source,
      };
    })
    .filter(Boolean);
}

function buildSubtitleDraftSnapshotFromWorkspace(workspace) {
  if (!workspace || typeof workspace !== "object") return null;
  const latestSnapshot = workspace.latest_subtitle_snapshot && typeof workspace.latest_subtitle_snapshot === "object" ? workspace.latest_subtitle_snapshot : null;
  if (!latestSnapshot) return null;
  const items = buildSubtitleDraftItems(latestSnapshot.items, {
    isFinal: Boolean(latestSnapshot.is_final),
    source: String(latestSnapshot.kind || "workspace"),
  });
  const previewText = String(latestSnapshot.preview_text || workspace?.current?.current_text || "").trim();
  return {
    workspaceId: String(workspace.workspace_id || ""),
    title: latestSnapshot.is_final ? "最终字幕" : "生成中的字幕草稿",
    updatedAt: String(latestSnapshot.updated_at || workspace.updated_at || ""),
    isFinal: Boolean(latestSnapshot.is_final),
    previewText,
    items:
      items.length > 0
        ? items
        : previewText
          ? [
              {
                id: `${String(workspace.workspace_id || "workspace")}-preview`,
                beginMs: 0,
                endMs: 0,
                textEn: previewText,
                textZh: "",
                isFinal: Boolean(latestSnapshot.is_final),
                source: String(latestSnapshot.kind || "workspace"),
              },
            ]
          : [],
    logs: Array.isArray(workspace?.log_summary?.events) ? workspace.log_summary.events : [],
  };
}

function buildSubtitleDraftSnapshotFromTask(taskSnapshot) {
  if (!taskSnapshot || typeof taskSnapshot !== "object") return null;
  const workspaceDraft = buildSubtitleDraftSnapshotFromWorkspace(taskSnapshot.workspace);
  if (workspaceDraft) return workspaceDraft;
  const lessonSentences = buildSubtitleDraftItems(taskSnapshot?.lesson?.sentences, { isFinal: true, source: "lesson" });
  if (lessonSentences.length > 0) {
    return {
      workspaceId: String(taskSnapshot?.lesson?.id || taskSnapshot?.task_id || ""),
      title: "最终字幕",
      updatedAt: "",
      isFinal: true,
      previewText: lessonSentences.map((item) => item.textEn).join(" "),
      items: lessonSentences,
      logs: [],
    };
  }
  const cacheSeedSentences = buildSubtitleDraftItems(taskSnapshot?.subtitle_cache_seed?.sentences, { isFinal: true, source: "subtitle_cache_seed" });
  if (cacheSeedSentences.length > 0) {
    return {
      workspaceId: String(taskSnapshot?.task_id || ""),
      title: "最终字幕",
      updatedAt: "",
      isFinal: true,
      previewText: cacheSeedSentences.map((item) => item.textEn).join(" "),
      items: cacheSeedSentences,
      logs: [],
    };
  }
  return null;
}

function buildSubtitleDraftSnapshotFromAsrPayload(asrPayload, { title = "生成中的字幕草稿", source = "local_asr", isFinal = false } = {}) {
  const transcriptSentences = buildSubtitleDraftItems(asrPayload?.transcripts?.[0]?.sentences, { isFinal, source });
  if (transcriptSentences.length === 0) return null;
  return {
    workspaceId: "",
    title,
    updatedAt: "",
    isFinal: Boolean(isFinal),
    previewText: transcriptSentences.map((item) => item.textEn).join(" "),
    items: transcriptSentences,
    logs: [],
  };
}

function isMobileUploadViewport() {
  if (typeof navigator === "undefined") return false;
  const userAgent = String(navigator.userAgent || "");
  return Boolean(navigator.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export function UploadPanel({
  accessToken,
  isActivePanel = true,
  onCreated,
  balanceAmountCents,
  balancePoints,
  billingRates,
  subtitleSettings,
  onWalletChanged,
  onTaskStateChange,
  onNavigateToLesson,
  isOnline = true,
}) {
  const currentUser = useAppStore((state) => state.currentUser);
  const normalizedBalanceAmountCents = Number(balanceAmountCents ?? balancePoints ?? 0);
  const localAsrSupport = useMemo(
    () =>
      LOCAL_BROWSER_ASR_ENABLED
        ? detectLocalAsrSupport()
        : { supported: false, reason: "浏览器本地 ASR 已下线", browserName: "", webgpuSupported: false },
    [],
  );
  const localDirectoryBindingAvailable = useMemo(() => (LOCAL_BROWSER_ASR_ENABLED ? localAsrDirectoryBindingSupported() : false), []);
  const configuredDefaultAsrModel = String(subtitleSettings?.default_asr_model || "").trim();
  const [file, setFile] = useState(null);
  const [taskId, setTaskId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [durationSec, setDurationSec] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [desktopSourceMode, setDesktopSourceMode] = useState(DESKTOP_UPLOAD_SOURCE_MODE_FILE);
  const [desktopLinkInput, setDesktopLinkInput] = useState("");
  const [desktopLinkTaskId, setDesktopLinkTaskId] = useState("");
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [coverAspectRatio, setCoverAspectRatio] = useState(0);
  const [coverWidth, setCoverWidth] = useState(0);
  const [coverHeight, setCoverHeight] = useState(0);
  const [isVideoSource, setIsVideoSource] = useState(false);
  const [taskSnapshot, setTaskSnapshot] = useState(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [diagnosticsDialogOpen, setDiagnosticsDialogOpen] = useState(false);
  const [desktopRuntimeInfo, setDesktopRuntimeInfo] = useState(null);
  const [networkOnline, setNetworkOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [desktopDiagnosticsLoading, setDesktopDiagnosticsLoading] = useState(false);
  const [desktopDiagnosticsError, setDesktopDiagnosticsError] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importDropActive, setImportDropActive] = useState(false);
  const [pendingLessonImport, setPendingLessonImport] = useState(null);
  const [desktopBillingState, setDesktopBillingState] = useState({
    status: "idle",
    balanceAmountCents: null,
    currency: "CNY",
    message: "",
    checkedAt: "",
  });
  const [bindingCompleted, setBindingCompleted] = useState(false);
  const [selectedUploadModel, setSelectedUploadModel] = useState(() => getDefaultUploadModelKey(configuredDefaultAsrModel));
  const [fasterWhisperRuntimeTrack, setFasterWhisperRuntimeTrack] = useState(() => getDefaultFasterWhisperRuntimeTrack());
  const [mode, setMode] = useState("fast");
  const [asrModelCatalogMap, setAsrModelCatalogMap] = useState(DEFAULT_ASR_MODEL_CATALOG_MAP);
  const [localWorkerEpoch, setLocalWorkerEpoch] = useState(0);
  const [localWorkerReadyMap, setLocalWorkerReadyMap] = useState({ browserLocal: false });
  const [selectedBalancedModel, setSelectedBalancedModel] = useState(() => {
    return getDefaultBalancedModelKey(configuredDefaultAsrModel);
  });
  const [localModelStateMap, setLocalModelStateMap] = useState({});
  const [localModelVisualProgressMap, setLocalModelVisualProgressMap] = useState({});
  const [localProgressSnapshot, setLocalProgressSnapshot] = useState(null);
  const [localBusyModelKey, setLocalBusyModelKey] = useState("");
  const [localBusyText, setLocalBusyText] = useState("");
  const [serverModelStateMap, setServerModelStateMap] = useState({});
  const [serverBusyModelKey, setServerBusyModelKey] = useState("");
  const [serverBusyText, setServerBusyText] = useState("");
  const [desktopBundleStateMap, setDesktopBundleStateMap] = useState({});
  const [desktopBundleBusyModelKey, setDesktopBundleBusyModelKey] = useState("");
  const [streamingSubtitleDraft, setStreamingSubtitleDraft] = useState(null);
  const [subtitleDraftEdits, setSubtitleDraftEdits] = useState({});
  const [desktopServerStatus, setDesktopServerStatus] = useState(() => normalizeServerStatus({ reachable: true, lastCheckedAt: "", latencyMs: null }));
  const [desktopHelperStatus, setDesktopHelperStatus] = useState({ healthy: false, modelReady: false, modelStatus: "" });
  const [offlineBannerMessage, setOfflineBannerMessage] = useState("");
  const [restoreBannerMode, setRestoreBannerMode] = useState(RESTORE_BANNER_MODES.NONE);
  const pollingAbortRef = useRef(false);
  const pollTokenRef = useRef(0);
  const pollFailureCountRef = useRef(0);
  const uploadAbortRef = useRef(null);
  const localRunAbortRef = useRef(null);
  const uploadPersistRef = useRef({ timer: null, lastSavedAt: 0, lastSavedPercent: -1, latestPercent: 0 });
  const localRunTokenRef = useRef(0);
  const localStageProgressTimerRef = useRef(null);
  const localStageProgressMetaRef = useRef({ runToken: 0, startedAt: 0, durationSec: 0, statusText: "" });
  const fileInputRef = useRef(null);
  const importFileInputRef = useRef(null);
  const freshEntryInitKeyRef = useRef("");
  const restoreVerificationTaskRef = useRef("");
  const successStateOriginRef = useRef("none");
  const fallbackToastTaskRef = useRef("");
  const localSenseWorkerRef = useRef(null);
  const localAsrRequestSequenceRef = useRef(0);
  const localAsrPendingRequestsRef = useRef(new Map());
  const desktopModelUpdatePromptRef = useRef("");
  const fasterWhisperTrackTouchedRef = useRef(false);
  const desktopLocalFailureCountRef = useRef(0);
  const desktopBillingReportRef = useRef(null);
  const desktopLinkPollTokenRef = useRef(0);
  const desktopLinkTaskIdRef = useRef("");
  const filePickerActionRef = useRef(FILE_PICKER_ACTION_SELECT);
  const ownerUserId = Number(currentUser?.id || 0);
  const desktopRuntimeAvailable = hasDesktopRuntimeBridge();
  const localLessonImportAvailable = hasLocalLessonImportBridge();

  async function refreshDesktopDiagnostics(options = {}) {
    if (!desktopRuntimeAvailable) {
      return null;
    }
    const silent = options.silent === true;
    if (!silent || !desktopRuntimeInfo) {
      setDesktopDiagnosticsLoading(true);
    }
    setDesktopDiagnosticsError("");
    try {
      const runtimeInfo = await window.desktopRuntime.getRuntimeInfo?.();
      const safeRuntimeInfo = runtimeInfo && typeof runtimeInfo === "object" ? runtimeInfo : null;
      setDesktopRuntimeInfo(safeRuntimeInfo);
      if (safeRuntimeInfo?.serverStatus) {
        setDesktopServerStatus(normalizeServerStatus(safeRuntimeInfo.serverStatus));
      }
      if (safeRuntimeInfo?.helperStatus) {
        setDesktopHelperStatus(safeRuntimeInfo.helperStatus);
      }
      return safeRuntimeInfo;
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "读取客户端诊断信息失败";
      setDesktopDiagnosticsError(message);
      return null;
    } finally {
      setDesktopDiagnosticsLoading(false);
    }
  }

  async function handleOpenLogsDirectory() {
    if (!desktopRuntimeAvailable) {
      return;
    }
    try {
      const opened = await window.desktopRuntime.openLogsDirectory?.();
      if (!opened) {
        throw new Error("当前日志目录不可用");
      }
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "打开日志目录失败");
    }
  }

  async function ensureDesktopClientBillingAdmission(sourceDurationSec = durationSec) {
    if (!desktopClientBillingEnabled) {
      return true;
    }
    if (!accessToken) {
      await handleTaskFailureState({
        message: "请先登录后再生成课程",
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return false;
    }
    if (!networkOnline) {
      setDesktopBillingState((prev) => ({
        ...prev,
        status: "offline",
        message: DESKTOP_CLIENT_OFFLINE_MESSAGE,
      }));
      await handleTaskFailureState({
        message: DESKTOP_CLIENT_OFFLINE_MESSAGE,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return false;
    }
    if (!selectedRate) {
      const message = "当前计费单价未配置，暂时无法开始生成";
      setDesktopBillingState((prev) => ({
        ...prev,
        status: "error",
        message,
      }));
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return false;
    }
    try {
      setDesktopBillingState((prev) => ({
        ...prev,
        status: "checking",
        message: "正在检查余额...",
      }));
      const snapshot = await requestWalletBalance(accessToken);
      const effectiveDurationSec = Math.max(0, Number(sourceDurationSec || durationSec || 0));
      const estimatedChargeCents =
        effectiveDurationSec > 0
          ? calculateChargeCentsBySeconds(effectiveDurationSec, selectedRatePricePerMinuteYuan) + estimatedMtChargeCents
          : desktopClientEstimatedChargeCents;
      const hasEnoughBalance = estimatedChargeCents <= 0 || snapshot.balanceAmountCents >= estimatedChargeCents;
      setDesktopBillingState({
        status: hasEnoughBalance ? "ready" : "insufficient",
        balanceAmountCents: snapshot.balanceAmountCents,
        currency: snapshot.currency,
        message: hasEnoughBalance ? "" : DESKTOP_CLIENT_INSUFFICIENT_BALANCE_MESSAGE,
        checkedAt: snapshot.updatedAt,
      });
      if (hasEnoughBalance) {
        return true;
      }
      await handleTaskFailureState({
        message: DESKTOP_CLIENT_INSUFFICIENT_BALANCE_MESSAGE,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return false;
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "读取余额失败";
      setDesktopBillingState((prev) => ({
        ...prev,
        status: "error",
        message,
      }));
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return false;
    }
  }

  async function syncDesktopClientBillingAfterSuccess(data) {
    const report = desktopBillingReportRef.current;
    desktopBillingReportRef.current = null;
    if (!report || !accessToken) {
      await onWalletChanged?.();
      return;
    }
    const lessonId = Number(data?.lesson?.id || 0);
    const lessonDurationSeconds = Math.max(
      1,
      Math.ceil(Number(data?.lesson?.source_duration_ms || 0) / 1000) || Math.ceil(Number(report.sourceDurationSec || durationSec || 0)),
    );
    if (!lessonId || lessonDurationSeconds <= 0) {
      await onWalletChanged?.();
      return;
    }
    try {
      const payload = await reportLocalGenerationUsage(accessToken, {
        courseId: lessonId,
        actualSeconds: lessonDurationSeconds,
        modelName: report.modelName,
        runtimeKind: report.runtimeKind,
      });
      const nextBalanceAmountCents = Number(payload?.balance_amount_cents ?? payload?.balance ?? NaN);
      if (Number.isFinite(nextBalanceAmountCents)) {
        setDesktopBillingState((prev) => ({
          ...prev,
          status: "ready",
          balanceAmountCents: Math.max(0, nextBalanceAmountCents),
          currency: String(payload?.currency || prev.currency || "CNY").trim() || "CNY",
          message: "",
        }));
      }
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "课程已生成，但余额同步失败，请稍后刷新确认。");
    } finally {
      await onWalletChanged?.();
    }
  }

  const selectedFastModel = useMemo(() => {
    const selectedMeta = getUploadModelMeta(selectedUploadModel);
    if (selectedMeta.mode === "fast") {
      return selectedMeta.key;
    }
    return getDefaultFastUploadModelKey(configuredDefaultAsrModel);
  }, [configuredDefaultAsrModel, selectedUploadModel]);
  const selectedAsrModel = mode === "balanced" ? selectedBalancedModel : selectedFastModel;
  const browserLocalRuntimeAvailable = hasBrowserLocalRuntimeBridge() && !isMobileUploadViewport();
  const browserLocalRuntimeBlockedMessage = hasBrowserLocalRuntimeBridge()
    ? "本地网站模式仅支持桌面浏览器，不支持手机和平板直接运行。"
    : "请先通过 preview-local.bat 启动本地网站运行时。";
  const selectedFastRuntimeTrack =
    selectedFastModel === FASTER_WHISPER_MODEL
      ? hasDesktopRuntimeBridge() || hasBrowserLocalRuntimeBridge()
        ? fasterWhisperRuntimeTrack
        : FAST_RUNTIME_TRACK_CLOUD
      : FAST_RUNTIME_TRACK_CLOUD;
  const fasterWhisperDesktopLocalSelected =
    mode === "fast" &&
    selectedFastModel === FASTER_WHISPER_MODEL &&
    selectedFastRuntimeTrack === FAST_RUNTIME_TRACK_DESKTOP_LOCAL &&
    hasDesktopRuntimeBridge();
  const fasterWhisperBrowserLocalSelected =
    mode === "fast" &&
    selectedFastModel === FASTER_WHISPER_MODEL &&
    selectedFastRuntimeTrack === FAST_RUNTIME_TRACK_BROWSER_LOCAL &&
    browserLocalRuntimeAvailable;
  const pricingModelKey = mode === "balanced" ? DEFAULT_FAST_UPLOAD_MODEL : selectedFastModel;
  const selectedRate = getRateByModel(billingRates, pricingModelKey);
  const selectedRatePricePerMinuteYuan = selectedRate ? getRatePricePerMinuteYuan(selectedRate) : 0;
  const estimatedAsrChargeCents = selectedRate ? calculateChargeCentsBySeconds(durationSec || 0, selectedRatePricePerMinuteYuan) : 0;
  const mtRate = getRateByModel(billingRates, MT_PRICE_MODEL);
  const mtRateCentsPer1kTokens = Number(mtRate?.points_per_1k_tokens || 0);
  const mtRatePricePer1kTokensYuan = getRatePricePer1kTokensYuan(mtRate);
  const estimatedMtTokens = estimateMtTokensByDuration(durationSec || 0);
  const estimatedMtChargeCents = calculateChargeCentsByTokens(estimatedMtTokens, mtRateCentsPer1kTokens);
  const estimatedTotalChargeCents = (fasterWhisperDesktopLocalSelected ? 0 : estimatedAsrChargeCents) + estimatedMtChargeCents;
  const desktopClientBillingEnabled = fasterWhisperDesktopLocalSelected;
  const desktopClientEstimatedChargeCents = estimatedAsrChargeCents + estimatedMtChargeCents;
  const desktopClientBalanceAmountCents =
    desktopClientBillingEnabled && Number.isFinite(Number(desktopBillingState.balanceAmountCents))
      ? Math.max(0, Number(desktopBillingState.balanceAmountCents || 0))
      : normalizedBalanceAmountCents;
  const desktopClientHasUsableEstimate = desktopClientBillingEnabled && durationSec != null && selectedRate != null;
  const localWorkerReady = Boolean(localWorkerReadyMap.browserLocal);
  const balancedPerformanceWarning = useMemo(
    () => (mode === "balanced" ? buildLocalAsrLongAudioWarning(durationSec, LOCAL_ASR_LONG_AUDIO_HINT_SECONDS) : ""),
    [durationSec, mode],
  );
  const selectedServerModelState = serverModelStateMap[selectedUploadModel] || {};
  const selectedServerModelPreparing = isAsrModelPreparing(selectedServerModelState);
  const selectedFastModelNeedsPreparation =
    mode === "fast" && SERVER_PREPARABLE_MODELS.has(selectedUploadModel) && !fasterWhisperDesktopLocalSelected;
  const localTranscribing = phase === "local_transcribing";
  const desktopLocalTranscribing = phase === DESKTOP_LOCAL_TRANSCRIBING_PHASE;
  const desktopLinkImporting = phase === DESKTOP_LINK_IMPORTING_PHASE;
  const desktopLinkModeActive = desktopRuntimeAvailable && desktopSourceMode === DESKTOP_UPLOAD_SOURCE_MODE_LINK;
  const desktopLocalGenerateAvailable =
    desktopRuntimeAvailable &&
    desktopSourceMode === DESKTOP_UPLOAD_SOURCE_MODE_FILE &&
    mode === "fast" &&
    selectedFastModel === FASTER_WHISPER_MODEL &&
    selectedFastRuntimeTrack === FAST_RUNTIME_TRACK_DESKTOP_LOCAL &&
    hasLocalCourseGeneratorBridge();
  const trimmedDesktopLinkInput = String(desktopLinkInput || "").trim();
  const desktopLinkModeSupported =
    desktopLinkModeActive &&
    mode === "fast" &&
    selectedFastModel === FASTER_WHISPER_MODEL &&
    selectedFastRuntimeTrack === FAST_RUNTIME_TRACK_DESKTOP_LOCAL;
  const desktopLinkModeBlockedMessage = desktopLinkModeActive
    ? desktopRuntimeAvailable
      ? "链接导入当前仅支持桌面端 Bottle 1.0 本机运行，不支持云端、网页本地模式或均衡模式。"
      : "当前环境不支持桌面端本地 helper，无法使用链接导入。"
    : "";
  const useLocalProgressSnapshot = localTranscribing || desktopLocalTranscribing || desktopLinkImporting;
  const displayTaskSnapshot = useLocalProgressSnapshot ? localProgressSnapshot : taskSnapshot;
  const hasLocalFile = Boolean(file);
  const displayTaskStatus = String(displayTaskSnapshot?.status || "").toLowerCase();
  const taskCompletionKind = String(taskSnapshot?.completion_kind || displayTaskSnapshot?.completion_kind || "full").toLowerCase();
  const taskResultMessage = sanitizeUserFacingText(String(taskSnapshot?.result_message || displayTaskSnapshot?.result_message || ""));
  const taskPartialFailureStageKey = String(taskSnapshot?.partial_failure_stage || "").trim();
  const taskPartialFailureStageLabel = taskPartialFailureStageKey ? getStageLabelByKey(taskPartialFailureStageKey) : "";
  const taskPartialFailureSummary = sanitizeUserFacingText(String(taskSnapshot?.partial_failure_message || "")).slice(0, 160);
  const taskSucceededPartially = !localTranscribing && !desktopLinkImporting && displayTaskStatus === "succeeded" && taskCompletionKind === "partial";
  const failureDebug = taskSnapshot?.failure_debug;
  const failureStageKey = String(failureDebug?.failed_stage || taskSnapshot?.resume_stage || "").trim();
  const failureStageLabel = failureStageKey ? getStageLabelByKey(failureStageKey) : "";
  const failureDetailRaw =
    failureDebug?.detail_excerpt ||
    failureDebug?.latest_error_summary ||
    failureDebug?.last_progress_text ||
    taskSnapshot?.current_text ||
    status;
  const failureSummary = failureDetailRaw ? sanitizeUserFacingText(String(failureDetailRaw)).slice(0, 160) : "";
  const isRestoreVerifying = restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING;
  const showRestoreInfoCard = restoreBannerMode !== RESTORE_BANNER_MODES.NONE;
  const serviceTaskActive =
    !localTranscribing &&
    !desktopLinkImporting &&
    !isRestoreVerifying &&
    Boolean(taskId) &&
    ACTIVE_SERVER_TASK_STATUSES.has(displayTaskStatus || (phase === "processing" ? "running" : ""));
  const serviceTaskStopActionsVisible =
    !isRestoreVerifying &&
    serviceTaskActive &&
    (Boolean(displayTaskSnapshot?.can_pause) || Boolean(displayTaskSnapshot?.can_terminate) || STOPPABLE_SERVER_TASK_STATUSES.has(displayTaskStatus));
  const taskPaused = !localTranscribing && displayTaskStatus === "paused";
  const taskTerminated = !localTranscribing && displayTaskStatus === "terminated";
  const canResumeServerTask = taskPaused || Boolean(taskSnapshot?.resume_available);
  const canReconnectInterruptedTask = restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED && Boolean(taskId) && !canResumeServerTask;
  const showRecoveryBanner = hasLocalFile && RECOVERABLE_SERVER_TASK_STATUSES.has(displayTaskStatus);
  const recoveryBannerText = getRecoveryBannerText(displayTaskSnapshot);
  const taskStatusCardText = getTaskStatusCardText(restoreBannerMode, taskSnapshot, status);
  const showTaskStatusCard =
    restoreBannerMode !== RESTORE_BANNER_MODES.NONE || (showRecoveryBanner && !isRestoreVerifying);
  const stageItems = getStageDisplayItems(displayTaskSnapshot);
  const progressPercent = getVisualProgress(phase, uploadPercent, displayTaskSnapshot);
  const showProgress =
    !isRestoreVerifying &&
    restoreBannerMode !== RESTORE_BANNER_MODES.STALE &&
    restoreBannerMode !== RESTORE_BANNER_MODES.INTERRUPTED &&
    !RECOVERABLE_SERVER_TASK_STATUSES.has(displayTaskStatus) &&
    (loading || phase === "success" || phase === "error" || phase === "upload_paused" || Boolean(displayTaskSnapshot));
  const canRetryWithoutUpload = Boolean(taskId) && (Boolean(taskSnapshot?.resume_available) || phase === "error");
  const showMediaPreview = Boolean(file || coverDataUrl);
  const offlineHintText = getOfflineHintText(isOnline, selectedAsrModel);
  const sourceDisplayName = String(file?.name || taskSnapshot?.lesson?.source_filename || "");
  const uploadActionBusy =
    loading && ["uploading", "processing", "local_transcribing", DESKTOP_LOCAL_TRANSCRIBING_PHASE, DESKTOP_LINK_IMPORTING_PHASE, DESKTOP_LOCAL_GENERATING_PHASE].includes(String(phase || ""));
  const localModeBusy = Boolean(localBusyModelKey || serverBusyModelKey) || localTranscribing;
  const cancelablePrimaryAction = localTranscribing || desktopLinkImporting;
  const primaryActionDisabled =
    phase === "success" ||
    (loading && !cancelablePrimaryAction && !serviceTaskStopActionsVisible) ||
    (mode === "balanced" && !localTranscribing && (!localAsrSupport.supported || !localWorkerReady || Boolean(localBusyModelKey))) ||
    (!isOnline && selectedAsrModel !== FASTER_WHISPER_MODEL && !desktopLocalTranscribing && !desktopLinkImporting) ||
    (desktopClientBillingEnabled &&
      (desktopBillingState.status === "offline" ||
        (desktopClientHasUsableEstimate && ["checking", "insufficient", "error"].includes(String(desktopBillingState.status || ""))))) ||
    (desktopLinkModeActive && !desktopLinkImporting && (!desktopLinkModeSupported || !trimmedDesktopLinkInput));
  const taskTone = getUploadTaskTone({
    phase,
    resumeAvailable: Boolean(displayTaskSnapshot?.resume_available) || taskPaused,
    taskStatus: displayTaskStatus,
  });
  const taskToneStyles = getUploadToneStyles(taskTone);
  const taskStatusTone = showRestoreInfoCard
    ? getUploadRestoreTone(restoreBannerMode)
    : showRecoveryBanner
      ? "recoverable"
      : taskTone;
  const taskStatusToneStyles = getUploadToneStyles(taskStatusTone);
  const subtitleDraftSnapshot = useMemo(() => {
    return (
      streamingSubtitleDraft ||
      buildSubtitleDraftSnapshotFromTask(displayTaskSnapshot) ||
      buildSubtitleDraftSnapshotFromTask(taskSnapshot) ||
      null
    );
  }, [displayTaskSnapshot, streamingSubtitleDraft, taskSnapshot]);
  const subtitleDraftKey = `${String(subtitleDraftSnapshot?.workspaceId || "")}:${String(subtitleDraftSnapshot?.updatedAt || "")}:${subtitleDraftSnapshot?.isFinal ? "final" : "draft"}`;
  const renderedSubtitleDraftItems = useMemo(() => {
    return (subtitleDraftSnapshot?.items || []).map((item, index) => ({
      ...item,
      id: String(item.id || `draft-${index}`),
      textEn: String(subtitleDraftEdits[String(item.id || `draft-${index}`)] ?? item.textEn ?? ""),
      textZh: String(subtitleDraftEdits[`${String(item.id || `draft-${index}`)}:zh`] ?? item.textZh ?? ""),
    }));
  }, [subtitleDraftEdits, subtitleDraftSnapshot]);
  const subtitleDraftLogEvents = Array.isArray(subtitleDraftSnapshot?.logs) ? subtitleDraftSnapshot.logs.slice(-5).reverse() : [];
  const showWorkbenchLayout = true;
  const subtitleDraftHasContent = renderedSubtitleDraftItems.length > 0;
  const subtitleDraftUpdatedLabel = formatDateTimeLabel(subtitleDraftSnapshot?.updatedAt);
  const subtitleDraftToneStyles = getUploadToneStyles(
    subtitleDraftSnapshot?.isFinal ? "success" : subtitleDraftHasContent ? "running" : "idle",
  );
  const subtitleDraftHintText = subtitleDraftSnapshot?.isFinal
    ? "最终字幕已确定覆盖草稿，你可以继续微调阅读内容，然后直接开始沉浸式学习。"
    : subtitleDraftHasContent
      ? "当前是可回改的字幕草稿，后续识别与课程生成结果可能继续修正；任务成功后会自动切换到最终态。"
      : "选择素材并开始生成后，这里会按句或按段持续刷新字幕草稿，刷新页面后也会从工作区恢复。";
  const processLogEvents =
    subtitleDraftLogEvents.length > 0
      ? subtitleDraftLogEvents
      : status || subtitleDraftSnapshot?.previewText
        ? [
            {
              at: subtitleDraftSnapshot?.updatedAt || "",
              stage: getCurrentTaskStageKey(displayTaskSnapshot),
              overall_percent: progressPercent,
              message: String(status || subtitleDraftSnapshot?.previewText || "").trim(),
              status: displayTaskStatus || phase,
            },
          ]
        : [];

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const updateOnlineState = () => {
      setNetworkOnline(typeof navigator === "undefined" ? true : navigator.onLine !== false);
    };
    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!desktopClientBillingEnabled) {
      setDesktopBillingState({
        status: "idle",
        balanceAmountCents: null,
        currency: "CNY",
        message: "",
        checkedAt: "",
      });
      return undefined;
    }
    if (!accessToken) {
      setDesktopBillingState({
        status: "error",
        balanceAmountCents: null,
        currency: "CNY",
        message: "请先登录后再生成课程",
        checkedAt: "",
      });
      return undefined;
    }
    if (!networkOnline) {
      setDesktopBillingState((prev) => ({
        ...prev,
        status: "offline",
        message: DESKTOP_CLIENT_OFFLINE_MESSAGE,
      }));
      return undefined;
    }
    if (!selectedRate) {
      setDesktopBillingState((prev) => ({
        ...prev,
        status: "error",
        message: "当前计费单价未配置，暂时无法开始生成",
      }));
      return undefined;
    }
    let cancelled = false;
    setDesktopBillingState((prev) => ({
      ...prev,
      status: "checking",
      message: durationSec != null ? "正在检查余额..." : "",
    }));
    void (async () => {
      try {
        const snapshot = await requestWalletBalance(accessToken);
        if (cancelled) return;
        const hasEnoughBalance = durationSec == null || snapshot.balanceAmountCents >= desktopClientEstimatedChargeCents;
        setDesktopBillingState({
          status: hasEnoughBalance ? "ready" : "insufficient",
          balanceAmountCents: snapshot.balanceAmountCents,
          currency: snapshot.currency,
          message: hasEnoughBalance ? "" : DESKTOP_CLIENT_INSUFFICIENT_BALANCE_MESSAGE,
          checkedAt: snapshot.updatedAt,
        });
      } catch (error) {
        if (cancelled) return;
        setDesktopBillingState((prev) => ({
          ...prev,
          status: "error",
          message: error instanceof Error && error.message ? error.message : "读取余额失败",
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, desktopClientBillingEnabled, desktopClientEstimatedChargeCents, durationSec, networkOnline, selectedRate]);

  useEffect(() => {
    setSubtitleDraftEdits({});
  }, [subtitleDraftKey]);

  function handleSubtitleDraftEditChange(itemId, field, value) {
    const normalizedId = String(itemId || "").trim();
    if (!normalizedId) return;
    const key = field === "textZh" ? `${normalizedId}:zh` : normalizedId;
    setSubtitleDraftEdits((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function maybeShowModelFallbackToast(payload) {
    void payload;
  }

  function clearDesktopLinkTaskTracking(invalidatePoll = true) {
    if (invalidatePoll) {
      desktopLinkPollTokenRef.current += 1;
    }
    desktopLinkTaskIdRef.current = "";
    setDesktopLinkTaskId("");
  }

  function updateDesktopLinkProgressState(progressPercent, statusText = "正在下载素材") {
    const nextPercent = clampPercent(progressPercent);
    const ratio = nextPercent > 0 ? nextPercent / 100 : 0.04;
    setUploadPercent(nextPercent);
    setLocalProgressSnapshot(
      buildLocalProgressSnapshot({
        stageKey: "convert_audio",
        stageStatus: nextPercent >= 100 ? "completed" : "running",
        ratio,
        currentText: statusText,
      }),
    );
  }

  function attachDesktopSourcePath(fileLike, sourcePath) {
    return decorateDesktopSourcePath(fileLike, sourcePath);
  }

  function resolveDesktopSelectedSourcePath(fileLike) {
    const existingPath = resolveDesktopSourcePathCandidate(fileLike);
    if (existingPath) return existingPath;
    if (!desktopRuntimeAvailable || !fileLike) return "";
    try {
      return String(window.desktopRuntime?.getPathForFile?.(fileLike) || "").trim();
    } catch (_) {
      return "";
    }
  }

  async function ensureBlobBackedSourceFile(sourceFile) {
    if (!sourceFile || isBlobBackedSourceFile(sourceFile)) {
      return sourceFile;
    }
    const materializedFile = await materializeDesktopSelectedFile(sourceFile);
    const resolvedMaterializedFile = attachDesktopSourcePath(materializedFile, resolveDesktopSelectedSourcePath(sourceFile));
    if (file === sourceFile && resolvedMaterializedFile && resolvedMaterializedFile !== sourceFile) {
      setFile(resolvedMaterializedFile);
    }
    return resolvedMaterializedFile;
  }

  function openSourceFilePicker(action = FILE_PICKER_ACTION_SELECT) {
    filePickerActionRef.current = action;
    if (!fileInputRef.current) {
      filePickerActionRef.current = FILE_PICKER_ACTION_SELECT;
      return false;
    }
    fileInputRef.current.value = "";
    fileInputRef.current.click();
    return true;
  }

  async function loadDesktopImportedSourceFile(taskPayload = {}) {
    const taskToken = encodeURIComponent(String(taskPayload?.task_id || ""));
    if (!taskToken) {
      throw new Error("链接下载任务缺少 task_id");
    }
    const response = await requestDesktopLocalHelper(`/api/desktop-asr/url-import/tasks/${taskToken}/file`, "arrayBuffer");
    const bytes = decodeBase64Bytes(response.bodyBase64);
    if (bytes.byteLength <= 0) {
      throw new Error("已下载素材为空，无法继续生成");
    }
    const contentType = String(response.contentType || taskPayload?.content_type || "application/octet-stream");
    const blob = new Blob([bytes], { type: contentType });
    const nextFile = createFileFromBlob(blob, String(taskPayload?.source_filename || "desktop-link-source"), contentType);
    if (!nextFile) {
      throw new Error("无法载入已下载素材");
    }
    return attachDesktopSourcePath(nextFile, String(taskPayload?.source_path || ""));
  }

  async function commitImportedLesson(normalizedImport, mode = "overwrite") {
    if (!localLessonImportAvailable) {
      throw new Error("当前环境不支持本地课程导入");
    }
    const courses = await window.localDb.getCourses().catch(() => []);
    const existingCourse = (Array.isArray(courses) ? courses : []).find(
      (course) => String(course?.id ?? "") === String(normalizedImport?.lesson?.id ?? ""),
    );
    const importedAt = new Date().toISOString();
    const targetLessonId =
      mode === "copy"
        ? (() => {
            const existingIds = new Set((Array.isArray(courses) ? courses : []).map((course) => String(course?.id ?? "")));
            let nextId = createImportedLessonId();
            while (existingIds.has(nextId)) {
              nextId = createImportedLessonId();
            }
            return nextId;
          })()
        : String(normalizedImport.lesson.id);
    const courseRecord = buildImportedCourseRecord(normalizedImport.lesson, targetLessonId, {
      schemaVersion: normalizedImport.schemaVersion,
      exportedAt: normalizedImport.exportedAt,
      appVersion: normalizedImport.appVersion,
      importedAt,
    });
    const sentenceRecords = normalizedImport.sentences.map((sentence, index) =>
      buildImportedSentenceRecord(targetLessonId, sentence, index),
    );
    const progressRecord = buildImportedProgressRecord(targetLessonId, normalizedImport.progress);
    const savedCourse = await window.localDb.saveCourse(courseRecord);
    await window.localDb.saveSentences(targetLessonId, sentenceRecords);
    if (progressRecord) {
      await window.localDb.saveProgress(targetLessonId, progressRecord);
    }
    await Promise.resolve(
      window.localDb.sync?.logSync?.(
        "lesson_sentences",
        targetLessonId,
        existingCourse && mode !== "copy" ? "UPDATE" : "INSERT",
        Number(savedCourse?.version || courseRecord.version || 1),
      ),
    ).catch(() => null);
    if (progressRecord) {
      await Promise.resolve(
        window.localDb.sync?.logSync?.(
          "progress",
          targetLessonId,
          existingCourse && mode !== "copy" ? "UPDATE" : "INSERT",
          Number(progressRecord.version || savedCourse?.version || 1),
        ),
      ).catch(() => null);
    }
    dispatchLocalLessonUpdateEvent();
    setPendingLessonImport(null);
    setStatus(mode === "copy" ? "课程已作为新副本导入，可在历史记录中查看。" : "课程已导入，可在历史记录中查看。");
    toast.success(mode === "copy" ? "课程已作为新副本导入" : existingCourse ? "课程已覆盖导入" : "课程已导入");
    return savedCourse;
  }

  async function handleImportLessonFile(file) {
    if (!file) {
      return;
    }
    if (!localLessonImportAvailable) {
      toast.error("当前环境不支持本地课程导入");
      return;
    }
    setImportBusy(true);
    try {
      const fileName = String(file?.name || "");
      if (fileName && !fileName.toLowerCase().endsWith(BOTTLE_LESSON_FILE_SUFFIX) && !fileName.toLowerCase().endsWith(".json")) {
        throw new Error("仅支持导入 .bottle-lesson.json 或 .json 文件");
      }
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const normalizedImport = normalizeImportedLessonPayload(parsed);
      const courses = await window.localDb.getCourses().catch(() => []);
      const hasConflict = (Array.isArray(courses) ? courses : []).some(
        (course) => String(course?.id ?? "") === String(normalizedImport.lesson.id),
      );
      if (hasConflict) {
        setPendingLessonImport({
          fileName: fileName || `${normalizedImport.lesson.id}${BOTTLE_LESSON_FILE_SUFFIX}`,
          normalizedImport,
        });
        return;
      }
      await commitImportedLesson(normalizedImport, "overwrite");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "导入课程失败");
    } finally {
      setImportBusy(false);
    }
  }

  async function resolvePendingLessonImport(mode = "overwrite") {
    if (!pendingLessonImport?.normalizedImport) {
      return;
    }
    setImportBusy(true);
    try {
      await commitImportedLesson(pendingLessonImport.normalizedImport, mode);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "导入课程失败");
    } finally {
      setImportBusy(false);
    }
  }

  function handleImportDropHover(event) {
    if (!localLessonImportAvailable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setImportDropActive(true);
  }

  function handleImportDropLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setImportDropActive(false);
  }

  async function handleImportDrop(event) {
    if (!localLessonImportAvailable) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setImportDropActive(false);
    const nextFile = event.dataTransfer?.files?.[0] ?? null;
    if (nextFile) {
      await handleImportLessonFile(nextFile);
    }
  }

  async function handleDesktopSourceModeChange(nextMode) {
    const normalizedMode = nextMode === DESKTOP_UPLOAD_SOURCE_MODE_LINK ? DESKTOP_UPLOAD_SOURCE_MODE_LINK : DESKTOP_UPLOAD_SOURCE_MODE_FILE;
    if (normalizedMode === desktopSourceMode) {
      return;
    }
    resetLocalSessionState();
    setDesktopSourceMode(normalizedMode);
    setDesktopLinkInput("");
    if (ownerUserId) {
      await clearUploadPanelSuccessSnapshot(ownerUserId);
      await clearActiveGenerationTask(ownerUserId);
    }
  }

  function updateLocalModelState(modelKey, patch) {
    setLocalModelStateMap((prev) => ({
      ...prev,
      [modelKey]: {
        ...(prev[modelKey] || {}),
        ...(patch || {}),
      },
    }));
  }

  function updateServerModelState(modelKey, patch) {
    setServerModelStateMap((prev) => ({
      ...prev,
      [modelKey]: {
        ...(prev[modelKey] || {}),
        ...(patch || {}),
      },
    }));
  }

  function updateDesktopBundleState(modelKey, patch) {
    setDesktopBundleStateMap((prev) => ({
      ...prev,
      [modelKey]: {
        ...(prev[modelKey] || {}),
        ...(patch || {}),
      },
    }));
  }

  function applyDesktopBundleState(modelKey, summary, overrides = {}) {
    updateDesktopBundleState(modelKey, {
      available: Boolean(overrides.available ?? summary?.available),
      installAvailable: Boolean(overrides.installAvailable ?? summary?.installAvailable),
      sourceAvailable: Boolean(overrides.sourceAvailable ?? summary?.sourceAvailable),
      sourceBundleDir: String(overrides.sourceBundleDir || summary?.sourceBundleDir || ""),
      targetBundleDir: String(overrides.targetBundleDir || summary?.targetBundleDir || ""),
      fileCount: Number(overrides.fileCount ?? summary?.fileCount ?? 0),
      updateAvailable: Boolean(overrides.updateAvailable ?? summary?.updateAvailable),
      updating: Boolean(overrides.updating ?? summary?.updating),
      cancellable: Boolean(overrides.cancellable ?? summary?.cancellable),
      localVersion: String(overrides.localVersion || summary?.localVersion || ""),
      remoteVersion: String(overrides.remoteVersion || summary?.remoteVersion || ""),
      totalFiles: Number(overrides.totalFiles ?? summary?.totalFiles ?? 0),
      completedFiles: Number(overrides.completedFiles ?? summary?.completedFiles ?? 0),
      currentFile: String(overrides.currentFile || summary?.currentFile || ""),
      message: String(overrides.message || summary?.message || ""),
      lastError: String(overrides.lastError || ""),
    });
  }

  function applyServerModelState(modelKey, payload, overrides = {}) {
    const status = String(overrides.status || payload?.status || "idle").trim().toLowerCase();
    const message = String(overrides.message || payload?.message || "");
    const lastError = String(overrides.lastError ?? payload?.last_error ?? payload?.lastError ?? "");
    const preparing = Boolean(overrides.preparing ?? payload?.preparing);
    const cached = Boolean(overrides.cached ?? payload?.cached);
    const downloadRequired = Boolean(overrides.downloadRequired ?? payload?.download_required ?? payload?.downloadRequired);
    const runtimeKind = String(overrides.runtimeKind || payload?.runtime_kind || "");
    const runtimeLabel = String(overrides.runtimeLabel || payload?.runtime_label || "");
    const prepareMode = String(overrides.prepareMode || payload?.prepare_mode || "");
    updateServerModelState(modelKey, {
      status,
      message,
      lastError,
      preparing,
      cached,
      downloadRequired,
      runtimeKind,
      runtimeLabel,
      prepareMode,
    });
  }

  function applyVerifiedLocalModelState(modelKey, verification, overrides = {}) {
    const nextStatus = String(overrides.status || verification?.status || "idle");
    const nextError = String(overrides.error ?? verification?.error ?? "");
    const nextMessage = String(overrides.message || verification?.message || "");
    updateLocalModelState(modelKey, {
      status: nextStatus,
      runtime: String(overrides.runtime || verification?.runtime || "wasm"),
      progress: overrides.progress ?? (nextStatus === "ready" || nextStatus === "cached" ? 100 : null),
      error: nextError,
      message: nextMessage,
      storageMode: String(overrides.storageMode || verification?.storageMode || LOCAL_ASR_STORAGE_MODE_BROWSER),
      storageSummary: String(overrides.storageSummary || verification?.storageSummary || ""),
      directoryName: String(overrides.directoryName || verification?.directoryName || ""),
      directoryBound: Boolean(overrides.directoryBound ?? verification?.directoryBound),
      cacheVersion: String(overrides.cacheVersion || verification?.cacheVersion || ""),
      missingFiles: Array.isArray(overrides.missingFiles) ? overrides.missingFiles : Array.isArray(verification?.missingFiles) ? verification.missingFiles : [],
    });
  }

  function getWorkerRefByModelKey(modelKey) {
    void modelKey;
    return localSenseWorkerRef.current;
  }

  function setWorkerReady(workerKind, ready) {
    setLocalWorkerReadyMap((prev) => ({ ...prev, [workerKind]: Boolean(ready) }));
  }

  function rejectPendingLocalRequests(message, errorName = "Error") {
    const error = errorName === "AbortError" ? createAbortError(message || "识别已取消") : new Error(message || "识别组件不可用");
    for (const [, request] of localAsrPendingRequestsRef.current.entries()) {
      request.reject(error);
    }
    localAsrPendingRequestsRef.current.clear();
  }

  async function createWorkerRequest(type, modelKey, payload = {}, transfer = []) {
    const modelMeta = getLocalModelMeta(modelKey);
    if (!modelMeta) {
      throw new Error("识别组件未初始化");
    }
    const worker = getWorkerRefByModelKey(modelKey);
    if (!worker) {
      throw new Error("识别组件未初始化");
    }
    let workerPayload = {};
    if (type === "load-model" || type === "transcribe-audio") {
      workerPayload = await getLocalAsrWorkerAssetPayload(modelKey, LOCAL_ASR_ASSET_BASE_URL);
    }
    localAsrRequestSequenceRef.current += 1;
    const requestId = buildWorkerRequestId(localAsrRequestSequenceRef.current);
    return new Promise((resolve, reject) => {
      localAsrPendingRequestsRef.current.set(requestId, { resolve, reject, type, modelKey });
      worker.postMessage(
        {
          type,
          requestId,
          modelId: modelMeta.workerModelId,
          preferredRuntime: "wasm",
          assetBaseUrl: LOCAL_ASR_ASSET_BASE_URL,
          ...workerPayload,
          ...payload,
        },
        transfer,
      );
    });
  }

  function clearLocalStageProgressTimer() {
    if (localStageProgressTimerRef.current) {
      clearInterval(localStageProgressTimerRef.current);
      localStageProgressTimerRef.current = null;
    }
  }

  function restartLocalWorker(message = "识别组件已重置", errorName = "AbortError") {
    rejectPendingLocalRequests(message, errorName);
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    setLocalWorkerReadyMap({ browserLocal: false });
    if (localSenseWorkerRef.current) {
      localSenseWorkerRef.current.terminate?.();
      localSenseWorkerRef.current = null;
    }
    releaseAllLocalAsrWorkerAssetPayloads();
    setLocalWorkerEpoch((prev) => prev + 1);
  }

  function setLocalProgress(stageKey, stageStatus, ratio, currentText, counters = {}) {
    setLocalProgressSnapshot(
      buildLocalProgressSnapshot({
        stageKey,
        stageStatus,
        ratio,
        currentText,
        counters,
      }),
    );
  }

  function startLocalAsrVisualProgress(runToken, nextStatusText, nextDurationSec) {
    clearLocalStageProgressTimer();
    localStageProgressMetaRef.current = {
      runToken,
      startedAt: Date.now(),
      durationSec: Number(nextDurationSec || 0),
      statusText: String(nextStatusText || "正在识别字幕"),
    };
    const initialRatio = estimateLocalAsrStageRatio(0, nextDurationSec);
    setLocalProgress("asr_transcribe", "running", initialRatio, nextStatusText, buildLocalAsrProgressCounters(0, nextDurationSec));
    localStageProgressTimerRef.current = setInterval(() => {
      if (runToken !== localRunTokenRef.current) return;
      const elapsedMs = Date.now() - Number(localStageProgressMetaRef.current.startedAt || 0);
      const ratio = estimateLocalAsrStageRatio(elapsedMs, localStageProgressMetaRef.current.durationSec);
      setLocalProgress("asr_transcribe", "running", ratio, localStageProgressMetaRef.current.statusText, buildLocalAsrProgressCounters(elapsedMs, localStageProgressMetaRef.current.durationSec));
    }, LOCAL_STAGE_PROGRESS_INTERVAL_MS);
  }

  function clearUploadPersistTimer() {
    if (uploadPersistRef.current.timer) {
      clearTimeout(uploadPersistRef.current.timer);
      uploadPersistRef.current.timer = null;
    }
  }

  function resetUploadPersistState() {
    clearUploadPersistTimer();
    uploadPersistRef.current.lastSavedAt = 0;
    uploadPersistRef.current.lastSavedPercent = -1;
    uploadPersistRef.current.latestPercent = 0;
  }

  function stopPollingSession() {
    pollingAbortRef.current = true;
    pollTokenRef.current += 1;
    pollFailureCountRef.current = 0;
  }

  function startPollingSession() {
    pollingAbortRef.current = false;
    pollTokenRef.current += 1;
    pollFailureCountRef.current = 0;
    return pollTokenRef.current;
  }

  useEffect(() => {
    onTaskStateChange?.(buildTaskState({ phase, taskId, taskSnapshot: displayTaskSnapshot, uploadPercent, status }));
  }, [onTaskStateChange, phase, taskId, displayTaskSnapshot, uploadPercent, status]);

  useEffect(() => () => {
    stopPollingSession();
    clearUploadPersistTimer();
    clearLocalStageProgressTimer();
    uploadAbortRef.current?.abort();
    localRunAbortRef.current?.abort();
    rejectPendingLocalRequests("识别组件已关闭");
    localSenseWorkerRef.current?.terminate?.();
    releaseAllLocalAsrWorkerAssetPayloads();
  }, []);

  useEffect(() => {
    if (!isLocalBalancedModelUploadEnabled(selectedBalancedModel)) {
      setSelectedBalancedModel(getDefaultBalancedModelKey(selectedBalancedModel));
    }
  }, [selectedBalancedModel]);

  useEffect(() => {
    let canceled = false;
    async function restoreServerModelState() {
      try {
        const response = await api(ASR_MODELS_API_BASE, { method: "GET" }, accessToken);
        const payload = await parseResponse(response);
        if (!response.ok) {
          throw new Error(toErrorText(payload, "加载模型目录失败"));
        }
        const models = Array.isArray(payload?.models) ? payload.models : [];
        if (canceled) return;
        setAsrModelCatalogMap(buildAsrModelCatalogMap(models));
        const nextServerStateMap = {};
        for (const item of models) {
          const modelKey = String(item?.model_key || "").trim();
          if (!modelKey || String(item?.runtime_kind || "") === "browser_local") continue;
          nextServerStateMap[modelKey] = {
            status: String(item.status || "idle"),
            message: String(item.message || ""),
            lastError: String(item.last_error || ""),
            preparing: Boolean(item.preparing),
            cached: Boolean(item.cached),
            downloadRequired: Boolean(item.download_required),
            runtimeKind: String(item.runtime_kind || ""),
            runtimeLabel: String(item.runtime_label || ""),
            prepareMode: String(item.prepare_mode || ""),
          };
        }
        setServerModelStateMap((prev) => ({ ...prev, ...nextServerStateMap }));
        if (hasDesktopRuntimeBridge()) {
          void fetchDesktopBundleStatus(FASTER_WHISPER_MODEL, { silent: true });
        }
      } catch (_) {
        const entries = await Promise.all(
          Array.from(SERVER_PREPARABLE_MODELS).map(async (modelKey) => {
            const payload = await fetchServerModelStatus(modelKey, { silent: true });
            if (payload) {
              return [
                modelKey,
                {
                  status: String(payload.status || "idle"),
                  message: String(payload.message || ""),
                  lastError: String(payload.last_error || ""),
                  preparing: Boolean(payload.preparing),
                  cached: Boolean(payload.cached),
                  downloadRequired: Boolean(payload.download_required),
                  runtimeKind: String(payload.runtime_kind || ""),
                  runtimeLabel: String(payload.runtime_label || ""),
                  prepareMode: String(payload.prepare_mode || ""),
                },
              ];
            }
            return [modelKey, { status: "error", lastError: "检查模型状态失败" }];
          }),
        );
        if (canceled) return;
        setServerModelStateMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        if (hasDesktopRuntimeBridge()) {
          void fetchDesktopBundleStatus(FASTER_WHISPER_MODEL, { silent: true });
        }
      }
    }
    void restoreServerModelState();
    return () => {
      canceled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!hasDesktopModelUpdateBridge() || !hasDesktopRuntimeBridge()) {
      return undefined;
    }
    const unsubscribe = onDesktopModelUpdateProgress((payload) => {
      const modelKey = String(payload?.modelKey || FASTER_WHISPER_MODEL);
      const merged = mergeDesktopBundleSummaryWithUpdate(desktopBundleStateMap[modelKey] || {}, payload);
      applyDesktopBundleState(modelKey, merged, {
        lastError: String(payload?.lastError || ""),
      });
      if (payload?.updateAvailable && !payload?.updating) {
        const promptKey = `${String(payload?.remoteVersion || "")}:${String(payload?.localVersion || "")}`;
        if (desktopModelUpdatePromptRef.current !== promptKey) {
          desktopModelUpdatePromptRef.current = promptKey;
          toast.message("发现新的 Bottle 1.0 模型版本，可点击更新");
        }
      }
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [desktopBundleStateMap]);

  useEffect(() => {
    if (!hasDesktopRuntimeBridge()) {
      return undefined;
    }
    let cancelled = false;
    const syncStatus = async () => {
      try {
        const [serverStatus, helperStatus] = await Promise.all([
          window.desktopRuntime.getServerStatus?.(),
          window.desktopRuntime.getHelperStatus?.(),
        ]);
        if (cancelled) return;
        const normalizedServerStatus = normalizeServerStatus(serverStatus);
        const nextHelperStatus = helperStatus || { healthy: false, modelReady: false, modelStatus: "" };
        setDesktopServerStatus(normalizedServerStatus);
        setDesktopHelperStatus(nextHelperStatus);
        setDesktopRuntimeInfo((prev) =>
          prev
            ? {
                ...prev,
                serverStatus: normalizedServerStatus,
                helperStatus: nextHelperStatus,
              }
            : prev,
        );
        setOfflineBannerMessage(getOfflineBannerText(normalizedServerStatus));
      } catch (_) {
        if (!cancelled) {
          setOfflineBannerMessage(typeof navigator !== "undefined" && navigator.onLine === false ? "当前处于离线模式" : "");
        }
      }
    };
    void syncStatus();
    void window.desktopRuntime.probeServerNow?.().catch(() => null);
    const onOnlineChange = () => {
      void syncStatus();
    };
    window.addEventListener("online", onOnlineChange);
    window.addEventListener("offline", onOnlineChange);
    const unsubscribe = window.desktopRuntime.onServerStatusChanged?.((payload) => {
      if (cancelled) return;
      const normalizedServerStatus = normalizeServerStatus(payload);
      setDesktopServerStatus(normalizedServerStatus);
      setDesktopRuntimeInfo((prev) =>
        prev
          ? {
              ...prev,
              serverStatus: normalizedServerStatus,
            }
          : prev,
      );
      setOfflineBannerMessage(getOfflineBannerText(normalizedServerStatus));
    });
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnlineChange);
      window.removeEventListener("offline", onOnlineChange);
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (!desktopRuntimeAvailable) {
      setDiagnosticsDialogOpen(false);
      setDesktopRuntimeInfo(null);
      setDesktopDiagnosticsError("");
      setDesktopDiagnosticsLoading(false);
      return undefined;
    }
    void refreshDesktopDiagnostics({ silent: true });
    const unsubscribe = window.desktopRuntime.onClientUpdateStatusChanged?.((payload) => {
      setDesktopRuntimeInfo((prev) => ({
        ...(prev || {}),
        clientUpdate: payload || {},
      }));
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [desktopRuntimeAvailable]);

  useEffect(() => {
    if (!desktopRuntimeAvailable || !diagnosticsDialogOpen) {
      return;
    }
    void refreshDesktopDiagnostics();
    void window.desktopRuntime.probeServerNow?.().catch(() => null);
  }, [desktopRuntimeAvailable, diagnosticsDialogOpen]);

  useEffect(() => {
    if (!selectedFastModelNeedsPreparation) return undefined;
    if (!selectedServerModelPreparing) return undefined;
    const timer = setInterval(() => {
      void fetchServerModelStatus(selectedUploadModel, { silent: true });
    }, 3000);
    return () => clearInterval(timer);
  }, [selectedFastModelNeedsPreparation, selectedServerModelPreparing, selectedUploadModel]);

  function resetLocalSessionState(options = {}) {
    const { clearFileInput = true } = options;
    const activeDesktopLinkTaskId = desktopLinkTaskIdRef.current || desktopLinkTaskId;
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    if (activeDesktopLinkTaskId && hasDesktopRuntimeBridge()) {
      void requestDesktopLocalHelper(`/api/desktop-asr/url-import/tasks/${encodeURIComponent(activeDesktopLinkTaskId)}/cancel`, "json", {
        method: "POST",
      }).catch(() => null);
    }
    desktopLinkPollTokenRef.current += 1;
    desktopLinkTaskIdRef.current = "";
    setDesktopLinkTaskId("");
    clearLocalStageProgressTimer();
    localRunTokenRef.current += 1;
    if (clearFileInput && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setFile(null);
    setTaskId("");
    setLoading(false);
    setStatus("");
    setDurationSec(null);
    setPhase("idle");
    setCoverDataUrl("");
    setCoverAspectRatio(0);
    setCoverWidth(0);
    setCoverHeight(0);
    setIsVideoSource(false);
    setTaskSnapshot(null);
    setUploadPercent(0);
    setLocalProgressSnapshot(null);
    setStreamingSubtitleDraft(null);
    setBindingCompleted(false);
    setLocalBusyModelKey("");
    setLocalBusyText("");
    setServerBusyModelKey("");
    setServerBusyText("");
    setRestoreBannerMode(RESTORE_BANNER_MODES.NONE);
    successStateOriginRef.current = "none";
  }

  async function persistSession(overrides = {}) {
    const nextFile = overrides.file ?? file;
    const nextTaskId = overrides.taskId ?? taskId;
    const nextPhase = overrides.phase ?? phase;
    const nextMode = overrides.mode ?? mode;
    const nextDesktopSourcePath = resolveDesktopSelectedSourcePath(nextFile);
    const restorablePhase =
      nextPhase === "local_transcribing" || nextPhase === DESKTOP_LOCAL_TRANSCRIBING_PHASE ? (nextFile ? "ready" : "idle") : nextPhase;
    const restorableStatus =
      nextPhase === "local_transcribing" || nextPhase === DESKTOP_LOCAL_TRANSCRIBING_PHASE
        ? getInterruptedLocalAsrStatus(Boolean(nextFile))
        : String(overrides.status ?? status ?? "");
    if (!ownerUserId) return;
    if (!nextFile && !nextTaskId && restorablePhase === "idle") {
      await clearActiveGenerationTask(ownerUserId);
      return;
    }
    await saveActiveGenerationTask(ownerUserId, {
      task_id: nextTaskId,
      phase: restorablePhase,
      task_snapshot: overrides.taskSnapshot ?? taskSnapshot,
      selected_upload_model: String(overrides.selectedUploadModel ?? selectedUploadModel ?? ""),
      file_blob: isBlobBackedSourceFile(nextFile) ? nextFile : null,
      file_name: String(nextFile?.name || ""),
      media_type: String(nextFile?.type || ""),
      file_size_bytes: Math.max(0, Number(nextFile?.size || 0)),
      file_last_modified_ms: Math.max(0, Number(nextFile?.lastModified || 0)),
      desktop_source_path: nextDesktopSourcePath,
      cover_data_url: String(overrides.coverDataUrl ?? coverDataUrl ?? ""),
      cover_width: Number(overrides.coverWidth ?? coverWidth ?? 0),
      cover_height: Number(overrides.coverHeight ?? coverHeight ?? 0),
      aspect_ratio: Number(overrides.aspectRatio ?? coverAspectRatio ?? 0),
      duration_seconds: Number(overrides.durationSec ?? durationSec ?? 0),
      is_video_source: Boolean(overrides.isVideoSource ?? isVideoSource),
      generation_mode: nextMode === "fast" ? "fast" : "balanced",
      upload_percent: Number(overrides.uploadPercent ?? uploadPercent ?? 0),
      status_text: restorableStatus,
      semantic_split_enabled: false,
      binding_completed: Boolean(overrides.bindingCompleted ?? bindingCompleted),
    });
  }

  async function applyTaskViewState({
    nextTaskId = taskId,
    nextTaskSnapshot = taskSnapshot,
    nextPhase = phase,
    nextStatus = status,
    nextUploadPercent = uploadPercent,
    nextLoading = loading,
    nextRestoreBannerMode = restoreBannerMode,
    nextBindingCompleted = bindingCompleted,
    persistState = true,
  } = {}) {
    const normalizedTaskId = String(nextTaskId || "");
    const normalizedStatus = String(nextStatus || "");
    const normalizedUploadPercent = clampPercent(nextUploadPercent);
    const normalizedTaskSnapshot = nextTaskSnapshot ?? null;
    setTaskId(normalizedTaskId);
    setTaskSnapshot(normalizedTaskSnapshot);
    setPhase(nextPhase);
    setStatus(normalizedStatus);
    setLoading(Boolean(nextLoading));
    setUploadPercent(normalizedUploadPercent);
    setRestoreBannerMode(nextRestoreBannerMode);
    setBindingCompleted(Boolean(nextBindingCompleted));
    if (persistState) {
      await persistSession({
        taskId: normalizedTaskId,
        phase: nextPhase,
        taskSnapshot: normalizedTaskSnapshot,
        uploadPercent: normalizedUploadPercent,
        status: normalizedStatus,
        bindingCompleted: Boolean(nextBindingCompleted),
      });
    }
  }

  async function handleTaskFailureState({
    message,
    nextTaskId = taskId,
    nextTaskSnapshot = taskSnapshot,
    nextUploadPercent = uploadPercent,
    nextRestoreBannerMode = restoreBannerMode,
    nextBindingCompleted = bindingCompleted,
    showToast = true,
    refreshWallet = false,
    persistState = true,
  } = {}) {
    desktopBillingReportRef.current = null;
    const normalizedMessage = String(message || "").trim() || "生成失败";
    await applyTaskViewState({
      nextTaskId,
      nextTaskSnapshot,
      nextPhase: "error",
      nextStatus: normalizedMessage,
      nextUploadPercent,
      nextLoading: false,
      nextRestoreBannerMode,
      nextBindingCompleted,
      persistState,
    });
    if (refreshWallet) {
      await onWalletChanged?.();
    }
    if (showToast) {
      toast.error(normalizedMessage);
    }
  }

  async function resetSession() {
    desktopBillingReportRef.current = null;
    resetLocalSessionState();
    setDesktopLinkInput("");
    if (!ownerUserId) return;
    await clearUploadPanelSuccessSnapshot(ownerUserId);
    await clearActiveGenerationTask(ownerUserId);
  }

  async function cancelDesktopLinkImport(options = {}) {
    const { showToast = true } = options;
    const activeTaskId = desktopLinkTaskIdRef.current || desktopLinkTaskId;
    if (!activeTaskId) {
      clearDesktopLinkTaskTracking(true);
      return;
    }
    try {
      await requestDesktopLocalHelper(`/api/desktop-asr/url-import/tasks/${encodeURIComponent(activeTaskId)}/cancel`, "json", {
        method: "POST",
      });
      setStatus("正在取消下载");
      setLoading(true);
      updateDesktopLinkProgressState(uploadPercent, "正在取消下载");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      if (showToast) {
        toast.error(message);
      }
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
    }
  }

  async function pollDesktopLinkImportTask(linkTaskId, pollToken) {
    if (!linkTaskId || pollToken !== desktopLinkPollTokenRef.current) {
      return;
    }
    try {
      const response = await requestDesktopLocalHelper(`/api/desktop-asr/url-import/tasks/${encodeURIComponent(linkTaskId)}`, "json");
      if (pollToken !== desktopLinkPollTokenRef.current) {
        return;
      }
      const payload = response.data || {};
      const nextStatus = String(payload.status || "").trim().toLowerCase();
      const nextMessage = sanitizeUserFacingText(String(payload.status_text || "正在下载素材"));
      setLoading(true);
      setPhase(DESKTOP_LINK_IMPORTING_PHASE);
      setStatus(nextMessage);
      updateDesktopLinkProgressState(Number(payload.progress_percent || 0), nextMessage);

      if (nextStatus === "succeeded") {
        setStatus("素材下载完成，正在载入文件");
        updateDesktopLinkProgressState(100, "素材下载完成，正在载入文件");
        const sourceFile = await loadDesktopImportedSourceFile(payload);
        if (pollToken !== desktopLinkPollTokenRef.current) {
          return;
        }
        clearDesktopLinkTaskTracking(false);
        const selectionMeta = await onSelectFile(sourceFile);
        const sourceDurationSeconds = Number(selectionMeta?.durationSec || payload.duration_seconds || 0);
        const billingAllowed = await ensureDesktopClientBillingAdmission(sourceDurationSeconds);
        if (!billingAllowed) {
          return;
        }
        const runToken = localRunTokenRef.current + 1;
        localRunTokenRef.current = runToken;
        const generationPollToken = startPollingSession();
        await submitDesktopLocalFast(generationPollToken, runToken, sourceFile, sourceDurationSeconds);
        return;
      }

      if (nextStatus === "failed") {
        clearDesktopLinkTaskTracking(false);
        setLocalProgressSnapshot(null);
        await handleTaskFailureState({
          message: nextMessage || String(payload.error_message || "下载链接素材失败"),
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 0,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
          persistState: false,
        });
        return;
      }

      if (nextStatus === "cancelled") {
        clearDesktopLinkTaskTracking(false);
        setLocalProgressSnapshot(null);
        await handleTaskFailureState({
          message: nextMessage || "已取消链接下载，可重新开始。",
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 0,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
          showToast: false,
          persistState: false,
        });
        return;
      }

      setTimeout(() => {
        void pollDesktopLinkImportTask(linkTaskId, pollToken);
      }, 1000);
    } catch (error) {
      if (pollToken !== desktopLinkPollTokenRef.current) {
        return;
      }
      clearDesktopLinkTaskTracking(false);
      setLocalProgressSnapshot(null);
      const message = error instanceof Error && error.message ? error.message : `网络错误: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
    }
  }

  async function submitDesktopLinkImport() {
    if (!desktopRuntimeAvailable) {
      await handleTaskFailureState({
        message: "当前环境不支持桌面端本地 helper，无法使用链接导入。",
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return;
    }
    if (!desktopLinkModeSupported) {
      await handleTaskFailureState({
        message: desktopLinkModeBlockedMessage || "链接导入当前仅支持桌面端 Bottle 1.0 本机运行。",
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return;
    }
    if (!networkOnline) {
      await handleTaskFailureState({
        message: DESKTOP_CLIENT_OFFLINE_MESSAGE,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return;
    }
    if (!trimmedDesktopLinkInput) {
      await handleTaskFailureState({
        message: "请输入公开视频链接",
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return;
    }

    if (ownerUserId) {
      await clearUploadPanelSuccessSnapshot(ownerUserId);
    }
    successStateOriginRef.current = "none";
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    clearLocalStageProgressTimer();
    clearDesktopLinkTaskTracking(true);
    setTaskId("");
    setTaskSnapshot(null);
    setUploadPercent(0);
    setLoading(true);
    setStatus("正在解析链接");
    setPhase(DESKTOP_LINK_IMPORTING_PHASE);
    setBindingCompleted(false);
    updateDesktopLinkProgressState(0, "正在解析链接");

    try {
      const response = await requestDesktopLocalHelper("/api/desktop-asr/url-import/tasks", "json", {
        method: "POST",
        body: { source_url: trimmedDesktopLinkInput },
      });
      const payload = response.data || {};
      const nextTaskId = String(payload.task_id || "");
      if (!nextTaskId) {
        throw new Error("链接下载任务创建成功但缺少 task_id");
      }
      const linkPollToken = desktopLinkPollTokenRef.current || 1;
      desktopLinkTaskIdRef.current = nextTaskId;
      setDesktopLinkTaskId(nextTaskId);
      setStatus(sanitizeUserFacingText(String(payload.status_text || "正在下载素材")));
      updateDesktopLinkProgressState(Number(payload.progress_percent || 0), sanitizeUserFacingText(String(payload.status_text || "正在下载素材")));
      await pollDesktopLinkImportTask(nextTaskId, linkPollToken);
    } catch (error) {
      clearDesktopLinkTaskTracking(false);
      setLocalProgressSnapshot(null);
      const message = error instanceof Error && error.message ? error.message : `网络错误: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
    }
  }

  async function saveSuccessSnapshot(sourceFile, data, nextStatus = "") {
    if (!ownerUserId || !data?.lesson?.id) return;
    await saveUploadPanelSuccessSnapshot(ownerUserId, {
      phase: "success",
      task_snapshot: data,
      selected_upload_model: String(selectedUploadModel || ""),
      file_blob: isBlobBackedSourceFile(sourceFile) ? sourceFile : null,
      file_name: String(sourceFile?.name || data.lesson.source_filename || ""),
      media_type: String(sourceFile?.type || ""),
      file_size_bytes: Math.max(0, Number(sourceFile?.size || 0)),
      file_last_modified_ms: Math.max(0, Number(sourceFile?.lastModified || 0)),
      desktop_source_path: resolveDesktopSelectedSourcePath(sourceFile),
      cover_data_url: String(coverDataUrl || ""),
      cover_width: Number(coverWidth || 0),
      cover_height: Number(coverHeight || 0),
      aspect_ratio: Number(coverAspectRatio || 0),
      duration_seconds: Number(durationSec || 0),
      is_video_source: Boolean(isVideoSource),
      generation_mode: mode === "fast" ? "fast" : "balanced",
      upload_percent: 100,
      status_text: String(nextStatus || status || ""),
      binding_completed: Boolean(bindingCompleted),
    });
  }

  async function restoreSuccessSnapshot(saved) {
    const restoredFile = restoreSavedSourceFile(saved);
    const restoredMode = String(saved?.generation_mode || "").trim().toLowerCase() === "balanced" ? "balanced" : "fast";
    const restoredModelKey = String(saved?.selected_upload_model || configuredDefaultAsrModel || "");
    setFile(restoredFile);
    setTaskId("");
    setLoading(false);
    setStatus(String(saved?.status_text || ""));
    setDurationSec(Number(saved?.duration_seconds || 0) || null);
    setPhase("success");
    setMode(restoredMode);
    setSelectedUploadModel(getDefaultUploadModelKey(restoredModelKey));
    setSelectedBalancedModel(getDefaultBalancedModelKey(restoredModelKey));
    setCoverDataUrl(String(saved?.cover_data_url || ""));
    setCoverWidth(Number(saved?.cover_width || 0));
    setCoverHeight(Number(saved?.cover_height || 0));
    setCoverAspectRatio(Number(saved?.aspect_ratio || 0));
    setIsVideoSource(Boolean(saved?.is_video_source));
    setTaskSnapshot(saved?.task_snapshot || null);
    setUploadPercent(100);
    uploadPersistRef.current.latestPercent = 100;
    setBindingCompleted(Boolean(saved?.binding_completed));
    setLocalBusyModelKey("");
    setLocalBusyText("");
    successStateOriginRef.current = "revisit";
    if (ownerUserId) {
      await clearActiveGenerationTask(ownerUserId);
      await clearUploadPanelSuccessSnapshot(ownerUserId);
    }
  }

  function applyRestoredMediaState(saved, restoredFile) {
    setFile(restoredFile);
    setCoverDataUrl(String(saved?.cover_data_url || ""));
    setCoverWidth(Number(saved?.cover_width || 0));
    setCoverHeight(Number(saved?.cover_height || 0));
    setCoverAspectRatio(Number(saved?.aspect_ratio || 0));
    setDurationSec(Number(saved?.duration_seconds || 0) || null);
    setIsVideoSource(Boolean(saved?.is_video_source));
  }

  async function restorePersistedTaskSnapshot(saved) {
    const restoredFile = restoreSavedSourceFile(saved);
    const restoredMode = String(saved?.generation_mode || "").trim().toLowerCase() === "balanced" ? "balanced" : "fast";
    const restoredModelKey = String(saved?.selected_upload_model || configuredDefaultAsrModel || "");
    const restoredTaskId = String(saved?.task_id || saved?.task_snapshot?.task_id || "");
    const restoredTaskSnapshot = saved?.task_snapshot || null;
    const restoredPhase = String(saved?.phase || "").trim().toLowerCase();
    const restoredStatus = String(saved?.status_text || "").trim();
    const restoredUploadPercent = clampPercent(saved?.upload_percent || 0);
    const restoredBindingCompleted = Boolean(saved?.binding_completed);
    const hasRestoredFile = Boolean(restoredFile);

    applyRestoredMediaState(saved, restoredFile);
    setMode(restoredMode);
    setSelectedUploadModel(getDefaultUploadModelKey(restoredModelKey));
    setSelectedBalancedModel(getDefaultBalancedModelKey(restoredModelKey));
    setLocalProgressSnapshot(null);
    setLocalBusyModelKey("");
    setLocalBusyText("");
    setServerBusyModelKey("");
    setServerBusyText("");
    successStateOriginRef.current = "revisit";
    fallbackToastTaskRef.current = "";

    if (restoredTaskSnapshot?.lesson?.id && String(restoredTaskSnapshot?.status || "").trim().toLowerCase() === "succeeded") {
      if (ownerUserId) {
        await clearActiveGenerationTask(ownerUserId);
      }
      await restoreSuccessSnapshot(saved);
      return;
    }

    if (restoredPhase === "processing" && restoredTaskId) {
      setTaskId(restoredTaskId);
      setTaskSnapshot(restoredTaskSnapshot);
      setPhase("processing");
      setStatus(restoredStatus);
      setLoading(true);
      setUploadPercent(100);
      uploadPersistRef.current.latestPercent = 100;
      setBindingCompleted(restoredBindingCompleted);
      setRestoreBannerMode(RESTORE_BANNER_MODES.VERIFYING);
      await persistSession({
        file: restoredFile,
        taskId: restoredTaskId,
        phase: "processing",
        taskSnapshot: restoredTaskSnapshot,
        selectedUploadModel: getDefaultUploadModelKey(restoredModelKey),
        durationSec: Number(saved?.duration_seconds || 0) || null,
        coverDataUrl: String(saved?.cover_data_url || ""),
        coverWidth: Number(saved?.cover_width || 0),
        coverHeight: Number(saved?.cover_height || 0),
        aspectRatio: Number(saved?.aspect_ratio || 0),
        isVideoSource: Boolean(saved?.is_video_source),
        uploadPercent: 100,
        status: restoredStatus,
        bindingCompleted: restoredBindingCompleted,
      });
      return;
    }

    if ((restoredPhase === "uploading" || restoredPhase === "upload_paused") && hasRestoredFile) {
      const nextStatus = restoredStatus || "上次上传已中断，可继续上传当前素材。";
      setTaskId("");
      setTaskSnapshot(null);
      setPhase("upload_paused");
      setStatus(nextStatus);
      setLoading(false);
      setUploadPercent(restoredUploadPercent);
      uploadPersistRef.current.latestPercent = restoredUploadPercent;
      setBindingCompleted(false);
      setRestoreBannerMode(RESTORE_BANNER_MODES.NONE);
      await persistSession({
        file: restoredFile,
        taskId: "",
        phase: "upload_paused",
        taskSnapshot: null,
        selectedUploadModel: getDefaultUploadModelKey(restoredModelKey),
        durationSec: Number(saved?.duration_seconds || 0) || null,
        coverDataUrl: String(saved?.cover_data_url || ""),
        coverWidth: Number(saved?.cover_width || 0),
        coverHeight: Number(saved?.cover_height || 0),
        aspectRatio: Number(saved?.aspect_ratio || 0),
        isVideoSource: Boolean(saved?.is_video_source),
        uploadPercent: restoredUploadPercent,
        status: nextStatus,
        bindingCompleted: false,
      });
      return;
    }

    setTaskId(restoredTaskId);
    setTaskSnapshot(restoredTaskSnapshot);
    setPhase(hasRestoredFile ? (restoredPhase === "error" ? "error" : "ready") : "idle");
    setStatus(restoredStatus);
    setLoading(false);
    setUploadPercent(restoredPhase === "error" ? restoredUploadPercent : 0);
    uploadPersistRef.current.latestPercent = restoredPhase === "error" ? restoredUploadPercent : 0;
    setBindingCompleted(restoredBindingCompleted);
    setRestoreBannerMode(
      restoredPhase === "error" && restoredTaskId && Boolean(restoredTaskSnapshot?.resume_available)
        ? RESTORE_BANNER_MODES.INTERRUPTED
        : RESTORE_BANNER_MODES.NONE,
    );
    await persistSession({
      file: restoredFile,
      taskId: restoredTaskId,
      phase: hasRestoredFile ? (restoredPhase === "error" ? "error" : "ready") : "idle",
      taskSnapshot: restoredTaskSnapshot,
      selectedUploadModel: getDefaultUploadModelKey(restoredModelKey),
      durationSec: Number(saved?.duration_seconds || 0) || null,
      coverDataUrl: String(saved?.cover_data_url || ""),
      coverWidth: Number(saved?.cover_width || 0),
      coverHeight: Number(saved?.cover_height || 0),
      aspectRatio: Number(saved?.aspect_ratio || 0),
      isVideoSource: Boolean(saved?.is_video_source),
      uploadPercent: restoredPhase === "error" ? restoredUploadPercent : 0,
      status: restoredStatus,
      bindingCompleted: restoredBindingCompleted,
    });
  }

  function persistUploadProgress(nextPercent, sourceFileOverride = undefined) {
    const persistedFile = sourceFileOverride ?? file;
    if (!ownerUserId || !persistedFile) return;
    const normalizedPercent = clampPercent(nextPercent);
    uploadPersistRef.current.latestPercent = normalizedPercent;
    const now = Date.now();
    const elapsed = now - Number(uploadPersistRef.current.lastSavedAt || 0);
    const shouldPersistImmediately =
      uploadPersistRef.current.lastSavedPercent < 0 ||
      normalizedPercent >= 100 ||
      elapsed >= UPLOAD_PROGRESS_PERSIST_INTERVAL_MS;

    clearUploadPersistTimer();

    const flush = () => {
      uploadPersistRef.current.lastSavedAt = Date.now();
      uploadPersistRef.current.lastSavedPercent = normalizedPercent;
      void persistSession({ file: persistedFile, phase: "uploading", uploadPercent: normalizedPercent, status: "" });
    };

    if (shouldPersistImmediately) {
      flush();
      return;
    }

    uploadPersistRef.current.timer = setTimeout(() => {
      uploadPersistRef.current.timer = null;
      flush();
    }, Math.max(80, UPLOAD_PROGRESS_PERSIST_INTERVAL_MS - elapsed));
  }

  async function pauseUpload(nextStatus = "上传已暂停，可继续上传当前素材") {
    stopPollingSession();
    clearUploadPersistTimer();
    const activeAbortController = uploadAbortRef.current;
    uploadAbortRef.current = null;
    activeAbortController?.abort();
    setTaskId("");
    setLoading(false);
    setStatus(nextStatus);
    setPhase("upload_paused");
    setTaskSnapshot(null);
    await persistSession({
      taskId: "",
      phase: "upload_paused",
      taskSnapshot: null,
      uploadPercent: clampPercent(uploadPersistRef.current.latestPercent || uploadPercent),
      status: nextStatus,
      bindingCompleted: false,
    });
  }

  async function clearTaskRuntime(nextStatus = "") {
    desktopBillingReportRef.current = null;
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    clearLocalStageProgressTimer();
    localRunTokenRef.current += 1;
    setTaskId("");
    setLoading(false);
    setStatus(nextStatus);
    setPhase(file ? "ready" : "idle");
    setTaskSnapshot(null);
    setUploadPercent(0);
    setLocalProgressSnapshot(null);
    setBindingCompleted(false);
    setRestoreBannerMode(RESTORE_BANNER_MODES.NONE);
    fallbackToastTaskRef.current = "";
    await persistSession({
      taskId: "",
      phase: file ? "ready" : "idle",
      taskSnapshot: null,
      uploadPercent: 0,
      status: nextStatus,
      bindingCompleted: false,
    });
  }

  async function stopLocalRecognition() {
    if (!localTranscribing) return;
    desktopBillingReportRef.current = null;
    console.debug("[DEBUG] upload.local_asr.stop", {
      fileName: String(file?.name || ""),
      model: selectedBalancedModel,
    });
    stopPollingSession();
    resetUploadPersistState();
    localRunTokenRef.current += 1;
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    clearLocalStageProgressTimer();
    restartLocalWorker("识别已停止", "AbortError");
    setTaskId("");
    setTaskSnapshot(null);
    setLocalProgressSnapshot(null);
    setUploadPercent(0);
    setLoading(false);
    setStatus(LOCAL_RECOGNITION_STOPPED_MESSAGE);
    setPhase(file ? "ready" : "idle");
    setBindingCompleted(false);
    await persistSession({
      taskId: "",
      phase: file ? "ready" : "idle",
      taskSnapshot: null,
      uploadPercent: 0,
      status: LOCAL_RECOGNITION_STOPPED_MESSAGE,
      bindingCompleted: false,
    });
    toast.success("已停止生成");
  }

  async function copyTaskDebugReport(targetTaskId = taskId) {
    const normalizedTaskId = String(targetTaskId || "").trim();
    if (!normalizedTaskId) {
      toast.error("当前没有可复制的任务排错信息");
      return;
    }
    try {
      const resp = await api(`/api/lessons/tasks/${normalizedTaskId}/debug-report`, {}, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        toast.error(toErrorText(data, "获取排错信息失败"));
        return;
      }
      const reportText = String(data?.report_text || "").trim();
      if (!reportText) {
        toast.error("当前任务暂无可复制的排错信息");
        return;
      }
      if (!navigator?.clipboard?.writeText) {
        toast.error("当前浏览器不支持直接复制，请换用桌面端 Chrome 或 Edge");
        return;
      }
      await navigator.clipboard.writeText(reportText);
      toast.success("已复制排错信息，可直接粘贴给编程 AI");
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "复制排错信息失败");
    }
  }

  async function finalizeSuccess(data, sourceFile = file, silentToast = false) {
    resetUploadPersistState();
    clearLocalStageProgressTimer();
    localRunAbortRef.current = null;
    setLocalProgressSnapshot(null);
    setStreamingSubtitleDraft(buildSubtitleDraftSnapshotFromTask(data));
    let mediaPersisted = false;
    let mediaPreview = null;
    const partialSuccess = String(data?.completion_kind || "full").toLowerCase() === "partial";
    const successMessages = [];
    if (String(data?.result_message || data?.message || "").trim()) {
      successMessages.push(String(data.result_message || data.message).trim());
    }
    if (data.lesson?.id && isBlobBackedSourceFile(sourceFile) && data.lesson.media_storage === "client_indexeddb" && !bindingCompleted) {
      try {
        await requestPersistentStorage();
        await saveLessonMedia(data.lesson.id, sourceFile, { coverDataUrl, coverWidth, coverHeight, aspectRatio: coverAspectRatio });
        mediaPreview = await getLessonMediaPreview(data.lesson.id);
        mediaPersisted = Boolean(mediaPreview?.hasMedia);
      } catch (_) {
        mediaPreview = { lessonId: Number(data.lesson.id || 0), hasMedia: false, mediaType: String(sourceFile?.type || ""), coverDataUrl, aspectRatio: coverAspectRatio, fileName: String(sourceFile?.name || data.lesson.source_filename || "") };
      }
    }
    if (data.lesson?.media_storage === "client_indexeddb" && !mediaPersisted) {
      successMessages.push("课程已生成，但当前浏览器未保存视频，请在历史记录中恢复视频后再开始学习。");
    }
    const successMessage = successMessages.join(" ");
    setTaskSnapshot(data);
    setPhase("success");
    setStatus(successMessage);
    setLoading(false);
    setRestoreBannerMode(RESTORE_BANNER_MODES.NONE);
    maybeShowModelFallbackToast(data);
    setBindingCompleted(Boolean(mediaPersisted || data.lesson?.media_storage !== "client_indexeddb"));
    successStateOriginRef.current = "live";
    if (ownerUserId) {
      await clearActiveGenerationTask(ownerUserId);
      await saveSuccessSnapshot(sourceFile, data, successMessage);
    }
    await syncDesktopClientBillingAfterSuccess(data);
    if (data.lesson) await onCreated?.({ lesson: data.lesson, mediaPreview, mediaPersisted });
    if (!silentToast) {
      if (partialSuccess || successMessage) {
        toast.warning(successMessage || "课程已生成，但翻译阶段存在失败，可先使用原文字幕学习。");
      } else {
        toast.success("课程已生成");
      }
    }
  }

  async function pollTask(nextTaskId, silentToast = false, pollToken = pollTokenRef.current) {
    if (!nextTaskId || pollingAbortRef.current || pollToken !== pollTokenRef.current) return;
    try {
      const resp = await api(`/api/lessons/tasks/${nextTaskId}`, {}, accessToken);
      const data = await parseResponse(resp);
      if (pollingAbortRef.current || pollToken !== pollTokenRef.current) return;
      pollFailureCountRef.current = 0;
      if (!resp.ok) {
        if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING) {
          const nextStatus = "上次生成记录已失效，可重新开始或清空这次记录。";
          await applyTaskViewState({
            nextTaskId: "",
            nextTaskSnapshot: null,
            nextPhase: file ? "ready" : "idle",
            nextStatus,
            nextUploadPercent: 0,
            nextLoading: false,
            nextRestoreBannerMode: RESTORE_BANNER_MODES.STALE,
            nextBindingCompleted: false,
          });
          return;
        }
        const message = toErrorText(data, "查询任务失败");
        await handleTaskFailureState({
          message,
          nextTaskId,
          nextTaskSnapshot: taskSnapshot,
          nextUploadPercent: uploadPercent,
          showToast: !silentToast,
        });
        return;
      }
      const resolvedTaskId = String(data.task_id || nextTaskId);
      maybeShowModelFallbackToast(data);
      const taskStatus = String(data.status || "").toLowerCase();
      let nextRestoreMode = restoreBannerMode;
      if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING) {
        if (ACTIVE_SERVER_TASK_STATUSES.has(taskStatus)) {
          nextRestoreMode = RESTORE_BANNER_MODES.NONE;
        } else if (RECOVERABLE_SERVER_TASK_STATUSES.has(taskStatus)) {
          nextRestoreMode = RESTORE_BANNER_MODES.INTERRUPTED;
        } else if (taskStatus === "failed") {
          nextRestoreMode = RESTORE_BANNER_MODES.STALE;
        }
      }
      if (taskStatus === "succeeded") {
        setTaskId(resolvedTaskId);
        setTaskSnapshot(data);
        await finalizeSuccess(data, file, silentToast);
        return;
      }
      if (taskStatus === "paused" || taskStatus === "terminated") {
        const nextPhase = file ? "ready" : "idle";
        const nextStatus = String(data.current_text || data.message || "");
        resetUploadPersistState();
        await applyTaskViewState({
          nextTaskId: resolvedTaskId,
          nextTaskSnapshot: data,
          nextPhase,
          nextStatus,
          nextUploadPercent: 100,
          nextLoading: false,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.INTERRUPTED,
        });
        return;
      }
      if (taskStatus === "failed") {
        if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING && !Boolean(data.resume_available)) {
          const nextStatus = "上次生成记录已失效，可重新开始或清空这次记录。";
          await applyTaskViewState({
            nextTaskId: "",
            nextTaskSnapshot: null,
            nextPhase: file ? "ready" : "idle",
            nextStatus,
            nextUploadPercent: 0,
            nextLoading: false,
            nextRestoreBannerMode: RESTORE_BANNER_MODES.STALE,
            nextBindingCompleted: false,
          });
          return;
        }
        const message = `${data.error_code || "ERROR"}: ${data.message || "生成失败"}`;
        await handleTaskFailureState({
          message,
          nextTaskId: resolvedTaskId,
          nextTaskSnapshot: data,
          nextUploadPercent: 100,
          nextRestoreBannerMode: nextRestoreMode,
          showToast: !silentToast,
          refreshWallet: true,
        });
        return;
      }
      resetUploadPersistState();
      await applyTaskViewState({
        nextTaskId: resolvedTaskId,
        nextTaskSnapshot: data,
        nextPhase: "processing",
        nextStatus: String(data.current_text || ""),
        nextUploadPercent: 100,
        nextLoading: true,
        nextRestoreBannerMode: nextRestoreMode,
      });
      setTimeout(() => void pollTask(nextTaskId, silentToast, pollToken), 1000);
    } catch (error) {
      if (pollingAbortRef.current || pollToken !== pollTokenRef.current || error?.name === "AbortError") return;
      if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING) {
        const nextStatus = "检查上次任务状态失败，可重新开始或稍后重试。";
        await applyTaskViewState({
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextPhase: file ? "ready" : "idle",
          nextStatus,
          nextUploadPercent: 0,
          nextLoading: false,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.STALE,
          nextBindingCompleted: false,
        });
        return;
      }
      const retryCount = pollFailureCountRef.current + 1;
      pollFailureCountRef.current = retryCount;
      if (retryCount <= POLL_RETRY_LIMIT) {
        const retryMessage = `网络波动，正在重试任务状态（${retryCount}/${POLL_RETRY_LIMIT}）`;
        await applyTaskViewState({
          nextTaskId,
          nextTaskSnapshot: taskSnapshot,
          nextPhase: "processing",
          nextStatus: retryMessage,
          nextUploadPercent: 100,
          nextLoading: true,
        });
        if (!silentToast && retryCount === 1) {
          toast.warning("网络波动，正在重试任务状态");
        }
        setTimeout(() => void pollTask(nextTaskId, true, pollToken), POLL_RETRY_DELAY_MS * retryCount);
        return;
      }
      pollFailureCountRef.current = 0;
      const message = "网络波动，任务状态暂时无法更新，可稍后继续查询或免上传继续生成。";
      const nextPhase = file ? "ready" : "idle";
      await applyTaskViewState({
        nextTaskId,
        nextTaskSnapshot: taskSnapshot,
        nextPhase,
        nextStatus: message,
        nextUploadPercent: 100,
        nextLoading: false,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.INTERRUPTED,
      });
      if (!silentToast) toast.warning(message);
    }
  }

  useEffect(() => {
    if (!isActivePanel) return undefined;
    const initKey = ownerUserId > 0 ? `user:${ownerUserId}` : accessToken ? "authed" : "guest";
    if (freshEntryInitKeyRef.current === initKey) return undefined;
    freshEntryInitKeyRef.current = initKey;
    let canceled = false;

    async function restorePersistedSession() {
      resetLocalSessionState();
      if (!ownerUserId) return;
      try {
        const [savedSuccessSnapshot, savedTaskSnapshot] = await Promise.all([
          getUploadPanelSuccessSnapshot(ownerUserId),
          getActiveGenerationTask(ownerUserId),
        ]);
        if (canceled) return;
        if (savedSuccessSnapshot?.task_snapshot?.lesson?.id) {
          await restoreSuccessSnapshot(savedSuccessSnapshot);
          return;
        }
        if (savedTaskSnapshot) {
          await restorePersistedTaskSnapshot(savedTaskSnapshot);
        }
      } catch (error) {
        if (canceled) return;
        const message = error instanceof Error && error.message ? error.message : String(error);
        toast.warning(`恢复上次上传状态失败: ${message}`);
      }
    }

    void restorePersistedSession();
    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isActivePanel, ownerUserId]);

  useEffect(() => {
    if (!isActivePanel || !accessToken || restoreBannerMode !== RESTORE_BANNER_MODES.VERIFYING || !taskId) {
      restoreVerificationTaskRef.current = "";
      return;
    }
    if (restoreVerificationTaskRef.current === taskId) return;
    restoreVerificationTaskRef.current = taskId;
    const pollToken = startPollingSession();
    void pollTask(taskId, true, pollToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isActivePanel, restoreBannerMode, taskId]);

  async function onSelectFile(nextFile) {
    const resolvedFile = attachDesktopSourcePath(nextFile, resolveDesktopSelectedSourcePath(nextFile));
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    clearDesktopLinkTaskTracking(true);
    clearLocalStageProgressTimer();
    localRunTokenRef.current += 1;
    if (ownerUserId) {
      await clearUploadPanelSuccessSnapshot(ownerUserId);
    }
    setFile(resolvedFile);
    setTaskId("");
    setLoading(false);
    setStatus("");
    setDurationSec(null);
    setTaskSnapshot(null);
    setCoverDataUrl("");
    setCoverAspectRatio(0);
    setCoverWidth(0);
    setCoverHeight(0);
    setIsVideoSource(false);
    setUploadPercent(0);
    uploadPersistRef.current.latestPercent = 0;
    setLocalProgressSnapshot(null);
    setBindingCompleted(false);
    setLocalBusyModelKey("");
    setLocalBusyText("");
    successStateOriginRef.current = "none";
    if (!resolvedFile) {
      setPhase("idle");
      if (ownerUserId) {
        await clearActiveGenerationTask(ownerUserId);
      }
      return { durationSec: null, isVideoSource: false };
    }
    setPhase("probing");
    const nextIsVideoSource = String(resolvedFile.type || "").startsWith("video/");
    try {
      const [seconds, cover] = await Promise.all([
        readMediaDurationSeconds(resolvedFile, resolvedFile.name || ""),
        extractMediaCoverPreview(resolvedFile, resolvedFile.name || ""),
      ]);
      setDurationSec(seconds);
      setCoverDataUrl(String(cover.coverDataUrl || ""));
      setCoverWidth(Number(cover.width || 0));
      setCoverHeight(Number(cover.height || 0));
      setCoverAspectRatio(Number(cover.aspectRatio || 0));
      setIsVideoSource(nextIsVideoSource);
      setPhase("ready");
      await persistSession({
        file: resolvedFile,
        phase: "ready",
        durationSec: seconds,
        coverDataUrl: cover.coverDataUrl,
        coverWidth: cover.width,
        coverHeight: cover.height,
        aspectRatio: cover.aspectRatio,
        isVideoSource: nextIsVideoSource,
      });
      return { durationSec: seconds, isVideoSource: nextIsVideoSource };
    } catch (_) {
      setPhase("ready");
      setIsVideoSource(nextIsVideoSource);
      await persistSession({ file: resolvedFile, phase: "ready", isVideoSource: nextIsVideoSource });
      return { durationSec: null, isVideoSource: nextIsVideoSource };
    }
  }

  async function handleSourceFileInputChange(nextFile) {
    const pickerAction = filePickerActionRef.current;
    filePickerActionRef.current = FILE_PICKER_ACTION_SELECT;
    const selectionMeta = await onSelectFile(nextFile);
    if (nextFile && pickerAction === FILE_PICKER_ACTION_DESKTOP_LOCAL_GENERATE) {
      await submit({
        sourceFile: nextFile,
        submitIntent: FILE_PICKER_ACTION_DESKTOP_LOCAL_GENERATE,
      });
    }
    return selectionMeta;
  }

  async function fetchDesktopModelUpdate(modelKey, options = {}) {
    const { silent = false } = options;
    if (!hasDesktopModelUpdateBridge() || modelKey !== FASTER_WHISPER_MODEL) {
      return null;
    }
    try {
      return await checkDesktopModelUpdate(modelKey);
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error && error.message ? error.message : String(error));
      }
      return null;
    }
  }

  function mergeDesktopBundleSummaryWithUpdate(summary, updateState) {
    if (!updateState || typeof updateState !== "object") {
      return summary;
    }
    const totalFiles = Math.max(0, Number(updateState.totalFiles || 0));
    const completedFiles = Math.max(0, Number(updateState.completedFiles || 0));
    const currentFile = String(updateState.currentFile || "");
    const updating = Boolean(updateState.updating);
    const updateAvailable = Boolean(updateState.updateAvailable);
    const message =
      String(updateState.message || "").trim() ||
      (updating
        ? currentFile
          ? `正在更新 ${currentFile}（${completedFiles}/${Math.max(totalFiles, 1)}）`
          : "正在更新 Bottle 1.0 本机模型"
        : updateAvailable
          ? "发现新的 Bottle 1.0 模型版本，可立即更新"
          : String(summary?.message || ""));
    return {
      ...(summary || {}),
      updateAvailable,
      updating,
      cancellable: Boolean(updateState.cancellable),
      localVersion: String(updateState.localVersion || ""),
      remoteVersion: String(updateState.remoteVersion || ""),
      totalFiles,
      completedFiles,
      currentFile,
      message,
      lastError: String(updateState.lastError || summary?.lastError || ""),
    };
  }

  async function fetchDesktopBundleStatus(modelKey, options = {}) {
    const { silent = false } = options;
    if (!hasDesktopRuntimeBridge() || modelKey !== FASTER_WHISPER_MODEL) {
      return null;
    }
    try {
      const [summary, updateState] = await Promise.all([
        getDesktopBundledAsrModelSummary(modelKey),
        fetchDesktopModelUpdate(modelKey, { silent: true }),
      ]);
      const mergedSummary = mergeDesktopBundleSummaryWithUpdate(summary, updateState);
      applyDesktopBundleState(modelKey, mergedSummary, { lastError: "" });
      return mergedSummary;
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateDesktopBundleState(modelKey, {
        available: false,
        installAvailable: false,
        sourceAvailable: false,
        updateAvailable: false,
        updating: false,
        message: "",
        lastError: message,
      });
      if (!silent) {
        toast.error(message);
      }
      return null;
    }
  }

  async function handleDesktopBundleModelUpdate(modelKey) {
    if (!hasDesktopModelUpdateBridge() || modelKey !== FASTER_WHISPER_MODEL) {
      return;
    }
    setDesktopBundleBusyModelKey(modelKey);
    updateDesktopBundleState(modelKey, {
      lastError: "",
      updating: true,
      cancellable: true,
      message: "正在更新 Bottle 1.0 本机模型",
    });
    try {
      const payload = await startDesktopModelUpdate(modelKey);
      applyDesktopBundleState(modelKey, mergeDesktopBundleSummaryWithUpdate(desktopBundleStateMap[modelKey] || {}, payload), {
        lastError: "",
      });
      if (!payload?.updating) {
        toast.success(payload?.message || "Bottle 1.0 本机模型已更新");
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateDesktopBundleState(modelKey, {
        updating: false,
        cancellable: false,
        lastError: message,
        message: "模型更新失败，已回滚到上一版本",
      });
      toast.error(message);
    } finally {
      setDesktopBundleBusyModelKey("");
    }
  }

  async function handleCancelDesktopBundleModelUpdate(modelKey) {
    if (!hasDesktopModelUpdateBridge() || modelKey !== FASTER_WHISPER_MODEL) {
      return;
    }
    try {
      const payload = await cancelDesktopModelUpdate();
      applyDesktopBundleState(modelKey, mergeDesktopBundleSummaryWithUpdate(desktopBundleStateMap[modelKey] || {}, payload), {
        lastError: "",
      });
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : String(error));
    }
  }

  async function fetchServerModelStatus(modelKey, options = {}) {
    const { silent = false } = options;
    try {
      const resp = await api(`${ASR_MODELS_API_BASE}/${encodeURIComponent(modelKey)}/status`, { method: "GET" }, accessToken);
      const payload = await parseResponse(resp);
      if (!resp.ok) {
        throw new Error(toErrorText(payload, "检查模型状态失败"));
      }
      setAsrModelCatalogMap((prev) => buildAsrModelCatalogMap([...(Object.values(prev || {})), payload]));
      applyServerModelState(modelKey, payload);
      return payload;
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateServerModelState(modelKey, {
        status: "error",
        lastError: message,
      });
      if (!silent) {
        toast.error(message);
      }
      return null;
    }
  }

  async function handleDesktopBundlePrepare(modelKey) {
    if (!hasDesktopRuntimeBridge() || modelKey !== FASTER_WHISPER_MODEL) {
      return;
    }
    setDesktopBundleBusyModelKey(modelKey);
    updateDesktopBundleState(modelKey, {
      lastError: "",
      message: "正在准备桌面端本机 Bottle 1.0 资源",
    });
    try {
      const summary = await installDesktopBundledAsrModel(modelKey);
      applyDesktopBundleState(modelKey, summary, { lastError: "" });
      toast.success(summary.available ? "桌面端本机 Bottle 1.0 已就绪" : "桌面端本机资源已更新");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateDesktopBundleState(modelKey, {
        lastError: message,
        message: "",
      });
      toast.error(message);
    } finally {
      setDesktopBundleBusyModelKey("");
    }
  }

  function handleSelectUploadModelCard(modelKey) {
    const nextModelMeta = getUploadModelMeta(modelKey);
    setSelectedUploadModel(nextModelMeta.key);
    setMode(nextModelMeta.mode);
    if (SERVER_PREPARABLE_MODELS.has(nextModelMeta.key)) {
      void fetchServerModelStatus(nextModelMeta.key, { silent: true });
      void fetchDesktopBundleStatus(nextModelMeta.key, { silent: true });
    }
  }

  function handleSelectFasterWhisperRuntimeTrack(nextTrack) {
    let normalizedTrack = FAST_RUNTIME_TRACK_CLOUD;
    if (nextTrack === FAST_RUNTIME_TRACK_DESKTOP_LOCAL) {
      normalizedTrack = FAST_RUNTIME_TRACK_DESKTOP_LOCAL;
    } else if (nextTrack === FAST_RUNTIME_TRACK_BROWSER_LOCAL) {
      normalizedTrack = FAST_RUNTIME_TRACK_BROWSER_LOCAL;
    }
    fasterWhisperTrackTouchedRef.current = true;
    setFasterWhisperRuntimeTrack(normalizedTrack);
    if (normalizedTrack === FAST_RUNTIME_TRACK_CLOUD) {
      void fetchServerModelStatus(FASTER_WHISPER_MODEL, { silent: true });
      return;
    }
    if (normalizedTrack === FAST_RUNTIME_TRACK_DESKTOP_LOCAL && hasDesktopRuntimeBridge()) {
      void fetchDesktopBundleStatus(FASTER_WHISPER_MODEL, { silent: true });
    }
  }

  async function handleServerModelPrepare(modelKey) {
    setServerBusyModelKey(modelKey);
    setServerBusyText("模型预热中");
    updateServerModelState(modelKey, {
      status: "preparing",
      preparing: true,
      lastError: "",
      message: "模型预热中",
    });
    try {
      const resp = await api(`${ASR_MODELS_API_BASE}/${encodeURIComponent(modelKey)}/prepare`, { method: "POST" }, accessToken);
      const payload = await parseResponse(resp);
      if (!resp.ok) {
        throw new Error(toErrorText(payload, "准备模型失败"));
      }
      applyServerModelState(modelKey, payload);
      if (!payload?.preparing) {
        await fetchServerModelStatus(modelKey, { silent: true });
      }
      toast.success(Boolean(payload?.preparing) ? "模型预热中" : "模型已就绪");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateServerModelState(modelKey, {
        status: "error",
        preparing: false,
        lastError: message,
      });
      toast.error(message);
    } finally {
      setServerBusyModelKey("");
      setServerBusyText("");
    }
  }

  async function handleLocalModelDownload(modelKey) {
    if (!isLocalBalancedModelUploadEnabled(modelKey)) {
      toast.error(getLocalBalancedModelUnavailableReason(modelKey) || "当前模型暂未开放");
      return;
    }
    if (!localAsrSupport.supported) {
      toast.error(sanitizeUserFacingText(localAsrSupport.reason || "当前浏览器暂不支持这个模型"));
      return;
    }
    if (!localWorkerReady) {
      toast.error("识别组件正在初始化，请稍后再试");
      return;
    }
    setLocalBusyModelKey(modelKey);
    setLocalBusyText("正在检查并下载模型");
    updateLocalModelState(modelKey, { status: "loading", progress: null, error: "", message: "" });
    try {
      const verification = await ensureLocalAsrModel(modelKey, LOCAL_ASR_ASSET_BASE_URL, {
        webgpuSupported: localAsrSupport.webgpuSupported,
        requestPersistentStorage,
        onProgress: (progress) => {
          updateLocalModelState(modelKey, {
            status: "loading",
            progress: Number.isFinite(Number(progress?.overallProgress)) ? clampPercent(progress.overallProgress) : null,
            error: "",
          });
          setLocalBusyText(sanitizeUserFacingText(progress?.statusText || "正在下载模型"));
        },
      });
      releaseLocalAsrWorkerAssetPayload(modelKey);
      const result = await createWorkerRequest("load-model", modelKey);
      const runtime = String(result?.runtime || "");
      applyVerifiedLocalModelState(modelKey, verification, { status: "ready", runtime, progress: 100, error: "", message: verification.message });
      setSelectedBalancedModel(modelKey);
      toast.success("模型已准备好");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateLocalModelState(modelKey, { status: "error", progress: null, error: message, message });
      toast.error(message);
    } finally {
      setLocalBusyModelKey("");
      setLocalBusyText("");
    }
  }

  async function handleLocalModelRemove(modelKey) {
    if (!isLocalBalancedModelUploadEnabled(modelKey)) {
      toast.error(getLocalBalancedModelUnavailableReason(modelKey) || "当前模型暂未开放");
      return;
    }
    if (!localWorkerReady) {
      toast.error("识别组件正在初始化，请稍后再试");
      return;
    }
    setLocalBusyModelKey(modelKey);
    setLocalBusyText("正在卸载模型");
    updateLocalModelState(modelKey, { status: "removing", error: "" });
    try {
      await createWorkerRequest("dispose-model", modelKey).catch(() => null);
      const verification = await removeLocalAsrModel(modelKey, LOCAL_ASR_ASSET_BASE_URL);
      applyVerifiedLocalModelState(modelKey, verification, { status: verification.status, runtime: "", progress: null });
      toast.success("模型已卸载");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateLocalModelState(modelKey, { status: "error", progress: null, error: message, message });
      toast.error(`卸载失败: ${message}`);
    } finally {
      setLocalBusyModelKey("");
      setLocalBusyText("");
    }
  }

  async function handleUseBrowserCache(modelKey) {
    setLocalBusyModelKey(modelKey);
    setLocalBusyText("正在切换为浏览器缓存");
    try {
      const verification = await switchLocalAsrStorageMode(modelKey, LOCAL_ASR_STORAGE_MODE_BROWSER, LOCAL_ASR_ASSET_BASE_URL);
      applyVerifiedLocalModelState(modelKey, verification, { progress: verification.ready ? 100 : null });
      toast.success("已切换为浏览器持久缓存");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateLocalModelState(modelKey, { status: "error", progress: null, error: message, message });
      toast.error(message);
    } finally {
      setLocalBusyModelKey("");
      setLocalBusyText("");
    }
  }

  async function handleBindLocalDirectory(modelKey) {
    if (!localDirectoryBindingAvailable) {
      toast.error("当前浏览器不支持选择本地目录");
      return;
    }
    setLocalBusyModelKey(modelKey);
    setLocalBusyText("正在绑定本地目录");
    try {
      const verification = await bindLocalAsrModelDirectory(modelKey, LOCAL_ASR_ASSET_BASE_URL);
      applyVerifiedLocalModelState(modelKey, verification, { progress: verification.ready ? 100 : null });
      toast.success("目录已绑定，接下来下载会写入该目录");
    } catch (error) {
      if (String(error?.name || "") === "AbortError") {
        toast.error("已取消目录选择");
      } else {
        const message = error instanceof Error && error.message ? error.message : String(error);
        updateLocalModelState(modelKey, { status: "error", progress: null, error: message, message });
        toast.error(message);
      }
    } finally {
      setLocalBusyModelKey("");
      setLocalBusyText("");
    }
  }

  async function persistCompletedLocalLesson({
    asrModel,
    runtimeKind,
    sourceFilename,
    sourceDurationMs,
    asrPayload,
    localGenerationResult,
  }) {
    const resp = await api(
      "/api/lessons/local-asr/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asr_model: asrModel,
          source_filename: sourceFilename,
          source_duration_ms: Math.max(1, Number(sourceDurationMs || 0) || 1),
          runtime_kind: runtimeKind,
          asr_payload: {
            ...(asrPayload && typeof asrPayload === "object" ? asrPayload : {}),
            __local_generation_result__: localGenerationResult && typeof localGenerationResult === "object" ? localGenerationResult : {},
          },
        }),
      },
      accessToken,
    );
    const data = await parseResponse(resp);
    if (!resp.ok) {
      throw new Error(toErrorText(data, "保存本地生成课程失败"));
    }
    return data;
  }

  async function submitBrowserLocalFast(sourceFile = file) {
    if (!browserLocalRuntimeApi || !browserLocalRuntimeAvailable) {
      await handleTaskFailureState({
        message: browserLocalRuntimeBlockedMessage,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return;
    }

    const startStatus = "正在通过本地网站 Bottle 1.0 识别字幕";
    setPhase("local_transcribing");
    setStatus(startStatus);
    setTaskId("");
    setTaskSnapshot(null);
    setUploadPercent(0);
    setLocalProgressSnapshot(null);
    setStreamingSubtitleDraft(null);
    await persistSession({
      file: sourceFile,
      taskId: "",
      phase: "local_transcribing",
      taskSnapshot: null,
      uploadPercent: 0,
      status: startStatus,
      bindingCompleted: false,
    });

    try {
      const form = new FormData();
      form.append("video_file", sourceFile);
      form.append("model_key", FASTER_WHISPER_MODEL);
      form.append("runtime_kind", FAST_RUNTIME_TRACK_BROWSER_LOCAL);
      const { ok, data } = await uploadWithProgress(
        "/api/desktop-asr/transcribe-upload",
        {
          method: "POST",
          body: form,
          onUploadProgress: ({ percent }) => {
            const nextPercent = clampPercent(Math.round(Number(percent || 0) * 0.35));
            setUploadPercent(nextPercent);
            setStatus(nextPercent > 5 ? "正在把素材发给本地网站运行时" : startStatus);
          },
        },
        "",
        LOCAL_BROWSER_RUNTIME_BASE_URL,
      );
      if (!ok) {
        throw new Error(toErrorText(data, "本地网站 Bottle 1.0 字幕识别失败"));
      }
      const localResult = data || {};
      const localSentences = localResult?.asr_result_json?.transcripts?.[0]?.sentences;
      if (!Array.isArray(localSentences) || localSentences.length === 0) {
        throw new Error("本地网站 Bottle 1.0 未识别出可用字幕，请改用云端运行或更换素材。");
      }
      setStreamingSubtitleDraft(
        buildSubtitleDraftSnapshotFromAsrPayload(localResult?.asr_result_json, { title: "生成中的字幕草稿", source: "browser_local_asr" }),
      );
      setUploadPercent(100);
      const createTaskAbortController = new AbortController();
      localRunAbortRef.current = createTaskAbortController;
      const resp = await api(
        "/api/lessons/tasks/local-asr",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: createTaskAbortController.signal,
          body: JSON.stringify({
            asr_model: FASTER_WHISPER_MODEL,
            source_filename: String(sourceFile?.name || localResult?.source_filename || "browser-local-source"),
            source_duration_ms: Math.max(1, Number(localResult?.source_duration_ms || 0) || Math.round(Number(durationSec || 0) * 1000) || 1),
            runtime_kind: FAST_RUNTIME_TRACK_BROWSER_LOCAL,
            asr_payload: localResult?.asr_result_json || {},
          }),
        },
        accessToken,
      );
      localRunAbortRef.current = null;
      const taskData = await parseResponse(resp);
      if (!resp.ok) {
        const message = getCloudFailureMessage(toErrorText(taskData, "创建识别任务失败"), desktopServerStatus);
        await handleTaskFailureState({
          message,
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 100,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
          refreshWallet: true,
        });
        return;
      }
      const nextTaskId = String(taskData?.task_id || "");
      if (!nextTaskId) {
        throw new Error("任务创建成功但缺少 task_id");
      }
      const pendingText = String(taskData?.admission?.state || "").trim().toLowerCase() === "queued" ? "本地字幕已提交，正在排队生成课程" : "本地字幕已提交，正在生成课程";
      const pendingTaskSnapshot = {
        task_id: nextTaskId,
        status: "pending",
        current_text: pendingText,
        workspace: taskData?.workspace || null,
      };
      setTaskId(nextTaskId);
      setTaskSnapshot(pendingTaskSnapshot);
      setLocalProgressSnapshot(null);
      setStreamingSubtitleDraft(null);
      setPhase("processing");
      setLoading(true);
      setStatus(pendingText);
      await persistSession({
        taskId: nextTaskId,
        phase: "processing",
        taskSnapshot: pendingTaskSnapshot,
        uploadPercent: 100,
        status: pendingText,
        bindingCompleted: false,
      });
      const nextPollToken = startPollingSession();
      void pollTask(nextTaskId, false, nextPollToken);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : `网络错误: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
    }
  }

  async function submitDesktopLocalFast(pollToken, runToken, sourceFile = file, sourceDurationSec = durationSec) {
    if (!hasDesktopRuntimeBridge()) {
      await handleTaskFailureState({
        message: "当前环境不支持 Bottle 1.0 本机运行，请改用云端运行。",
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
      return;
    }

    const currentBundleState = desktopBundleStateMap[FASTER_WHISPER_MODEL] || {};
    let bundleSummary = currentBundleState;
    if (!bundleSummary?.available) {
      bundleSummary = (await fetchDesktopBundleStatus(FASTER_WHISPER_MODEL, { silent: true })) || currentBundleState;
    }
    if (!bundleSummary?.available) {
      const message = bundleSummary?.installAvailable
        ? "Bottle 1.0 本机资源未就绪，请先点“准备本机资源”。"
        : "当前安装包未提供可用的 Bottle 1.0 本机资源，请改用云端运行。";
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return;
    }

    const startStatus = "正在通过本机 Bottle 1.0 识别字幕";
    desktopBillingReportRef.current = {
      modelName: FASTER_WHISPER_MODEL,
      runtimeKind: FAST_RUNTIME_TRACK_DESKTOP_LOCAL,
      sourceDurationSec: Math.max(0, Number(sourceDurationSec || durationSec || 0)),
    };
    setPhase(DESKTOP_LOCAL_TRANSCRIBING_PHASE);
    setStatus(startStatus);
    setTaskId("");
    setTaskSnapshot(null);
    setUploadPercent(0);
    setLocalProgressSnapshot(null);
    setStreamingSubtitleDraft(null);
    startLocalAsrVisualProgress(runToken, startStatus, sourceDurationSec || 0);
    await persistSession({
      file: sourceFile,
      taskId: "",
      phase: DESKTOP_LOCAL_TRANSCRIBING_PHASE,
      taskSnapshot: null,
      uploadPercent: 0,
      status: startStatus,
      durationSec: sourceDurationSec,
      bindingCompleted: false,
    });

    try {
      const localResult = await transcribeDesktopLocalAsr(FASTER_WHISPER_MODEL, sourceFile);
      if (runToken !== localRunTokenRef.current) return;
      clearLocalStageProgressTimer();
      setStreamingSubtitleDraft(
        buildSubtitleDraftSnapshotFromAsrPayload(localResult?.asrPayload, { title: "生成中的字幕草稿", source: "desktop_local_asr" }),
      );
      const localSentences = localResult?.asrPayload?.transcripts?.[0]?.sentences;
      if (!Array.isArray(localSentences) || localSentences.length === 0) {
        throw new Error("当前本机 Bottle 1.0 未识别出可用字幕，请改用云端运行或更换素材。");
      }
      const sentenceCount = localSentences.length;
      setLocalProgress("asr_transcribe", "completed", 1, `本机识别完成，共 ${sentenceCount} 段字幕`, {
        asr_done: sentenceCount,
        asr_estimated: sentenceCount,
        translate_done: 0,
        translate_total: 0,
        segment_done: sentenceCount,
        segment_total: sentenceCount,
      });
      const createTaskAbortController = new AbortController();
      localRunAbortRef.current = createTaskAbortController;
      const resp = await api(
        "/api/lessons/tasks/local-asr",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: createTaskAbortController.signal,
          body: JSON.stringify({
            asr_model: FASTER_WHISPER_MODEL,
            source_filename: String(sourceFile?.name || localResult?.sourceFilename || "desktop-local-source"),
            source_duration_ms: Math.max(1, Number(localResult?.sourceDurationMs || 0) || Math.round(Number(sourceDurationSec || 0) * 1000) || 1),
            runtime_kind: FAST_RUNTIME_TRACK_DESKTOP_LOCAL,
            asr_payload: localResult?.asrPayload || {},
          }),
        },
        accessToken,
      );
      if (runToken !== localRunTokenRef.current) return;
      localRunAbortRef.current = null;
      const data = await parseResponse(resp);
      if (!resp.ok) {
        setLocalProgressSnapshot(null);
        const message = getCloudFailureMessage(toErrorText(data, "创建识别任务失败"), desktopServerStatus);
        await handleTaskFailureState({
          message,
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 100,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
          refreshWallet: true,
        });
        return;
      }
      const nextTaskId = String(data?.task_id || "");
      if (!nextTaskId) {
        throw new Error("任务创建成功但缺少 task_id");
      }
      const pendingText = String(data?.admission?.state || "").trim().toLowerCase() === "queued" ? "本地字幕已提交，正在排队生成课程" : "本地字幕已提交，正在生成课程";
      const pendingTaskSnapshot = {
        task_id: nextTaskId,
        status: "pending",
        current_text: pendingText,
        workspace: data?.workspace || null,
      };
      setTaskId(nextTaskId);
      setTaskSnapshot(pendingTaskSnapshot);
      setLocalProgressSnapshot(null);
      setStreamingSubtitleDraft(null);
      setPhase("processing");
      setLoading(true);
      setStatus(pendingText);
      await persistSession({
        taskId: nextTaskId,
        phase: "processing",
        taskSnapshot: pendingTaskSnapshot,
        uploadPercent: 100,
        status: pendingText,
        bindingCompleted: false,
      });
      void pollTask(nextTaskId, false, pollToken);
    } catch (error) {
      clearLocalStageProgressTimer();
      setLocalProgressSnapshot(null);
      if (error?.name === "AbortError") return;
      const message = error instanceof Error && error.message ? error.message : `网络错误: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
    }
  }

  async function submitDesktopLocalGenerateCourse(sourceFile = file) {
    if (!hasDesktopRuntimeBridge()) {
      await handleTaskFailureState({
        message: "当前环境不支持桌面端本机生成，请改用云端运行。",
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
      return;
    }
    if (!hasLocalCourseGeneratorBridge()) {
      await handleTaskFailureState({
        message: "本机课程生成功能暂不可用，请确保桌面客户端已更新到最新版本。",
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
      return;
    }

    const currentBundleState = desktopBundleStateMap[FASTER_WHISPER_MODEL] || {};
    let bundleSummary = currentBundleState;
    if (!bundleSummary?.available) {
      bundleSummary = (await fetchDesktopBundleStatus(FASTER_WHISPER_MODEL, { silent: true })) || currentBundleState;
    }
    if (!bundleSummary?.available) {
      const message = bundleSummary?.installAvailable
        ? "Bottle 1.0 本机资源未就绪，请先点「准备本机资源」。"
        : "当前安装包未提供可用的 Bottle 1.0 本机资源，请改用云端运行。";
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return;
    }

    const sourceFileName = String(sourceFile?.name || file?.name || "本地视频").trim();
    const sourceFilePath = String(
      typeof sourceFile?.path === "string" && sourceFile.path
        ? sourceFile.path
        : typeof file?.path === "string" && file.path
          ? file.path
          : "",
    ).trim();

    const startStatus = "正在通过本机 Bottle 1.0 生成课程";
    setPhase(DESKTOP_LOCAL_GENERATING_PHASE);
    setStatus(startStatus);
    setTaskId("");
    setTaskSnapshot(null);
    setUploadPercent(0);
    setLocalProgressSnapshot(null);
    setStreamingSubtitleDraft(null);
    setLoading(true);
    desktopBillingReportRef.current = {
      modelName: FASTER_WHISPER_MODEL,
      runtimeKind: FAST_RUNTIME_TRACK_DESKTOP_LOCAL,
      sourceDurationSec: Math.max(0, Number(durationSec || 0)),
    };

    try {
      const result = await window.localAsr.generateCourse({
        filePath: sourceFilePath,
        sourceFilename: sourceFileName,
        modelKey: FASTER_WHISPER_MODEL,
        runtimeKind: FAST_RUNTIME_TRACK_DESKTOP_LOCAL,
      });

      const response = result?.data || result || {};

      if (!response?.ok) {
        throw new Error(
          String(response?.message || response?.detail || response?.error_message || "课程生成失败").trim() ||
            "课程生成失败",
        );
      }

      const courseId = String(response?.course_id || "").trim();
      const translationPending = Boolean(response?.translation_pending);
      const sentenceCount = Array.isArray(response?.sentences) ? response.sentences.length : 0;
      const usageSeconds = Math.max(0, Number(response?.usage_seconds || 0));
      const lessonStatus = String(response?.lesson_status || "ready").trim();

      setUploadPercent(100);
      setPhase("success");
      setLoading(false);
      setStatus(
        translationPending
          ? "课程已生成（翻译待补全），可在历史记录中查看"
          : "课程已生成，可在历史记录中查看",
      );

      const taskSnapshotValue = {
        lesson: {
          id: courseId,
          source_filename: sourceFileName,
          title: String(response?.course?.title || sourceFileName.replace(/\.[^.]+$/, "")).trim(),
          runtime_kind: FAST_RUNTIME_TRACK_DESKTOP_LOCAL,
          asr_model: FASTER_WHISPER_MODEL,
        },
        task_id: courseId,
        status: "succeeded",
        current_text: translationPending ? "课程已生成（翻译待补全）" : "课程已生成",
        overall_percent: 100,
        workspace: null,
      };
      setTaskSnapshot(taskSnapshotValue);

      dispatchLocalLessonUpdateEvent();
      await clearUploadPanelSuccessSnapshot(null);

      if (accessToken && courseId) {
        try {
          await reportLocalGenerationUsage(accessToken, {
            courseId,
            actualSeconds: Math.round(usageSeconds),
            modelName: FASTER_WHISPER_MODEL,
            runtimeKind: FAST_RUNTIME_TRACK_DESKTOP_LOCAL,
          });
          if (onRefreshWallet != null) {
            void onRefreshWallet();
          }
        } catch (_) {
          // Usage reporting failure should not interrupt success flow
        }
      }

      toast.success(translationPending ? "课程已生成（翻译待补全）" : "课程已生成");
    } catch (error) {
      setLoading(false);
      if (error?.name === "AbortError") {
        return;
      }
      const message = error instanceof Error && error.message ? error.message : `本机课程生成失败: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
    }
  }

  async function submitBalanced(pollToken, sourceFile = file) {
    if (!localAsrSupport.supported) {
      const message = sanitizeUserFacingText(localAsrSupport.reason || "当前浏览器暂不支持这个模型");
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
        persistState: false,
      });
      return;
    }
    if (!localWorkerReady) {
      const message = "识别组件正在重置，请稍后再试。";
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
      return;
    }
    if (!isLocalBalancedModelUploadEnabled(selectedBalancedModel)) {
      const message = getLocalBalancedModelUnavailableReason(selectedBalancedModel) || "当前模型暂未开放";
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
      return;
    }
    const modelState = localModelStateMap[selectedBalancedModel] || {};
    if (!["ready", "cached"].includes(String(modelState.status || ""))) {
      const message = "请先下载并就绪模型";
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
      return;
    }
    const runToken = localRunTokenRef.current + 1;
    localRunTokenRef.current = runToken;
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    clearLocalStageProgressTimer();
    setLocalProgressSnapshot(null);
    setStreamingSubtitleDraft(null);
    setPhase("local_transcribing");
    setLoading(true);
    setStatus("正在识别字幕");
    await persistSession({
      file: sourceFile,
      taskId: "",
      phase: "local_transcribing",
      taskSnapshot: null,
      uploadPercent: 0,
      status: "正在识别字幕",
      bindingCompleted: false,
    });
    const totalStart = nowMs();
    try {
      const isVideoFile = String(sourceFile?.type || "").startsWith("video/");
      if (isVideoFile) {
        const extractingStatus = "正在从视频提取音轨";
        console.debug("[DEBUG] upload.local_asr.stage", {
          stage: "convert_audio",
          fileName: String(sourceFile?.name || ""),
          model: selectedBalancedModel,
        });
        setStatus(extractingStatus);
        setLocalProgress("convert_audio", "running", 0.4, extractingStatus);
        await persistSession({ taskId: "", phase: "local_transcribing", taskSnapshot: null, uploadPercent: 0, status: extractingStatus, bindingCompleted: false });
      } else {
        setLocalProgress("convert_audio", "completed", 1, "音频已就绪，准备识别字幕");
      }
      const prepareAbortController = new AbortController();
      localRunAbortRef.current = prepareAbortController;
      const preprocessResult = await prepareAudioDataForLocalAsr(sourceFile, accessToken, {
        preferServerExtract: isVideoFile,
        signal: prepareAbortController.signal,
      });
      if (runToken !== localRunTokenRef.current) return;
      localRunAbortRef.current = null;
      const audioData = preprocessResult?.audioData;
      const preprocessDurationSec = Math.max(0, Number(preprocessResult?.durationSec || durationSec || 0));
      const preprocessMetrics = {
        audio_extract_ms: Math.max(0, Number(preprocessResult?.metrics?.audio_extract_ms || 0)),
        decode_ms: Math.max(0, Number(preprocessResult?.metrics?.decode_ms || 0)),
        resample_ms: Math.max(0, Number(preprocessResult?.metrics?.resample_ms || 0)),
        preprocess_ms: Math.max(0, Number(preprocessResult?.metrics?.preprocess_ms || 0)),
        source_sample_rate: Math.max(0, Number(preprocessResult?.metrics?.source_sample_rate || 0)),
        target_sample_rate: Math.max(0, Number(preprocessResult?.metrics?.target_sample_rate || 0)),
        channel_count: Math.max(0, Number(preprocessResult?.metrics?.channel_count || 0)),
        input_bytes: Math.max(0, Number(preprocessResult?.metrics?.input_bytes || 0)),
        sample_count: Math.max(0, Number(preprocessResult?.metrics?.sample_count || 0)),
        resample_strategy: String(preprocessResult?.metrics?.resample_strategy || ""),
      };
      if (!(audioData instanceof Float32Array) || audioData.length <= 0) {
        throw new Error("音频解析结果为空，无法继续生成");
      }
      logUploadLocalAsrDebug("preprocess.done", {
        file_name: String(sourceFile?.name || ""),
        model: selectedBalancedModel,
        duration_sec: preprocessDurationSec,
        warning: Boolean(buildLocalAsrLongAudioWarning(preprocessDurationSec, LOCAL_ASR_LONG_AUDIO_HINT_SECONDS)),
        ...preprocessMetrics,
      });
      const localAsrStatus = "正在识别字幕";
      console.debug("[DEBUG] upload.local_asr.stage", {
        stage: "asr_transcribe",
        fileName: String(sourceFile?.name || ""),
        model: selectedBalancedModel,
        sampleCount: audioData.length,
      });
      setStatus(localAsrStatus);
      if (isVideoFile) {
        setLocalProgress("convert_audio", "completed", 1, "转换音频格式完成");
      }
      await persistSession({ taskId: "", phase: "local_transcribing", taskSnapshot: null, uploadPercent: 0, status: localAsrStatus, bindingCompleted: false });
      const transcribeAbortController = new AbortController();
      localRunAbortRef.current = transcribeAbortController;
      const localResult = await runLocalAsrWithAutoParallelism({
        modelKey: selectedBalancedModel,
        audioData,
        samplingRate: LOCAL_ASR_TARGET_SAMPLE_RATE,
        durationSec: preprocessDurationSec || durationSec || 0,
        assetBaseUrl: LOCAL_ASR_ASSET_BASE_URL,
        signal: transcribeAbortController.signal,
        onProgress: (event) => {
          if (runToken !== localRunTokenRef.current) return;
          const completedSegments = Math.max(0, Number(event?.completedSegments || 0));
          const totalSegments = Math.max(completedSegments, Number(event?.totalSegments || 0));
          const ratio = totalSegments > 0 ? Math.min(1, completedSegments / totalSegments) : 0;
          const currentText = String(event?.currentText || localAsrStatus);
          setStatus(currentText);
          setLocalProgress("asr_transcribe", "running", ratio, currentText, event?.counters || {
            asr_done: completedSegments,
            asr_estimated: totalSegments,
            translate_done: 0,
            translate_total: 0,
            segment_done: completedSegments,
            segment_total: totalSegments,
          });
          if (Array.isArray(event?.draftSubtitles) && event.draftSubtitles.length > 0) {
            setStreamingSubtitleDraft({
              workspaceId: "",
              title: "生成中的字幕草稿",
              updatedAt: "",
              isFinal: false,
              previewText: event.draftSubtitles.map((item) => String(item?.text || "")).join(" "),
              items: buildSubtitleDraftItems(
                event.draftSubtitles.map((item) => ({
                  id: item?.id,
                  begin_ms: item?.begin_ms,
                  end_ms: item?.end_ms,
                  text: item?.text,
                })),
                { isFinal: false, source: "browser_local_asr" },
              ),
              logs: [],
            });
          }
        },
      });
      if (runToken !== localRunTokenRef.current) return;
      localRunAbortRef.current = null;
      const postprocessStart = nowMs();
      clearLocalStageProgressTimer();
      if (!Array.isArray(localResult?.asr_payload?.transcripts?.[0]?.sentences) || localResult.asr_payload.transcripts[0].sentences.length === 0) {
        throw new Error("当前模型未识别出可用字幕，请换一个模型或更换素材");
      }
      const sentenceCount = localResult.asr_payload.transcripts[0].sentences.length;
      setStreamingSubtitleDraft(
        buildSubtitleDraftSnapshotFromAsrPayload(localResult?.asr_payload, { title: "生成中的字幕草稿", source: "browser_local_asr" }),
      );
      const parallelSegmentCount = Math.max(0, Number(localResult?.segmentCount || localResult?.raw_result?.segment_count || 0));
      const postprocessMs = Math.max(0, Math.round(nowMs() - postprocessStart));
      logUploadLocalAsrDebug("run.done", {
        file_name: String(sourceFile?.name || ""),
        model: selectedBalancedModel,
        duration_sec: preprocessDurationSec,
        audio_extract_ms: preprocessMetrics.audio_extract_ms,
        decode_ms: preprocessMetrics.decode_ms,
        resample_ms: preprocessMetrics.resample_ms,
        worker_decode_ms: Math.max(0, Number(localResult?.raw_result?.total_parallel_asr_ms || 0)),
        postprocess_ms: postprocessMs,
        total_local_asr_ms: Math.max(0, Math.round(nowMs() - totalStart)),
        sample_count: preprocessMetrics.sample_count,
        source_sample_rate: preprocessMetrics.source_sample_rate,
        target_sample_rate: preprocessMetrics.target_sample_rate,
        channel_count: preprocessMetrics.channel_count,
        resample_strategy: preprocessMetrics.resample_strategy,
        sentence_count: sentenceCount,
        segment_count: parallelSegmentCount,
        planned_concurrency: Math.max(0, Number(localResult?.plannedConcurrency || localResult?.raw_result?.planned_concurrency || 0)),
        actual_concurrency: Math.max(0, Number(localResult?.actualConcurrency || localResult?.raw_result?.actual_concurrency || 0)),
      });
      setLocalProgress("asr_transcribe", "completed", 1, `识别完成，共 ${sentenceCount} 段字幕`, {
        asr_done: sentenceCount,
        asr_estimated: sentenceCount,
        translate_done: 0,
        translate_total: 0,
        segment_done: parallelSegmentCount || sentenceCount,
        segment_total: parallelSegmentCount || sentenceCount,
      });
      const createTaskAbortController = new AbortController();
      localRunAbortRef.current = createTaskAbortController;
      const resp = await api(
        "/api/lessons/tasks/local-asr",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: createTaskAbortController.signal,
          body: JSON.stringify({
            asr_model: selectedBalancedModel,
            source_filename: String(sourceFile?.name || "local-source"),
            source_duration_ms: Math.max(1, Math.round(Number(durationSec || 0) * 1000)),
            asr_payload: localResult?.asr_payload || {},
          }),
        },
        accessToken,
      );
      if (runToken !== localRunTokenRef.current) return;
      localRunAbortRef.current = null;
      const data = await parseResponse(resp);
      if (!resp.ok) {
        setLocalProgressSnapshot(null);
        const message = getCloudFailureMessage(toErrorText(data, "创建识别任务失败"), desktopServerStatus);
        await handleTaskFailureState({
          message,
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 0,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
          refreshWallet: true,
        });
        return;
      }
      const nextTaskId = String(data.task_id || "");
      setTaskId(nextTaskId);
      setTaskSnapshot(null);
      setLocalProgressSnapshot(null);
      setPhase("processing");
      setLoading(true);
      setStatus("");
      await persistSession({ taskId: nextTaskId, phase: "processing", taskSnapshot: null, uploadPercent: 100, status: "", bindingCompleted: false });
      void pollTask(nextTaskId, false, pollToken);
    } catch (error) {
      clearLocalStageProgressTimer();
      localRunAbortRef.current = null;
      if (error?.name === "AbortError") {
        return;
      }
      const canAutoFallbackToCloud = !fasterWhisperTrackTouchedRef.current && desktopServerStatus?.reachable !== false;
      if (canAutoFallbackToCloud) {
        desktopLocalFailureCountRef.current += 1;
        if (desktopLocalFailureCountRef.current < 2) {
          desktopBillingReportRef.current = null;
          toast.message("本地识别失败，正在重试一次");
          await submitDesktopLocalFast(pollToken, runToken, sourceFile, sourceDurationSec);
          return;
        }
        desktopLocalFailureCountRef.current = 0;
        desktopBillingReportRef.current = null;
        setFasterWhisperRuntimeTrack(FAST_RUNTIME_TRACK_CLOUD);
        toast.message("本地识别连续失败，已切换到云端模式");
        await submit();
        return;
      }
      desktopLocalFailureCountRef.current = 0;
      desktopBillingReportRef.current = null;
      logUploadLocalAsrDebug("run.failed", {
        file_name: String(sourceFile?.name || ""),
        model: selectedBalancedModel,
        total_local_asr_ms: Math.max(0, Math.round(nowMs() - totalStart)),
        message: error instanceof Error && error.message ? error.message : String(error),
      });
      setLocalProgressSnapshot(null);
      const message = error instanceof Error && error.message ? error.message : `网络错误: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
    }
  }

  async function submitCloudDirectUpload(uploadSourceFile, runToken, pollToken) {
    const uploadStartStatus = "正在获取云端上传地址";
    setPhase("uploading");
    setStatus(uploadStartStatus);
    await persistSession({
      file: uploadSourceFile,
      taskId: "",
      phase: "uploading",
      taskSnapshot: null,
      uploadPercent: 0,
      status: uploadStartStatus,
      bindingCompleted: false,
    });

    const abortController = new AbortController();
    uploadAbortRef.current = abortController;

    try {
      // Step 1: 获取 DashScope pre-signed upload URL
      const requestUrlResp = await api(
        "/api/dashscope-upload/request-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: String(uploadSourceFile?.name || "upload"),
            content_type: String(uploadSourceFile?.type || "audio/mpeg"),
          }),
          signal: abortController.signal,
        },
        accessToken,
      );

      if (!requestUrlResp.ok) {
        const errorData = await parseResponse(requestUrlResp);
        throw new Error(toErrorText(errorData, "获取云端上传地址失败"));
      }

      const uploadConfig = await parseResponse(requestUrlResp);
      const { upload_url, oss_fields, file_id } = uploadConfig;

      if (runToken !== localRunTokenRef.current) return;
      if (abortController.signal.aborted) return;

      // Step 2: 直接 PUT 到 DashScope OSS（multipart/form-data 格式）
      const dashscopeUploadStatus = "正在上传到云端存储";
      setStatus(dashscopeUploadStatus);

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        const onAbort = () => {
          xhr.abort();
          reject(new DOMException("Upload aborted", "AbortError"));
        };
        abortController.signal.addEventListener("abort", onAbort, { once: true });

        xhr.open("PUT", upload_url, true);

        // 使用 FormData 构建 multipart/form-data 请求
        const formData = new FormData();
        // 添加 OSS 认证字段
        if (oss_fields) {
          Object.entries(oss_fields).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              formData.append(key, String(value));
            }
          });
        }
        // 添加文件（必须在 OSS 字段之后）
        formData.append("file", uploadSourceFile);

        xhr.upload.onprogress = (event) => {
          if (abortController.signal.aborted) return;
          const total = Number(event.total || 0);
          const loaded = Number(event.loaded || 0);
          const percent = event.lengthComputable && total > 0 ? Math.round((loaded / total) * 100) : 0;
          const clampedPercent = clampPercent(percent);
          uploadPersistRef.current.latestPercent = clampedPercent;
          setUploadPercent(clampedPercent);
          persistUploadProgress(clampedPercent, uploadSourceFile);
        };

        xhr.onload = () => {
          abortController.signal.removeEventListener("abort", onAbort);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`云端存储上传失败 (HTTP ${xhr.status}): ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => {
          abortController.signal.removeEventListener("abort", onAbort);
          reject(new Error("云端存储上传网络错误"));
        };

        xhr.onabort = () => {
          abortController.signal.removeEventListener("abort", onAbort);
          reject(new DOMException("Upload aborted", "AbortError"));
        };

        xhr.send(formData);
      });

      if (runToken !== localRunTokenRef.current) return;
      if (abortController.signal.aborted) return;

      // Step 3: PUT 成功后，创建任务并携带 dashscope_file_id
      const createTaskStatus = "正在提交云端任务";
      setStatus(createTaskStatus);

      const form = new FormData();
      // 传一个空文件占位（FastAPI File(...) 必填，但后端有 dashscope_file_id 时会忽略此文件）
      form.append("video_file", new Blob([], { type: "application/octet-stream" }), "placeholder.bin");
      form.append("asr_model", selectedAsrModel);
      form.append("semantic_split_enabled", "false");
      form.append("dashscope_file_id", file_id);

      const { ok, data } = await uploadWithProgress(
        "/api/lessons/tasks",
        {
          method: "POST",
          body: form,
          signal: abortController.signal,
          onUploadProgress: () => {
            // 进度已在 DashScope PUT 阶段处理
          },
        },
        accessToken,
      );

      uploadAbortRef.current = null;

      if (!ok) {
        const message = getCloudFailureMessage(toErrorText(data, "创建云端任务失败"), desktopServerStatus);
        await handleTaskFailureState({
          message,
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: clampPercent(uploadPersistRef.current.latestPercent || uploadPercent),
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
          refreshWallet: true,
        });
        return;
      }

      const nextTaskId = String(data.task_id || "");
      if (!nextTaskId) {
        const message = "任务创建成功但缺少 task_id";
        await handleTaskFailureState({
          message,
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: clampPercent(uploadPersistRef.current.latestPercent || uploadPercent),
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
        });
        return;
      }

      maybeShowModelFallbackToast({ ...data, task_id: nextTaskId });
      setTaskId(nextTaskId);
      setUploadPercent(100);
      uploadPersistRef.current.latestPercent = 100;
      setPhase("processing");
      resetUploadPersistState();
      await persistSession({ taskId: nextTaskId, phase: "processing", taskSnapshot: null, uploadPercent: 100, status: "", bindingCompleted: false });
      void pollTask(nextTaskId, false, pollToken);
    } catch (error) {
      uploadAbortRef.current = null;
      if (error?.name === "AbortError") return;
      resetUploadPersistState();
      const message = error instanceof Error && error.message ? error.message : `云端直传失败: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: clampPercent(uploadPersistRef.current.latestPercent || uploadPercent),
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
    }
  }

  async function submit(options = {}) {
    const selectedSourceFile = options?.sourceFile ?? file;
    const submitIntent = String(options?.submitIntent || FILE_PICKER_ACTION_SELECT);
    if (desktopLinkModeActive) {
      await submitDesktopLinkImport();
      return;
    }
    if (!selectedSourceFile) {
      const message = "请先选择文件";
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
      return;
    }
    if (ownerUserId) {
      await clearUploadPanelSuccessSnapshot(ownerUserId);
    }
    successStateOriginRef.current = "none";
    stopPollingSession();
    resetUploadPersistState();
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    clearLocalStageProgressTimer();
    localRunTokenRef.current += 1;
    const runToken = localRunTokenRef.current;
    const pollToken = startPollingSession();
    uploadAbortRef.current?.abort();
    setLoading(true);
    setTaskId("");
    setStatus("");
    setTaskSnapshot(null);
    setUploadPercent(0);
    uploadPersistRef.current.latestPercent = 0;
    setLocalProgressSnapshot(null);
    desktopLocalFailureCountRef.current = 0;
    let shouldUseDesktopLocalFast = fasterWhisperDesktopLocalSelected;
    let shouldUseBrowserLocalFast = fasterWhisperBrowserLocalSelected;
    let shouldUseDesktopLocalGenerateCourse = false;
    if (
      submitIntent === FILE_PICKER_ACTION_DESKTOP_LOCAL_GENERATE &&
      selectedSourceFile &&
      hasLocalCourseGeneratorBridge() &&
      !loading &&
      (phase === "idle" || phase === "ready" || phase === "error")
    ) {
      shouldUseDesktopLocalGenerateCourse = true;
    }
    const ensureUploadableSourceFile = async () => {
      const preparedFile = await ensureBlobBackedSourceFile(selectedSourceFile);
      if (isBlobBackedSourceFile(preparedFile)) {
        return preparedFile;
      }
      throw new Error("当前素材仅保留了桌面本机路径。如需云端或网页本地运行，请重新选择一次文件。");
    };
    if (mode === "balanced") {
      try {
        const preparedFile = await ensureUploadableSourceFile();
        await submitBalanced(pollToken, preparedFile);
      } catch (error) {
        await handleTaskFailureState({
          message: error instanceof Error && error.message ? error.message : String(error),
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 0,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
        });
      }
      return;
    }
    if (selectedFastModel === FASTER_WHISPER_MODEL && hasDesktopRuntimeBridge()) {
      const strategy = resolveAsrStrategy({
        runtimeTrack: fasterWhisperRuntimeTrack,
        userExplicitTrack: fasterWhisperTrackTouchedRef.current,
        localHelperStatus: desktopHelperStatus,
        serverStatus: desktopServerStatus,
        localFailureCount: 0,
      });
      if (strategy.degraded && strategy.strategy === ASR_STRATEGY_CLOUD && !fasterWhisperTrackTouchedRef.current) {
        shouldUseDesktopLocalFast = false;
        setFasterWhisperRuntimeTrack(FAST_RUNTIME_TRACK_CLOUD);
        if (strategy.message) {
          setOfflineBannerMessage(strategy.message);
          toast.message(strategy.message);
        }
      }
    }
    if (selectedFastModel === FASTER_WHISPER_MODEL && selectedFastRuntimeTrack === FAST_RUNTIME_TRACK_BROWSER_LOCAL && !browserLocalRuntimeAvailable) {
      shouldUseBrowserLocalFast = false;
      setFasterWhisperRuntimeTrack(FAST_RUNTIME_TRACK_CLOUD);
      toast.message(browserLocalRuntimeBlockedMessage);
    }
    if (shouldUseDesktopLocalGenerateCourse) {
      await submitDesktopLocalGenerateCourse(selectedSourceFile);
      return;
    }
    if (shouldUseDesktopLocalFast) {
      const billingAllowed = await ensureDesktopClientBillingAdmission(durationSec);
      if (!billingAllowed) {
        return;
      }
      await submitDesktopLocalFast(pollToken, runToken, selectedSourceFile, durationSec);
      return;
    }
    if (shouldUseBrowserLocalFast) {
      try {
        const preparedFile = await ensureUploadableSourceFile();
        await submitBrowserLocalFast(preparedFile);
      } catch (error) {
        await handleTaskFailureState({
          message: error instanceof Error && error.message ? error.message : String(error),
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 0,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
        });
      }
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await handleTaskFailureState({
        message: offlineBannerMessage || "当前处于离线模式，部分功能不可用",
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: 0,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
      return;
    }
    // 云端直传模式（Bottle 2.0 / QWEN_MODEL）：使用 DashScope pre-signed URL 直传
    if (selectedAsrModel === QWEN_MODEL) {
      try {
        const uploadSourceFile = await ensureUploadableSourceFile();
        await submitCloudDirectUpload(uploadSourceFile, runToken, pollToken);
      } catch (error) {
        await handleTaskFailureState({
          message: error instanceof Error && error.message ? error.message : String(error),
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: 0,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
        });
      }
      return;
    }
    try {
      const uploadSourceFile = await ensureUploadableSourceFile();
      setPhase("uploading");
      await persistSession({
        file: uploadSourceFile,
        taskId: "",
        phase: "uploading",
        taskSnapshot: null,
        uploadPercent: 0,
        status: "",
        bindingCompleted: false,
      });
      const form = new FormData();
      form.append("video_file", uploadSourceFile);
      form.append("asr_model", selectedAsrModel);
      form.append("semantic_split_enabled", "false");
      const abortController = new AbortController();
      uploadAbortRef.current = abortController;
      const { ok, data } = await uploadWithProgress(
        "/api/lessons/tasks",
        {
          method: "POST",
          body: form,
          signal: abortController.signal,
          onUploadProgress: ({ percent }) => {
            const nextPercent = clampPercent(percent);
            uploadPersistRef.current.latestPercent = nextPercent;
            setUploadPercent(nextPercent);
            persistUploadProgress(nextPercent, uploadSourceFile);
          },
        },
        accessToken,
      );
      uploadAbortRef.current = null;
      if (!ok) {
        const message = getCloudFailureMessage(toErrorText(data, "创建上传任务失败"), desktopServerStatus);
        await handleTaskFailureState({
          message,
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: clampPercent(uploadPersistRef.current.latestPercent || uploadPercent),
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
          refreshWallet: true,
        });
        return;
      }
      const nextTaskId = String(data.task_id || "");
      if (!nextTaskId) {
        const message = "任务创建成功但缺少 task_id";
        await handleTaskFailureState({
          message,
          nextTaskId: "",
          nextTaskSnapshot: null,
          nextUploadPercent: clampPercent(uploadPersistRef.current.latestPercent || uploadPercent),
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
          nextBindingCompleted: false,
        });
        return;
      }
      if (Boolean(data.model_fallback_applied)) {
        updateServerModelState(FASTER_WHISPER_MODEL, {
          status: "preparing",
          preparing: true,
          lastError: "",
          message: "模型预热中",
        });
        void fetchServerModelStatus(FASTER_WHISPER_MODEL, { silent: true });
      }
      maybeShowModelFallbackToast({ ...data, task_id: nextTaskId });
      setTaskId(nextTaskId);
      setUploadPercent(100);
      uploadPersistRef.current.latestPercent = 100;
      setPhase("processing");
      resetUploadPersistState();
      await persistSession({ taskId: nextTaskId, phase: "processing", taskSnapshot: null, uploadPercent: 100, status: "", bindingCompleted: false });
      void pollTask(nextTaskId, false, pollToken);
    } catch (error) {
      uploadAbortRef.current = null;
      if (error?.name === "AbortError") return;
      resetUploadPersistState();
      const message = `网络错误: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: "",
        nextTaskSnapshot: null,
        nextUploadPercent: clampPercent(uploadPersistRef.current.latestPercent || uploadPercent),
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        nextBindingCompleted: false,
      });
    }
  }

  async function resumeTask() {
    if (!taskId) return;
    stopPollingSession();
    const pollToken = startPollingSession();
    setLoading(true);
    setStatus("");
    setRestoreBannerMode(RESTORE_BANNER_MODES.NONE);
    try {
      const resp = await api(`/api/lessons/tasks/${taskId}/resume`, { method: "POST" }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const errorCode = String(data?.error_code || "");
        const baseMessage = toErrorText(data, "继续生成失败");
        const message = errorCode === "TASK_ARTIFACT_MISSING" ? `${baseMessage}；素材已过期，请更换素材或重新上传当前文件。` : baseMessage;
        const nextTaskSnapshot =
          errorCode === "TASK_ARTIFACT_MISSING" || errorCode === "TASK_RESUME_UNAVAILABLE"
            ? {
                ...(taskSnapshot || {}),
                status: "failed",
                error_code: errorCode,
                message: String(data?.message || message),
                current_text: String(data?.message || message),
                resume_available: false,
              }
            : taskSnapshot;
        await handleTaskFailureState({
          message,
          nextTaskId: taskId,
          nextTaskSnapshot,
          nextUploadPercent: 100,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        });
        return;
      }
      setPhase("processing");
      const nextTaskSnapshot =
        taskSnapshot != null
          ? {
              ...taskSnapshot,
              status: "pending",
              error_code: "",
              message: "",
              current_text: "准备重新生成",
              resume_available: false,
            }
          : null;
      setTaskSnapshot((prev) =>
        prev
          ? {
              ...prev,
              status: "pending",
              error_code: "",
              message: "",
              current_text: "准备重新生成",
              resume_available: false,
            }
          : prev,
      );
      await persistSession({ taskId, phase: "processing", taskSnapshot: nextTaskSnapshot, uploadPercent: 100, status: "" });
      void pollTask(taskId, false, pollToken);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: taskId,
        nextTaskSnapshot: taskSnapshot,
        nextUploadPercent: 100,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
      });
    }
  }

  async function reconnectTaskPolling() {
    if (!taskId) return;
    stopPollingSession();
    const pollToken = startPollingSession();
    const nextStatus = "正在重新连接任务状态";
    await applyTaskViewState({
      nextTaskId: taskId,
      nextTaskSnapshot: taskSnapshot,
      nextPhase: "processing",
      nextStatus,
      nextUploadPercent: 100,
      nextLoading: true,
      nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
    });
    void pollTask(taskId, false, pollToken);
  }

  async function requestServerTaskControl(action) {
    if (!taskId) return;
    const normalizedAction = action === "terminate" ? "terminate" : "pause";
    const endpoint = normalizedAction === "terminate" ? "terminate" : "pause";
    const pendingStatus = normalizedAction === "terminate" ? "terminating" : "pausing";
    const pendingText = normalizedAction === "terminate" ? "正在终止，当前步骤完成后会停止生成" : "正在暂停，当前步骤完成后会保留进度";
    const previousTaskSnapshot = taskSnapshot ? { ...taskSnapshot } : null;
    const pendingTaskSnapshot =
      previousTaskSnapshot != null
        ? {
            ...previousTaskSnapshot,
            status: pendingStatus,
            current_text: pendingText,
            message: "",
            control_action: normalizedAction,
            can_pause: false,
            can_terminate: normalizedAction === "terminate",
          }
        : null;
    try {
      stopPollingSession();
      setLoading(true);
      setStatus(pendingText);
      setPhase("processing");
      setTaskSnapshot((prev) =>
        prev
          ? {
              ...prev,
              status: pendingStatus,
              current_text: pendingText,
              message: "",
              control_action: normalizedAction,
              can_pause: false,
              can_terminate: normalizedAction === "terminate",
            }
          : prev,
      );
      await persistSession({ taskId, phase: "processing", taskSnapshot: pendingTaskSnapshot, uploadPercent: 100, status: pendingText });
      const resp = await api(`/api/lessons/tasks/${taskId}/${endpoint}`, { method: "POST" }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, normalizedAction === "terminate" ? "终止生成失败" : "暂停生成失败");
        await handleTaskFailureState({
          message,
          nextTaskId: taskId,
          nextTaskSnapshot: previousTaskSnapshot,
          nextUploadPercent: 100,
          nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
        });
        return;
      }
      const pollToken = startPollingSession();
      void pollTask(taskId, true, pollToken);
      toast.success(normalizedAction === "terminate" ? "已提交终止请求" : "已提交暂停请求");
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      await handleTaskFailureState({
        message,
        nextTaskId: taskId,
        nextTaskSnapshot: previousTaskSnapshot,
        nextUploadPercent: 100,
        nextRestoreBannerMode: RESTORE_BANNER_MODES.NONE,
      });
    }
  }

  const desktopServerDiagnostic = getDesktopServerDiagnostic(desktopServerStatus, desktopRuntimeInfo);
  const desktopHelperDiagnostic = getDesktopHelperDiagnostic(desktopHelperStatus, desktopRuntimeInfo);
  const desktopClientUpdateDiagnostic = getDesktopClientUpdateDiagnostic(desktopRuntimeInfo);
  const desktopClientVersionLabel = String(desktopRuntimeInfo?.clientUpdate?.currentVersion || "").trim() || "未知";
  const desktopDiagnosticsItems = [
    {
      key: "client-version",
      title: "客户端版本",
      badgeLabel: desktopClientVersionLabel,
      badgeTone: "neutral",
      detail:
        String(desktopRuntimeInfo?.clientUpdate?.releaseName || "").trim() ||
        String(desktopRuntimeInfo?.cloud?.appBaseUrl || "").trim() ||
        "用于确认当前用户安装的桌面客户端版本",
    },
    {
      key: "cloud-status",
      title: "云端连接",
      badgeLabel: desktopServerDiagnostic.label,
      badgeTone: desktopServerDiagnostic.tone,
      detail: desktopServerDiagnostic.detail,
    },
    {
      key: "helper-status",
      title: "本地 Helper",
      badgeLabel: desktopHelperDiagnostic.label,
      badgeTone: desktopHelperDiagnostic.tone,
      detail: desktopHelperDiagnostic.detail,
    },
    {
      key: "client-update",
      title: "客户端更新",
      badgeLabel: desktopClientUpdateDiagnostic.label,
      badgeTone: desktopClientUpdateDiagnostic.tone,
      detail: desktopClientUpdateDiagnostic.detail,
    },
  ];

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <UploadCloud className="size-4" />
            生成工作台
          </CardTitle>
          <CardDescription>左侧查看素材与生成流程，右侧持续查看并回改字幕草稿。</CardDescription>
        </div>
        {desktopRuntimeAvailable ? (
          <Button type="button" variant="outline" className="h-9 w-fit px-3" onClick={() => setDiagnosticsDialogOpen(true)}>
            客户端诊断
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className={cn("border", getUploadToneStyles("idle").surface)}>
          <AlertDescription>
            <p className="text-muted-foreground">余额：{desktopClientBillingEnabled && desktopBillingState.status === "offline" ? "离线模式" : formatMoneyCents(desktopClientBalanceAmountCents)}</p>
            <p className="text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted underline-offset-2">预估价格</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">ASR 按素材秒数折算分钟估算；MT 按 qwen-mt-flash 的 1k Tokens 费率与常见字幕量近似估算，最终以实际翻译 Tokens 结算。</TooltipContent>
              </Tooltip>
              ：
              {desktopClientBillingEnabled
                ? selectedRate
                  ? durationSec != null
                    ? `${formatMoneyCents(desktopClientEstimatedChargeCents)}（ASR ${formatMoneyCents(estimatedAsrChargeCents)} + MT 约 ${formatMoneyCents(estimatedMtChargeCents)}）`
                    : "选择文件后显示"
                  : "该模型未配置 ASR 单价"
                : selectedRate
                ? durationSec != null
                  ? `${formatMoneyCents(estimatedTotalChargeCents)}（ASR ${formatMoneyCents(estimatedAsrChargeCents)} + MT 约 ${formatMoneyCents(estimatedMtChargeCents)}）`
                  : "选择文件后显示"
                : "该模型未配置 ASR 单价"}
            </p>
            {desktopClientBillingEnabled && desktopBillingState.message ? (
              <p className={cn("text-xs", desktopBillingState.status === "insufficient" || desktopBillingState.status === "offline" || desktopBillingState.status === "error" ? getUploadToneStyles("recoverable").text : "text-muted-foreground")}>
                {desktopBillingState.message}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">选择字幕生成方式</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {UPLOAD_MODEL_OPTIONS.map((item) => {
              const selected = selectedUploadModel === item.key;
              const isFasterWhisper = item.key === FASTER_WHISPER_MODEL;
              const isQwen = item.key === QWEN_MODEL;
              const uploadCardMeta = mergeCatalogIntoUploadModelMeta(item.key, asrModelCatalogMap);
              const fasterModelState = serverModelStateMap[item.key] || {};
              const fasterModelReady = isAsrModelReady(fasterModelState);
              const fasterModelBusy = serverBusyModelKey === item.key;
              const fasterModelPreparing = isAsrModelPreparing(fasterModelState);
              const desktopBundleState = desktopBundleStateMap[item.key] || {};
              const desktopBundleAvailable = Boolean(desktopBundleState.available);
              const desktopBundleInstallAvailable = Boolean(desktopBundleState.installAvailable);
              const desktopBundleUpdating = Boolean(desktopBundleState.updating);
              const desktopBundleUpdateAvailable = Boolean(desktopBundleState.updateAvailable);
              const desktopBundleBusy = desktopBundleBusyModelKey === item.key || desktopBundleUpdating;
              const fasterWhisperCardTrack =
                isFasterWhisper && (hasDesktopRuntimeBridge() || hasBrowserLocalRuntimeBridge()) ? fasterWhisperRuntimeTrack : FAST_RUNTIME_TRACK_CLOUD;
              const fasterWhisperDesktopTrack = fasterWhisperCardTrack === FAST_RUNTIME_TRACK_DESKTOP_LOCAL;
              const fasterWhisperBrowserTrack = fasterWhisperCardTrack === FAST_RUNTIME_TRACK_BROWSER_LOCAL;
              const cardPriceLabel = getUploadModelPriceLabel(item, billingRates);
              const highlightStatus = isFasterWhisper
                ? fasterWhisperDesktopTrack
                  ? desktopBundleAvailable
                  : fasterWhisperBrowserTrack
                    ? browserLocalRuntimeAvailable
                    : fasterModelReady
                : true;
              const modelCardHasError = isFasterWhisper
                ? fasterWhisperDesktopTrack
                  ? Boolean(desktopBundleState.lastError)
                  : fasterWhisperBrowserTrack
                    ? !browserLocalRuntimeAvailable
                    : Boolean(fasterModelState.lastError) || String(fasterModelState.status || "").trim().toLowerCase() === "error"
                : false;
              const modelCardTone = getUploadModelTone({
                selected,
                ready: highlightStatus,
                busy: isFasterWhisper && (fasterWhisperDesktopTrack ? desktopBundleBusy : fasterModelBusy || fasterModelPreparing),
                error: modelCardHasError,
              });
              const modelCardToneStyles = getUploadToneStyles(modelCardTone);
              const cardStatusAvailable = !isFasterWhisper || highlightStatus;
              const cardStatusLabel = cardStatusAvailable ? "可用" : "不可用";
              const showCardProgress = isFasterWhisper
                ? fasterWhisperDesktopTrack
                  ? desktopBundleBusy
                  : fasterModelPreparing || fasterModelBusy
                : false;
              const cardProgressValue =
                desktopBundleUpdating && Number(desktopBundleState.totalFiles || 0) > 0
                  ? clampPercent((Number(desktopBundleState.completedFiles || 0) / Number(desktopBundleState.totalFiles || 1)) * 100)
                  : null;
              const cardProgressText = String(
                isFasterWhisper && fasterWhisperDesktopTrack
                  ? desktopBundleState.message || "正在准备本机资源"
                  : serverBusyText || fasterModelState.message || "准备中",
              );
              const actionMeta = getUploadCardActionMeta({
                item,
                uploadActionBusy,
                localTranscribing,
                localAsrSupport,
                localWorkerReady,
                localCardBusy: false,
                localCardDownloaded: false,
                fasterModelReady,
                fasterModelPreparing,
                fasterModelBusy,
              });
              const desktopBundleActionLabel = desktopBundleUpdating
                ? "取消更新"
                : desktopBundleUpdateAvailable && desktopBundleAvailable
                  ? "更新模型"
                  : desktopBundleBusy
                    ? "准备中"
                    : desktopBundleAvailable
                      ? "本机已就绪"
                      : "准备本机资源";
              const desktopBundleActionDisabled =
                desktopBundleUpdating
                  ? false
                  : uploadActionBusy || desktopBundleBusy || (!desktopBundleInstallAvailable && !desktopBundleAvailable && !desktopBundleUpdateAvailable);
              const fasterWhisperActionMeta = fasterWhisperDesktopTrack
                ? {
                    label: desktopBundleBusy ? "准备中" : desktopBundleAvailable ? "本机已就绪" : "准备本机资源",
                    disabled: uploadActionBusy || desktopBundleBusy || (!desktopBundleInstallAvailable && !desktopBundleAvailable),
                  }
                : fasterWhisperBrowserTrack
                  ? {
                      label: browserLocalRuntimeAvailable ? "本地网站已就绪" : "本地网站未就绪",
                      disabled: true,
                    }
                : actionMeta;
              const effectiveActionMeta =
                isFasterWhisper && fasterWhisperDesktopTrack
                  ? {
                      ...fasterWhisperActionMeta,
                      label: desktopBundleActionLabel,
                      disabled: desktopBundleActionDisabled,
                    }
                  : isFasterWhisper
                    ? fasterWhisperActionMeta
                    : actionMeta;
              const showReadyIcon = !isQwen && highlightStatus;
              const showLoadingIcon = !isQwen && isFasterWhisper && (fasterWhisperDesktopTrack ? desktopBundleBusy : fasterModelBusy || fasterModelPreparing);

              return (
                <div
                  key={item.key}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex min-h-[220px] flex-col gap-3 rounded-2xl border p-4 text-left transition-colors",
                    modelCardToneStyles.surface,
                    selected ? "shadow-sm" : "bg-background/80",
                    uploadActionBusy ? "cursor-not-allowed opacity-80" : "cursor-pointer",
                  )}
                  onClick={() => {
                    if (uploadActionBusy) return;
                    handleSelectUploadModelCard(item.key);
                  }}
                  onKeyDown={(event) => {
                    if (uploadActionBusy) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSelectUploadModelCard(item.key);
                    }
                  }}
                  aria-disabled={uploadActionBusy}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-foreground">{uploadCardMeta.title}</p>
                      <p className="text-sm text-muted-foreground">{cardPriceLabel}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0",
                        cardStatusAvailable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700",
                      )}
                    >
                      {cardStatusLabel}
                    </Badge>
                  </div>

                  {isFasterWhisper ? (
                    <div className="flex flex-wrap gap-2 rounded-xl border bg-background/70 p-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={fasterWhisperDesktopTrack ? "default" : "outline"}
                        className={fasterWhisperDesktopTrack ? getUploadToneStyles("selected").button : getUploadToneStyles("selected").buttonSubtle}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectFasterWhisperRuntimeTrack(FAST_RUNTIME_TRACK_DESKTOP_LOCAL);
                        }}
                        disabled={uploadActionBusy}
                      >
                        本地电脑跑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={fasterWhisperCardTrack === FAST_RUNTIME_TRACK_BROWSER_LOCAL ? "default" : "outline"}
                        className={fasterWhisperCardTrack === FAST_RUNTIME_TRACK_BROWSER_LOCAL ? getUploadToneStyles("selected").button : getUploadToneStyles("selected").buttonSubtle}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectFasterWhisperRuntimeTrack(FAST_RUNTIME_TRACK_BROWSER_LOCAL);
                        }}
                        disabled={uploadActionBusy || !hasBrowserLocalRuntimeBridge()}
                        title={browserLocalRuntimeAvailable ? "" : browserLocalRuntimeBlockedMessage}
                      >
                        本地网站跑
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={fasterWhisperCardTrack === FAST_RUNTIME_TRACK_CLOUD ? "default" : "outline"}
                        className={fasterWhisperCardTrack === FAST_RUNTIME_TRACK_CLOUD ? getUploadToneStyles("selected").button : getUploadToneStyles("selected").buttonSubtle}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectFasterWhisperRuntimeTrack(FAST_RUNTIME_TRACK_CLOUD);
                        }}
                        disabled={uploadActionBusy}
                      >
                        服务器跑
                      </Button>
                    </div>
                  ) : null}

                  {showCardProgress ? (
                    <div className="space-y-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        {cardProgressValue != null ? (
                          <div
                            className={cn("h-full rounded-full transition-[width] duration-200", getUploadToneStyles("running").progress)}
                            style={{ width: `${cardProgressValue}%` }}
                          />
                        ) : (
                          <div className={cn("h-full w-1/2 rounded-full animate-pulse", getUploadToneStyles("running").progress)} />
                        )}
                      </div>
                      <p className={cn("text-xs", getUploadToneStyles("running").text)}>{cardProgressText}</p>
                    </div>
                  ) : null}

                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={isQwen ? "outline" : "default"}
                      className="h-9 px-3"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isFasterWhisper) {
                          if (fasterWhisperDesktopTrack) {
                            if (desktopBundleUpdating) {
                              void handleCancelDesktopBundleModelUpdate(item.key);
                              return;
                            }
                            if (desktopBundleUpdateAvailable && desktopBundleAvailable) {
                              void handleDesktopBundleModelUpdate(item.key);
                              return;
                            }
                            void handleDesktopBundlePrepare(item.key);
                            return;
                          }
                          void handleServerModelPrepare(item.key);
                        }
                      }}
                      disabled={effectiveActionMeta.disabled}
                    >
                      {showLoadingIcon ? <Loader2 className="size-4 animate-spin" /> : null}
                      {effectiveActionMeta.label}
                    </Button>
                    {isFasterWhisper && hasDesktopRuntimeBridge() && !fasterWhisperDesktopTrack ? (
                      <Button
                        type="button"
                        variant={desktopBundleAvailable ? "outline" : "secondary"}
                        className="h-9 px-3"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDesktopBundlePrepare(item.key);
                        }}
                        disabled={uploadActionBusy || desktopBundleBusy || !desktopBundleInstallAvailable}
                      >
                        {desktopBundleBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                        {desktopBundleAvailable ? "本机已预装" : "准备本机资源"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {offlineBannerMessage ? (
          <Alert className="border-destructive/30 bg-destructive/5 text-destructive">
            <AlertDescription>{offlineBannerMessage}</AlertDescription>
          </Alert>
        ) : null}

        {offlineHintText && !offlineBannerMessage ? (
          <Alert className="border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
            <AlertDescription className="flex items-center gap-2">
              <span>{offlineHintText}</span>
              {selectedAsrModel === FASTER_WHISPER_MODEL && (
                <span className="text-xs opacity-80">（本地生成仍可使用）</span>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        {showMediaPreview ? (
          <div className="relative overflow-hidden rounded-2xl border bg-muted/10 p-1">
            <MediaCover
              coverDataUrl={coverDataUrl}
              alt={isVideoSource ? "视频封面" : "音频素材"}
              aspectRatio={coverAspectRatio}
              className="border-0 bg-muted/20"
              fallback={<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">{isVideoSource ? "封面提取中或失败" : "音频素材（无视频封面）"}</div>}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute right-4 top-4 h-8 rounded-full px-3 shadow-sm"
              onClick={() => void resetSession()}
              disabled={uploadActionBusy}
            >
              x 清空
            </Button>
          </div>
        ) : null}

        {showMediaPreview ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/15 px-3 py-2">
            <Badge variant="outline">{isVideoSource ? "视频" : "音频"}</Badge>
            {durationSec != null ? <Badge variant="outline">{formatDurationLabel(durationSec)}</Badge> : null}
            {sourceDisplayName ? <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{sourceDisplayName}</p> : null}
          </div>
        ) : null}
        {mode === "balanced" && balancedPerformanceWarning ? (
          <p className={cn("text-xs", getUploadToneStyles("recoverable").text)}>{simplifyLongAudioWarning(balancedPerformanceWarning)}</p>
        ) : null}

        {showTaskStatusCard ? (
          <div className={cn("space-y-3 rounded-2xl border p-4", taskStatusToneStyles.surface)}>
            <div className="space-y-1">
              <p className="text-sm font-medium">任务状态</p>
              <p className={cn("text-sm", taskStatusToneStyles.text)}>
                {restoreBannerMode === RESTORE_BANNER_MODES.NONE ? recoveryBannerText || taskStatusCardText : taskStatusCardText}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {((restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED || restoreBannerMode === RESTORE_BANNER_MODES.NONE) && canResumeServerTask) ||
              canReconnectInterruptedTask ? (
                <Button
                  type="button"
                  className={cn("h-9 px-3", getUploadToneStyles("recoverable").button)}
                  onClick={() => void (canReconnectInterruptedTask ? reconnectTaskPolling() : resumeTask())}
                >
                  <RefreshCcw className="size-4" />
                  {canReconnectInterruptedTask ? "继续查询" : "继续生成"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant={(restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED || restoreBannerMode === RESTORE_BANNER_MODES.NONE) && taskPaused ? "outline" : "default"}
                className={
                  cn(
                    "h-9 px-3",
                    (restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED || restoreBannerMode === RESTORE_BANNER_MODES.NONE) && taskPaused
                      ? getUploadToneStyles("selected").buttonSubtle
                      : getUploadToneStyles("selected").button,
                  )
                }
                onClick={() => void clearTaskRuntime("已保留素材，可重新开始。")}
              >
                <RefreshCcw className="size-4" />
                重新开始
              </Button>
              <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => void clearTaskRuntime()}>
                清空这次记录
              </Button>
            </div>
          </div>
        ) : null}

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3" data-guide-id="upload-select-file">
            {desktopRuntimeAvailable ? (
              <div className="inline-flex w-fit rounded-2xl border bg-muted/20 p-1">
                <button
                  type="button"
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-sm transition-colors",
                    desktopSourceMode === DESKTOP_UPLOAD_SOURCE_MODE_FILE
                      ? getUploadToneStyles("selected").button
                      : getUploadToneStyles("selected").buttonSubtle,
                  )}
                  onClick={() => void handleDesktopSourceModeChange(DESKTOP_UPLOAD_SOURCE_MODE_FILE)}
                  disabled={loading || localModeBusy}
                >
                  文件
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-sm transition-colors",
                    desktopSourceMode === DESKTOP_UPLOAD_SOURCE_MODE_LINK
                      ? getUploadToneStyles("selected").button
                      : getUploadToneStyles("selected").buttonSubtle,
                  )}
                  onClick={() => void handleDesktopSourceModeChange(DESKTOP_UPLOAD_SOURCE_MODE_LINK)}
                  disabled={loading || localModeBusy}
                >
                  链接
                </button>
              </div>
            ) : null}
            <input
              id="asr-file"
              ref={fileInputRef}
              type="file"
              accept={mode === "balanced" ? LOCAL_ASR_FILE_ACCEPT : undefined}
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                void handleSourceFileInputChange(nextFile).catch((error) => {
                  toast.error(error instanceof Error && error.message ? error.message : "选择本地文件失败");
                });
                event.target.value = "";
              }}
              disabled={loading || localModeBusy}
            />
            <input
              ref={importFileInputRef}
              type="file"
              accept={`${BOTTLE_LESSON_FILE_SUFFIX},application/json,.json`}
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                if (nextFile) {
                  void handleImportLessonFile(nextFile);
                }
                event.target.value = "";
              }}
              disabled={loading || localModeBusy || importBusy}
            />
            {desktopLinkModeActive ? (
              <div className="space-y-2">
                <input
                  type="url"
                  inputMode="url"
                  className="h-11 rounded-2xl border bg-background px-4 text-sm outline-none transition-colors focus:border-upload-brand/50"
                  placeholder="粘贴公开单条视频链接，例如 https://www.youtube.com/watch?v=..."
                  value={desktopLinkInput}
                  onChange={(event) => setDesktopLinkInput(event.target.value)}
                  disabled={loading || localModeBusy}
                />
                <p className="text-xs text-muted-foreground">仅支持公开单条视频链接，不支持 cookies、登录态、手动 cookie、播放列表或批量链接。</p>
                {desktopLinkModeBlockedMessage ? (
                  <p className={cn("text-xs", getUploadToneStyles("recoverable").text)}>{desktopLinkModeBlockedMessage}</p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 px-4"
                  onClick={() => {
                    if (!openSourceFilePicker()) {
                      toast.error("文件选择器不可用，请刷新后重试");
                    }
                  }}
                  disabled={loading || localModeBusy}
                >
                  选择文件
                </Button>
                {desktopLocalGenerateAvailable ? (
                  <Button
                    type="button"
                    variant="default"
                    className="h-9 px-4"
                    onClick={() => {
                      if (file) {
                        void submit({ submitIntent: FILE_PICKER_ACTION_DESKTOP_LOCAL_GENERATE });
                        return;
                      }
                      if (!openSourceFilePicker(FILE_PICKER_ACTION_DESKTOP_LOCAL_GENERATE)) {
                        toast.error("文件选择器不可用，请刷新后重试");
                      }
                    }}
                    disabled={loading || localModeBusy}
                  >
                    本地生成
                  </Button>
                ) : null}
                {!desktopRuntimeAvailable ? (
                  <Button type="button" variant="default" className="h-9 px-4" onClick={() => setLinkDialogOpen(true)} disabled={loading || localModeBusy}>
                    提取视频
                  </Button>
                ) : null}
              </div>
            )}
            {localLessonImportAvailable ? (
              <div
                className={cn(
                  "rounded-2xl border border-dashed px-4 py-3 transition-colors",
                  importDropActive
                    ? "border-primary/60 bg-primary/5"
                    : "border-border/70 bg-muted/10",
                )}
                onDragEnter={handleImportDropHover}
                onDragOver={handleImportDropHover}
                onDragLeave={handleImportDropLeave}
                onDrop={(event) => {
                  void handleImportDrop(event);
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">导入课程</p>
                    <p className="text-xs text-muted-foreground">支持拖拽或选择 `.bottle-lesson.json` 文件，导入后会写入本地课程列表。</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 px-4"
                    onClick={() => {
                      if (importFileInputRef.current) {
                        importFileInputRef.current.value = "";
                        importFileInputRef.current.click();
                      }
                    }}
                    disabled={loading || localModeBusy || importBusy}
                  >
                    <FileJson className="size-4" />
                    {importBusy ? "导入中..." : "导入课程"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {serviceTaskStopActionsVisible ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4"
                onClick={() => void requestServerTaskControl("pause")}
                disabled={Boolean(displayTaskSnapshot?.control_action) || !Boolean(displayTaskSnapshot?.can_pause)}
              >
                {displayTaskStatus === "pausing" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    暂停请求中
                  </span>
                ) : (
                  "暂停并保留进度"
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-9 px-4"
                onClick={() => void requestServerTaskControl("terminate")}
                disabled={Boolean(displayTaskSnapshot?.control_action) || !Boolean(displayTaskSnapshot?.can_terminate)}
              >
                {displayTaskStatus === "terminating" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    终止请求中
                  </span>
                ) : (
                  "终止并保留素材"
                )}
              </Button>
            </div>
          ) : (
            <Button
              type={cancelablePrimaryAction ? "button" : "submit"}
              disabled={primaryActionDisabled}
              className={cn(
                "h-9 px-4",
                phase === "upload_paused"
                  ? getUploadToneStyles("recoverable").button
                  : phase === "success"
                    ? getUploadToneStyles("success").buttonSubtle
                    : getUploadToneStyles("selected").button,
              )}
              data-guide-id="upload-submit"
                  onClick={localTranscribing || phase === DESKTOP_LOCAL_GENERATING_PHASE ? () => void stopLocalRecognition() : desktopLinkImporting ? () => void cancelDesktopLinkImport() : undefined}
            >
              {localTranscribing || phase === DESKTOP_LOCAL_GENERATING_PHASE ? (
                "停止生成"
              ) : desktopLinkImporting ? (
                "取消下载"
              ) : loading && (phase === "uploading" || phase === "processing" || phase === DESKTOP_LOCAL_GENERATING_PHASE) ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {phase === "uploading" ? "上传中" : desktopLinkModeActive ? "下载中" : phase === DESKTOP_LOCAL_GENERATING_PHASE ? "本机生成中" : "生成中"}
                </span>
              ) : phase === "success" ? (
                "已生成完成"
              ) : phase === "upload_paused" ? (
                "继续上传当前素材"
              ) : (
                "开始生成"
              )}
            </Button>
          )}

          {phase === "uploading" ? (
            <Button type="button" variant="outline" className="h-9 px-4" onClick={() => void pauseUpload()}>
              取消上传
            </Button>
          ) : null}
        </form>

        {showProgress ? (
          <div className={cn("space-y-3 rounded-2xl border p-4", taskToneStyles.surface)}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{getProgressHeadline(phase, uploadPercent, displayTaskSnapshot)}</p>
                <p className={cn("text-xs", taskToneStyles.text)}>总进度</p>
              </div>
              <span className={cn("text-sm font-semibold tabular-nums", taskToneStyles.text)}>{progressPercent}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-[width,background-color] duration-300", taskToneStyles.progress)} style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="grid grid-cols-5 gap-2 overflow-x-auto pb-1">
              {stageItems.map((item) => {
                const stageToneStyles = getUploadToneStyles(getUploadStageTone(item.status));
                const stageLabel = desktopLinkImporting && item.key === "convert_audio" ? "下载素材" : item.label;
                return (
                  <div key={item.key} className={cn("min-w-[120px] space-y-2 rounded-xl border px-3 py-3", stageToneStyles.surface)}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold">{stageLabel}</p>
                      <span className="text-xs font-semibold tabular-nums">{item.detailText}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/60">
                      <div className={cn("h-full rounded-full transition-[width,background-color] duration-300", stageToneStyles.progress)} style={{ width: `${item.progressPercent}%` }} />
                    </div>
                    <p className="text-xs leading-5 opacity-85">{item.statusText}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {phase === "success" && taskSnapshot?.lesson ? (
          <div className={cn("space-y-3 rounded-2xl border p-4", getUploadToneStyles("success").surface)}>
            <div className="flex items-start gap-3">
              <CheckCircle2 className={cn("mt-0.5 size-5", getUploadToneStyles("success").text)} />
              <div className="space-y-1">
                <p className={cn("text-sm font-semibold", getUploadToneStyles("success").text)}>{taskSucceededPartially ? "生成成功（仅原文字幕）" : "生成成功"}</p>
                <p className={cn("text-sm", getUploadToneStyles("success").text)}>
                  {status || taskResultMessage || "课程已写入历史记录，你可以现在开始学习，或继续上传下一份素材。"}
                </p>
                {taskSucceededPartially && (taskPartialFailureStageLabel || taskPartialFailureSummary) ? (
                  <div className="space-y-1">
                    {taskPartialFailureStageLabel ? <p className="text-xs font-semibold">未完成阶段：{taskPartialFailureStageLabel}</p> : null}
                    {taskPartialFailureSummary ? <p className="text-xs opacity-85 break-words">{taskPartialFailureSummary}</p> : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className={cn("h-9 px-3", getUploadToneStyles("success").button)} onClick={() => onNavigateToLesson?.(taskSnapshot.lesson.id)}>
                去学习
              </Button>
              {taskSucceededPartially ? (
                <Button type="button" variant="outline" className={cn("h-9 px-3", getUploadToneStyles("selected").buttonSubtle)} onClick={() => void copyTaskDebugReport(taskId || taskSnapshot?.task_id)}>
                  复制排错信息
                </Button>
              ) : null}
              <Button type="button" variant="outline" className={cn("h-9 px-3", getUploadToneStyles("selected").buttonSubtle)} onClick={() => void resetSession()}>
                继续上传
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "error" && status ? (
          <div className={cn("space-y-3 rounded-2xl border p-4", getUploadToneStyles(taskTone).surface)}>
            <p className={cn("text-sm", getUploadToneStyles(taskTone).text)}>{status}</p>
            {(failureStageLabel || failureSummary) && (
              <div className="space-y-1">
                {failureStageLabel ? (
                  <p className={cn("text-xs font-semibold", getUploadToneStyles(taskTone).text)}>失败阶段：{failureStageLabel}</p>
                ) : null}
                {failureSummary ? (
                  <p className="text-xs text-muted-foreground break-words">{failureSummary}</p>
                ) : null}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {taskId ? (
                <Button type="button" variant="outline" onClick={() => void copyTaskDebugReport(taskId)}>
                  复制排错信息
                </Button>
              ) : null}
              {canRetryWithoutUpload ? (
                <Button type="button" className={cn("h-9 px-3", getUploadToneStyles(taskSnapshot?.resume_available ? "recoverable" : "selected").button)} onClick={() => void resumeTask()}>
                  <RefreshCcw className="size-4" />
                  {taskSnapshot?.resume_available ? "免上传继续生成" : "免上传重新生成"}
                </Button>
              ) : null}
              {hasLocalFile ? (
                <Button type="button" variant="secondary" className={cn("h-9 px-3", getUploadToneStyles("selected").button)} onClick={() => void submit()}>
                  <RefreshCcw className="size-4" />
                  重新上传当前素材
                </Button>
              ) : null}
              {hasLocalFile ? (
                <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => void clearTaskRuntime()}>
                  保留素材并清空错误
                </Button>
              ) : null}
              <Button type="button" variant="outline" className="h-9 px-3" onClick={() => void resetSession()}>
                更换素材
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "upload_paused" ? (
          <div className={cn("space-y-3 rounded-2xl border p-4", getUploadToneStyles("recoverable").surface)}>
            <p className={cn("text-sm", getUploadToneStyles("recoverable").text)}>{status || "上传已暂停，可继续上传当前素材。"}</p>
            <div className="flex flex-wrap gap-2">
              {hasLocalFile ? (
                <Button type="button" className={getUploadToneStyles("recoverable").button} onClick={() => void submit()}>
                  <RefreshCcw className="size-4" />
                  继续上传当前素材
                </Button>
              ) : null}
              {hasLocalFile ? (
                <Button type="button" variant="ghost" onClick={() => void clearTaskRuntime()}>
                  保留素材并清空状态
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => void resetSession()}>
                更换素材
              </Button>
            </div>
          </div>
        ) : null}

        <Dialog
          open={Boolean(pendingLessonImport)}
          onOpenChange={(open) => {
            if (!open && !importBusy) {
              setPendingLessonImport(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>检测到课程 ID 冲突</DialogTitle>
              <DialogDescription>
                导入文件 `{pendingLessonImport?.fileName || "课程文件"}` 的课程 ID 已存在。你可以覆盖现有记录，或导入为一个新副本。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="h-9 px-3"
                onClick={() => setPendingLessonImport(null)}
                disabled={importBusy}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-3"
                onClick={() => void resolvePendingLessonImport("copy")}
                disabled={importBusy}
              >
                新建副本
              </Button>
              <Button
                type="button"
                className="h-9 px-3"
                onClick={() => void resolvePendingLessonImport("overwrite")}
                disabled={importBusy}
              >
                覆盖导入
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {desktopRuntimeAvailable ? (
          <Dialog open={diagnosticsDialogOpen} onOpenChange={setDiagnosticsDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>客户端诊断</DialogTitle>
                <DialogDescription>查看当前桌面客户端版本、云端连接、本地 Helper 与更新状态，便于快速排查用户环境问题。</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {desktopDiagnosticsItems.map((item) => (
                    <div key={item.key} className="space-y-2 rounded-2xl border bg-muted/15 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{item.title}</p>
                        <Badge variant="outline" className={getDiagnosticBadgeClassName(item.badgeTone)}>
                          {item.badgeLabel}
                        </Badge>
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground break-words">{item.detail}</p>
                    </div>
                  ))}
                </div>
                {desktopDiagnosticsError ? (
                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-700">{desktopDiagnosticsError}</div>
                ) : null}
                <div className="rounded-2xl border bg-muted/10 px-4 py-3 text-xs text-muted-foreground">
                  {desktopDiagnosticsLoading ? "正在刷新客户端诊断信息..." : "诊断信息会在打开面板时自动刷新；如状态变化较快，可手动刷新一次。"}
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => setDiagnosticsDialogOpen(false)}>
                  关闭
                </Button>
                <Button type="button" variant="outline" className="h-9 px-3" onClick={() => void refreshDesktopDiagnostics()} disabled={desktopDiagnosticsLoading}>
                  <RefreshCcw className={cn("size-4", desktopDiagnosticsLoading ? "animate-spin" : "")} />
                  刷新状态
                </Button>
                <Button type="button" className="h-9 px-3" onClick={() => void handleOpenLogsDirectory()}>
                  打开日志目录
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>提取视频</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-1">
                  <p>上传视频才可以获取素材。</p>
                  <p>您可自行寻找可以链接转视频的合法工具。</p>
                  <p>或使用推荐的工具网站。</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => setLinkDialogOpen(false)}>
                取消
              </Button>
              <Button type="button" className="h-9 px-3" onClick={() => window.open("https://snapany.com/zh", "_blank", "noopener,noreferrer")}>
                跳转
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
