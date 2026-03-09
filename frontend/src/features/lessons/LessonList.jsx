import { Clock3, History, ImageIcon, MoreVertical, Pencil, Play, RotateCcw, Sparkles, Trash2 } from "lucide-react";
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
  Progress,
  Skeleton,
} from "../../shared/ui";

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
  if (progress.stage === "semantic_split") return "正在语义分句...";
  if (progress.stage === "fallback") return "正在切回普通请求...";
  if (progress.stage === "completed") return "即将完成...";
  return "正在重切分句...";
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
  const restoreInputRef = useRef(null);
  const restoreTargetRef = useRef(null);
  const activeSubtitleProgress =
    subtitleLesson && subtitleRegenerateState?.lessonId === subtitleLesson.id ? subtitleRegenerateState : null;

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
        <CardDescription>继续学习已有课程，或管理历史记录中的标题、视频与删除操作。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : null}

        {!loading && cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/15 px-6 py-10 text-center">
            <p className="text-base font-medium">还没有历史记录</p>
            <p className="mt-2 text-sm text-muted-foreground">先去上传素材，生成第一节课程后再回来继续学习。</p>
            {onSwitchToUpload ? (
              <Button className="mt-4" onClick={onSwitchToUpload}>
                去上传素材
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
                : "仅改造后新上传课程支持";
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
                      onClick={() => onSelect?.(lesson.id)}
                    >
                      <div className="flex h-28 w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-2xl font-semibold text-white md:w-44">
                        {mediaMeta.coverDataUrl ? (
                          <img src={mediaMeta.coverDataUrl} alt={`${lesson.title} 封面`} className="h-full w-full object-cover" />
                        ) : (
                          <>
                            <ImageIcon className="size-9 text-white/90" aria-hidden="true" />
                            <span className="sr-only">{getCoverAssistiveText(lesson)}</span>
                          </>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-lg font-semibold">{lesson.title}</div>
                            {selected ? <Badge variant="outline">当前课程</Badge> : null}
                            {needsBinding ? <Badge variant="secondary">待恢复视频</Badge> : null}
                            {selected && currentLessonNeedsBinding ? <Badge variant="secondary">播放受限</Badge> : null}
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
                        onClick={() => {
                          console.debug("[DEBUG] history.lesson.start", { lessonId: lesson.id });
                          void onStartLesson?.(lesson.id);
                        }}
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
                              重命名
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
                              {subtitleMeta.canRegenerate ? "重新生成字幕" : "重新生成字幕（仅新上传）"}
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
                              恢复视频
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
              <DialogTitle>重命名历史记录</DialogTitle>
              <DialogDescription>修改后将立即生效并同步到课程列表。</DialogDescription>
            </DialogHeader>
            <Input
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              placeholder="请输入课程标题"
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
              <DialogTitle>重新生成字幕</DialogTitle>
              <DialogDescription>
                仅重新加载字幕，不会重新跑 ASR。切到原始字幕会回到 ASR 原句，切到语义分句会按新的英文分句重翻中文字幕。
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
                {subtitleMode === "semantic" ? "适合长句重新细分，阅读更轻松。" : "直接回到 ASR 原始分句结果。"}
              </p>
              {subtitleBusy ? (
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{activeSubtitleProgress?.message || "正在处理字幕"}</span>
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
              <AlertDialogTitle>确认删除历史记录？</AlertDialogTitle>
              <AlertDialogDescription>课程与学习进度会被彻底删除，不可恢复。</AlertDialogDescription>
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
