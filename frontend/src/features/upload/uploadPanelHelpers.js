/**
 * Module-level helper functions extracted from UploadPanel.jsx.
 * These are pure functions (no React state) used by UploadPanel and useUploadWorkflow.
 */
import { hasDesktopRuntimeBridge, hasDesktopFileReadBridge, hasLocalCourseGeneratorBridge, hasBrowserLocalRuntimeBridge, hasDesktopModelUpdateBridge, requestDesktopLocalHelper, decodeBase64Bytes } from "./uploadRuntime";
import {
  FASTER_WHISPER_MODEL, QWEN_MODEL, STEPFUN_MODEL, MT_PRICE_MODEL,
  DESKTOP_LOCAL_GENERATING_PHASE, DESKTOP_LOCAL_TRANSCRIBING_PHASE,
  FAST_RUNTIME_TRACK_DESKTOP_LOCAL, LOCAL_BROWSER_ASR_ENABLED,
  LOCAL_BROWSER_RUNTIME_BASE_URL, LOCAL_ASR_FILE_ACCEPT,
  LOCAL_ASR_ASSET_BASE_URL, LOCAL_ASR_TARGET_SAMPLE_RATE,
  LOCAL_ASR_LONG_AUDIO_HINT_SECONDS, LOCAL_ASR_STORAGE_MODE_BROWSER,
  BOTTLE_LESSON_FILE_SUFFIX, BOTTLE_LESSON_SCHEMA_VERSION,
  ESTIMATED_MT_TOKENS_PER_MINUTE, LOCAL_LESSON_UPDATE_EVENT,
  POLL_RETRY_LIMIT, POLL_RETRY_DELAY_MS,
} from "./uploadConstants";
import { toErrorText } from "../../shared/api/client";
import { formatDateTimeLabel, formatLatencyLabel } from "./uploadHelpers";
import { sanitizeUserFacingText } from "./uploadTaskViewModel";
import { mapCloudAsrFailureToMessage } from "./asrStrategy";

export function localAsrDirectoryBindingSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}
export function getLocalAsrWorkerAssetPayload(modelKey, assetBaseUrl) {
  return {};
}
export function ensureLocalAsrModel(modelKey, assetBaseUrl, options) {
  return { status: "idle" };
}
export function removeLocalAsrModel(modelKey, assetBaseUrl) {
  return { status: "removed" };
}
export function switchLocalAsrStorageMode(modelKey, mode, assetBaseUrl) {
  return { status: "idle" };
}
export function bindLocalAsrModelDirectory(modelKey, assetBaseUrl) {
  return { status: "idle" };
}
export function buildLocalAsrLongAudioWarning(durationSec, hintSeconds) {
  return "";
}
export function releaseLocalAsrWorkerAssetPayload(modelKey) {}

export function estimateLocalAsrStageRatio(elapsedMs, durationSec) {
  if (!durationSec || durationSec <= 0) return 0;
  return Math.max(0, Math.min(1, elapsedMs / (durationSec * 1000 * 0.9)));
}
export function buildLocalAsrProgressCounters(elapsedMs, durationSec) {
  return {};
}

export function hasLocalAsrWorkerSupport() { return false; }
export function localSenseWorkerSupportedRuntimes() { return []; }
export async function createLocalSenseWorker(runtime) { return null; }
export function buildLocalAsrAudioMetadata(mediaEl) { return {}; }
export function buildLocalAsrTranscribeOptions(options) { return options || {}; }
export async function runLocalAsrTranscribe(worker, options) { return { text: "", segments: [] }; }
export function estimateLocalAsrStageProgress(elapsedMs, durationSec, stageKey) { return { ratio: 0, stageLabel: "" }; }
export function buildLocalAsrSegmentProgressCounters(elapsedMs, durationSec, segmentCount) { return { processedSegments: 0, totalSegments: segmentCount || 0 }; }
export function persistLocalAsrSession(taskSnapshot) {}
export function loadLocalAsrSession() { return null; }
export function clearLocalAsrSession() {}
export function releaseAllLocalAsrWorkerAssetPayloads() {}

