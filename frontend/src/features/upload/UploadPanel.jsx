import { CheckCircle2, Loader2, RefreshCcw, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "../../lib/utils";
import { api, parseResponse, toErrorText, uploadWithProgress } from "../../shared/api/client";
import { ASR_MODEL_KEYS, buildAsrModelCatalogMap, getAsrModelCatalogItem, getAsrModelStatusLabel, isAsrModelPreparing, isAsrModelReady } from "../../shared/lib/asrModels";
import { formatMoneyCents, formatMoneyYuan, formatMoneyYuanPerMinute } from "../../shared/lib/money";
import {
  bindLocalAsrModelDirectory,
  ensureLocalAsrModel,
  getDesktopBundledAsrModelSummary,
  getLocalAsrWorkerAssetPayload,
  installDesktopBundledAsrModel,
  localAsrDirectoryBindingSupported,
  LOCAL_ASR_STORAGE_MODE_BROWSER,
  LOCAL_ASR_STORAGE_MODE_DIRECTORY,
  releaseAllLocalAsrWorkerAssetPayloads,
  releaseLocalAsrWorkerAssetPayload,
  removeLocalAsrModel,
  switchLocalAsrStorageMode,
  verifyLocalAsrModel,
} from "../../shared/media/localAsrAssetManager";
import { extractMediaCoverPreview, getLessonMediaPreview, readMediaDurationSeconds, requestPersistentStorage, saveLessonMedia } from "../../shared/media/localMediaStore";
import {
  clearActiveGenerationTask,
  clearUploadPanelSuccessSnapshot,
  getActiveGenerationTask,
  getUploadPanelSuccessSnapshot,
  saveActiveGenerationTask,
  saveUploadPanelSuccessSnapshot,
} from "../../shared/media/localTaskStore";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, MediaCover, Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui";
import { useAppStore } from "../../store";
import { buildLocalAsrLongAudioWarning, LOCAL_ASR_LONG_AUDIO_HINT_SECONDS, LOCAL_ASR_TARGET_SAMPLE_RATE, preprocessLocalAsrFile } from "./localAsrAudioPreprocess";
import { runLocalAsrWithAutoParallelism } from "./localAsrParallelRuntime";
import { getUploadModelTone, getUploadRestoreTone, getUploadStageTone, getUploadTaskTone, getUploadToneStyles } from "./uploadStatusTheme";

const QWEN_MODEL = "qwen3-asr-flash-filetrans";
const FASTER_WHISPER_MODEL = "faster-whisper-medium";
const MT_PRICE_MODEL = "qwen-mt-flash";
const ESTIMATED_MT_TOKENS_PER_MINUTE = 320;
const UPLOAD_PROGRESS_PERSIST_INTERVAL_MS = 800;
const LOCAL_ASR_FILE_ACCEPT = "audio/*,video/mp4,.mp4,.m4a,.mp3,.wav,.aac,.ogg,.flac,.opus";
const LOCAL_MODEL_VISUAL_PROGRESS_INTERVAL_MS = 120;
const LOCAL_STAGE_PROGRESS_INTERVAL_MS = 800;
const DEFAULT_LOCAL_ASR_ASSET_BASE_URL = "/api/local-asr-assets";
const LOCAL_ASR_ASSET_BASE_URL = (import.meta.env.VITE_LOCAL_ASR_MODEL_BASE_URL || DEFAULT_LOCAL_ASR_ASSET_BASE_URL).trim().replace(/\/+$/, "");
const ASR_MODELS_API_BASE = "/api/asr-models";
const LOCAL_RECOGNITION_STOPPED_MESSAGE = "已停止生成，可重新开始。";
const LOCAL_BROWSER_ASR_ENABLED = false;
const DEFAULT_ASR_MODEL_CATALOG_MAP = buildAsrModelCatalogMap();
const DEFAULT_FAST_UPLOAD_MODEL = QWEN_MODEL;
function hasDesktopRuntimeBridge() {
  return typeof window !== "undefined" && typeof window.desktopRuntime?.requestLocalHelper === "function";
}

const LOCAL_MODEL_OPTIONS = [
  {
    key: ASR_MODEL_KEYS.sensevoiceBrowser,
    workerModelId: ASR_MODEL_KEYS.sensevoiceBrowser,
    title: "SenseVoice Small",
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
  if (normalizedConfiguredModel === ASR_MODEL_KEYS.sensevoiceBrowser || normalizedConfiguredModel === ASR_MODEL_KEYS.sensevoiceServer) {
    return DEFAULT_FAST_UPLOAD_MODEL;
  }
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
  sensevoiceModelReady,
  sensevoiceModelPreparing,
  sensevoiceModelBusy,
  fasterModelReady,
  fasterModelPreparing,
  fasterModelBusy,
}) {
  if (item.key === ASR_MODEL_KEYS.sensevoiceServer) {
    return {
      label: sensevoiceModelReady ? "重新准备" : sensevoiceModelPreparing || sensevoiceModelBusy ? "准备中" : "准备模型",
      disabled: uploadActionBusy || sensevoiceModelBusy || sensevoiceModelPreparing || localTranscribing,
    };
  }
  if (item.key === FASTER_WHISPER_MODEL) {
    return {
      label: fasterModelReady ? "重新准备" : fasterModelPreparing || fasterModelBusy ? "准备中" : "准备模型",
      disabled: uploadActionBusy || fasterModelBusy || fasterModelPreparing || localTranscribing,
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

function logUploadLocalAsrDebug(message, extra = {}) {
  if (typeof console === "undefined" || typeof console.debug !== "function") return;
  console.debug("[DEBUG] upload.local_asr", message, extra);
}

async function extractAudioForLocalAsrWithServer(file, accessToken = "", signal = undefined) {
  const form = new FormData();
  form.append("video_file", file);
  const resp = await api(
    "/api/lessons/local-asr/audio-extract",
    {
      method: "POST",
      body: form,
      signal,
    },
    accessToken,
  );
  if (!resp.ok) {
    const payload = await parseResponse(resp);
    throw new Error(toErrorText(payload, "视频音轨提取失败"));
  }
  return resp.blob();
}

async function prepareAudioDataForLocalAsr(file, accessToken = "", options = {}) {
  const { preferServerExtract = false, signal = undefined } = options;
  const isMp4 = String(file?.type || "").toLowerCase() === "video/mp4" || /\.mp4$/i.test(String(file?.name || ""));
  const preprocessOptions = {
    targetSampleRate: LOCAL_ASR_TARGET_SAMPLE_RATE,
    unsupportedAudioContextMessage: "当前浏览器暂不支持这个模型",
    mp4DecodeErrorMessage: "当前 MP4 音轨无法直接解析，请改传音频或换另一个模型。",
    decodeErrorPrefix: "解析音频失败",
  };
  if (isMp4 && preferServerExtract) {
    if (!accessToken) {
      throw new Error("当前登录状态已失效，请重新登录后再试。");
    }
    const extractStart = nowMs();
    const extractedAudio = await extractAudioForLocalAsrWithServer(file, accessToken, signal);
    const extractedFile = new File([extractedAudio], `${String(file?.name || "local-source").replace(/\.[^.]+$/, "") || "local-source"}.opus`, {
      type: String(extractedAudio.type || "audio/ogg"),
      lastModified: Date.now(),
    });
    const preprocessResult = await preprocessLocalAsrFile(extractedFile, preprocessOptions);
    return {
      ...preprocessResult,
      metrics: {
        ...(preprocessResult?.metrics || {}),
        audio_extract_ms: Math.max(0, Math.round(nowMs() - extractStart)),
      },
    };
  }
  try {
    return await preprocessLocalAsrFile(file, preprocessOptions);
  } catch (error) {
    if (!isMp4) {
      throw error;
    }
    if (!accessToken) {
      throw new Error("当前 MP4 音轨无法直接解析，请改传音频或换另一个模型。");
    }
    const extractStart = nowMs();
    const extractedAudio = await extractAudioForLocalAsrWithServer(file, accessToken, signal);
    const extractedFile = new File([extractedAudio], `${String(file?.name || "local-source").replace(/\.[^.]+$/, "") || "local-source"}.opus`, {
      type: String(extractedAudio.type || "audio/ogg"),
      lastModified: Date.now(),
    });
    const preprocessResult = await preprocessLocalAsrFile(extractedFile, preprocessOptions);
    return {
      ...preprocessResult,
      metrics: {
        ...(preprocessResult?.metrics || {}),
        audio_extract_ms: Math.max(0, Math.round(nowMs() - extractStart)),
      },
    };
  }
}

function buildWorkerRequestId(sequence) {
  return `upload-local-asr-${Date.now()}-${sequence}`;
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
    .replace(/本地 SenseVoice/g, "SenseVoice")
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
  if (phase === "local_transcribing") {
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

function estimateLocalAsrStageRatio(elapsedMs, durationSec) {
  const elapsedSeconds = Math.max(0, Number(elapsedMs || 0)) / 1000;
  const expectedSeconds = Math.max(30, Math.min(120, Math.round(Math.max(10, Number(durationSec || 0)) * 0.6)));
  if (elapsedSeconds <= 0) return 0.12;
  return Math.min(0.84, 0.12 + Math.min(0.72, (elapsedSeconds / expectedSeconds) * 0.72));
}

function buildLocalAsrProgressCounters(elapsedMs, durationSec) {
  const totalUnits = Math.max(0, Math.ceil(Number(durationSec || 0)));
  if (totalUnits <= 0) {
    return {
      asr_done: 0,
      asr_estimated: 0,
      translate_done: 0,
      translate_total: 0,
      segment_done: 0,
      segment_total: 0,
    };
  }
  const elapsedSeconds = Math.max(0, Number(elapsedMs || 0)) / 1000;
  const expectedSeconds = Math.max(30, Math.min(120, Math.round(Math.max(10, Number(durationSec || 0)) * 0.6)));
  const runningRatio = expectedSeconds > 0 ? Math.min(0.94, (elapsedSeconds / expectedSeconds) * 0.94) : 0;
  const done = Math.min(Math.max(0, totalUnits - 1), Math.floor(totalUnits * runningRatio));
  return {
    asr_done: done,
    asr_estimated: totalUnits,
    translate_done: 0,
    translate_total: 0,
    segment_done: 0,
    segment_total: 0,
  };
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

export function UploadPanel({ accessToken, isActivePanel = true, onCreated, balanceAmountCents, balancePoints, billingRates, subtitleSettings, onWalletChanged, onTaskStateChange, onNavigateToLesson }) {
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
  const [coverDataUrl, setCoverDataUrl] = useState("");
  const [coverAspectRatio, setCoverAspectRatio] = useState(0);
  const [coverWidth, setCoverWidth] = useState(0);
  const [coverHeight, setCoverHeight] = useState(0);
  const [isVideoSource, setIsVideoSource] = useState(false);
  const [taskSnapshot, setTaskSnapshot] = useState(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [bindingCompleted, setBindingCompleted] = useState(false);
  const [selectedUploadModel, setSelectedUploadModel] = useState(() => getDefaultUploadModelKey(configuredDefaultAsrModel));
  const [mode, setMode] = useState("fast");
  const [asrModelCatalogMap, setAsrModelCatalogMap] = useState(DEFAULT_ASR_MODEL_CATALOG_MAP);
  const [localWorkerEpoch, setLocalWorkerEpoch] = useState(0);
  const [localWorkerReadyMap, setLocalWorkerReadyMap] = useState({ sensevoice: false });
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
  const freshEntryInitKeyRef = useRef("");
  const restoreVerificationTaskRef = useRef("");
  const successStateOriginRef = useRef("none");
  const fallbackToastTaskRef = useRef("");
  const localSenseWorkerRef = useRef(null);
  const localAsrRequestSequenceRef = useRef(0);
  const localAsrPendingRequestsRef = useRef(new Map());
  const ownerUserId = Number(currentUser?.id || 0);

  const selectedFastModel = useMemo(() => {
    const selectedMeta = getUploadModelMeta(selectedUploadModel);
    if (selectedMeta.mode === "fast") {
      return selectedMeta.key;
    }
    return getDefaultFastUploadModelKey(configuredDefaultAsrModel);
  }, [configuredDefaultAsrModel, selectedUploadModel]);
  const selectedAsrModel = mode === "balanced" ? selectedBalancedModel : selectedFastModel;
  const pricingModelKey = mode === "balanced" ? DEFAULT_FAST_UPLOAD_MODEL : selectedFastModel;
  const selectedRate = getRateByModel(billingRates, pricingModelKey);
  const selectedRatePricePerMinuteYuan = selectedRate ? getRatePricePerMinuteYuan(selectedRate) : 0;
  const estimatedAsrChargeCents = selectedRate ? calculateChargeCentsBySeconds(durationSec || 0, selectedRatePricePerMinuteYuan) : 0;
  const mtRate = getRateByModel(billingRates, MT_PRICE_MODEL);
  const mtRateCentsPer1kTokens = Number(mtRate?.points_per_1k_tokens || 0);
  const mtRatePricePer1kTokensYuan = getRatePricePer1kTokensYuan(mtRate);
  const estimatedMtTokens = estimateMtTokensByDuration(durationSec || 0);
  const estimatedMtChargeCents = calculateChargeCentsByTokens(estimatedMtTokens, mtRateCentsPer1kTokens);
  const estimatedTotalChargeCents = estimatedAsrChargeCents + estimatedMtChargeCents;
  const localWorkerReady = Boolean(localWorkerReadyMap.sensevoice);
  const balancedPerformanceWarning = useMemo(
    () => (mode === "balanced" ? buildLocalAsrLongAudioWarning(durationSec, LOCAL_ASR_LONG_AUDIO_HINT_SECONDS) : ""),
    [durationSec, mode],
  );
  const selectedServerModelState = serverModelStateMap[selectedUploadModel] || {};
  const selectedServerModelPreparing = isAsrModelPreparing(selectedServerModelState);
  const selectedFastModelNeedsPreparation = mode === "fast" && SERVER_PREPARABLE_MODELS.has(selectedUploadModel);
  const localTranscribing = phase === "local_transcribing";
  const displayTaskSnapshot = localTranscribing ? localProgressSnapshot : taskSnapshot;
  const hasLocalFile = Boolean(file);
  const displayTaskStatus = String(displayTaskSnapshot?.status || "").toLowerCase();
  const taskCompletionKind = String(taskSnapshot?.completion_kind || displayTaskSnapshot?.completion_kind || "full").toLowerCase();
  const taskResultMessage = sanitizeUserFacingText(String(taskSnapshot?.result_message || displayTaskSnapshot?.result_message || ""));
  const taskPartialFailureStageKey = String(taskSnapshot?.partial_failure_stage || "").trim();
  const taskPartialFailureStageLabel = taskPartialFailureStageKey ? getStageLabelByKey(taskPartialFailureStageKey) : "";
  const taskPartialFailureSummary = sanitizeUserFacingText(String(taskSnapshot?.partial_failure_message || "")).slice(0, 160);
  const taskSucceededPartially = !localTranscribing && displayTaskStatus === "succeeded" && taskCompletionKind === "partial";
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
  const sourceDisplayName = String(file?.name || taskSnapshot?.lesson?.source_filename || "");
  const uploadActionBusy = loading && ["uploading", "processing", "local_transcribing"].includes(String(phase || ""));
  const localModeBusy = Boolean(localBusyModelKey || serverBusyModelKey) || localTranscribing;
  const primaryActionDisabled =
    phase === "success" ||
    (loading && !localTranscribing && !serviceTaskStopActionsVisible) ||
    (mode === "balanced" && !localTranscribing && (!localAsrSupport.supported || !localWorkerReady || Boolean(localBusyModelKey)));
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

  function maybeShowModelFallbackToast(payload) {
    void payload;
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
    setLocalWorkerReadyMap({ sensevoice: false });
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
    if (mode === "balanced") {
      setSelectedUploadModel((prev) => (prev === getDefaultFastUploadModelKey(configuredDefaultAsrModel) ? prev : getDefaultFastUploadModelKey(configuredDefaultAsrModel)));
      return;
    }
    setSelectedUploadModel((prev) => (getUploadModelMeta(prev).mode === "fast" ? prev : getDefaultFastUploadModelKey(configuredDefaultAsrModel)));
  }, [configuredDefaultAsrModel, mode]);

  useEffect(() => {
    if (!LOCAL_BROWSER_ASR_ENABLED) {
      setLocalWorkerReadyMap({ sensevoice: false });
      setLocalModelStateMap({});
      return undefined;
    }
    if (!localAsrSupport.supported) {
      setLocalWorkerReadyMap({ sensevoice: false });
      const unsupportedMap = Object.fromEntries(
        LOCAL_MODEL_OPTIONS.map((item) => [
          item.key,
          {
            status: "unsupported",
            runtime: "",
            progress: null,
            error: localAsrSupport.reason,
          },
        ]),
      );
      setLocalModelStateMap(unsupportedMap);
      return undefined;
    }
    const senseWorker = new Worker(new URL("./localAsrPreviewWorker.js", import.meta.url));
    localSenseWorkerRef.current = senseWorker;
    setLocalWorkerReadyMap({ sensevoice: true });

    const handleMessage = (event) => {
      const payload = event?.data || {};
      const requestId = String(payload?.requestId || "");
      const pending = requestId ? localAsrPendingRequestsRef.current.get(requestId) : null;
      const modelKey = pending?.modelKey || LOCAL_MODEL_OPTIONS.find((item) => item.workerModelId === String(payload?.modelId || payload?.model_id || ""))?.key || "";
      if (payload?.type === "progress" && modelKey) {
        if (payload.stage === "model-load-start") {
          updateLocalModelState(modelKey, { status: "loading", runtime: String(payload.runtime || ""), progress: null, error: "" });
          setLocalBusyModelKey(modelKey);
          setLocalBusyText(sanitizeUserFacingText(payload.status_text || "正在下载模型"));
          return;
        }
        if (payload.stage === "model-progress") {
          updateLocalModelState(modelKey, {
            status: "loading",
            runtime: String(payload.runtime || ""),
            progress: Number.isFinite(Number(payload.progress)) ? clampPercent(payload.progress) : null,
            error: "",
          });
          setLocalBusyModelKey(modelKey);
          setLocalBusyText(sanitizeUserFacingText(payload.status || "正在下载模型"));
          return;
        }
        if (payload.stage === "runtime-fallback") {
          updateLocalModelState(modelKey, { runtime: String(payload.runtime || "wasm") });
          setLocalBusyText(sanitizeUserFacingText(payload.status_text || "已切换为兼容模式"));
          return;
        }
      }
      if (payload?.type === "result" && pending) {
        localAsrPendingRequestsRef.current.delete(requestId);
        pending.resolve(payload);
        return;
      }
      if (payload?.type === "error" && pending) {
        localAsrPendingRequestsRef.current.delete(requestId);
        pending.reject(new Error(sanitizeUserFacingText(payload.message || "识别组件失败")));
      }
    };

    const buildWorkerErrorHandler = (workerKind) => (event) => {
      const message = sanitizeUserFacingText(event?.message || "识别组件启动失败");
      rejectPendingLocalRequests(message);
      setWorkerReady(workerKind, false);
      setLocalBusyModelKey("");
      setLocalBusyText("");
      setLocalModelStateMap((prev) => {
        const next = { ...prev };
        LOCAL_MODEL_OPTIONS.forEach((item) => {
          if (workerKind !== "sensevoice") return;
          next[item.key] = {
            ...(next[item.key] || {}),
            status: "error",
            error: message,
          };
        });
        return next;
      });
    };
    const handleSenseWorkerError = buildWorkerErrorHandler("sensevoice");

    senseWorker.addEventListener("message", handleMessage);
    senseWorker.addEventListener("error", handleSenseWorkerError);
    return () => {
      senseWorker.removeEventListener("message", handleMessage);
      senseWorker.removeEventListener("error", handleSenseWorkerError);
      rejectPendingLocalRequests("识别组件已关闭");
      setLocalWorkerReadyMap({ sensevoice: false });
      senseWorker.terminate();
      releaseAllLocalAsrWorkerAssetPayloads();
      if (localSenseWorkerRef.current === senseWorker) localSenseWorkerRef.current = null;
    };
  }, [localAsrSupport.reason, localAsrSupport.supported, localWorkerEpoch]);

  useEffect(() => {
    const timer = setInterval(() => {
      setLocalModelVisualProgressMap((prev) => {
        let changed = false;
        const next = { ...prev };
        LOCAL_MODEL_OPTIONS.forEach((item) => {
          const modelState = localModelStateMap[item.key] || {};
          const status = String(modelState.status || "");
          const rawProgress = Number(modelState.progress);
          const shouldShowProgress =
            ["ready", "cached"].includes(status) || (status === "loading" && Number.isFinite(rawProgress));

          if (!shouldShowProgress) {
            if (Object.prototype.hasOwnProperty.call(next, item.key)) {
              delete next[item.key];
              changed = true;
            }
            return;
          }

          const target = ["ready", "cached"].includes(status) ? 100 : clampPercent(rawProgress);
          const current = Number.isFinite(Number(prev[item.key])) ? clampPercent(prev[item.key]) : 0;
          const nextValue =
            target >= 100
              ? 100
              : current >= target
                ? current
                : Math.min(target, current + Math.max(1, Math.ceil((target - current) * 0.22)));

          if (!Object.prototype.hasOwnProperty.call(next, item.key) || Math.abs(Number(next[item.key]) - nextValue) > 0.001) {
            next[item.key] = nextValue;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, LOCAL_MODEL_VISUAL_PROGRESS_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [localModelStateMap]);

  useEffect(() => {
    if (!LOCAL_BROWSER_ASR_ENABLED) {
      setLocalModelStateMap({});
      return undefined;
    }
    let canceled = false;
    async function restoreLocalModelState() {
      const nextEntries = await Promise.all(
        LOCAL_MODEL_OPTIONS.map(async (item) => {
          if (!localAsrSupport.supported) {
            return [item.key, { status: "unsupported", runtime: "", progress: null, error: localAsrSupport.reason }];
          }
          if (!item.uploadEnabled) {
            return [item.key, { status: "unsupported", runtime: "", progress: null, error: String(item.unavailableReason || "") }];
          }
          try {
            const verification = await verifyLocalAsrModel(item.key, LOCAL_ASR_ASSET_BASE_URL);
            return [
              item.key,
              {
                status: verification.status,
                runtime: verification.runtime,
                progress: verification.ready ? 100 : null,
                error: verification.error,
                message: verification.message,
                storageMode: verification.storageMode,
                storageSummary: verification.storageSummary,
                directoryName: verification.directoryName,
                directoryBound: verification.directoryBound,
                cacheVersion: verification.cacheVersion,
                missingFiles: verification.missingFiles,
              },
            ];
          } catch (error) {
            return [
              item.key,
              {
                status: "error",
                runtime: "",
                progress: null,
                error: error instanceof Error && error.message ? error.message : String(error),
              },
            ];
          }
        }),
      );
      if (canceled) return;
      const nextMap = Object.fromEntries(nextEntries);
      setLocalModelStateMap(nextMap);
    }
    void restoreLocalModelState();
    return () => {
      canceled = true;
    };
  }, [localAsrSupport.reason, localAsrSupport.supported]);

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
    if (!selectedFastModelNeedsPreparation) return undefined;
    if (!selectedServerModelPreparing) return undefined;
    const timer = setInterval(() => {
      void fetchServerModelStatus(selectedUploadModel, { silent: true });
    }, 3000);
    return () => clearInterval(timer);
  }, [selectedFastModelNeedsPreparation, selectedServerModelPreparing, selectedUploadModel]);

  function resetLocalSessionState(options = {}) {
    const { clearFileInput = true } = options;
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
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
    const restorablePhase = nextPhase === "local_transcribing" ? (nextFile ? "ready" : "idle") : nextPhase;
    const restorableStatus =
      nextPhase === "local_transcribing"
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
      file_blob: nextFile instanceof Blob ? nextFile : null,
      file_name: String(nextFile?.name || ""),
      media_type: String(nextFile?.type || ""),
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
    resetLocalSessionState();
    if (!ownerUserId) return;
    await clearUploadPanelSuccessSnapshot(ownerUserId);
    await clearActiveGenerationTask(ownerUserId);
  }

  async function saveSuccessSnapshot(sourceFile, data, nextStatus = "") {
    if (!ownerUserId || !data?.lesson?.id) return;
    await saveUploadPanelSuccessSnapshot(ownerUserId, {
      phase: "success",
      task_snapshot: data,
      selected_upload_model: String(selectedUploadModel || ""),
      file_blob: sourceFile instanceof Blob ? sourceFile : null,
      file_name: String(sourceFile?.name || data.lesson.source_filename || ""),
      media_type: String(sourceFile?.type || ""),
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
    const restoredFile = createFileFromBlob(saved?.file_blob, saved?.file_name, saved?.media_type);
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
    const restoredFile = createFileFromBlob(saved?.file_blob, saved?.file_name, saved?.media_type);
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

  function persistUploadProgress(nextPercent) {
    if (!ownerUserId || !file) return;
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
      void persistSession({ phase: "uploading", uploadPercent: normalizedPercent, status: "" });
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
    let mediaPersisted = false;
    let mediaPreview = null;
    const partialSuccess = String(data?.completion_kind || "full").toLowerCase() === "partial";
    const successMessages = [];
    if (String(data?.result_message || data?.message || "").trim()) {
      successMessages.push(String(data.result_message || data.message).trim());
    }
    if (data.lesson?.id && sourceFile && data.lesson.media_storage === "client_indexeddb" && !bindingCompleted) {
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
    await onWalletChanged?.();
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
    stopPollingSession();
    resetUploadPersistState();
    uploadAbortRef.current?.abort();
    localRunAbortRef.current?.abort();
    localRunAbortRef.current = null;
    clearLocalStageProgressTimer();
    localRunTokenRef.current += 1;
    if (ownerUserId) {
      await clearUploadPanelSuccessSnapshot(ownerUserId);
    }
    setFile(nextFile);
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
    if (!nextFile) {
      setPhase("idle");
      if (ownerUserId) {
        await clearActiveGenerationTask(ownerUserId);
      }
      return;
    }
    setPhase("probing");
    try {
      const [seconds, cover] = await Promise.all([readMediaDurationSeconds(nextFile, nextFile.name || ""), extractMediaCoverPreview(nextFile, nextFile.name || "")]);
      setDurationSec(seconds);
      setCoverDataUrl(String(cover.coverDataUrl || ""));
      setCoverWidth(Number(cover.width || 0));
      setCoverHeight(Number(cover.height || 0));
      setCoverAspectRatio(Number(cover.aspectRatio || 0));
      setIsVideoSource(String(nextFile.type || "").startsWith("video/"));
      setPhase("ready");
      await persistSession({ file: nextFile, phase: "ready", durationSec: seconds, coverDataUrl: cover.coverDataUrl, coverWidth: cover.width, coverHeight: cover.height, aspectRatio: cover.aspectRatio, isVideoSource: String(nextFile.type || "").startsWith("video/") });
    } catch (_) {
      setPhase("ready");
      setIsVideoSource(String(nextFile.type || "").startsWith("video/"));
      await persistSession({ file: nextFile, phase: "ready", isVideoSource: String(nextFile.type || "").startsWith("video/") });
    }
  }

  async function fetchDesktopBundleStatus(modelKey, options = {}) {
    const { silent = false } = options;
    if (!hasDesktopRuntimeBridge() || modelKey !== FASTER_WHISPER_MODEL) {
      return null;
    }
    try {
      const summary = await getDesktopBundledAsrModelSummary(modelKey);
      applyDesktopBundleState(modelKey, summary, { lastError: "" });
      return summary;
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error);
      updateDesktopBundleState(modelKey, {
        available: false,
        installAvailable: false,
        sourceAvailable: false,
        message: "",
        lastError: message,
      });
      if (!silent) {
        toast.error(message);
      }
      return null;
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

  async function submitBalanced(pollToken) {
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
    setPhase("local_transcribing");
    setLoading(true);
    setStatus("正在识别字幕");
    await persistSession({ taskId: "", phase: "local_transcribing", taskSnapshot: null, uploadPercent: 0, status: "正在识别字幕", bindingCompleted: false });
    const totalStart = nowMs();
    try {
      const isVideoFile = String(file?.type || "").startsWith("video/");
      if (isVideoFile) {
        const extractingStatus = "正在从视频提取音轨";
        console.debug("[DEBUG] upload.local_asr.stage", {
          stage: "convert_audio",
          fileName: String(file?.name || ""),
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
      const preprocessResult = await prepareAudioDataForLocalAsr(file, accessToken, {
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
        file_name: String(file?.name || ""),
        model: selectedBalancedModel,
        duration_sec: preprocessDurationSec,
        warning: Boolean(buildLocalAsrLongAudioWarning(preprocessDurationSec, LOCAL_ASR_LONG_AUDIO_HINT_SECONDS)),
        ...preprocessMetrics,
      });
      const localAsrStatus = "正在识别字幕";
      console.debug("[DEBUG] upload.local_asr.stage", {
        stage: "asr_transcribe",
        fileName: String(file?.name || ""),
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
      const parallelSegmentCount = Math.max(0, Number(localResult?.segmentCount || localResult?.raw_result?.segment_count || 0));
      const postprocessMs = Math.max(0, Math.round(nowMs() - postprocessStart));
      logUploadLocalAsrDebug("run.done", {
        file_name: String(file?.name || ""),
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
            source_filename: String(file?.name || "local-source"),
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
        const message = toErrorText(data, "创建识别任务失败");
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
      logUploadLocalAsrDebug("run.failed", {
        file_name: String(file?.name || ""),
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

  async function submit() {
    if (!file) {
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
    const pollToken = startPollingSession();
    uploadAbortRef.current?.abort();
    setLoading(true);
    setTaskId("");
    setStatus("");
    setTaskSnapshot(null);
    setUploadPercent(0);
    uploadPersistRef.current.latestPercent = 0;
    setLocalProgressSnapshot(null);
    if (mode === "balanced") {
      await submitBalanced(pollToken);
      return;
    }
    setPhase("uploading");
    await persistSession({ taskId: "", phase: "uploading", taskSnapshot: null, uploadPercent: 0, status: "", bindingCompleted: false });
    try {
      const form = new FormData();
      form.append("video_file", file);
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
            persistUploadProgress(nextPercent);
          },
        },
        accessToken,
      );
      uploadAbortRef.current = null;
      if (!ok) {
        const message = toErrorText(data, "创建上传任务失败");
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="size-4" />
          上传素材
        </CardTitle>
        <CardDescription>自动识别、翻译并生成学习课程。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className={cn("border", getUploadToneStyles("idle").surface)}>
          <AlertDescription>
            <p className="text-muted-foreground">余额：{formatMoneyCents(normalizedBalanceAmountCents)}</p>
            <p className="text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted underline-offset-2">预估价格</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">ASR 按素材秒数折算分钟估算；MT 按 qwen-mt-flash 的 1k Tokens 费率与常见字幕量近似估算，最终以实际翻译 Tokens 结算。</TooltipContent>
              </Tooltip>
              ：
              {selectedRate
                ? durationSec != null
                  ? `${formatMoneyCents(estimatedTotalChargeCents)}（ASR ${formatMoneyCents(estimatedAsrChargeCents)} + MT 约 ${formatMoneyCents(estimatedMtChargeCents)}）`
                  : "选择文件后显示"
                : "该模型未配置 ASR 单价"}
            </p>
            <p className="text-xs text-muted-foreground">
              MT 估算：{mtRatePricePer1kTokensYuan > 0 ? `${formatMoneyYuan(mtRatePricePer1kTokensYuan)}/1k Tokens` : "未配置 MT 费率"}，按约{" "}
              {ESTIMATED_MT_TOKENS_PER_MINUTE} Tokens/分钟折算，最终以实际翻译 Tokens 为准。
            </p>
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">选择字幕生成方式</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {UPLOAD_MODEL_OPTIONS.map((item) => {
              const selected = selectedUploadModel === item.key;
              const isSenseVoice = item.key === ASR_MODEL_KEYS.sensevoiceServer;
              const isFasterWhisper = item.key === FASTER_WHISPER_MODEL;
              const isQwen = item.key === QWEN_MODEL;
              const uploadCardMeta = mergeCatalogIntoUploadModelMeta(item.key, asrModelCatalogMap);
              const sensevoiceModelState = serverModelStateMap[item.key] || {};
              const sensevoiceModelReady = isAsrModelReady(sensevoiceModelState);
              const sensevoiceModelBusy = serverBusyModelKey === item.key;
              const sensevoiceModelPreparing = isAsrModelPreparing(sensevoiceModelState);
              const fasterModelState = serverModelStateMap[item.key] || {};
              const fasterModelReady = isAsrModelReady(fasterModelState);
              const fasterModelBusy = serverBusyModelKey === item.key;
              const fasterModelPreparing = isAsrModelPreparing(fasterModelState);
              const desktopBundleState = desktopBundleStateMap[item.key] || {};
              const desktopBundleAvailable = Boolean(desktopBundleState.available);
              const desktopBundleInstallAvailable = Boolean(desktopBundleState.installAvailable);
              const desktopBundleBusy = desktopBundleBusyModelKey === item.key;
              const sensevoiceCardStatus = String(sensevoiceModelState.status || "").trim().toLowerCase();
              const fasterCardStatus = String(fasterModelState.status || "").trim().toLowerCase();
              const cardStatusLabel = isSenseVoice
                ? getAsrModelStatusLabel(sensevoiceModelState, { readyLabel: "已就绪", missingLabel: "未准备", loadingLabel: "准备中", errorLabel: "异常", unsupportedLabel: "不可用" })
                : isFasterWhisper
                  ? getAsrModelStatusLabel(fasterModelState, { readyLabel: "已就绪", missingLabel: "未准备", loadingLabel: "准备中", errorLabel: "异常", unsupportedLabel: "不可用" })
                  : getAsrModelStatusLabel({ status: "ready", downloadRequired: false }, { readyLabel: "可用" });
              const cardPriceLabel = getUploadModelPriceLabel(item, billingRates);
              const highlightStatus = isSenseVoice ? sensevoiceModelReady : isFasterWhisper ? fasterModelReady : true;
              const modelCardHasError = isSenseVoice
                ? Boolean(sensevoiceModelState.lastError) || ["error", "unsupported"].includes(sensevoiceCardStatus)
                : Boolean(fasterModelState.lastError) || String(fasterModelState.status || "").trim().toLowerCase() === "error";
              const modelCardTone = getUploadModelTone({
                selected,
                ready: highlightStatus,
                busy: (isSenseVoice && (sensevoiceModelBusy || sensevoiceModelPreparing)) || (isFasterWhisper && (fasterModelBusy || fasterModelPreparing)),
                error: modelCardHasError,
              });
              const modelCardToneStyles = getUploadToneStyles(modelCardTone);
              const modelBadgeToneStyles = getUploadToneStyles(highlightStatus ? "success" : modelCardTone === "running" ? "running" : "idle");
              const showCardProgress = isSenseVoice
                ? sensevoiceModelPreparing || sensevoiceModelBusy
                : isFasterWhisper
                  ? fasterModelPreparing || fasterModelBusy
                  : false;
              const cardProgressValue = null;
              const cardProgressText = String(serverBusyText || (isSenseVoice ? sensevoiceModelState.message : fasterModelState.message) || "准备中");
              const cardErrorText = isSenseVoice
                ? sanitizeUserFacingText(String(sensevoiceModelState.lastError || ""))
                : isFasterWhisper
                  ? sanitizeUserFacingText(String(fasterModelState.lastError || ""))
                  : "";
              const desktopBundleStatusText =
                isFasterWhisper && hasDesktopRuntimeBridge()
                  ? sanitizeUserFacingText(
                      String(
                        desktopBundleState.message ||
                          (desktopBundleAvailable
                            ? "桌面端本机 Bottle 1.0 资源已预装。"
                            : desktopBundleInstallAvailable
                              ? "桌面端本机 Bottle 1.0 资源未预装，可在安装后继续准备。"
                              : ""),
                      ),
                    )
                  : "";
              const desktopBundleErrorText = isFasterWhisper && hasDesktopRuntimeBridge() ? sanitizeUserFacingText(String(desktopBundleState.lastError || "")) : "";
              const cardStatusText = isSenseVoice
                ? sanitizeUserFacingText(
                    sensevoiceModelState.message ||
                      (sensevoiceModelReady
                        ? "服务端模型已就绪，可直接生成。"
                        : sensevoiceCardStatus === "error"
                          ? "服务端模型暂未就绪，请重新准备。"
                          : String(uploadCardMeta.note || uploadCardMeta.subtitle || "")),
                  )
                : isFasterWhisper
                  ? sanitizeUserFacingText(
                      fasterModelState.message ||
                        (fasterModelReady
                          ? "服务端模型已就绪，可直接生成。"
                          : fasterCardStatus === "error"
                            ? "服务端模型暂未就绪，请重新准备。"
                            : String(uploadCardMeta.note || uploadCardMeta.subtitle || "")),
                    )
                  : sanitizeUserFacingText(String(uploadCardMeta.note || uploadCardMeta.subtitle || ""));
              const actionMeta = getUploadCardActionMeta({
                item,
                uploadActionBusy,
                localTranscribing,
                localAsrSupport,
                localWorkerReady,
                localCardBusy: false,
                localCardDownloaded: false,
                sensevoiceModelReady,
                sensevoiceModelPreparing,
                sensevoiceModelBusy,
                fasterModelReady,
                fasterModelPreparing,
                fasterModelBusy,
              });
              const showReadyIcon = !isQwen && highlightStatus;
              const showLoadingIcon = !isQwen && ((isSenseVoice && (sensevoiceModelBusy || sensevoiceModelPreparing)) || (isFasterWhisper && (fasterModelBusy || fasterModelPreparing)));

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
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{uploadCardMeta.title}</p>
                      <p className="text-sm text-muted-foreground">{cardPriceLabel}</p>
                      <p className="text-xs text-muted-foreground">{uploadCardMeta.subtitle}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(highlightStatus ? modelBadgeToneStyles.badgeSolid : modelBadgeToneStyles.badge)}
                    >
                      {showReadyIcon ? <CheckCircle2 className="mr-1 size-3.5" /> : null}
                      {showLoadingIcon ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                      {cardStatusLabel}
                    </Badge>
                  </div>

                    <div className="rounded-xl border bg-background/70 p-3">
                      <p className="text-xs leading-5 text-muted-foreground">{cardStatusText || "选择后即可开始。"}</p>
                      {desktopBundleStatusText ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{desktopBundleStatusText}</p> : null}
                      {cardErrorText ? <p className="mt-2 text-xs leading-5 text-destructive break-all">{cardErrorText}</p> : null}
                      {desktopBundleErrorText ? <p className="mt-2 text-xs leading-5 text-destructive break-all">{desktopBundleErrorText}</p> : null}
                    </div>

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
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isSenseVoice) {
                          void handleServerModelPrepare(item.key);
                          return;
                        }
                        if (isFasterWhisper) {
                          void handleServerModelPrepare(item.key);
                        }
                      }}
                      disabled={actionMeta.disabled}
                    >
                      {showLoadingIcon ? <Loader2 className="size-4 animate-spin" /> : null}
                      {actionMeta.label}
                    </Button>
                    {isFasterWhisper && hasDesktopRuntimeBridge() ? (
                      <Button
                        type="button"
                        variant={desktopBundleAvailable ? "outline" : "secondary"}
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
                  className={getUploadToneStyles("recoverable").button}
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
                  (restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED || restoreBannerMode === RESTORE_BANNER_MODES.NONE) && taskPaused
                    ? getUploadToneStyles("selected").buttonSubtle
                    : getUploadToneStyles("selected").button
                }
                onClick={() => void clearTaskRuntime("已保留素材，可重新开始。")}
              >
                <RefreshCcw className="size-4" />
                重新开始
              </Button>
              <Button type="button" variant="ghost" onClick={() => void clearTaskRuntime()}>
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
          <div className="grid gap-2" data-guide-id="upload-select-file">
            <input
              id="asr-file"
              ref={fileInputRef}
              type="file"
              accept={mode === "balanced" ? LOCAL_ASR_FILE_ACCEPT : undefined}
              className="hidden"
              onChange={(event) => {
                void onSelectFile(event.target.files?.[0] ?? null);
              }}
              disabled={loading || localModeBusy}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                    fileInputRef.current.click();
                  }
                }}
                disabled={loading || localModeBusy}
              >
                选择文件
              </Button>
              <Button type="button" variant="secondary" className="h-11" onClick={() => setLinkDialogOpen(true)} disabled={loading || localModeBusy}>
                链接生成视频
              </Button>
            </div>
          </div>

          {serviceTaskStopActionsVisible ? (
            <div className="grid gap-2 md:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-11"
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
                className="h-11"
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
              type={localTranscribing ? "button" : "submit"}
              disabled={primaryActionDisabled}
              className={cn(
                "h-11 w-full",
                phase === "upload_paused"
                  ? getUploadToneStyles("recoverable").button
                  : phase === "success"
                    ? getUploadToneStyles("success").buttonSubtle
                    : getUploadToneStyles("selected").button,
              )}
              data-guide-id="upload-submit"
              onClick={localTranscribing ? () => void stopLocalRecognition() : undefined}
            >
              {localTranscribing ? (
                "停止生成"
              ) : loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  {phase === "uploading" ? "上传中" : "生成中"}
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
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => void pauseUpload()}>
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
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {stageItems.map((item) => {
                const stageToneStyles = getUploadToneStyles(getUploadStageTone(item.status));
                return (
                  <div key={item.key} className={cn("space-y-2 rounded-xl border px-3 py-3", stageToneStyles.surface)}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold">{item.label}</p>
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
              <Button type="button" className={getUploadToneStyles("success").button} onClick={() => onNavigateToLesson?.(taskSnapshot.lesson.id)}>
                去学习
              </Button>
              {taskSucceededPartially ? (
                <Button type="button" variant="outline" className={getUploadToneStyles("selected").buttonSubtle} onClick={() => void copyTaskDebugReport(taskId || taskSnapshot?.task_id)}>
                  复制排错信息
                </Button>
              ) : null}
              <Button type="button" variant="outline" className={getUploadToneStyles("selected").buttonSubtle} onClick={() => void resetSession()}>
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
                <Button type="button" className={getUploadToneStyles(taskSnapshot?.resume_available ? "recoverable" : "selected").button} onClick={() => void resumeTask()}>
                  <RefreshCcw className="size-4" />
                  {taskSnapshot?.resume_available ? "免上传继续生成" : "免上传重新生成"}
                </Button>
              ) : null}
              {hasLocalFile ? (
                <Button type="button" variant="secondary" className={getUploadToneStyles("selected").button} onClick={() => void submit()}>
                  <RefreshCcw className="size-4" />
                  重新上传当前素材
                </Button>
              ) : null}
              {hasLocalFile ? (
                <Button type="button" variant="ghost" onClick={() => void clearTaskRuntime()}>
                  保留素材并清空错误
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => void resetSession()}>
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

        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>链接生成视频</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-1">
                  <p>上传视频才可以获取素材。</p>
                  <p>您可自行寻找可以链接转视频的合法工具。</p>
                  <p>或使用推荐的工具网站。</p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setLinkDialogOpen(false)}>
                取消
              </Button>
              <Button type="button" onClick={() => window.open("https://snapany.com/zh", "_blank", "noopener,noreferrer")}>
                跳转
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
