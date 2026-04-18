import { TOKEN_KEY, readCollinsLevel } from "../../app/authStorage";
import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { classifyTokensByCollins } from "../../shared/api/dictionaryApi";
import { useAppStore } from "../../store";

const BOTTLE_LESSON_SCHEMA_VERSION = "1";
const BOTTLE_LESSON_FILE_SUFFIX = ".bottle-lesson.json";
const BOTTLE_DESKTOP_APP_VERSION = "0.2.0";

export const LOCAL_LESSON_UPDATE_EVENT = "bottle-local-lessons-updated";

export function hasLocalDbBridge() {
  return typeof window !== "undefined" && typeof window.localDb?.getCourses === "function";
}

function hasDesktopRuntimeBridge() {
  return typeof window !== "undefined" && typeof window.desktopRuntime?.requestLocalHelper === "function";
}

export const isDesktop = hasDesktopRuntimeBridge();

export async function requestDesktopLocalHelper(pathname, responseType = "json", options = {}) {
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

function sanitizeExportFileName(value, fallback = "lesson") {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

export function buildBottleLessonFilename(lesson) {
  const title = sanitizeExportFileName(lesson?.title, "");
  const lessonId = sanitizeExportFileName(lesson?.id, "lesson");
  return `${title || lessonId}${BOTTLE_LESSON_FILE_SUFFIX}`;
}

export function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function normalizeExportLesson(lesson = {}, source = "remote") {
  const metadata = lesson?.metadata && typeof lesson.metadata === "object" && !Array.isArray(lesson.metadata) ? lesson.metadata : {};
  return {
    id: String(lesson?.id ?? "").trim(),
    title: String(lesson?.title || ""),
    source_filename: String(lesson?.source_filename || ""),
    created_at: String(lesson?.created_at || ""),
    updated_at: String(lesson?.updated_at || lesson?.created_at || ""),
    source_duration_ms: Math.max(0, Number(lesson?.source_duration_ms ?? lesson?.duration_ms ?? 0) || 0),
    media_storage: String(lesson?.media_storage || metadata.media_storage || source),
    asr_model: String(lesson?.asr_model || ""),
    metadata: {
      ...metadata,
      export_source: source,
    },
  };
}

function normalizeExportSentence(sentence = {}, index = 0) {
  return {
    id: sentence?.id == null ? `${index}` : String(sentence.id),
    order_index: Number(sentence?.order_index ?? sentence?.sentence_index ?? index) || index,
    text_en: String(sentence?.text_en || sentence?.english_text || sentence?.text || ""),
    text_zh: String(sentence?.text_zh || sentence?.chinese_text || sentence?.translation || ""),
    begin_ms: Math.max(0, Number(sentence?.begin_ms ?? sentence?.start_ms ?? 0) || 0),
    end_ms: Math.max(0, Number(sentence?.end_ms ?? sentence?.end_time ?? 0) || 0),
    tokens: Array.isArray(sentence?.tokens) ? sentence.tokens : Array.isArray(sentence?.words) ? sentence.words : [],
    audio_url: sentence?.audio_url ?? null,
    variant_key: String(sentence?.variant_key || ""),
  };
}

function normalizeExportProgress(progress = {}) {
  return {
    current_sentence_index: Math.max(0, Number(progress?.current_sentence_index ?? progress?.current_index ?? 0) || 0),
    completed_sentence_indexes: Array.isArray(progress?.completed_sentence_indexes)
      ? progress.completed_sentence_indexes
      : Array.isArray(progress?.completed_indices)
        ? progress.completed_indices
        : [],
    last_played_at_ms: Math.max(0, Number(progress?.last_played_at_ms || 0) || 0),
    started_at: progress?.started_at || null,
    updated_at: progress?.updated_at || "",
    user_id: String(progress?.user_id || ""),
  };
}

function buildBottleLessonPayload({ lesson, sentences, progress, source }) {
  return {
    schema_version: BOTTLE_LESSON_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    app_version: BOTTLE_DESKTOP_APP_VERSION,
    lesson: normalizeExportLesson(lesson, source),
    sentences: (Array.isArray(sentences) ? sentences : []).map((item, index) => normalizeExportSentence(item, index)),
    progress: normalizeExportProgress(progress),
  };
}

export function buildLocalLessonRecord(course, sentences, progress) {
  const metadata = course?.metadata && typeof course.metadata === "object" && !Array.isArray(course.metadata) ? course.metadata : {};
  const progressSnapshot = normalizeExportProgress(progress);
  const normalizedSentences = (Array.isArray(sentences) ? sentences : []).map((item, index) => normalizeExportSentence(item, index));
  return {
    id: String(course?.id ?? ""),
    title: String(course?.title || metadata.title || "未命名课程"),
    source_filename: String(course?.source_filename || metadata.source_filename || "本地导入课程"),
    created_at: String(course?.created_at || ""),
    updated_at: String(course?.updated_at || course?.created_at || ""),
    source_duration_ms: Math.max(0, Number(metadata.source_duration_ms ?? course?.duration_ms ?? 0) || 0),
    media_storage: "local_import",
    asr_model: String(course?.asr_model || metadata.asr_model || ""),
    sentences: normalizedSentences,
    progress: progressSnapshot,
    __bottleLocal: true,
    __bottleCardMeta: {
      sentenceCount: normalizedSentences.length,
      progress: progressSnapshot,
    },
    __bottleExportPayload: buildBottleLessonPayload({
      lesson: {
        ...course,
        source_duration_ms: metadata.source_duration_ms ?? course?.duration_ms ?? 0,
        media_storage: metadata.media_storage || "local_import",
        metadata,
      },
      sentences: normalizedSentences,
      progress: progressSnapshot,
      source: "local_db",
    }),
  };
}

export async function buildRemoteLessonExportPayload(lessonId) {
  const accessToken = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem(TOKEN_KEY) || "" : "";
  if (!accessToken) {
    throw new Error("当前未登录，无法导出云端课程。");
  }

  const [detailResp, progressResp] = await Promise.all([
    api(`/api/lessons/${lessonId}`, {}, accessToken),
    api(`/api/lessons/${lessonId}/progress`, {}, accessToken),
  ]);
  const detailData = await parseResponse(detailResp);
  const progressData = await parseResponse(progressResp);

  if (!detailResp.ok) {
    throw new Error(toErrorText(detailData, "加载课程详情失败"));
  }
  if (!progressResp.ok && progressResp.status !== 404) {
    throw new Error(toErrorText(progressData, "加载课程进度失败"));
  }

  return buildBottleLessonPayload({
    lesson: detailData,
    sentences: Array.isArray(detailData?.sentences) ? detailData.sentences : [],
    progress: progressResp.ok ? progressData : null,
    source: "remote_api",
  });
}

export async function buildRemoteLessonDetailPayload(lessonId) {
  const accessToken = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem(TOKEN_KEY) || "" : "";
  if (!accessToken) {
    throw new Error("当前未登录，无法读取课程详情。");
  }
  const detailResp = await api(`/api/lessons/${lessonId}`, {}, accessToken);
  const detailData = await parseResponse(detailResp);
  if (!detailResp.ok) {
    throw new Error(toErrorText(detailData, "加载课程详情失败"));
  }
  return { accessToken, detail: detailData };
}

export function formatCreatedAt(createdAt) {
  if (!createdAt) return "时间未知";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(createdAt));
  } catch (_) {
    return "时间未知";
  }
}

