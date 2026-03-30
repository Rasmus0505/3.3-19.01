import { CheckCircle2, Clock3, Download, History, MoreVertical, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { TOKEN_KEY } from "../../app/authStorage";
import { cn } from "../../lib/utils";
import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { saveLessonSubtitleCacheSeed, saveLessonSubtitleVariant } from "../../shared/media/localSubtitleStore.js";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  MediaCover,
  Skeleton,
  Progress,
  Switch,
} from "../../shared/ui";
import {
  areShortcutBindingsEqual,
  captureShortcutFromKeyboardEvent,
  getShortcutLabel,
  readLearningSettings,
  sanitizeLearningSettings,
  SHORTCUT_ACTIONS,
  writeLearningSettings,
} from "../immersive/learningSettings";

/** @typedef {import("./types").Lesson} Lesson */
/** @typedef {import("./types").LessonSentence} LessonSentence */

const BOTTLE_LESSON_SCHEMA_VERSION = "1";
const BOTTLE_LESSON_FILE_SUFFIX = ".bottle-lesson.json";
const BOTTLE_DESKTOP_APP_VERSION = "0.2.0";
const LOCAL_LESSON_UPDATE_EVENT = "bottle-local-lessons-updated";

function hasLocalDbBridge() {
  return typeof window !== "undefined" && typeof window.localDb?.getCourses === "function";
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

function buildBottleLessonFilename(lesson) {
  const title = sanitizeExportFileName(lesson?.title, "");
  const lessonId = sanitizeExportFileName(lesson?.id, "lesson");
  return `${title || lessonId}${BOTTLE_LESSON_FILE_SUFFIX}`;
}

function downloadJsonFile(fileName, payload) {
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

function buildLocalLessonRecord(course, sentences, progress) {
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

async function buildRemoteLessonExportPayload(lessonId) {
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

async function buildRemoteLessonDetailPayload(lessonId) {
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

function formatCreatedAt(createdAt) {
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

function hasProgressSnapshot(progress) {
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

function buildLessonProgressState(progress, sentenceCount) {
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
    progressLabel: totalCount > 0 ? `${currentCount}/${totalCount}` : "\u53e5\u6570\u5f85\u540c\u6b65",
    statusLabel:
      totalCount <= 0
        ? "\u5b66\u4e60\u8fdb\u5ea6"
        : isComplete
          ? "\u5df2\u5b8c\u6210"
          : currentCount > 0
            ? "\u5f53\u524d\u8fdb\u5ea6"
            : "\u5c1a\u672a\u5f00\u59cb",
    isComplete,
    isActive: totalCount > 0 && currentCount > 0 && !isComplete,
    hasTrack: totalCount > 0,
  };
}

function getCoverAssistiveText(lesson) {
  const title = String(lesson?.title || "").trim();
  return title ? `${title} 默认封面` : "课程默认封面";
}

export function LessonList({
  lessons,
  totalLessons = 0,
  currentLessonId,
  currentLessonNeedsBinding = false,
  lessonCardMetaMap = {},
  lessonMediaMetaMap = {},
  guideTargetLessonId = 0,
  onStartLesson,
  onRename,
  onDelete,
  onBulkDelete,
  onRestoreMedia,
  onRefreshHistory,
  onSwitchToUpload,
  loading = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore = null,
}) {
  const [localLessons, setLocalLessons] = useState([]);
  const [renamingLesson, setRenamingLesson] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deletingLesson, setDeletingLesson] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [menuLessonId, setMenuLessonId] = useState(null);
  const [restoringLessonId, setRestoringLessonId] = useState(null);
  const [status, setStatus] = useState("");
  const [exportingLessonId, setExportingLessonId] = useState("");
  const [actionLessonId, setActionLessonId] = useState("");
  const [progressOverrides, setProgressOverrides] = useState({});
  const [selectionMode, setSelectionMode] = useState("none");
  const [selectedLessonIds, setSelectedLessonIds] = useState([]);
  const [excludedLessonIds, setExcludedLessonIds] = useState([]);
  const [learningSettings, setLearningSettings] = useState(() => readLearningSettings());
  const [settingsError, setSettingsError] = useState("");
  const [recordingShortcutActionId, setRecordingShortcutActionId] = useState("");
  const restoreInputRef = useRef(null);
  const restoreTargetRef = useRef(null);
  const visibleLessons = useMemo(() => {
    if (!localLessons.length) {
      return lessons;
    }
    const localLessonIdSet = new Set(localLessons.map((lesson) => String(lesson?.id ?? "")));
    return [...localLessons, ...lessons.filter((lesson) => !localLessonIdSet.has(String(lesson?.id ?? "")))];
  }, [lessons, localLessons]);
  const loadedLessonIds = useMemo(() => visibleLessons.map((lesson) => Number(lesson.id || 0)).filter((item) => item > 0), [visibleLessons]);
  const loadedLessonIdSet = useMemo(() => new Set(loadedLessonIds), [loadedLessonIds]);
  const selectedLessonIdSet = useMemo(() => new Set(selectedLessonIds), [selectedLessonIds]);
  const excludedLessonIdSet = useMemo(() => new Set(excludedLessonIds), [excludedLessonIds]);

  function updateLearningSettings(updater) {
    setLearningSettings((current) => {
      const nextValue = typeof updater === "function" ? updater(current) : updater;
      return sanitizeLearningSettings(nextValue);
    });
  }

  function handleCustomConfigChange(field, value) {
    setSettingsError("");
    updateLearningSettings((current) => ({
      ...current,
      presetId: "custom",
      customConfig: {
        ...current.customConfig,
        [field]: value,
      },
    }));
  }

  function handleCustomConfigToggle(field, checked) {
    setSettingsError("");
    updateLearningSettings((current) => ({
      ...current,
      presetId: "custom",
      customConfig: {
        ...current.customConfig,
        [field]: checked,
      },
    }));
  }

  function handlePlaybackPreferenceChange(field, checked) {
    setSettingsError("");
    updateLearningSettings((current) => ({
      ...current,
      playbackPreferences: {
        ...current.playbackPreferences,
        [field]: checked,
      },
    }));
  }

  const cards = useMemo(
    () =>
      visibleLessons.map((lesson) => {
        const isLocalLesson = Boolean(lesson?.__bottleLocal);
        const overrideProgress = progressOverrides[lesson.id] || null;
        const meta = {
          ...(lesson?.__bottleCardMeta || lessonCardMetaMap[lesson.id] || {}),
          progress: overrideProgress || lesson?.__bottleCardMeta?.progress || lessonCardMetaMap[lesson.id]?.progress || null,
        };
        const mediaMeta = lessonMediaMetaMap[lesson.id] || {};
        const sentenceCount = Number(meta.sentenceCount || lesson.sentences?.length || 0);
        const progressState = buildLessonProgressState(meta.progress, sentenceCount);
        const actionLabel = isLocalLesson ? "本地导入" : hasProgressSnapshot(meta.progress) ? "继续学习" : "开始学习";
        const needsBinding = !isLocalLesson && lesson.media_storage === "client_indexeddb" && !mediaMeta.hasMedia;
        return {
          lesson,
          mediaMeta,
          sentenceCount,
          progressState,
          actionLabel,
          needsBinding,
          isLocalLesson,
          createdAtLabel: formatCreatedAt(lesson.created_at),
        };
      }),
    [lessonCardMetaMap, lessonMediaMetaMap, progressOverrides, visibleLessons],
  );
  const defaultGuideLessonId = useMemo(() => cards.find((item) => !item.isLocalLesson)?.lesson.id ?? cards[0]?.lesson.id ?? 0, [cards]);
  const allHistorySelected = selectionMode === "all" && Number(totalLessons || 0) > 0;
  const selectedCount = allHistorySelected ? Math.max(0, Number(totalLessons || 0) - excludedLessonIds.length) : selectedLessonIds.length;
  const hasSelection = selectedCount > 0;

  function isLessonSelected(lessonId) {
    const normalizedLessonId = Number(lessonId || 0);
    if (!normalizedLessonId) return false;
    if (allHistorySelected) {
      return !excludedLessonIdSet.has(normalizedLessonId);
    }
    return selectedLessonIdSet.has(normalizedLessonId);
  }

  function clearSelection() {
    setSelectionMode("none");
    setSelectedLessonIds([]);
    setExcludedLessonIds([]);
  }

  function toggleLessonSelection(lessonId, checked) {
    const normalizedLessonId = Number(lessonId || 0);
    if (!normalizedLessonId) return;
    if (allHistorySelected) {
      setExcludedLessonIds((current) => {
        const next = new Set(current);
        if (checked) {
          next.delete(normalizedLessonId);
        } else {
          next.add(normalizedLessonId);
        }
        return Array.from(next);
      });
      return;
    }
    setSelectedLessonIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(normalizedLessonId);
      } else {
        next.delete(normalizedLessonId);
      }
      const nextList = Array.from(next);
      setSelectionMode(nextList.length > 0 ? "partial" : "none");
      return nextList;
    });
  }

  function selectAllHistory() {
    setSelectionMode("all");
    setSelectedLessonIds([]);
    setExcludedLessonIds([]);
    setStatus("");
  }

  function startLessonFromHistory(lessonId) {
    void onStartLesson?.(lessonId);
  }

  async function refreshLocalLessons() {
    if (!hasLocalDbBridge()) {
      setLocalLessons([]);
      return;
    }
    try {
      const courses = await window.localDb.getCourses();
      const nextLocalLessons = await Promise.all(
        (Array.isArray(courses) ? courses : []).map(async (course) => {
          const [sentences, progress] = await Promise.all([
            window.localDb.getSentences(course.id).catch(() => []),
            window.localDb.getProgress(course.id).catch(() => null),
          ]);
          return buildLocalLessonRecord(course, sentences, progress);
        }),
      );
      setLocalLessons(nextLocalLessons);
    } catch (_) {
      setLocalLessons([]);
    }
  }

  async function handleExportLesson(lesson) {
    if (!lesson?.id) return;
    const normalizedLessonId = String(lesson.id);
    setExportingLessonId(normalizedLessonId);
    setStatus("");
    try {
      const payload = lesson.__bottleExportPayload || (lesson.__bottleLocal ? null : await buildRemoteLessonExportPayload(lesson.id));
      if (!payload) {
        throw new Error("当前课程缺少可导出的本地数据。");
      }
      downloadJsonFile(buildBottleLessonFilename(lesson), payload);
      setStatus(`已导出课程：${lesson.title || normalizedLessonId}`);
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "导出课程失败");
    } finally {
      setExportingLessonId("");
    }
  }

  async function handleSetLessonCompletion(lesson, completed) {
    if (!lesson?.id) return;
    setActionLessonId(String(lesson.id));
    setMenuLessonId(null);
    setStatus("");
    try {
      const { accessToken, detail } = await buildRemoteLessonDetailPayload(lesson.id);
      const sentenceCount =
        Array.isArray(detail?.sentences) && detail.sentences.length > 0
          ? detail.sentences.length
          : Number(lessonCardMetaMap[lesson.id]?.sentenceCount || 0);
      if (!Number.isFinite(sentenceCount) || sentenceCount <= 0) {
        throw new Error("当前课程暂无可完成的句子。");
      }
      const completedSentenceIndexes = Array.from({ length: sentenceCount }, (_, index) => index);
      const progressResp = await api(
        `/api/lessons/${lesson.id}/progress`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_sentence_index: completed ? Math.max(0, sentenceCount - 1) : 0,
            completed_sentence_indexes: completed ? completedSentenceIndexes : [],
            last_played_at_ms: completed ? Number(detail?.duration_ms || detail?.source_duration_ms || 0) : 0,
          }),
        },
        accessToken,
      );
      const progressData = await parseResponse(progressResp);
      if (!progressResp.ok) {
        throw new Error(toErrorText(progressData, completed ? "标记学完失败" : "标记未完成失败"));
      }
      setProgressOverrides((current) => ({
        ...current,
        [lesson.id]: {
          current_sentence_index: completed ? Math.max(0, sentenceCount - 1) : 0,
          completed_sentence_indexes: completed ? completedSentenceIndexes : [],
          last_played_at_ms: completed ? Number(detail?.duration_ms || detail?.source_duration_ms || 0) : 0,
        },
      }));
      await onRefreshHistory?.();
      setStatus(completed ? "已标记学完" : "已标记未完成");
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : completed ? "标记学完失败" : "标记未完成失败");
    } finally {
      setActionLessonId("");
    }
  }

  async function handleRecoverTranslation(lesson) {
    if (!lesson?.id) return;
    setActionLessonId(String(lesson.id));
    setMenuLessonId(null);
    setStatus("");
    try {
      const { accessToken, detail } = await buildRemoteLessonDetailPayload(lesson.id);
      const sourceSeed = detail?.subtitle_cache_seed;
      const asrPayload = sourceSeed?.asr_payload;
      if (!asrPayload || typeof asrPayload !== "object") {
        throw new Error("当前课程缺少可补翻译的字幕源数据。");
      }
      const hasMissingTranslation = Array.isArray(detail?.sentences)
        ? detail.sentences.some((sentence) => !String(sentence?.text_zh || "").trim())
        : true;
      if (!hasMissingTranslation && lesson.status !== "partial_ready") {
        setStatus("当前课程已有翻译，无需补翻译");
        return;
      }
      await saveLessonSubtitleCacheSeed(lesson.id, sourceSeed, {
        metadata: {
          source_filename: detail?.source_filename || lesson?.source_filename || "",
          runtime_kind: sourceSeed?.runtime_kind || "",
        },
      });
      const variantResp = await api(
        `/api/lessons/${lesson.id}/subtitle-variants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asr_payload: asrPayload,
            semantic_split_enabled: false,
          }),
        },
        accessToken,
      );
      const variantData = await parseResponse(variantResp);
      if (!variantResp.ok) {
        throw new Error(toErrorText(variantData, "补翻译失败"));
      }
      await saveLessonSubtitleVariant(lesson.id, variantData, {
        makeActive: true,
        metadata: {
          source_filename: detail?.source_filename || lesson?.source_filename || "",
          runtime_kind: sourceSeed?.runtime_kind || "",
        },
      });
      setStatus("已补充翻译，进入课程即可使用");
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "补翻译失败");
    } finally {
      setActionLessonId("");
    }
  }

  useEffect(() => {
    writeLearningSettings(learningSettings);
  }, [learningSettings]);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      if (disposed) return;
      await refreshLocalLessons();
    };

    void load();
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleLocalLessonUpdated = () => {
      void load();
    };
    window.addEventListener(LOCAL_LESSON_UPDATE_EVENT, handleLocalLessonUpdated);
    return () => {
      disposed = true;
      window.removeEventListener(LOCAL_LESSON_UPDATE_EVENT, handleLocalLessonUpdated);
    };
  }, []);

  useEffect(() => {
    if (!recordingShortcutActionId || typeof window === "undefined") return undefined;

    const handleShortcutKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setRecordingShortcutActionId("");
        setSettingsError("已取消快捷键录入。");
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const { value, error } = captureShortcutFromKeyboardEvent(event);
      if (error) {
        setSettingsError(error);
        return;
      }

      setSettingsError("");
      updateLearningSettings((current) => ({
        ...current,
        shortcuts: {
          ...Object.fromEntries(
            Object.entries(current.shortcuts).map(([actionId, actionValue]) => [
              actionId,
              actionId !== recordingShortcutActionId && areShortcutBindingsEqual(actionValue, value) ? null : actionValue,
            ]),
          ),
          [recordingShortcutActionId]: value,
        },
      }));
      setRecordingShortcutActionId("");
    };

    window.addEventListener("keydown", handleShortcutKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleShortcutKeyDown, true);
    };
  }, [learningSettings.shortcuts, recordingShortcutActionId]);

  useEffect(() => {
    if (renamingLesson && !visibleLessons.some((item) => item.id === renamingLesson.id)) {
      setRenamingLesson(null);
      setRenameTitle("");
    }
    if (deletingLesson && !visibleLessons.some((item) => item.id === deletingLesson.id)) {
      setDeletingLesson(null);
    }
    if (menuLessonId && !visibleLessons.some((item) => item.id === menuLessonId)) {
      setMenuLessonId(null);
    }
    if (restoringLessonId && !visibleLessons.some((item) => item.id === restoringLessonId)) {
      setRestoringLessonId(null);
      restoreTargetRef.current = null;
    }
  }, [deletingLesson, menuLessonId, renamingLesson, restoringLessonId, visibleLessons]);

  useEffect(() => {
    setSelectedLessonIds((current) => current.filter((lessonId) => loadedLessonIdSet.has(Number(lessonId || 0))));
    setExcludedLessonIds((current) => current.filter((lessonId) => loadedLessonIdSet.has(Number(lessonId || 0))));
    if (Number(totalLessons || 0) <= 0) {
      clearSelection();
      setBulkDeleteOpen(false);
    }
  }, [loadedLessonIdSet, totalLessons]);

  function openRenameDialog(lesson) {
    setRenamingLesson(lesson);
    setRenameTitle(String(lesson.title || ""));
    setStatus("");
  }

  async function submitRename() {
    if (!renamingLesson || !onRename) return;
    const nextTitle = String(renameTitle || "").trim();
    if (!nextTitle) {
      setStatus("课程标题不能为空");
      return;
    }

    setRenameBusy(true);
    try {
      const result = await onRename(renamingLesson.id, nextTitle);
      if (result?.ok) {
        setRenamingLesson(null);
        setRenameTitle("");
        setStatus("");
      } else {
        setStatus(result?.message || "重命名课程失败");
      }
    } finally {
      setRenameBusy(false);
    }
  }

  async function submitDelete() {
    if (!deletingLesson || !onDelete) return;
    setDeleteBusy(true);
    try {
      const result = await onDelete(deletingLesson.id);
      if (result?.ok) {
        setDeletingLesson(null);
        setStatus("");
      } else {
        setStatus(result?.message || "删除课程失败");
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  async function submitBulkDelete() {
    if (!onBulkDelete || !hasSelection) return;
    setDeleteBusy(true);
    try {
      const result = await onBulkDelete(
        allHistorySelected
          ? { deleteAll: true, lessonIds: [], excludedLessonIds }
          : { deleteAll: false, lessonIds: selectedLessonIds },
      );
      if (result?.ok) {
        clearSelection();
        setBulkDeleteOpen(false);
        setStatus("");
      } else {
        setStatus(result?.message || "批量删除历史失败");
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  function openRestorePicker(lesson) {
    if (!onRestoreMedia || !lesson) return;
    restoreTargetRef.current = lesson;
    setMenuLessonId(null);
    restoreInputRef.current?.click();
  }

  async function submitRestore(file) {
    const lesson = restoreTargetRef.current;
    if (!lesson || !file || !onRestoreMedia) return;
    setRestoringLessonId(lesson.id);
    setStatus("");
    try {
      const result = await onRestoreMedia(lesson, file);
      if (result?.ok) {
        setStatus(result?.message || "恢复视频成功");
      } else {
        setStatus(result?.message || "恢复视频失败");
      }
    } finally {
      setRestoringLessonId(null);
      restoreTargetRef.current = null;
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          历史记录
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <section className="rounded-2xl border bg-muted/10 p-4 md:p-5">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">学习参数</p>
          </div>

          <div className="mt-4 space-y-4">
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border bg-background/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">答完自动重播本句</p>
                  <Switch
                    checked={learningSettings.playbackPreferences?.autoReplayAnsweredSentence !== false}
                    onCheckedChange={(checked) => handlePlaybackPreferenceChange("autoReplayAnsweredSentence", checked)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border bg-background/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">字母揭示</p>
                  <Switch
                    checked={learningSettings.customConfig.revealLetterEnabled}
                    onCheckedChange={(checked) => handleCustomConfigToggle("revealLetterEnabled", checked)}
                  />
                </div>
                <div className={cn("mt-3 space-y-2", !learningSettings.customConfig.revealLetterEnabled && "opacity-60")}>
                  <p className="text-xs font-medium text-foreground">开始阶段</p>
                  <Input
                    type="number"
                    min="0"
                    max="8"
                    step="1"
                    className="h-9"
                    disabled={!learningSettings.customConfig.revealLetterEnabled}
                    value={learningSettings.customConfig.revealLetterAt}
                    onChange={(event) => handleCustomConfigChange("revealLetterAt", event.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-2xl border bg-background/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">单词揭示</p>
                  <Switch
                    checked={learningSettings.customConfig.revealWordEnabled}
                    onCheckedChange={(checked) => handleCustomConfigToggle("revealWordEnabled", checked)}
                  />
                </div>
                <div className={cn("mt-3 grid gap-2 sm:grid-cols-2", !learningSettings.customConfig.revealWordEnabled && "opacity-60")}>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">开始阶段</p>
                    <Input
                      type="number"
                      min="0"
                      max="8"
                      step="1"
                      className="h-9"
                      disabled={!learningSettings.customConfig.revealWordEnabled}
                      value={learningSettings.customConfig.revealWordAt}
                      onChange={(event) => handleCustomConfigChange("revealWordAt", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground">每次 + 词数</p>
                    <Input
                      type="number"
                      min="0"
                      max="4"
                      step="1"
                      className="h-9"
                      disabled={!learningSettings.customConfig.revealWordEnabled}
                      value={learningSettings.customConfig.extraRevealWordsPerReplay}
                      onChange={(event) => handleCustomConfigChange("extraRevealWordsPerReplay", event.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">快捷键配置</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {SHORTCUT_ACTIONS.map((action) => {
                  const recording = recordingShortcutActionId === action.id;
                  return (
                    <div key={action.id} className="flex h-full flex-col rounded-2xl border bg-background/80 p-3">
                      <div className="flex flex-1 flex-col gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-foreground">{action.label}</p>
                          <p className="text-sm text-muted-foreground break-all">{getShortcutLabel(learningSettings.shortcuts[action.id])}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={recording ? "default" : "outline"}
                          className="mt-auto self-start"
                          onClick={() => {
                            setSettingsError("");
                            setRecordingShortcutActionId((current) => (current === action.id ? "" : action.id));
                          }}
                        >
                          {recording ? "请按键…" : "修改"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {settingsError ? (
              <Alert variant="destructive">
                <AlertDescription>{settingsError}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </section>

        {Number(totalLessons || cards.length || 0) > 0 ? (
          <div className="sticky top-14 z-10 rounded-2xl border bg-background/95 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85 md:top-16 md:px-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {allHistorySelected ? (
                  <Button type="button" variant="outline" onClick={clearSelection} disabled={deleteBusy}>
                    取消全选
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={selectAllHistory} disabled={deleteBusy}>
                    全选全部历史
                  </Button>
                )}
                {hasSelection ? (
                  <p className="text-sm text-muted-foreground">
                    {allHistorySelected
                      ? excludedLessonIds.length > 0
                        ? `已选其余 ${selectedCount} 项，已排除 ${excludedLessonIds.length} 项`
                        : `已选全部历史 ${selectedCount} 项`
                      : `已选 ${selectedCount} 项`}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">选择要删除的记录</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="destructive" className="min-h-11 w-full sm:w-auto" disabled={!hasSelection || deleteBusy || !onBulkDelete} onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="size-4" />
                  批量删除
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : null}

        {!loading && cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/15 px-6 py-10 text-center">
            <p className="text-base font-medium">还没有课程记录</p>
            <p className="mt-2 text-sm text-muted-foreground">先上传一份素材，生成第一节课程后再回来继续学习。</p>
            {onSwitchToUpload ? (
              <Button className="mt-4" onClick={onSwitchToUpload}>
                去生成课程
              </Button>
            ) : null}
          </div>
        ) : null}

        {!loading ? (
          <div className="space-y-3">
            {cards.map(({ lesson, mediaMeta, sentenceCount, progressState, actionLabel, needsBinding, isLocalLesson, createdAtLabel }) => {
              const selected = currentLessonId === lesson.id;
              const isGuideTarget =
                Number(guideTargetLessonId || 0) > 0 ? Number(guideTargetLessonId) === Number(lesson.id) : lesson.id === defaultGuideLessonId;
              return (
                <div
                  key={lesson.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border transition-all",
                    progressState.isComplete
                      ? selected
                        ? "border-emerald-500 bg-emerald-50/95 shadow-sm"
                        : "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(240,253,250,0.96))] hover:border-emerald-300 hover:bg-[linear-gradient(180deg,rgba(220,252,231,0.96),rgba(236,253,245,0.98))]"
                      : selected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-primary/30 hover:bg-muted/10",
                  )}
                >
                  <div className="flex flex-col gap-4 p-3 sm:p-4 md:flex-row">
                    <label className="flex shrink-0 items-start pt-1">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input accent-primary"
                        checked={isLessonSelected(lesson.id)}
                        disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || isLocalLesson}
                        onChange={(event) => toggleLessonSelection(lesson.id, event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`选择课程 ${lesson.title || lesson.source_filename || lesson.id}`}
                      />
                    </label>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-stretch gap-4 text-left sm:flex-row"
                      onClick={() => {
                        if (!isLocalLesson) {
                          startLessonFromHistory(lesson.id);
                        }
                      }}
                      disabled={isLocalLesson}
                    >
                      <MediaCover
                        coverDataUrl={mediaMeta.coverDataUrl}
                        alt={getCoverAssistiveText(lesson)}
                        aspectRatio={mediaMeta.aspectRatio}
                        className="w-full shrink-0 sm:max-w-[11rem] md:w-44"
                      />

                      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-lg font-semibold">{lesson.title}</div>
                            {selected ? <Badge variant="outline">当前课程</Badge> : null}
                            {selected && currentLessonNeedsBinding ? <Badge variant="secondary">需绑定本地视频</Badge> : null}
                          </div>
                          <p className="line-clamp-2 text-sm text-muted-foreground">{lesson.source_filename || "未命名素材"}</p>
                          <div
                            className={cn(
                              "rounded-2xl border px-3 py-3",
                              progressState.isComplete
                                ? "border-emerald-200/80 bg-emerald-50/70"
                                : progressState.isActive
                                  ? "border-border/80 bg-background/90"
                                  : "border-border/70 bg-background/80",
                            )}
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  progressState.isComplete
                                    ? "text-emerald-700"
                                    : progressState.isActive
                                      ? "text-foreground"
                                      : "text-muted-foreground",
                                )}
                              >
                                {progressState.statusLabel}
                              </span>
                              <span
                                className={cn(
                                  "text-sm font-semibold tabular-nums",
                                  progressState.isComplete ? "text-emerald-700" : "text-foreground",
                                )}
                              >
                                {progressState.progressLabel}
                              </span>
                            </div>
                            {progressState.hasTrack ? (
                              <Progress
                                value={progressState.percent}
                                className={cn(
                                  "h-2.5 rounded-full",
                                  progressState.isComplete
                                    ? "bg-emerald-100/90 [&>[data-slot=progress-indicator]]:bg-emerald-500"
                                    : progressState.isActive
                                      ? "bg-muted/90 [&>[data-slot=progress-indicator]]:bg-primary"
                                      : "bg-muted/80 [&>[data-slot=progress-indicator]]:bg-primary/70",
                                )}
                              />
                            ) : (
                              <div className="rounded-full border border-dashed border-border/80 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                                {"\u53e5\u6570\u5f85\u540c\u6b65"}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span>{sentenceCount} 句</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-4" />
                            {createdAtLabel}
                          </span>
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 flex-row gap-2 md:w-40 md:flex-col">
                      <Button
                        type="button"
                        className="min-h-11 flex-1 md:w-full"
                        onClick={() => startLessonFromHistory(lesson.id)}
                        disabled={isLocalLesson}
                        data-guide-id={isGuideTarget ? "history-start-latest" : undefined}
                      >
                        <Play className="size-4" />
                        {actionLabel}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1 md:w-full"
                        onClick={() => void handleExportLesson(lesson)}
                        disabled={Boolean(exportingLessonId) || renameBusy || deleteBusy || Boolean(restoringLessonId)}
                      >
                        <Download className="size-4" />
                        {exportingLessonId === String(lesson.id) ? "导出中..." : "导出"}
                      </Button>
                      {!isLocalLesson ? (
                        <Popover
                          open={menuLessonId === lesson.id}
                          onOpenChange={(open) => {
                            setMenuLessonId(open ? lesson.id : null);
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              className="min-h-11 w-11 shrink-0 self-stretch md:w-auto md:self-end"
                              aria-label="open-lesson-menu"
                              disabled={renameBusy || deleteBusy || Boolean(restoringLessonId)}
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" sideOffset={8} className="w-[min(92vw,14rem)] p-2">
                            <div className="flex flex-col gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => {
                                  openRenameDialog(lesson);
                                  setMenuLessonId(null);
                                }}
                                disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || Boolean(actionLessonId)}
                              >
                                <Pencil className="size-4" />
                                修改标题
                              </Button>
                              {lesson.status === "partial_ready" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="w-full justify-start"
                                  onClick={() => void handleRecoverTranslation(lesson)}
                                  disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || Boolean(actionLessonId)}
                                >
                                  <RotateCcw className="size-4" />
                                  {actionLessonId === String(lesson.id) ? "补翻译中..." : "补翻译"}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => void handleSetLessonCompletion(lesson, !progressState.isComplete)}
                                disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || Boolean(actionLessonId)}
                              >
                                <CheckCircle2 className="size-4" />
                                {actionLessonId === String(lesson.id)
                                  ? "处理中..."
                                  : progressState.isComplete
                                    ? "标记未完成"
                                    : "标记学完"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start"
                                onClick={() => openRestorePicker(lesson)}
                                disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || Boolean(actionLessonId)}
                              >
                                <RotateCcw className="size-4" />
                                恢复本地视频
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start text-destructive hover:text-destructive"
                                onClick={() => {
                                  setDeletingLesson(lesson);
                                  setMenuLessonId(null);
                                }}
                                disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || Boolean(actionLessonId)}
                              >
                                <Trash2 className="size-4" />
                                删除
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {hasMore ? (
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={() => onLoadMore?.()} disabled={loadingMore}>
                  {loadingMore ? "正在加载更多..." : "加载更多课程"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <Dialog
          open={Boolean(renamingLesson)}
          onOpenChange={(open) => {
            if (!open && !renameBusy) {
              setRenamingLesson(null);
              setRenameTitle("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>修改课程标题</DialogTitle>
              <DialogDescription>保存后会立即显示在课程列表里。</DialogDescription>
            </DialogHeader>
            <Input
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              placeholder="输入新的课程标题"
              maxLength={255}
              disabled={renameBusy}
            />
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  if (renameBusy) return;
                  setRenamingLesson(null);
                  setRenameTitle("");
                }}
              >
                取消
              </Button>
              <Button onClick={() => void submitRename()} disabled={renameBusy}>
                {renameBusy ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(deletingLesson)}
          onOpenChange={(open) => {
            if (!open && !deleteBusy) {
              setDeletingLesson(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除这节课程？</AlertDialogTitle>
              <AlertDialogDescription>课程、学习进度和相关记录都会被删除，删除后不可恢复。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteBusy}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void submitDelete();
                }}
                disabled={deleteBusy}
              >
                {deleteBusy ? "删除中..." : "确认删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={bulkDeleteOpen}
          onOpenChange={(open) => {
            if (!open && !deleteBusy) {
              setBulkDeleteOpen(false);
            }
          }}
        >
          <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认删除选中的历史记录？</AlertDialogTitle>
                  <AlertDialogDescription>
                    {allHistorySelected
                      ? excludedLessonIds.length > 0
                        ? `将删除除已取消勾选的 ${excludedLessonIds.length} 项外，其余 ${selectedCount} 项历史记录；课程、学习进度和相关记录都会被删除，删除后不可恢复。`
                        : `将删除全部历史记录中的 ${selectedCount} 项，课程、学习进度和相关记录都会被删除，删除后不可恢复。`
                      : `将删除当前选中的 ${selectedCount} 项历史记录，课程、学习进度和相关记录都会被删除，删除后不可恢复。`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteBusy}>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void submitBulkDelete();
                }}
                disabled={deleteBusy || !hasSelection}
              >
                {deleteBusy ? "删除中..." : "确认批量删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {status ? (
          <Alert>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        ) : null}

        <input
          ref={restoreInputRef}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null;
            if (nextFile) {
              void submitRestore(nextFile);
            }
            event.target.value = "";
          }}
        />
      </CardContent>
    </Card>
  );
}
