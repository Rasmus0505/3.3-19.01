import { Compass, MoreVertical, Pencil, RotateCcw, Trash2 } from "lucide-react";
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="size-4" />
          Explorer
        </CardTitle>
        <CardDescription>选择课程进入沉浸学习，可通过右上角菜单管理历史记录。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : null}

        {!loading && lessons.length === 0 ? <p className="text-sm text-muted-foreground">暂无课程，请先上传素材。</p> : null}

        {!loading
          ? lessons.map((lesson) => (
              <div
                key={lesson.id}
                className={`rounded-md border p-3 ${
                  currentLessonId === lesson.id
                    ? "border-primary bg-primary/10"
                    : "border-input bg-background hover:bg-muted/30"
                }`}
              >
                <div className="mb-1 flex items-start justify-between gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(lesson.id)}>
                    <div className="truncate font-medium">{lesson.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {lesson.status} · {lesson.asr_model} · {lesson.sentences?.length || 0} 句
                    </div>
                  </button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="open-lesson-menu"
                    onClick={() => setMenuLessonId((prev) => (prev === lesson.id ? null : lesson.id))}
                    disabled={renameBusy || deleteBusy || Boolean(restoringLessonId)}
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </div>
                {menuLessonId === lesson.id ? (
                  <div className="mt-2 rounded-md border bg-muted/30 p-1">
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