export function hasProgressSnapshot(progress) {
  if (!progress) return false;
  const currentIndex = Number(progress.current_sentence_index || 0);
  const completedCount = Array.isArray(progress.completed_sentence_indexes) ? progress.completed_sentence_indexes.length : 0;
  const lastPlayedAtMs = Number(progress.last_played_at_ms || 0);
  return currentIndex > 0 || completedCount > 0 || lastPlayedAtMs > 0;
}

function getCurrentSentenceCount(progress, totalCount) {
  if (!totalCount || totalCount <= 0 || !hasProgressSnapshot(progress)) {
    return 0;
  }
  const currentIndex = Number(progress?.current_sentence_index || 0);
  if (!Number.isFinite(currentIndex)) {
    return 1;
  }
  return Math.min(totalCount, Math.max(1, Math.trunc(currentIndex) + 1));
}

export function buildLessonProgressState(progress, sentenceCount) {
  const normalizedTotal = Number(sentenceCount || 0);
  const totalCount = Number.isFinite(normalizedTotal) && normalizedTotal > 0 ? Math.max(0, Math.trunc(normalizedTotal)) : 0;
  const currentCount = getCurrentSentenceCount(progress, totalCount);
  const completedCount = Array.isArray(progress?.completed_sentence_indexes)
    ? Math.min(totalCount || Number.MAX_SAFE_INTEGER, progress.completed_sentence_indexes.length)
    : 0;
  const isComplete = totalCount > 0 && (currentCount >= totalCount || completedCount >= totalCount);
  const ratio = totalCount > 0 ? (isComplete ? 1 : currentCount / totalCount) : 0;
  const clampedPercent = Math.max(0, Math.min(100, ratio * 100));

  return {
    completedCount,
    currentCount,
    totalCount,
    percent: clampedPercent,
    progressLabel: totalCount > 0 ? `${currentCount}/${totalCount}` : "句数待同步",
    statusLabel:
      totalCount <= 0
        ? "学习进度"
        : isComplete
          ? "已完成"
          : currentCount > 0
            ? "当前进度"
            : "尚未开始",
    isComplete,
    isActive: totalCount > 0 && currentCount > 0 && !isComplete,
    hasTrack: totalCount > 0,
  };
}

