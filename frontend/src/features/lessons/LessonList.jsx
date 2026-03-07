import { Compass, MoreVertical, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Clock3, Film, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  Skeleton,
} from "../../shared/ui";

export function LessonList({
  lessons,
  currentLessonId,
  onSelect,
  onRename,
  onDelete,
  onRestoreMedia,
  loading = false,
}) {
  const [renamingLesson, setRenamingLesson] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deletingLesson, setDeletingLesson] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [menuLessonId, setMenuLessonId] = useState(null);
  const [restoringLessonId, setRestoringLessonId] = useState(null);
  const [status, setStatus] = useState("");
  const restoreInputRef = useRef(null);
  const restoreTargetRef = useRef(null);

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

  return (
    <Card className="apple-panel">
      <CardHeader className="space-y-3.5">
        <div className="apple-kicker w-fit">
          <Sparkles className="size-3.5" />
          Library
        </div>
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Compass className="size-4" />
            课程库
          </CardTitle>
          <CardDescription>从历史课程中继续学习，列表更像内容库，操作菜单保持原有逻辑。</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-white/72 bg-white/74 px-3 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            共 {lessons.length} 节
          </span>
          <span className="rounded-full border border-white/72 bg-white/74 px-3 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            {lessons.filter((item) => Number(item.sentences?.length || 0) > 0).length} 节可学
          </span>
          <span className="rounded-full border border-white/72 bg-white/74 px-3 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            当前 {lessons.find((item) => item.id === currentLessonId)?.title || "未选择"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-24 w-full rounded-[1.5rem]" />
            <Skeleton className="h-24 w-full rounded-[1.5rem]" />
          </>
        ) : null}

        {!loading && lessons.length === 0 ? (
          <div className="rounded-[1.5rem] border border-white/70 bg-white/70 px-4 py-5 text-sm leading-6 text-slate-500">
            暂无课程，请先在右侧导入素材并生成第一节课。
          </div>
        ) : null}

        {!loading
          ? lessons.map((lesson, index) => (
              <div
                key={lesson.id}
                className={`rounded-[1.6rem] border p-4 transition-all duration-200 ${
                  currentLessonId === lesson.id
                    ? "border-white/82 bg-white/92 shadow-[0_20px_56px_-42px_rgba(37,99,235,0.22)] ring-1 ring-primary/12"
                    : "border-white/70 bg-white/68 hover:bg-white/80"
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(lesson.id)}>
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          currentLessonId === lesson.id
                            ? "border-slate-950/5 bg-slate-950 text-white"
                            : "border-white/75 bg-white/82 text-slate-600"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="min-h-[2.75rem] break-words text-[15px] font-semibold leading-6 text-slate-950">{lesson.title}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/72 bg-white/75 px-2.5 py-1">
                            <Film className="size-3.5" />
                            {lesson.asr_model || "默认模型"}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/72 bg-white/75 px-2.5 py-1">
                            <Clock3 className="size-3.5" />
                            {lesson.sentences?.length || 0} 句
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/72 bg-white/75 px-2.5 py-1">
                            {lesson.status || "ready"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="mt-0.5 shrink-0 text-slate-500 hover:bg-white/80"
                    aria-label="open-lesson-menu"
                    onClick={() => setMenuLessonId((prev) => (prev === lesson.id ? null : lesson.id))}
                    disabled={renameBusy || deleteBusy || Boolean(restoringLessonId)}
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </div>
                {menuLessonId === lesson.id ? (
                    <div className="mt-3 rounded-[1.15rem] border border-white/70 bg-white/76 p-1.5">
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                        size="sm"
                        variant="ghost"
                        className="justify-start"
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
                        className="justify-start"
                        onClick={() => openRestorePicker(lesson)}
                        disabled={renameBusy || deleteBusy || Boolean(restoringLessonId)}
                      >
                        <RotateCcw className="size-4" />
                        恢复视频
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="justify-start text-destructive hover:text-destructive"
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
                  </div>
                ) : null}
              </div>
            ))
          : null}

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
              <AlertDialogDescription>
                课程与学习进度会被彻底删除，不可恢复。
              </AlertDialogDescription>
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
          <Alert className="border-white/75 bg-white/76">
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