export async function transcribeDesktopLocalAsr(modelKey, sourceFile) {
  if (!hasDesktopRuntimeBridge()) {
    throw new Error("Desktop runtime bridge is unavailable");
  }
  const sourcePath = resolveTranscribeDesktopSourcePath(sourceFile);
  const response = await window.desktopRuntime.transcribeLocalMedia({
    modelKey: String(modelKey || FASTER_WHISPER_MODEL),
    file: sourceFile,
    filePath: sourcePath,
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


export function normalizeServerStatus(payload = {}) {
  return {
    reachable: payload?.reachable !== false,
    lastCheckedAt: String(payload?.lastCheckedAt || ""),
    latencyMs: payload?.latencyMs == null ? null : Math.max(0, Number(payload.latencyMs || 0)),
    statusCode: Math.max(0, Number(payload?.statusCode || payload?.status_code || 0)),
    endpoint: String(payload?.endpoint || ""),
    reason: String(payload?.reason || ""),
  };
}

export function getOfflineBannerText(serverStatus) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "当前处于离线模式，部分功能不可用";
  }
  if (serverStatus?.reachable === false) {
    return sanitizeUserFacingText(serverStatus?.reason || "云端服务当前不可达，请稍后重试");
  }
  return "";
}

export function getOfflineHintText(isOnline, selectedAsrModel) {
  if (isOnline) return null;
  if (selectedAsrModel === FASTER_WHISPER_MODEL) {
    return "离线模式，仅支持本地生成";
  }
  return "离线模式，云端生成不可用，请联网后重试";
}

export function getDesktopSelectionErrorMessage(selection = {}) {
  return sanitizeUserFacingText(
    selection?.error?.message ||
      selection?.error ||
      selection?.message ||
      "",
  );
}

export function getCloudModelDisplayName(modelKey = "") {
  return String(modelKey || "") === STEPFUN_MODEL ? "StepAudio 2.5 ASR" : "Bottle 2.0";
}

export function getCloudFailureMessage(errorLike = "", serverStatus = {}, fallback = "", modelKey = QWEN_MODEL) {
  const normalizedServerStatus = normalizeServerStatus(serverStatus);
  const modelName = getCloudModelDisplayName(modelKey);
  const applyModelName = (message) => String(message || "").replaceAll("Bottle 2.0", modelName);
  const reason = sanitizeUserFacingText(normalizedServerStatus.reason || "");
  const hasApiErrorData = errorLike && (typeof errorLike === "object" ? Object.keys(errorLike).length > 0 : String(errorLike).trim().length > 0);
  if (normalizedServerStatus.reachable === false && reason && !hasApiErrorData) {
    return applyModelName(reason);
  }
  if (errorLike && typeof errorLike === "object") {
    const exactMessage = toErrorText(errorLike, fallback || `${modelName} 请求失败`);
    const exactDetail = typeof errorLike?.detail === "string" ? String(errorLike.detail || "").trim() : "";
    if (exactMessage) {
      return applyModelName(exactDetail ? `${exactMessage}；${exactDetail}` : exactMessage);
    }
    return applyModelName(mapCloudAsrFailureToMessage(
      {
        error_code: errorLike?.error_code ?? errorLike?.code ?? "",
        message: errorLike?.message || toErrorText(errorLike, fallback || `${modelName} 当前不可用`),
        detail: errorLike?.detail ?? "",
      },
      normalizedServerStatus,
    ));
  }
  return applyModelName(mapCloudAsrFailureToMessage(errorLike || fallback, normalizedServerStatus));
}

export function toNormalizedFilename(filename = "") {
  const normalized = String(filename || "").trim().replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || "upload.bin";
}

export function resolveDashscopeObjectKey({ ossFields = {}, uploadDir = "", fileId = "", filename = "" } = {}) {
  const normalizedFilename = toNormalizedFilename(filename);
  const applyFilename = (value) => String(value || "").replace(/\$\{filename\}/gi, normalizedFilename);
  const normalizePath = (value) => String(value || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  const looksLikeObjectPath = (value = "") => {
    const lastSegment = String(value || "").split("/").pop() || "";
    return /\.[A-Za-z0-9]{1,12}$/.test(lastSegment);
  };

  const keyFromFields = normalizePath(applyFilename(ossFields?.key));
  if (keyFromFields) {
    return keyFromFields;
  }

  const candidates = [fileId, uploadDir];
  for (const candidate of candidates) {
    let resolved = normalizePath(applyFilename(candidate));
    if (!resolved) continue;
    if (resolved.endsWith("/")) {
      resolved = `${resolved}${normalizedFilename}`;
    } else if (!looksLikeObjectPath(resolved)) {
      resolved = `${resolved}/${normalizedFilename}`;
    }
    return resolved;
  }
  return "";
}

export function parseDashscopeUploadErrorPayload(responseText = "") {
  const text = String(responseText || "").trim();
  if (!text) return { code: "", message: "", requestId: "" };

  try {
    const payload = JSON.parse(text);
    return {
      code: sanitizeUserFacingText(String(payload?.code || payload?.error_code || payload?.Code || "")),
      message: sanitizeUserFacingText(String(payload?.message || payload?.error || payload?.Message || "")),
      requestId: sanitizeUserFacingText(String(payload?.request_id || payload?.requestId || payload?.RequestId || "")),
    };
  } catch (_) {
    const getXmlTagValue = (tagName) => {
      const match = text.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
      return sanitizeUserFacingText(String(match?.[1] || ""));
    };
    return {
      code: getXmlTagValue("Code"),
      message: getXmlTagValue("Message"),
      requestId: getXmlTagValue("RequestId"),
    };
  }
}

export function buildDashscopeStorageUploadFailureMessage(uploadResult = {}) {
  const status = Math.max(0, Number(uploadResult?.status || 0));
  const prefix = status > 0 ? `云端存储上传失败 (HTTP ${status})` : "云端存储上传失败";
  const parsed = parseDashscopeUploadErrorPayload(uploadResult?.responseText || "");
  const details = [];
  if (parsed.code) details.push(`Code=${parsed.code}`);
  if (parsed.message) details.push(`Message=${parsed.message}`);
  if (parsed.requestId) details.push(`RequestId=${parsed.requestId}`);
  return details.length ? `${prefix}: ${details.join("; ")}` : prefix;
}


export function hasLocalLessonImportBridge() {
  return (
    typeof window !== "undefined" &&
    typeof window.localDb?.getCourses === "function" &&
    typeof window.localDb?.saveCourse === "function" &&
    typeof window.localDb?.saveSentences === "function" &&
    typeof window.localDb?.saveProgress === "function"
  );
}

export function dispatchLocalLessonUpdateEvent() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(LOCAL_LESSON_UPDATE_EVENT));
}