const WORD_DIFFICULTY_KEY_PREFIX = "difficulty_distribution_v1:";

function getDifficultyAnalysisKey(lessonId) {
  return `${WORD_DIFFICULTY_KEY_PREFIX}${lessonId}`;
}

function computeCollinsDistribution(analysisResult) {
  const distribution = analysisResult?.distribution;
  if (!distribution || typeof distribution !== "object") return null;
  const total = Object.values(distribution).reduce((sum, count) => sum + (Number(count) || 0), 0);
  if (total === 0) return null;
  const defaultPercent = Math.round(((Number(distribution.default) || 0) / total) * 100);
  const iPlusOnePercent = Math.round(((Number(distribution.i_plus_one) || 0) / total) * 100);
  const aboveIPlusOnePercent = Math.round(((Number(distribution.above_i_plus_one) || 0) / total) * 100);
  const unratedPercent = Math.round(((Number(distribution.unrated) || 0) / total) * 100);
  const dominantLabel =
    iPlusOnePercent >= aboveIPlusOnePercent
      ? "i+1"
      : "高难";

  return {
    iPlusOnePercent: Math.round(iPlusOnePercent),
    aboveIPlusOnePercent: Math.round(aboveIPlusOnePercent),
    masteredPercent: Math.round(defaultPercent),
    unratedPercent,
    dominantLabel,
    rawDistribution: distribution,
  };
}

export async function ensureCefrAnalysis(lessonId, sentences) {
  const key = getDifficultyAnalysisKey(lessonId);
  const accessToken = typeof window !== "undefined" && window.localStorage ? window.localStorage.getItem(TOKEN_KEY) || "" : "";
  if (!accessToken) {
    return;
  }

  if (typeof localStorage !== "undefined") {
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        const analysis = JSON.parse(cached);
        const distribution = computeCollinsDistribution(analysis);
        if (distribution) {
          useAppStore.getState().mergeLessonCardMeta(lessonId, { difficultyDistribution: distribution });
          return;
        }
      } catch (_) {
        // fall through to re-analyze
      }
    }
  }

  useAppStore.getState().mergeLessonCardMeta(lessonId, { difficultyLoading: true });
  try {
    const tokens = Array.from(
      new Set(
        (Array.isArray(sentences) ? sentences : [])
          .flatMap((sentence) => String(sentence?.text_en || sentence?.english_text || sentence?.text || "").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [])
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
    const userCollinsLevel = readCollinsLevel() || 3;
    const payload = await classifyTokensByCollins(api, accessToken, tokens);
    const distribution = { default: 0, i_plus_one: 0, above_i_plus_one: 0, unrated: 0 };
    for (const item of Array.isArray(payload?.items) ? payload.items : []) {
      const band = String(item?.band || "unrated");
      distribution[band] = (Number(distribution[band]) || 0) + 1;
    }
    const analysis = { distribution, userCollinsLevel };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(analysis));
    }
    const distributionSummary = computeCollinsDistribution(analysis);
    useAppStore.getState().mergeLessonCardMeta(lessonId, { difficultyDistribution: distributionSummary, difficultyLoading: false });
  } catch (_) {
    useAppStore.getState().mergeLessonCardMeta(lessonId, { difficultyLoading: false });
  }
}

export function getCoverAssistiveText(lesson) {
  const title = String(lesson?.title || "").trim();
  return title ? `${title} 默认封面` : "课程默认封面";
}


