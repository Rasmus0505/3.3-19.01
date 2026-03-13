import { Clock3, History, MoreVertical, Pencil, Play, RotateCcw, Sparkles, Trash2 } from "lucide-react";
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
  CardDescription,
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
  Progress,
  Skeleton,
  Switch,
} from "../../shared/ui";
import {
  areShortcutBindingsEqual,
  captureShortcutFromKeyboardEvent,
  getPresetSummaryLines,
  getShortcutLabel,
  readLearningSettings,
  REPLAY_PRESET_OPTIONS,
  sanitizeLearningSettings,
  SHORTCUT_ACTIONS,
  writeLearningSettings,
} from "../immersive/learningSettings";

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

function getCoverAssistiveText(lesson) {
  const title = String(lesson?.title || "").trim();
  return title ? `${title} 默认封面` : "课程默认封面";
}

function getSubtitleProgressValue(progress) {
  if (!progress) return 0;
  const done = Number(progress.done || 0);
  const total = Number(progress.total || 0);
  if (total > 0) {
    return Math.max(8, Math.min(100, Math.round((done / total) * 100)));
  }
  if (progress.stage === "prepare") return 18;
  if (progress.stage === "semantic_split") return 42;
  if (progress.stage === "fallback") return 84;
  if (progress.stage === "completed") return 100;
  return 12;
}

function getSubtitleBusyLabel(progress) {
  if (!progress) return "处理中...";
  if (progress.stage === "translate" && Number(progress.total || 0) > 0) {
    return `正在翻译 ${Number(progress.done || 0)}/${Number(progress.total || 0)}`;
  }
  if (progress.stage === "semantic_split") return "正在细分长句...";
  if (progress.stage === "fallback") return "正在切回稳定模式...";
  if (progress.stage === "completed") return "即将完成...";
  return "正在更新字幕...";
}