export function createImportedLessonId() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

export function normalizeImportedLessonPayload(payload = {}) {
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

export function buildImportedCourseRecord(lesson = {}, targetLessonId, meta = {}) {
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

export function buildImportedSentenceRecord(courseId, sentence = {}, index = 0) {
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

export function buildImportedProgressRecord(courseId, progress = null) {
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

export function getDesktopServerDiagnostic(serverStatus = {}, runtimeInfo = null) {
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
      label: "连接失败",
      tone: "neutral",
      detail: detailParts.join(" · ") || "当前无法连接云端服务",
    };
  }
  return {
    label: "已连接",
    tone: "success",
    detail: detailParts.join(" · ") || "云端服务连接正常",
  };
}

export function getDesktopHelperDiagnostic(helperStatus = {}, runtimeInfo = null) {
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
  if (!runtimeInfo) {
    return {
      label: "检查中",
      tone: "neutral",
      detail: "正在连接本地助手",
    };
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

export function getDesktopClientUpdateDiagnostic(runtimeInfo = null) {
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

export function createAbortError(message) {
  const error = new Error(message || "操作已取消");
  error.name = "AbortError";
  return error;
}

export function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function buildWorkerRequestId(sequence) {
  return `upload-${Date.now()}-${sequence}`;
}


export function createFileFromBlob(blob, fileName, mediaType) {
  if (!(blob instanceof Blob)) return null;
  try {
    return new File([blob], String(fileName || "source.bin"), { type: String(mediaType || blob.type || ""), lastModified: Date.now() });
  } catch (_) {
    return blob;
  }
}

export function isBlobBackedSourceFile(fileLike) {
  return fileLike instanceof Blob && fileLike?.desktopSelectionPlaceholder !== true;
}

export function decorateDesktopSourcePath(fileLike, sourcePath) {
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

export function decorateDesktopLinkImportFile(fileLike, lessonTitle = "") {
  if (!fileLike) return fileLike;
  const normalizedTitle = String(lessonTitle || "").trim();
  try {
    Object.defineProperty(fileLike, "desktopLinkImported", { value: true, configurable: true });
  } catch (_) {
    try {
      fileLike.desktopLinkImported = true;
    } catch (_) {
      void 0;
    }
  }
  if (normalizedTitle) {
    try {
      Object.defineProperty(fileLike, "desktopLinkLessonTitle", { value: normalizedTitle, configurable: true });
    } catch (_) {
      try {
        fileLike.desktopLinkLessonTitle = normalizedTitle;
      } catch (_) {
        void 0;
      }
    }
  }
  return fileLike;
}

export function resolveDesktopSourcePathCandidate(payload = {}) {
  return (
    String(payload?.desktopSourcePath || "").trim() ||
    String(payload?.sourcePath || "").trim() ||
    String(payload?.path || "").trim() ||
    String(payload?.filePath || "").trim()
  );
}

/** 桌面本机转写：占位 File 无 getPathForFile 路径时，仍可读装饰字段 */
export function resolveTranscribeDesktopSourcePath(fileLike) {
  const fromMeta = resolveDesktopSourcePathCandidate(fileLike).trim();
  if (fromMeta) return fromMeta;
  if (typeof window !== "undefined" && typeof window.desktopRuntime?.getPathForFile === "function" && fileLike) {
    try {
      return String(window.desktopRuntime.getPathForFile(fileLike) || "").trim();
    } catch {
      return "";
    }
  }
  return "";
}

export function buildDesktopSelectedFile(selection = {}) {
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

export async function materializeDesktopSelectedFile(fileLike) {
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

export async function prepareDesktopCloudUploadSourceFile(sourceFile, fallbackLessonTitle = "") {
  const sourcePath = resolveDesktopSourcePathCandidate(sourceFile);
  if (!sourcePath || !hasDesktopRuntimeBridge()) {
    return sourceFile;
  }
  const sourceType = String(sourceFile?.type || "").trim().toLowerCase();
  const sourceName = String(sourceFile?.name || "").trim();
  if (!sourceType.startsWith("video/") && !/\.(mp4|m4v|mov|mkv|webm|avi)$/i.test(sourceName)) {
    return sourceFile;
  }
  const response = await requestDesktopLocalHelper("/api/desktop-asr/prepare-upload-source", "json", {
    method: "POST",
    body: {
      source_path: sourcePath,
      source_filename: sourceName,
    },
  });
  const payload = response?.data || {};
  if (!response?.ok) {
    throw new Error(toErrorText(payload, "准备桌面上传素材失败"));
  }
  const preparedSourcePath = String(payload?.source_path || "").trim();
  if (!preparedSourcePath || preparedSourcePath === sourcePath) {
    return sourceFile;
  }
  const preparedFile = buildDesktopSelectedFile({
    path: preparedSourcePath,
    sourcePath: preparedSourcePath,
    name: String(payload?.source_filename || sourceName || "desktop-cloud-upload").trim() || "desktop-cloud-upload",
    type: String(payload?.content_type || "audio/ogg").trim() || "audio/ogg",
    size: Math.max(0, Number(payload?.source_size_bytes || payload?.size_bytes || 0)),
  });
  const nextFile = preparedFile
    ? decorateDesktopSourcePath(preparedFile, preparedSourcePath)
    : decorateDesktopSourcePath(sourceFile, preparedSourcePath);
  if (sourceFile?.desktopLinkImported) {
    return decorateDesktopLinkImportFile(nextFile, String(sourceFile?.desktopLinkLessonTitle || fallbackLessonTitle || "").trim());
  }
  return nextFile;
}

export function restoreSavedSourceFile(saved = {}) {
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

export function buildSubtitleDraftItems(sentences, { isFinal = false, source = "workspace" } = {}) {
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

export function buildSubtitleDraftSnapshotFromWorkspace(workspace) {
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

export function buildSubtitleDraftSnapshotFromTask(taskSnapshot) {
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

export function buildSubtitleDraftSnapshotFromAsrPayload(asrPayload, { title = "生成中的字幕草稿", source = "local_asr", isFinal = false } = {}) {
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

export function isMobileUploadViewport() {
  if (typeof navigator === "undefined") return false;
  const userAgent = String(navigator.userAgent || "");
  return Boolean(navigator.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

