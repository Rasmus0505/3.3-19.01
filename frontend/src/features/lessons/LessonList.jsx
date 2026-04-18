import { History } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, parseResponse, toErrorText } from "../../shared/api/client";
import { hasLessonMedia } from "../../shared/media/localMediaStore";
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "../../shared/ui";
import {
  areShortcutBindingsEqual,
  captureShortcutFromKeyboardEvent,
  getShortcutCompleteness,
  readLearningSettings,
  sanitizeLearningSettings,
  writeLearningSettings,
} from "../immersive/learningSettings";
import { LessonHistoryCard } from "./components/LessonHistoryCard";
import { LessonHistoryToolbar } from "./components/LessonHistoryToolbar";
import { LessonLearningSettingsSection } from "./components/LessonLearningSettingsSection";
import { LessonListDialogs } from "./components/LessonListDialogs";
import {
  LOCAL_LESSON_UPDATE_EVENT,
  buildBottleLessonFilename,
  buildLessonProgressState,
  buildLocalLessonRecord,
  buildRemoteLessonDetailPayload,
  buildRemoteLessonExportPayload,
  downloadJsonFile,
  ensureCefrAnalysis,
  formatCreatedAt,
  hasLocalDbBridge,
  hasProgressSnapshot,
  isDesktop,
  requestDesktopLocalHelper,
} from "./lessonListHelpers";
import "../immersive/immersive.css";

