import { Compass, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from "../../shared/ui";

const STATUS_LABEL_MAP = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
  failed: "处理失败",
};

function toLessonStatusLabel(status) {
  const key = String(status || "").trim().toLowerCase();
  return STATUS_LABEL_MAP[key] || "处理中";
}

export function LessonList({ lessons, currentLessonId, onSelect, onRename, onDelete, loading = false }) {
  const [renamingLesson, setRenamingLesson] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deletingLesson, setDeletingLesson] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [menuOpenLessonId, setMenuOpenLessonId] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (renamingLesson && !lessons.some((item) => item.id === renamingLesson.id)) {
      setRenamingLesson(null);
      setRenameTitle("");
    }
    if (deletingLesson && !lessons.some((item) => item.id === deletingLesson.id)) {
      setDeletingLesson(null);
    }
    if (menuOpenLessonId && !lessons.some((item) => item.id === menuOpenLessonId)) {
      setMenuOpenLessonId(null);
    }
  }, [deletingLesson, lessons, menuOpenLessonId, renamingLesson]);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="size-4" />
          课程历史
        </CardTitle>
        <CardDescription>选择课程进入沉浸学习，可直接重命名；删除在更多操作中。</CardDescription>
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
                <button type="button" className="w-full text-left" onClick={() => onSelect(lesson.id)}>
                  <div className="font-medium">{lesson.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {toLessonStatusLabel(lesson.status)} · {lesson.asr_model || "未设置模型"} · {lesson.sentences?.length || 0} 句
                  </div>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openRenameDialog(lesson)}
                    disabled={renameBusy || deleteBusy}
                  >
                    <Pencil className="size-4" />
                    重命名
                  </Button>
                  <Popover
                    open={menuOpenLessonId === lesson.id}
                    onOpenChange={(open) => {
                      setMenuOpenLessonId(open ? lesson.id : null);
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        aria-label="更多操作"
                        disabled={renameBusy || deleteBusy}
                      >
                        <Ellipsis className="size-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-40 p-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="w-full justify-start"
                        onClick={() => {
                          setMenuOpenLessonId(null);
                          setDeletingLesson(lesson);
                        }}
                        disabled={renameBusy || deleteBusy}
                      >
                        <Trash2 className="size-4" />
                        删除历史记录
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
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
                删除后无法恢复，相关学习进度将一并清除。
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
      </CardContent>
    </Card>
  );
}
