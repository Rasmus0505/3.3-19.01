import { Clock3, History, MoreVertical, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
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

function getCompletedSentenceCount(progress) {
  if (!progress || !Array.isArray(progress.completed_sentence_indexes)) return 0;
  return progress.completed_sentence_indexes.length;
}

function buildLessonProgressState(progress, sentenceCount) {
  const normalizedTotal = Number(sentenceCount || 0);
  const totalCount = Number.isFinite(normalizedTotal) && normalizedTotal > 0 ? Math.max(0, Math.trunc(normalizedTotal)) : 0;
  const rawCompletedCount = Math.max(0, getCompletedSentenceCount(progress));
  const completedCount = totalCount > 0 ? Math.min(totalCount, rawCompletedCount) : rawCompletedCount;
  const ratio = totalCount > 0 ? completedCount / totalCount : 0;
  const clampedPercent = Math.max(0, Math.min(100, ratio * 100));

  return {
    completedCount,
    totalCount,
    percent: clampedPercent,
    progressLabel: totalCount > 0 ? `${completedCount}\u53e5/${totalCount}\u53e5` : "\u53e5\u6570\u5f85\u540c\u6b65",
    statusLabel:
      totalCount <= 0
        ? "\u5b66\u4e60\u8fdb\u5ea6"
        : completedCount >= totalCount
          ? "\u5df2\u5b8c\u6210"
          : completedCount > 0
            ? "\u5b66\u4e60\u8fdb\u5ea6"
            : "\u5c1a\u672a\u5f00\u59cb",
    isComplete: totalCount > 0 && completedCount >= totalCount,
    isActive: totalCount > 0 && completedCount > 0 && completedCount < totalCount,
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
  onSwitchToUpload,
  loading = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore = null,
}) {
  const [renamingLesson, setRenamingLesson] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deletingLesson, setDeletingLesson] = useState(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [menuLessonId, setMenuLessonId] = useState(null);
  const [restoringLessonId, setRestoringLessonId] = useState(null);
  const [status, setStatus] = useState("");
  const [selectionMode, setSelectionMode] = useState("none");
  const [selectedLessonIds, setSelectedLessonIds] = useState([]);
  const [excludedLessonIds, setExcludedLessonIds] = useState([]);
  const [learningSettings, setLearningSettings] = useState(() => readLearningSettings());
  const [settingsError, setSettingsError] = useState("");
  const [recordingShortcutActionId, setRecordingShortcutActionId] = useState("");
  const restoreInputRef = useRef(null);
  const restoreTargetRef = useRef(null);
  const loadedLessonIds = useMemo(() => lessons.map((lesson) => Number(lesson.id || 0)).filter((item) => item > 0), [lessons]);
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
      lessons.map((lesson) => {
        const meta = lessonCardMetaMap[lesson.id] || {};
        const mediaMeta = lessonMediaMetaMap[lesson.id] || {};
        const sentenceCount = Number(meta.sentenceCount || lesson.sentences?.length || 0);
        const progressState = buildLessonProgressState(meta.progress, sentenceCount);
        const actionLabel = hasProgressSnapshot(meta.progress) ? "继续学习" : "开始学习";
        const needsBinding = lesson.media_storage === "client_indexeddb" && !mediaMeta.hasMedia;
        return {
          lesson,
          mediaMeta,
          sentenceCount,
          progressState,
          actionLabel,
          needsBinding,
          createdAtLabel: formatCreatedAt(lesson.created_at),
        };
      }),
    [lessonCardMetaMap, lessonMediaMetaMap, lessons],
  );
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

  useEffect(() => {
    writeLearningSettings(learningSettings);
  }, [learningSettings]);

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
    if (renamingLesson && !lessons.some((item) => item.id === renamingLesson.id)) {
      setRenamingLesson(null);
      setRenameTitle("");
    }
    if (deletingLesson && !lessons.some((item) => item.id === deletingLesson.id)) {
      setDeletingLesson(null);
    }
    if (menuLessonId && !lessons.some((item) => item.id === menuLessonId)) {
      setMenuLessonId(null);
    }
    if (restoringLessonId && !lessons.some((item) => item.id === restoringLessonId)) {
      setRestoringLessonId(null);
      restoreTargetRef.current = null;
    }
  }, [deletingLesson, lessons, menuLessonId, renamingLesson, restoringLessonId]);

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
          ? { deleteAll: true, lessonIds: [] }
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
                    {allHistorySelected ? `已选全部历史 ${selectedCount} 项` : `已选 ${selectedCount} 项`}
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
            {cards.map(({ lesson, mediaMeta, sentenceCount, progressState, actionLabel, needsBinding, createdAtLabel }) => {
              const selected = currentLessonId === lesson.id;
              const isGuideTarget = Number(guideTargetLessonId || 0) > 0 ? Number(guideTargetLessonId) === Number(lesson.id) : lesson.id === cards[0]?.lesson.id;
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
                        disabled={renameBusy || deleteBusy || Boolean(restoringLessonId)}
                        onChange={(event) => toggleLessonSelection(lesson.id, event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`选择课程 ${lesson.title || lesson.source_filename || lesson.id}`}
                      />
                    </label>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col items-stretch gap-4 text-left sm:flex-row"
                      onClick={() => startLessonFromHistory(lesson.id)}
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
                            {needsBinding ? <Badge variant="secondary">待恢复视频</Badge> : null}
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
                        data-guide-id={isGuideTarget ? "history-start-latest" : undefined}
                      >
                        <Play className="size-4" />
                        {actionLabel}
                      </Button>
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
                              disabled={renameBusy || deleteBusy || Boolean(restoringLessonId)}
                            >
                              <Pencil className="size-4" />
                              修改标题
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={() => openRestorePicker(lesson)}
                              disabled={renameBusy || deleteBusy || Boolean(restoringLessonId)}
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
                              disabled={renameBusy || deleteBusy || Boolean(restoringLessonId)}
                            >
                              <Trash2 className="size-4" />
                              删除
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
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
                  ? `将删除全部历史记录中的 ${selectedCount} 项，课程、学习进度和相关记录都会被删除，删除后不可恢复。`
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
