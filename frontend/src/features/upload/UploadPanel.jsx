import { CheckCircle2, Loader2, RefreshCcw, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "../../lib/utils";
import { api, parseResponse, toErrorText, uploadWithProgress } from "../../shared/api/client";
import { formatMoneyCents, formatMoneyPerMinute } from "../../shared/lib/money";
import {
  bindLocalAsrModelDirectory,
  ensureLocalAsrModel,
  getLocalAsrWorkerAssetPayload,
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

const QWEN_MODEL = "qwen3-asr-flash-filetrans";
const FASTER_WHISPER_MODEL = "faster-whisper-medium";
const UPLOAD_PROGRESS_PERSIST_INTERVAL_MS = 800;
const LOCAL_ASR_FILE_ACCEPT = "audio/*,video/mp4,.mp4,.m4a,.mp3,.wav,.aac,.ogg,.flac,.opus";
const LOCAL_MODEL_VISUAL_PROGRESS_INTERVAL_MS = 120;
const LOCAL_STAGE_PROGRESS_INTERVAL_MS = 800;
const DEFAULT_LOCAL_ASR_ASSET_BASE_URL = "/api/local-asr-assets";
const LOCAL_ASR_ASSET_BASE_URL = (import.meta.env.VITE_LOCAL_ASR_MODEL_BASE_URL || DEFAULT_LOCAL_ASR_ASSET_BASE_URL).trim().replace(/\/+$/, "");
const ASR_MODELS_API_BASE = "/api/asr-models";
const LOCAL_RECOGNITION_STOPPED_MESSAGE = "已停止生成，可重新开始。";
const LOCAL_MODEL_OPTIONS = [
  {
    key: "local-sensevoice-small",
    workerModelId: "local-sensevoice-small",
    title: "SenseVoice Small",
    subtitle: "官方 SenseVoice 小模型，适合先试跑字幕识别。",
    uploadEnabled: true,
    sizeEstimateMb: { wasm: 180 },
  },
];
const UPLOAD_MODEL_OPTIONS = [
  {
    key: "sensevoice-small",
    title: "SenseVoice Small",
    subtitle: "浏览器本地均衡模式，先准备模型再生成。",
    mode: "balanced",
  },
  {
    key: QWEN_MODEL,
    title: "Qwen ASR Flash",
    subtitle: "云端文件转写，启动最快，无需下载服务端模型。",
    mode: "fast",
    note: "沿用现有高速生成链路，适合想直接开始的场景。",
  },
  {
    key: FASTER_WHISPER_MODEL,
    title: "Faster Whisper Medium",
    subtitle: "服务端识别，适合不想在浏览器里准备本地模型的场景。",
    mode: "fast",
    note: "首次使用前需要先准备服务端模型。",
    sourceModelId: "pengzhendong/faster-whisper-medium",
    deployPath: "/data/modelscope_whisper/faster-whisper-medium",
  },
];
const DISPLAY_STAGES = [
  { key: "convert_audio", label: "转换" },
  { key: "asr_transcribe", label: "识别" },
  { key: "translate_zh", label: "翻译" },
  { key: "write_lesson", label: "生成" },
];
function getStageLabelByKey(stageKey) {
  if (!stageKey) return "";
  const stage = DISPLAY_STAGES.find((item) => item.key === stageKey);
  return stage ? stage.label : stageKey;
}
const STAGE_PROGRESS_BOUNDS = {
  convert_audio: { start: 0, end: 20 },
  asr_transcribe: { start: 20, end: 60 },
  translate_zh: { start: 60, end: 90 },
  write_lesson: { start: 90, end: 100 },
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

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function getRateByModel(rates, modelName) {
  return rates.find((item) => item.model_name === modelName && item.is_active);
}

function isServerRuntimeModel(rate) {
  return Boolean(rate) && String(rate.runtime_kind || "cloud") !== "local" && String(rate.billing_unit || "minute") === "minute";
}

function calculatePointsBySeconds(seconds, pointsPerMinute) {
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(pointsPerMinute) || pointsPerMinute <= 0) return 0;
  return Math.ceil((Math.ceil(seconds) * pointsPerMinute) / 60);
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
  return "sensevoice-small";
}

function getDefaultUploadModelKey(configuredModel = "") {
  const normalizedConfiguredModel = String(configuredModel || "").trim();
  if (normalizedConfiguredModel === "local-sensevoice-small" || normalizedConfiguredModel === "sensevoice-small") {
    return "sensevoice-small";
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

function getLocalModelStatusLabel(status) {
  if (status === "ready" || status === "cached") return "已下载";
  return "未下载";
}

function getServerModelStatusLabel(modelState) {
  const status = String(modelState?.status || "").trim().toLowerCase();
  if (Boolean(modelState?.cached) || ["ready", "cached"].includes(status)) return "已下载";
  if (Boolean(modelState) && modelState.downloadRequired === false && !modelState.preparing && status !== "error") return "已下载";
  return "未下载";
}

function isServerModelReady(modelState) {
  const status = String(modelState?.status || "").trim().toLowerCase();
  if (Boolean(modelState?.cached) || ["ready", "cached"].includes(status)) return true;
  return Boolean(modelState) && modelState.downloadRequired === false && !modelState.preparing && status !== "error";
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
    if (stageKey === "convert_audio") return "音频处理中";
    if (stageKey === "asr_transcribe") return "识别中";
    if (stageKey === "translate_zh") return "翻译中";
    if (stageKey === "write_lesson") return "生成中";
  }
  return "等待开始";
}

function getStageDisplayMeta(taskSnapshot, stageKey, stageStatus, currentStageKey) {
  const counters = taskSnapshot?.counters || {};
  const fallbackRatio = stageStatus === "completed" ? 1 : stageStatus === "pending" ? 0 : getStageProgressRatioFromOverall(stageKey, taskSnapshot?.overall_percent);
  let progressMeta;

  if (stageKey === "convert_audio") {
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
  if (stageKey === "translate_zh") {
    const done = Math.max(0, Number(counters.translate_done || 0));
    const total = Math.max(done, Number(counters.translate_total || 0));
    return total > 0 ? `翻译字幕 ${done}/${total}` : sanitizeUserFacingText(taskSnapshot.current_text || "翻译字幕");
  }
  if (stageKey === "convert_audio") return sanitizeUserFacingText(taskSnapshot.current_text || "转换音频");
  if (stageKey === "write_lesson") return sanitizeUserFacingText(taskSnapshot.current_text || "生成课程");
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
  if (stageKey === "convert_audio") return Math.round(20 * safeRatio);
  if (stageKey === "asr_transcribe") return Math.round(20 + 40 * safeRatio);
  if (stageKey === "translate_zh") return Math.round(60 + 30 * safeRatio);
  if (stageKey === "write_lesson") return Math.round(90 + 10 * safeRatio);
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

export function UploadPanel({ accessToken, isActivePanel = true, onCreated, balanceAmountCents = 0, balancePoints, billingRates, subtitleSettings, onWalletChanged, onTaskStateChange, onNavigateToLesson }) {
  const currentUser = useAppStore((state) => state.currentUser);
  const normalizedBalanceAmountCents = Number(balanceAmountCents ?? balancePoints ?? 0);
  const localAsrSupport = useMemo(() => detectLocalAsrSupport(), []);
  const localDirectoryBindingAvailable = useMemo(() => localAsrDirectoryBindingSupported(), []);
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
  const [mode, setMode] = useState(() => getUploadModelMeta(getDefaultUploadModelKey(configuredDefaultAsrModel)).mode);
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
  const [localModelAdvancedOpen, setLocalModelAdvancedOpen] = useState(false);
  const [restoreBannerMode, setRestoreBannerMode] = useState(RESTORE_BANNER_MODES.NONE);
  const pollingAbortRef = useRef(false);
  const pollTokenRef = useRef(0);
  const uploadAbortRef = useRef(null);
  const localRunAbortRef = useRef(null);
  const uploadPersistRef = useRef({ timer: null, lastSavedAt: 0, lastSavedPercent: -1, latestPercent: 0 });
  const localRunTokenRef = useRef(0);
  const localStageProgressTimerRef = useRef(null);
  const localStageProgressMetaRef = useRef({ runToken: 0, startedAt: 0, durationSec: 0, statusText: "" });
  const fileInputRef = useRef(null);
  const previousPanelActiveRef = useRef(Boolean(isActivePanel));
  const successStateOriginRef = useRef("none");
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
  const selectedUploadModelMeta = getUploadModelMeta(selectedUploadModel);
  const selectedAsrModel = mode === "balanced" ? selectedBalancedModel : selectedFastModel;
  const selectedRate = getRateByModel(billingRates, selectedAsrModel) || getRateByModel(billingRates, selectedFastModel);
  const estimatedChargeCents = selectedRate ? calculatePointsBySeconds(durationSec || 0, selectedRate.price_per_minute_cents) : 0;
  const likelyInsufficient = Number.isFinite(normalizedBalanceAmountCents) && estimatedChargeCents > 0 && normalizedBalanceAmountCents < estimatedChargeCents;
  const localWorkerReady = Boolean(localWorkerReadyMap.sensevoice);
  const balancedPerformanceWarning = useMemo(
    () => (mode === "balanced" ? buildLocalAsrLongAudioWarning(durationSec, LOCAL_ASR_LONG_AUDIO_HINT_SECONDS) : ""),
    [durationSec, mode],
  );
  const selectedServerModelState = serverModelStateMap[selectedUploadModel] || {};
  const selectedServerModelReady = isServerModelReady(selectedServerModelState);
  const selectedServerModelPreparing =
    Boolean(selectedServerModelState.preparing) || ["loading", "preparing", "downloading"].includes(String(selectedServerModelState.status || ""));
  const selectedFastModelNeedsPreparation = mode === "fast" && SERVER_PREPARABLE_MODELS.has(selectedUploadModel);
  const localTranscribing = phase === "local_transcribing";
  const displayTaskSnapshot = localTranscribing ? localProgressSnapshot : taskSnapshot;
  const hasLocalFile = Boolean(file);
  const displayTaskStatus = String(displayTaskSnapshot?.status || "").toLowerCase();
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
    (mode === "balanced" && !localTranscribing && (!localAsrSupport.supported || !localWorkerReady || Boolean(localBusyModelKey))) ||
    (selectedFastModelNeedsPreparation && (!selectedServerModelReady || selectedServerModelPreparing || Boolean(serverBusyModelKey)));

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

  function applyServerModelState(modelKey, payload, overrides = {}) {
    const status = String(overrides.status || payload?.status || "idle").trim().toLowerCase();
    const message = String(overrides.message || payload?.message || "");
    const lastError = String(overrides.lastError ?? payload?.last_error ?? payload?.lastError ?? "");
    const preparing = Boolean(overrides.preparing ?? payload?.preparing);
    const cached = Boolean(overrides.cached ?? payload?.cached);
    const downloadRequired = Boolean(overrides.downloadRequired ?? payload?.download_required ?? payload?.downloadRequired);
    updateServerModelState(modelKey, {
      status,
      message,
      lastError,
      preparing,
      cached,
      downloadRequired,
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
  }

  function startPollingSession() {
    pollingAbortRef.current = false;
    pollTokenRef.current += 1;
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
      setSelectedUploadModel((prev) => (prev === "sensevoice-small" ? prev : "sensevoice-small"));
      return;
    }
    setSelectedUploadModel((prev) => (getUploadModelMeta(prev).mode === "fast" ? prev : getDefaultFastUploadModelKey(configuredDefaultAsrModel)));
  }, [configuredDefaultAsrModel, mode]);

  useEffect(() => {
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
              },
            ];
          }
          return [modelKey, { status: "error", lastError: "检查模型状态失败" }];
        }),
      );
      if (canceled) return;
      setServerModelStateMap((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
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
    setFile(restoredFile);
    setTaskId("");
    setLoading(false);
    setStatus(String(saved?.status_text || ""));
    setDurationSec(Number(saved?.duration_seconds || 0) || null);
    setPhase("success");
    setMode(String(saved?.generation_mode || "").toLowerCase() === "fast" ? "fast" : "balanced");
    setSelectedUploadModel(getDefaultUploadModelKey(String(saved?.selected_upload_model || configuredDefaultAsrModel)));
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
      await clearUploadPanelSuccessSnapshot(ownerUserId);
    }
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

  async function finalizeSuccess(data, sourceFile = file, silentToast = false) {
    resetUploadPersistState();
    clearLocalStageProgressTimer();
    localRunAbortRef.current = null;
    setLocalProgressSnapshot(null);
    let mediaPersisted = false;
    let mediaPreview = null;
    let successMessage = "";
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
    if (data.lesson?.media_storage === "client_indexeddb" && !mediaPersisted) successMessage = "课程已生成，但当前浏览器未保存视频，请在历史记录中恢复视频后再开始学习。";
    setTaskSnapshot(data);
    setPhase("success");
    setStatus(successMessage);
    setLoading(false);
    setRestoreBannerMode(RESTORE_BANNER_MODES.NONE);
    setBindingCompleted(Boolean(mediaPersisted || data.lesson?.media_storage !== "client_indexeddb"));
    successStateOriginRef.current = "live";
    if (ownerUserId) {
      await clearActiveGenerationTask(ownerUserId);
      await clearUploadPanelSuccessSnapshot(ownerUserId);
    }
    await onWalletChanged?.();
    if (data.lesson) await onCreated?.({ lesson: data.lesson, mediaPreview, mediaPersisted });
    if (!silentToast) (successMessage ? toast.warning(successMessage) : toast.success("课程已生成"));
  }

  async function pollTask(nextTaskId, silentToast = false, pollToken = pollTokenRef.current) {
    if (!nextTaskId || pollingAbortRef.current || pollToken !== pollTokenRef.current) return;
    try {
      const resp = await api(`/api/lessons/tasks/${nextTaskId}`, {}, accessToken);
      const data = await parseResponse(resp);
      if (pollingAbortRef.current || pollToken !== pollTokenRef.current) return;
      if (!resp.ok) {
        if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING) {
          const nextStatus = "上次生成记录已失效，可重新开始或清空这次记录。";
          setTaskId("");
          setTaskSnapshot(null);
          setRestoreBannerMode(RESTORE_BANNER_MODES.STALE);
          setStatus(nextStatus);
          setPhase(file ? "ready" : "idle");
          setLoading(false);
          await persistSession({ taskId: "", phase: file ? "ready" : "idle", taskSnapshot: null, uploadPercent: 0, status: nextStatus });
          return;
        }
        const message = toErrorText(data, "查询任务失败");
        setStatus(message);
        setPhase("error");
        setLoading(false);
        await persistSession({ phase: "error", status: message });
        if (!silentToast) toast.error(message);
        return;
      }
      setTaskId(String(data.task_id || nextTaskId));
      setTaskSnapshot(data);
      const taskStatus = String(data.status || "").toLowerCase();
      if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING) {
        if (ACTIVE_SERVER_TASK_STATUSES.has(taskStatus)) {
          setRestoreBannerMode(RESTORE_BANNER_MODES.NONE);
        } else if (RECOVERABLE_SERVER_TASK_STATUSES.has(taskStatus)) {
          setRestoreBannerMode(RESTORE_BANNER_MODES.INTERRUPTED);
        } else if (taskStatus === "failed") {
          setRestoreBannerMode(RESTORE_BANNER_MODES.STALE);
        }
      }
      if (taskStatus === "succeeded") {
        await finalizeSuccess(data, file, silentToast);
        return;
      }
      if (taskStatus === "paused" || taskStatus === "terminated") {
        setRestoreBannerMode(RESTORE_BANNER_MODES.INTERRUPTED);
        const nextPhase = file ? "ready" : "idle";
        const nextStatus = String(data.current_text || data.message || "");
        setStatus(nextStatus);
        setPhase(nextPhase);
        setLoading(false);
        resetUploadPersistState();
        await persistSession({ phase: nextPhase, taskSnapshot: data, uploadPercent: 100, status: nextStatus });
        return;
      }
      if (taskStatus === "failed") {
        if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING && !Boolean(data.resume_available)) {
          setTaskId("");
          setTaskSnapshot(null);
          setRestoreBannerMode(RESTORE_BANNER_MODES.STALE);
          const nextStatus = "上次生成记录已失效，可重新开始或清空这次记录。";
          setStatus(nextStatus);
          setPhase(file ? "ready" : "idle");
          setLoading(false);
          await persistSession({ taskId: "", phase: file ? "ready" : "idle", taskSnapshot: null, uploadPercent: 0, status: nextStatus });
          return;
        }
        const message = `${data.error_code || "ERROR"}: ${data.message || "生成失败"}`;
        setStatus(message);
        setPhase("error");
        setLoading(false);
        await persistSession({ phase: "error", taskSnapshot: data, status: message });
        await onWalletChanged?.();
        if (!silentToast) toast.error(message);
        return;
      }
      setPhase("processing");
      setLoading(true);
      resetUploadPersistState();
      await persistSession({ phase: "processing", taskSnapshot: data, uploadPercent: 100, status: String(data.current_text || "") });
      setTimeout(() => void pollTask(nextTaskId, silentToast, pollToken), 1000);
    } catch (error) {
      if (pollingAbortRef.current || pollToken !== pollTokenRef.current || error?.name === "AbortError") return;
      if (restoreBannerMode === RESTORE_BANNER_MODES.VERIFYING) {
        const nextStatus = "检查上次任务状态失败，可重新开始或稍后重试。";
        setTaskId("");
        setTaskSnapshot(null);
        setRestoreBannerMode(RESTORE_BANNER_MODES.STALE);
        setStatus(nextStatus);
        setPhase(file ? "ready" : "idle");
        setLoading(false);
        await persistSession({ taskId: "", phase: file ? "ready" : "idle", taskSnapshot: null, uploadPercent: 0, status: nextStatus });
        return;
      }
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      await persistSession({ phase: "error", status: message });
      if (!silentToast) toast.error(message);
    }
  }

  useEffect(() => {
    let canceled = false;
    resetLocalSessionState();
    previousPanelActiveRef.current = Boolean(isActivePanel);

    async function restoreSession() {
      if (!ownerUserId) return;
      const saved = await getActiveGenerationTask(ownerUserId);
      if (saved && !canceled) {
        const savedPhase = String(saved.phase || "").toLowerCase();
        const savedTaskStatus = String(saved.task_snapshot?.status || "").toLowerCase();
        if (savedPhase === "success" || savedTaskStatus === "succeeded") {
          await clearActiveGenerationTask(ownerUserId);
          return;
        }

        const restoredFile = createFileFromBlob(saved.file_blob, saved.file_name, saved.media_type);
        const wasLocalTranscribing = savedPhase === "local_transcribing";
        const isRecoverableServerTask = ["paused", "terminated"].includes(savedTaskStatus);
        const restoredPhase = wasLocalTranscribing
          ? restoredFile
            ? "ready"
            : "idle"
          : isRecoverableServerTask
            ? restoredFile
              ? "ready"
              : "idle"
          : !saved.task_id && savedPhase === "uploading"
            ? "upload_paused"
            : savedPhase;
        const restoredStatus = wasLocalTranscribing
          ? getInterruptedLocalAsrStatus(Boolean(restoredFile))
          : isRecoverableServerTask
            ? String(saved.task_snapshot?.current_text || saved.status_text || "")
          : !saved.task_id && savedPhase === "uploading"
            ? String(saved.status_text || "检测到上次上传中断，可继续上传当前素材")
            : String(saved.status_text || "");
        const savedTaskId = String(saved.task_id || "").trim();
        const savedSnapshotExists = Boolean(saved.task_snapshot);
        const nextRestoreBannerMode = savedTaskId
          ? RESTORE_BANNER_MODES.VERIFYING
          : savedSnapshotExists
            ? RESTORE_BANNER_MODES.STALE
            : RESTORE_BANNER_MODES.NONE;
        const nextStatus =
          nextRestoreBannerMode === RESTORE_BANNER_MODES.VERIFYING
            ? "正在检查上次任务状态..."
            : nextRestoreBannerMode === RESTORE_BANNER_MODES.STALE
              ? "上次生成记录已失效，可重新开始或清空这次记录。"
              : restoredStatus;
        setFile(restoredFile);
        setTaskId(savedTaskId);
        setStatus(nextStatus);
        setDurationSec(Number(saved.duration_seconds || 0) || null);
        setPhase(restoredPhase || "idle");
        setMode(String(saved.generation_mode || "").toLowerCase() === "fast" ? "fast" : "balanced");
        setSelectedUploadModel(getDefaultUploadModelKey(String(saved.selected_upload_model || configuredDefaultAsrModel)));
        setCoverDataUrl(String(saved.cover_data_url || ""));
        setCoverWidth(Number(saved.cover_width || 0));
        setCoverHeight(Number(saved.cover_height || 0));
        setCoverAspectRatio(Number(saved.aspect_ratio || 0));
        setIsVideoSource(Boolean(saved.is_video_source));
        setTaskSnapshot(nextRestoreBannerMode === RESTORE_BANNER_MODES.NONE && isRecoverableServerTask ? saved.task_snapshot || null : null);
        setUploadPercent(Number(saved.upload_percent || 0));
        uploadPersistRef.current.latestPercent = Number(saved.upload_percent || 0);
        setBindingCompleted(Boolean(saved.binding_completed));
        setLocalBusyModelKey("");
        setLocalBusyText("");
        successStateOriginRef.current = "none";
        setRestoreBannerMode(nextRestoreBannerMode);
        setLoading(["processing"].includes(restoredPhase) && ACTIVE_SERVER_TASK_STATUSES.has(savedTaskStatus || "running"));
        if (savedTaskId && (ACTIVE_SERVER_TASK_STATUSES.has(savedTaskStatus) || ["processing", "uploading"].includes(savedPhase))) {
          const pollToken = startPollingSession();
          void pollTask(savedTaskId, true, pollToken);
        }
        return;
      }

      const savedSuccess = await getUploadPanelSuccessSnapshot(ownerUserId);
      if (savedSuccess && !canceled) {
        await restoreSuccessSnapshot(savedSuccess);
      }
    }

    void restoreSession();
    return () => {
      canceled = true;
    };
  }, [ownerUserId]);

  useEffect(() => {
    const wasActivePanel = previousPanelActiveRef.current;
    if (wasActivePanel && !isActivePanel && phase === "success") {
      if (successStateOriginRef.current === "live" && taskSnapshot?.lesson?.id) {
        void saveSuccessSnapshot(file, taskSnapshot, status);
      }
      resetLocalSessionState();
    }
    previousPanelActiveRef.current = Boolean(isActivePanel);
  }, [file, isActivePanel, phase, status, taskSnapshot]);

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

  async function fetchServerModelStatus(modelKey, options = {}) {
    const { silent = false } = options;
    try {
      const resp = await api(`${ASR_MODELS_API_BASE}/${encodeURIComponent(modelKey)}/status`, { method: "GET" }, accessToken);
      const payload = await parseResponse(resp);
      if (!resp.ok) {
        throw new Error(toErrorText(payload, "检查模型状态失败"));
      }
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

  function handleSelectUploadModelCard(modelKey) {
    const nextModelMeta = getUploadModelMeta(modelKey);
    setSelectedUploadModel(nextModelMeta.key);
    setMode(nextModelMeta.mode);
    if (SERVER_PREPARABLE_MODELS.has(nextModelMeta.key)) {
      void fetchServerModelStatus(nextModelMeta.key, { silent: true });
    }
  }

  async function handleServerModelPrepare(modelKey) {
    setServerBusyModelKey(modelKey);
    setServerBusyText("正在下载模型");
    updateServerModelState(modelKey, {
      status: "preparing",
      preparing: true,
      lastError: "",
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
      toast.success(Boolean(payload?.preparing) ? "已开始准备模型" : "模型状态已更新");
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
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      return;
    }
    if (!localWorkerReady) {
      const message = "识别组件正在重置，请稍后再试。";
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      return;
    }
    if (!isLocalBalancedModelUploadEnabled(selectedBalancedModel)) {
      const message = getLocalBalancedModelUnavailableReason(selectedBalancedModel) || "当前模型暂未开放";
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      return;
    }
    const modelState = localModelStateMap[selectedBalancedModel] || {};
    if (!["ready", "cached"].includes(String(modelState.status || ""))) {
      const message = "请先下载并就绪模型";
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
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
      startLocalAsrVisualProgress(runToken, localAsrStatus, preprocessDurationSec || durationSec);
      await persistSession({ taskId: "", phase: "local_transcribing", taskSnapshot: null, uploadPercent: 0, status: localAsrStatus, bindingCompleted: false });
      const workerStart = nowMs();
      const localResult = await createWorkerRequest(
        "transcribe-audio",
        selectedBalancedModel,
        {
          audioData,
          samplingRate: LOCAL_ASR_TARGET_SAMPLE_RATE,
          fileName: String(file?.name || ""),
        },
        [audioData.buffer],
      );
      if (runToken !== localRunTokenRef.current) return;
      const workerDecodeMs = Math.max(0, Math.round(nowMs() - workerStart));
      const postprocessStart = nowMs();
      clearLocalStageProgressTimer();
      if (!Array.isArray(localResult?.asr_payload?.transcripts?.[0]?.sentences) || localResult.asr_payload.transcripts[0].sentences.length === 0) {
        throw new Error("当前模型未识别出可用字幕，请换一个模型或更换素材");
      }
      const sentenceCount = localResult.asr_payload.transcripts[0].sentences.length;
      const postprocessMs = Math.max(0, Math.round(nowMs() - postprocessStart));
      logUploadLocalAsrDebug("run.done", {
        file_name: String(file?.name || ""),
        model: selectedBalancedModel,
        duration_sec: preprocessDurationSec,
        audio_extract_ms: preprocessMetrics.audio_extract_ms,
        decode_ms: preprocessMetrics.decode_ms,
        resample_ms: preprocessMetrics.resample_ms,
        worker_decode_ms: workerDecodeMs,
        postprocess_ms: postprocessMs,
        total_local_asr_ms: Math.max(0, Math.round(nowMs() - totalStart)),
        sample_count: preprocessMetrics.sample_count,
        source_sample_rate: preprocessMetrics.source_sample_rate,
        target_sample_rate: preprocessMetrics.target_sample_rate,
        channel_count: preprocessMetrics.channel_count,
        resample_strategy: preprocessMetrics.resample_strategy,
        sentence_count: sentenceCount,
      });
      setLocalProgress("asr_transcribe", "completed", 1, `识别完成，共 ${sentenceCount} 段字幕`, {
        asr_done: sentenceCount,
        asr_estimated: sentenceCount,
        translate_done: 0,
        translate_total: 0,
        segment_done: 0,
        segment_total: 0,
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
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await persistSession({ phase: "error", status: message });
        await onWalletChanged?.();
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
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      await persistSession({ phase: "error", status: message });
    }
  }

  async function submit() {
    if (!file) {
      const message = "请先选择文件";
      setStatus(message);
      setPhase("error");
      toast.error(message);
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
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await persistSession({ phase: "error", status: message });
        await onWalletChanged?.();
        return;
      }
      const nextTaskId = String(data.task_id || "");
      if (!nextTaskId) {
        const message = "任务创建成功但缺少 task_id";
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await persistSession({ phase: "error", status: message });
        return;
      }
      setTaskId(nextTaskId);
      setUploadPercent(100);
      uploadPersistRef.current.latestPercent = 100;
      setPhase("processing");
      resetUploadPersistState();
      await persistSession({ taskId: nextTaskId, phase: "processing", uploadPercent: 100 });
      void pollTask(nextTaskId, false, pollToken);
    } catch (error) {
      uploadAbortRef.current = null;
      if (error?.name === "AbortError") return;
      resetUploadPersistState();
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      await persistSession({ phase: "error", status: message });
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
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        if (nextTaskSnapshot) {
          setTaskSnapshot(nextTaskSnapshot);
        }
        await persistSession({ phase: "error", status: message, taskSnapshot: nextTaskSnapshot });
        return;
      }
      setPhase("processing");
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
      await persistSession({ phase: "processing", uploadPercent: 100, status: "" });
      void pollTask(taskId, false, pollToken);
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      await persistSession({ phase: "error", status: message });
    }
  }

  async function requestServerTaskControl(action) {
    if (!taskId) return;
    const normalizedAction = action === "terminate" ? "terminate" : "pause";
    const endpoint = normalizedAction === "terminate" ? "terminate" : "pause";
    const pendingStatus = normalizedAction === "terminate" ? "terminating" : "pausing";
    const pendingText = normalizedAction === "terminate" ? "正在终止，当前步骤完成后会停止生成" : "正在暂停，当前步骤完成后会保留进度";
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
      await persistSession({ phase: "processing", status: pendingText });
      const resp = await api(`/api/lessons/tasks/${taskId}/${endpoint}`, { method: "POST" }, accessToken);
      const data = await parseResponse(resp);
      if (!resp.ok) {
        const message = toErrorText(data, normalizedAction === "terminate" ? "终止生成失败" : "暂停生成失败");
        setStatus(message);
        setPhase("error");
        setLoading(false);
        toast.error(message);
        await persistSession({ phase: "error", status: message });
        return;
      }
      const pollToken = startPollingSession();
      void pollTask(taskId, true, pollToken);
      toast.success(normalizedAction === "terminate" ? "已提交终止请求" : "已提交暂停请求");
    } catch (error) {
      const message = `网络错误: ${String(error)}`;
      setStatus(message);
      setPhase("error");
      setLoading(false);
      toast.error(message);
      await persistSession({ phase: "error", status: message });
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
        <Alert>
          <AlertDescription>
            <p className="text-muted-foreground">当前余额：{formatMoneyCents(normalizedBalanceAmountCents)}</p>
            <p className="text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted underline-offset-2">预估扣费</span>
                </TooltipTrigger>
                <TooltipContent>按素材秒数折算分钟后计费，金额统一按分存储、按元展示。</TooltipContent>
              </Tooltip>
              ：{selectedRate ? (durationSec != null ? `${formatMoneyCents(estimatedChargeCents)}（${formatMoneyPerMinute(selectedRate.price_per_minute_cents)}）` : "选择文件后显示") : "该模型未配置单价"}
            </p>
            <p className="text-muted-foreground">当前模型：{selectedUploadModelMeta.title}</p>
            {likelyInsufficient ? <p className="mt-1 text-destructive">余额可能不足，提交将被拒绝。</p> : null}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">选择模型</p>
            <p className="text-xs text-muted-foreground">先选一个模型，再上传素材开始生成。</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {UPLOAD_MODEL_OPTIONS.map((item) => {
              const selected = selectedUploadModel === item.key;
              const isSenseVoice = item.mode === "balanced";
              const isFasterWhisper = item.key === FASTER_WHISPER_MODEL;
              const localCardState = localModelStateMap[selectedBalancedModel] || {};
              const localCardDownloaded = ["ready", "cached"].includes(String(localCardState.status || ""));
              const localCardBusy = localBusyModelKey === selectedBalancedModel;
              const localSupportReason = sanitizeUserFacingText(localAsrSupport.reason || "");
              const localCardError = sanitizeUserFacingText(localCardState.error || "");
              const localCardHint =
                localSupportReason ||
                localCardError ||
                (localCardBusy ? sanitizeUserFacingText(localBusyText || (localCardDownloaded ? "正在卸载模型" : "正在下载模型")) : "");
              const fasterModelState = serverModelStateMap[item.key] || {};
              const fasterModelReady = isServerModelReady(fasterModelState);
              const fasterModelBusy = serverBusyModelKey === item.key;
              const fasterModelError = sanitizeUserFacingText(fasterModelState.lastError || "");
              const fasterModelMessage = fasterModelBusy
                ? sanitizeUserFacingText(serverBusyText || "正在下载模型")
                : sanitizeUserFacingText(fasterModelError || "");
              const cardStatusLabel = isSenseVoice
                ? getLocalModelStatusLabel(localCardState.status)
                : isFasterWhisper
                  ? getServerModelStatusLabel(fasterModelState)
                  : "已下载";

              return (
                <div
                  key={item.key}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "space-y-3 rounded-2xl border p-4 text-left transition-colors",
                    selected ? "border-primary bg-primary/5" : "border-border bg-background/80",
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
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                    </div>
                    <Badge variant={cardStatusLabel === "已下载" ? "default" : "outline"}>{cardStatusLabel}</Badge>
                  </div>
                  {isSenseVoice && localCardHint ? <p className={cn("text-xs", localSupportReason || localCardError ? "text-destructive" : "text-muted-foreground")}>{localCardHint}</p> : null}
                  {isFasterWhisper && fasterModelMessage ? <p className={cn("text-xs", fasterModelError ? "text-destructive" : "text-muted-foreground")}>{fasterModelMessage}</p> : null}

                  {isSenseVoice &&
                  localCardBusy &&
                  String(localCardState.status || "") === "loading" &&
                  Number.isFinite(Number(localModelVisualProgressMap[selectedBalancedModel])) ? (
                    <div className="space-y-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-200"
                          style={{ width: `${clampPercent(localModelVisualProgressMap[selectedBalancedModel])}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">准备进度：{clampPercent(localModelVisualProgressMap[selectedBalancedModel])}%</p>
                    </div>
                  ) : null}

                  {isFasterWhisper && !fasterModelReady ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleServerModelPrepare(item.key);
                        }}
                        disabled={uploadActionBusy || fasterModelBusy || localTranscribing}
                      >
                        {fasterModelBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                        下载模型
                      </Button>
                    </div>
                  ) : null}

                  {isSenseVoice ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void (localCardDownloaded ? handleLocalModelRemove(selectedBalancedModel) : handleLocalModelDownload(selectedBalancedModel));
                        }}
                        disabled={!localAsrSupport.supported || !localWorkerReady || uploadActionBusy || localCardBusy}
                      >
                        {localCardBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                        {localCardDownloaded ? "卸载模型" : "下载模型"}
                      </Button>
                    </div>
                  ) : null}
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
        {mode === "balanced" && balancedPerformanceWarning ? <p className="text-xs text-amber-700">{simplifyLongAudioWarning(balancedPerformanceWarning)}</p> : null}

        {showTaskStatusCard ? (
          <div className="space-y-3 rounded-2xl border border-border bg-muted/15 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">任务状态</p>
              <p className="text-sm text-muted-foreground">
                {restoreBannerMode === RESTORE_BANNER_MODES.NONE ? recoveryBannerText || taskStatusCardText : taskStatusCardText}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED || restoreBannerMode === RESTORE_BANNER_MODES.NONE) &&
              (taskPaused || Boolean(taskSnapshot?.resume_available)) ? (
                <Button type="button" onClick={() => void resumeTask()}>
                  <RefreshCcw className="size-4" />
                  继续生成
                </Button>
              ) : null}
              <Button
                type="button"
                variant={(restoreBannerMode === RESTORE_BANNER_MODES.INTERRUPTED || restoreBannerMode === RESTORE_BANNER_MODES.NONE) && taskPaused ? "outline" : "default"}
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
              className="h-11 w-full"
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
          <div className="space-y-3 rounded-2xl border bg-muted/15 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{getProgressHeadline(phase, uploadPercent, displayTaskSnapshot)}</p>
                <p className="text-xs text-muted-foreground">总进度</p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">{progressPercent}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width,background-color] duration-300",
                  phase === "success" ? "bg-emerald-500" : phase === "error" ? "bg-red-500" : phase === "uploading" ? "bg-sky-500" : "bg-amber-500",
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {stageItems.map((item) => (
                <div
                  key={item.key}
                  className={cn(
                    "space-y-2 rounded-xl border px-3 py-3",
                    item.status === "completed"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                      : item.status === "running"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                        : item.status === "failed"
                          ? "border-red-500/30 bg-red-500/10 text-red-600"
                          : "border-border bg-muted/30 text-muted-foreground",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <span className="text-xs font-semibold tabular-nums">{item.detailText}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/60">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width,background-color] duration-300",
                        item.status === "completed"
                          ? "bg-emerald-500"
                          : item.status === "running"
                            ? "bg-amber-500"
                            : item.status === "failed"
                              ? "bg-red-500"
                              : "bg-muted-foreground/30",
                      )}
                      style={{ width: `${item.progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs leading-5 opacity-85">{item.statusText}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {phase === "success" && taskSnapshot?.lesson ? (
          <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-emerald-700">生成成功</p>
                <p className="text-sm text-emerald-700/80">{status || "课程已写入历史记录，你可以现在开始学习，或继续上传下一份素材。"}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => onNavigateToLesson?.(taskSnapshot.lesson.id)}>
                去学习
              </Button>
              <Button type="button" variant="outline" onClick={() => void resetSession()}>
                继续上传
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "error" && status ? (
          <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{status}</p>
            {(failureStageLabel || failureSummary) && (
              <div className="space-y-1">
                {failureStageLabel ? (
                  <p className="text-xs font-semibold text-destructive">失败阶段：{failureStageLabel}</p>
                ) : null}
                {failureSummary ? (
                  <p className="text-xs text-muted-foreground break-words">{failureSummary}</p>
                ) : null}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {canRetryWithoutUpload ? (
                <Button type="button" onClick={() => void resumeTask()}>
                  <RefreshCcw className="size-4" />
                  {taskSnapshot?.resume_available ? "免上传继续生成" : "免上传重新生成"}
                </Button>
              ) : null}
              {hasLocalFile ? (
                <Button type="button" variant="secondary" onClick={() => void submit()}>
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
          <div className="space-y-3 rounded-2xl border border-border bg-muted/15 p-4">
            <p className="text-sm text-muted-foreground">{status || "上传已暂停，可继续上传当前素材。"}</p>
            <div className="flex flex-wrap gap-2">
              {hasLocalFile ? (
                <Button type="button" onClick={() => void submit()}>
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