export function LessonList({
  lessons,
  currentLessonId,
  currentLessonNeedsBinding = false,
  lessonCardMetaMap = {},
  lessonMediaMetaMap = {},
  subtitleCacheMetaMap = {},
  onSelect,
  onStartLesson,
  onRename,
  onDelete,
  onRestoreMedia,
  onRegenerateSubtitles,
  onSwitchToUpload,
  subtitleRegenerateState = null,
  loading = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore = null,
}) {
  const [renamingLesson, setRenamingLesson] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deletingLesson, setDeletingLesson] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [menuLessonId, setMenuLessonId] = useState(null);
  const [restoringLessonId, setRestoringLessonId] = useState(null);
  const [subtitleLesson, setSubtitleLesson] = useState(null);
  const [subtitleMode, setSubtitleMode] = useState("plain");
  const [subtitleBusy, setSubtitleBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [learningSettings, setLearningSettings] = useState(() => readLearningSettings());
  const [settingsError, setSettingsError] = useState("");
  const [recordingShortcutActionId, setRecordingShortcutActionId] = useState("");
  const restoreInputRef = useRef(null);
  const restoreTargetRef = useRef(null);
  const activeSubtitleProgress =
    subtitleLesson && subtitleRegenerateState?.lessonId === subtitleLesson.id ? subtitleRegenerateState : null;

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
        const subtitleMeta = subtitleCacheMetaMap[lesson.id] || {};
        const sentenceCount = Number(meta.sentenceCount || lesson.sentences?.length || 0);
        const actionLabel = hasProgressSnapshot(meta.progress) ? "继续学习" : "开始学习";
        const needsBinding = lesson.media_storage === "client_indexeddb" && !mediaMeta.hasMedia;
        return {
          lesson,
          mediaMeta,
          subtitleMeta,
          sentenceCount,
          actionLabel,
          needsBinding,
          createdAtLabel: formatCreatedAt(lesson.created_at),
        };
      }),
    [lessonCardMetaMap, lessonMediaMetaMap, lessons, subtitleCacheMetaMap],
  );
  const presetSummaryLines = useMemo(() => getPresetSummaryLines(learningSettings), [learningSettings]);

  function startLessonFromHistory(lessonId, source) {
    console.debug("[DEBUG] history.lesson.start", { lessonId, source });
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
    if (subtitleLesson && !lessons.some((item) => item.id === subtitleLesson.id)) {
      setSubtitleLesson(null);
      setSubtitleMode("plain");
    }
  }, [deletingLesson, lessons, menuLessonId, renamingLesson, restoringLessonId, subtitleLesson]);

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

  function openSubtitleDialog(lesson, subtitleMeta) {
    setSubtitleLesson(lesson);
    setSubtitleMode(subtitleMeta?.currentSemanticSplitEnabled ? "semantic" : "plain");
    setStatus("");
  }

  async function submitRegenerate() {
    if (!subtitleLesson || !onRegenerateSubtitles) return;
    setSubtitleBusy(true);
    try {
      const result = await onRegenerateSubtitles(subtitleLesson, subtitleMode === "semantic");
      if (result?.ok) {
        setSubtitleLesson(null);
        setStatus(result?.message || "字幕已切换");
      } else {
        setStatus(result?.message || "重新生成字幕失败");
      }
    } finally {
      setSubtitleBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          历史记录
        </CardTitle>
        <CardDescription>点击课程卡片或右侧按钮，直接进入全屏学习并继续当前进度。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <section className="rounded-2xl border bg-muted/10 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">学习参数预设</p>
              <p className="text-sm text-muted-foreground">
                先在这里设好重播策略和快捷键，再从下方任意课程卡片直接进入全屏学习。
              </p>
            </div>
            <Badge variant="outline">浏览器全局默认</Badge>
          </div>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">学习预设</p>
              <div className="flex flex-wrap gap-2">
                {REPLAY_PRESET_OPTIONS.map((item) => {
                  const active = learningSettings.presetId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/40",
                      )}
                      onClick={() => {
                        setSettingsError("");
                        updateLearningSettings((current) => ({ ...current, presetId: item.id }));
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border bg-background/80 px-4 py-3 text-sm text-muted-foreground">
              {presetSummaryLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            <div className="rounded-2xl border bg-background/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">答完自动重播本句</p>
                  <p className="text-xs text-muted-foreground">
                    开启后，答完先显示本句翻译，再用 1x 自动重播一次，结束后自动进入下一句。
                  </p>
                </div>
                <Switch
                  checked={learningSettings.playbackPreferences?.autoReplayAnsweredSentence !== false}
                  onCheckedChange={(checked) => handlePlaybackPreferenceChange("autoReplayAnsweredSentence", checked)}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {learningSettings.playbackPreferences?.autoReplayAnsweredSentence !== false
                  ? "当前：已开启。若浏览器拦截自动重播，会直接进入下一句。"
                  : "当前：已关闭。答完后会沿用现在的直接过句逻辑。"}
              </p>
            </div>

            {learningSettings.presetId === "custom" ? (
              <div className="grid gap-3 xl:grid-cols-3">
                <div className="rounded-2xl border bg-background/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">倍速辅助</p>
                      <p className="text-xs text-muted-foreground">关闭后重播保持原速；开启后优先压低未掌握尾段。</p>
                    </div>
                    <Switch
                      checked={learningSettings.customConfig.speedEnabled}
                      onCheckedChange={(checked) => handleCustomConfigToggle("speedEnabled", checked)}
                    />
                  </div>
                  <div className={cn("mt-4 grid gap-3", !learningSettings.customConfig.speedEnabled && "opacity-60")}>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">每次额外降速</p>
                      <Input
                        type="number"
                        min="0.01"
                        max="0.5"
                        step="0.01"
                        disabled={!learningSettings.customConfig.speedEnabled}
                        value={learningSettings.customConfig.tailSpeedStep}
                        onChange={(event) => handleCustomConfigChange("tailSpeedStep", event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">最低倍速</p>
                      <Input
                        type="number"
                        min="0.4"
                        max="0.98"
                        step="0.01"
                        disabled={!learningSettings.customConfig.speedEnabled}
                        value={learningSettings.customConfig.minimumTailSpeed}
                        onChange={(event) => handleCustomConfigChange("minimumTailSpeed", event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border bg-background/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">字母揭示</p>
                      <p className="text-xs text-muted-foreground">关闭后不会再自动补字母；开启后只在设定阶段触发。</p>
                    </div>
                    <Switch
                      checked={learningSettings.customConfig.revealLetterEnabled}
                      onCheckedChange={(checked) => handleCustomConfigToggle("revealLetterEnabled", checked)}
                    />
                  </div>
                  <div className={cn("mt-4 space-y-2", !learningSettings.customConfig.revealLetterEnabled && "opacity-60")}>
                    <p className="text-sm font-medium">从第几次重播开始</p>
                    <Input
                      type="number"
                      min="0"
                      max="8"
                      step="1"
                      disabled={!learningSettings.customConfig.revealLetterEnabled}
                      value={learningSettings.customConfig.revealLetterAt}
                      onChange={(event) => handleCustomConfigChange("revealLetterAt", event.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border bg-background/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">单词揭示</p>
                      <p className="text-xs text-muted-foreground">关闭后不会再自动补完整单词；开启后可以单独调开始阶段和递增量。</p>
                    </div>
                    <Switch
                      checked={learningSettings.customConfig.revealWordEnabled}
                      onCheckedChange={(checked) => handleCustomConfigToggle("revealWordEnabled", checked)}
                    />
                  </div>
                  <div className={cn("mt-4 grid gap-3", !learningSettings.customConfig.revealWordEnabled && "opacity-60")}>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">从第几次重播开始</p>
                      <Input
                        type="number"
                        min="0"
                        max="8"
                        step="1"
                        disabled={!learningSettings.customConfig.revealWordEnabled}
                        value={learningSettings.customConfig.revealWordAt}
                        onChange={(event) => handleCustomConfigChange("revealWordAt", event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">之后每次额外揭示词数</p>
                      <Input
                        type="number"
                        min="0"
                        max="4"
                        step="1"
                        disabled={!learningSettings.customConfig.revealWordEnabled}
                        value={learningSettings.customConfig.extraRevealWordsPerReplay}
                        onChange={(event) => handleCustomConfigChange("extraRevealWordsPerReplay", event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">快捷键配置</p>
                <p className="text-sm text-muted-foreground">
                  点一下按钮后直接按键录入；支持更多安全组合，Esc 固定保留为退出沉浸学习。若与其他动作冲突，会直接覆盖并清空旧动作。
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {SHORTCUT_ACTIONS.map((action) => {
                  const recording = recordingShortcutActionId === action.id;
                  return (
                    <div key={action.id} className="rounded-2xl border bg-background/80 p-3">
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        当前：{getShortcutLabel(learningSettings.shortcuts[action.id])}
                      </p>
                      <Button
                        type="button"
                        variant={recording ? "default" : "outline"}
                        className="mt-3 w-full"
                        onClick={() => {
                          setSettingsError("");
                          setRecordingShortcutActionId((current) => (current === action.id ? "" : action.id));
                        }}
                      >
                        {recording ? "请直接按键…" : "点击录入"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {settingsError ? (
              <Alert variant="destructive">
                <AlertDescription>{settingsError}</AlertDescription>
              </Alert>
            ) : (
              <p className="text-xs text-muted-foreground">
                推荐默认：Shift+A 揭示字母，Shift+S 揭示单词，Shift+Q 上一句，Shift+W 下一句，Shift+R 重播，Space 暂停/继续播放。
              </p>
            )}
          </div>
        </section>

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
            {cards.map(({ lesson, mediaMeta, subtitleMeta, sentenceCount, actionLabel, needsBinding, createdAtLabel }) => {
              const selected = currentLessonId === lesson.id;
              const currentVariantLabel =
                subtitleMeta.currentSemanticSplitEnabled === true
                  ? "语义分句"
                  : subtitleMeta.currentSemanticSplitEnabled === false
                    ? "原始字幕"
                    : "服务器字幕";
              const subtitleVariantHint = subtitleMeta.canRegenerate
                ? `已缓存${subtitleMeta.hasPlainVariant && subtitleMeta.hasSemanticVariant ? "双模式字幕" : "当前模式字幕"}`
                : "仅新上传的课程支持";
              return (
                <div
                  key={lesson.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border bg-background transition-all",
                    selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:bg-muted/10",
                  )}
                >
                  <div className="flex flex-col gap-4 p-4 md:flex-row">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-stretch gap-4 text-left"
                      onClick={() => startLessonFromHistory(lesson.id, "card")}
                    >
                      <MediaCover
                        coverDataUrl={mediaMeta.coverDataUrl}
                        alt={getCoverAssistiveText(lesson)}
                        aspectRatio={mediaMeta.aspectRatio}
                        className="shrink-0 md:w-44"
                      />

                      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-lg font-semibold">{lesson.title}</div>
                            {selected ? <Badge variant="outline">当前课程</Badge> : null}
                            {needsBinding ? <Badge variant="secondary">待恢复视频</Badge> : null}
                            {selected && currentLessonNeedsBinding ? <Badge variant="secondary">需绑定本地视频</Badge> : null}
                            <Badge variant="outline">{currentVariantLabel}</Badge>
                          </div>
                          <p className="line-clamp-2 text-sm text-muted-foreground">{lesson.source_filename || "未命名素材"}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                          <span>{sentenceCount} 句</span>
                          <span>{subtitleVariantHint}</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-4" />
                            {createdAtLabel}
                          </span>
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 flex-col gap-2 md:w-40">
                      <Button
                        type="button"
                        className="w-full"
                        onClick={() => startLessonFromHistory(lesson.id, "button")}
                      >
                        <Play className="size-4" />
                        {actionLabel}
                      </Button>
                      <Popover
                        open={menuLessonId === lesson.id}
                        onOpenChange={(open) => {
                          console.debug("[DEBUG] history.lesson.menu.toggle", { lessonId: lesson.id, open });
                          setMenuLessonId(open ? lesson.id : null);
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="self-end"
                            aria-label="open-lesson-menu"
                            onClick={() => {
                              console.debug("[DEBUG] history.lesson.menu.click", { lessonId: lesson.id });
                            }}
                            disabled={renameBusy || deleteBusy || subtitleBusy || Boolean(restoringLessonId)}
                          >
                            <MoreVertical className="size-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" sideOffset={8} className="w-56 p-2">
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
                              onClick={() => {
                                openSubtitleDialog(lesson, subtitleMeta);
                                setMenuLessonId(null);
                              }}
                              disabled={renameBusy || deleteBusy || subtitleBusy || !subtitleMeta.canRegenerate}
                            >
                              <Sparkles className="size-4" />
                              {subtitleMeta.canRegenerate ? "切换字幕版本" : "切换字幕版本（仅新上传）"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={() => openRestorePicker(lesson)}
                              disabled={renameBusy || deleteBusy || subtitleBusy || Boolean(restoringLessonId)}
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
                              disabled={renameBusy || deleteBusy || subtitleBusy || Boolean(restoringLessonId)}
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

        <Dialog
          open={Boolean(subtitleLesson)}
          onOpenChange={(open) => {
            if (!open && !subtitleBusy) {
              setSubtitleLesson(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>切换字幕版本</DialogTitle>
              <DialogDescription>
                这里不会重新识别音频。切到“原始字幕”会回到 ASR 原句，切到“语义分句”会重新整理长句并更新中文字幕。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={subtitleMode === "plain" ? "default" : "outline"}
                  onClick={() => setSubtitleMode("plain")}
                  disabled={subtitleBusy}
                >
                  原始字幕
                </Button>
                <Button
                  type="button"
                  variant={subtitleMode === "semantic" ? "default" : "outline"}
                  onClick={() => setSubtitleMode("semantic")}
                  disabled={subtitleBusy}
                >
                  语义分句
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {subtitleMode === "semantic" ? "适合长句较多的课程，阅读会更轻松。" : "直接回到识别后的原始分句结果。"}
              </p>
              {subtitleBusy ? (
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{activeSubtitleProgress?.message || "正在更新字幕"}</span>
                    {Number(activeSubtitleProgress?.total || 0) > 0 ? (
                      <span className="text-muted-foreground">
                        {Number(activeSubtitleProgress?.done || 0)}/{Number(activeSubtitleProgress?.total || 0)}
                      </span>
                    ) : null}
                  </div>
                  <Progress value={getSubtitleProgressValue(activeSubtitleProgress)} className="mt-3 h-2" />
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                disabled={subtitleBusy}
                onClick={() => {
                  if (subtitleBusy) return;
                  setSubtitleLesson(null);
                }}
              >
                取消
              </Button>
              <Button onClick={() => void submitRegenerate()} disabled={subtitleBusy}>
                {subtitleBusy ? getSubtitleBusyLabel(activeSubtitleProgress) : "确认切换"}
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