/** @typedef {import("./types").Lesson} Lesson */
/** @typedef {import("./types").LessonSentence} LessonSentence */

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
  const [restoreChoiceOpen, setRestoreChoiceOpen] = useState(false);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);
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

  function handleRecordingShortcutActionChange(actionId) {
    setSettingsError("");
    setRecordingShortcutActionId((current) => (current === actionId ? "" : actionId));
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
        return {
          lesson,
          mediaMeta,
          sentenceCount,
          progressState,
          actionLabel: isLocalLesson ? "本地导入" : hasProgressSnapshot(meta.progress) ? "继续学习" : "开始学习",
          isLocalLesson,
          createdAtLabel: formatCreatedAt(lesson.created_at),
          cefrLoading: Boolean(lessonCardMetaMap[lesson.id]?.cefrLoading),
          cefrDistribution: lessonCardMetaMap[lesson.id]?.cefrDistribution || null,
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
    const { complete, missingActions } = getShortcutCompleteness(learningSettings);
    if (!complete) {
      const names = missingActions.map((action) => action.label).join("、");
      setStatus(`快捷键未配置完整：${names}。请先在下方「学习参数」区域配置好所有快捷键，再开始学习。`);
      return;
    }
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
      const lastPlayedAtMs = completed ? Number(detail?.duration_ms || detail?.source_duration_ms || 0) : 0;
      const progressResp = await api(
        `/api/lessons/${lesson.id}/progress`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_sentence_index: completed ? Math.max(0, sentenceCount - 1) : 0,
            completed_sentence_indexes: completed ? completedSentenceIndexes : [],
            last_played_at_ms: lastPlayedAtMs,
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
          last_played_at_ms: lastPlayedAtMs,
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

  async function handleGenerateMissingContent(lesson, requestOptions = {}, successMessage = "补生成完成") {
    if (!lesson?.id) return;
    setActionLessonId(String(lesson.id));
    setMenuLessonId(null);
    setStatus("");
    try {
      const { accessToken } = await buildRemoteLessonDetailPayload(lesson.id);
      const generateResp = await api(
        `/api/lessons/${lesson.id}/generate-missing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestOptions),
        },
        accessToken,
      );
      const nextData = await parseResponse(generateResp);
      if (!generateResp.ok) {
        throw new Error(toErrorText(nextData, "补生成失败"));
      }
      setStatus(successMessage);
      await onRefreshHistory?.();
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "补生成失败");
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

  useEffect(() => {
    for (const card of cards) {
      if (!card.isLocalLesson && !card.cefrLoading && !card.cefrDistribution) {
        const sentences = card.lesson?.sentences?.map((sentence) => sentence.en || sentence.text_en) || [];
        if (sentences.length > 0) {
          void ensureCefrAnalysis(card.lesson.id, sentences);
        }
      }
    }
  }, [cards]);

  function openRenameDialog(lesson) {
    setRenamingLesson(lesson);
    setRenameTitle(String(lesson.title || ""));
    setStatus("");
  }

  function closeRenameDialog() {
    if (renameBusy) return;
    setRenamingLesson(null);
    setRenameTitle("");
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

  function closeDeleteDialog() {
    if (deleteBusy) return;
    setDeletingLesson(null);
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

  function handleBulkDeleteOpenChange(open) {
    if (!open && deleteBusy) return;
    setBulkDeleteOpen(open);
  }

  async function submitBulkDelete() {
    if (!onBulkDelete || !hasSelection) return;
    setDeleteBusy(true);
    try {
      const lessonIds = allHistorySelected
        ? loadedLessonIds.filter((id) => !excludedLessonIdSet.has(id))
        : selectedLessonIds;
      const result = await onBulkDelete({ deleteAll: false, lessonIds, excludedLessonIds: [] });
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

    if (lesson?.source_url) {
      setRestoreChoiceOpen(true);
    } else {
      restoreInputRef.current?.click();
    }
  }

  async function submitRestore(file) {
    const lesson = restoreTargetRef.current;
    if (!lesson || !file || !onRestoreMedia) return;
    setRestoringLessonId(lesson.id);
    setStatus("");
    try {
      const result = await onRestoreMedia(lesson, file);
      setStatus(result?.message || (result?.ok ? "恢复视频成功" : "恢复视频失败"));
    } finally {
      setRestoringLessonId(null);
      restoreTargetRef.current = null;
    }
  }

  async function handleLinkRestore() {
    const lesson = restoreTargetRef.current;
    if (!lesson?.source_url) return;

    setRestoreChoiceOpen(false);

    const hasLocal = await hasLessonMedia(lesson.id);
    if (hasLocal) {
      setOverwriteConfirmOpen(true);
    } else {
      await submitLinkRestore(lesson);
    }
  }

  async function submitLinkRestore(lesson) {
    if (!lesson?.source_url) return;

    setRestoringLessonId(lesson.id);
    setStatus("");
    try {
      const response = await requestDesktopLocalHelper("/api/desktop-asr/url-import/tasks", "json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: { source_url: lesson.source_url },
      });

      if (response?.ok) {
        setStatus("视频已更新");
        if (onRestoreMedia) {
          await onRestoreMedia(lesson, null);
        }
      } else {
        setStatus(response?.message || "按链接恢复失败");
      }
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "按链接恢复失败");
    } finally {
      setRestoringLessonId(null);
      restoreTargetRef.current = null;
    }
  }

  async function handleOverwriteConfirm() {
    const lesson = restoreTargetRef.current;
    setOverwriteConfirmOpen(false);
    if (lesson) {
      await submitLinkRestore(lesson);
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
        <LessonLearningSettingsSection
          learningSettings={learningSettings}
          settingsError={settingsError}
          recordingShortcutActionId={recordingShortcutActionId}
          onPlaybackPreferenceChange={handlePlaybackPreferenceChange}
          onRecordingShortcutActionChange={handleRecordingShortcutActionChange}
        />

        {Number(totalLessons || cards.length || 0) > 0 ? (
          <LessonHistoryToolbar
            allHistorySelected={allHistorySelected}
            selectedCount={selectedCount}
            excludedLessonCount={excludedLessonIds.length}
            hasSelection={hasSelection}
            deleteBusy={deleteBusy}
            bulkDeleteEnabled={Boolean(onBulkDelete)}
            onClearSelection={clearSelection}
            onSelectAllHistory={selectAllHistory}
            onOpenBulkDelete={() => setBulkDeleteOpen(true)}
          />
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
            {cards.map((card) => {
              const { lesson } = card;
              const selected = currentLessonId === lesson.id;
              const isGuideTarget =
                Number(guideTargetLessonId || 0) > 0 ? Number(guideTargetLessonId) === Number(lesson.id) : lesson.id === defaultGuideLessonId;
              return (
                <LessonHistoryCard
                  key={lesson.id}
                  card={card}
                  selected={selected}
                  currentLessonNeedsBinding={currentLessonNeedsBinding}
                  isGuideTarget={isGuideTarget}
                  menuOpen={menuLessonId === lesson.id}
                  exportingLessonId={exportingLessonId}
                  renameBusy={renameBusy}
                  deleteBusy={deleteBusy}
                  restoringLessonId={restoringLessonId}
                  actionLessonId={actionLessonId}
                  isSelected={isLessonSelected(lesson.id)}
                  onSelectionChange={toggleLessonSelection}
                  onStart={startLessonFromHistory}
                  onExport={(nextLesson) => void handleExportLesson(nextLesson)}
                  onMenuOpenChange={(open) => setMenuLessonId(open ? lesson.id : null)}
                  onRename={(nextLesson) => {
                    openRenameDialog(nextLesson);
                    setMenuLessonId(null);
                  }}
                  onGenerateMissingContent={(nextLesson, requestOptions, successMessage) =>
                    void handleGenerateMissingContent(nextLesson, requestOptions, successMessage)
                  }
                  onSetCompletion={(nextLesson, completed) => void handleSetLessonCompletion(nextLesson, completed)}
                  onRestoreMedia={(nextLesson) => openRestorePicker(nextLesson)}
                  onDelete={(nextLesson) => {
                    setDeletingLesson(nextLesson);
                    setMenuLessonId(null);
                  }}
                />
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

        <LessonListDialogs
          renamingLesson={renamingLesson}
          renameTitle={renameTitle}
          renameBusy={renameBusy}
          onRenameTitleChange={setRenameTitle}
          onCloseRename={closeRenameDialog}
          onSubmitRename={() => void submitRename()}
          deletingLesson={deletingLesson}
          deleteBusy={deleteBusy}
          onCloseDelete={closeDeleteDialog}
          onSubmitDelete={() => void submitDelete()}
          bulkDeleteOpen={bulkDeleteOpen}
          onBulkDeleteOpenChange={handleBulkDeleteOpenChange}
          allHistorySelected={allHistorySelected}
          excludedLessonCount={excludedLessonIds.length}
          selectedCount={selectedCount}
          hasSelection={hasSelection}
          onSubmitBulkDelete={() => void submitBulkDelete()}
          restoreChoiceOpen={restoreChoiceOpen}
          onRestoreChoiceOpenChange={setRestoreChoiceOpen}
          isDesktop={isDesktop}
          onPickRestoreFile={() => restoreInputRef.current?.click()}
          onLinkRestore={() => void handleLinkRestore()}
          overwriteConfirmOpen={overwriteConfirmOpen}
          onOverwriteConfirmOpenChange={setOverwriteConfirmOpen}
          onConfirmOverwrite={() => void handleOverwriteConfirm()}
          status={status}
          restoreInputRef={restoreInputRef}
          onRestoreInputChange={(file) => void submitRestore(file)}
        />
      </CardContent>
    </Card>
  );
}
