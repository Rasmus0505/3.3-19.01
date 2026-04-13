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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "../../../shared/ui";

export function LessonListDialogs({
  renamingLesson,
  renameTitle,
  renameBusy,
  onRenameTitleChange,
  onCloseRename,
  onSubmitRename,
  deletingLesson,
  deleteBusy,
  onCloseDelete,
  onSubmitDelete,
  bulkDeleteOpen,
  onBulkDeleteOpenChange,
  allHistorySelected,
  excludedLessonCount,
  selectedCount,
  hasSelection,
  onSubmitBulkDelete,
  restoreChoiceOpen,
  onRestoreChoiceOpenChange,
  isDesktop,
  onPickRestoreFile,
  onLinkRestore,
  overwriteConfirmOpen,
  onOverwriteConfirmOpenChange,
  onConfirmOverwrite,
  status,
  restoreInputRef,
  onRestoreInputChange,
}) {
  return (
    <>
      <Dialog open={Boolean(renamingLesson)} onOpenChange={(open) => (!open && !renameBusy ? onCloseRename() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改课程标题</DialogTitle>
            <DialogDescription>保存后会立即显示在课程列表里。</DialogDescription>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(event) => onRenameTitleChange(event.target.value)}
            placeholder="输入新的课程标题"
            maxLength={255}
            disabled={renameBusy}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={onCloseRename}>
              取消
            </Button>
            <Button onClick={onSubmitRename} disabled={renameBusy}>
              {renameBusy ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deletingLesson)} onOpenChange={(open) => (!open && !deleteBusy ? onCloseDelete() : null)}>
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
                void onSubmitDelete();
              }}
              disabled={deleteBusy}
            >
              {deleteBusy ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={onBulkDeleteOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除选中的历史记录？</AlertDialogTitle>
            <AlertDialogDescription>
              {allHistorySelected
                ? excludedLessonCount > 0
                  ? `将删除除已取消勾选的 ${excludedLessonCount} 项外，其余 ${selectedCount} 项历史记录；课程、学习进度和相关记录都会被删除，删除后不可恢复。`
                  : `将删除全部历史记录中的 ${selectedCount} 项，课程、学习进度和相关记录都会被删除，删除后不可恢复。`
                : `将删除当前选中的 ${selectedCount} 项历史记录，课程、学习进度和相关记录都会被删除，删除后不可恢复。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void onSubmitBulkDelete();
              }}
              disabled={deleteBusy || !hasSelection}
            >
              {deleteBusy ? "删除中..." : "确认批量删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreChoiceOpen} onOpenChange={onRestoreChoiceOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>选择恢复方式</AlertDialogTitle>
            <AlertDialogDescription>该视频来自网络链接，请选择恢复方式。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel onClick={onPickRestoreFile}>恢复本地视频</AlertDialogCancel>
            {isDesktop ? <AlertDialogAction onClick={onLinkRestore}>按链接恢复</AlertDialogAction> : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={overwriteConfirmOpen} onOpenChange={onOverwriteConfirmOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本地已有视频</AlertDialogTitle>
            <AlertDialogDescription>本地已有该视频，是否覆盖？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => onOverwriteConfirmOpenChange(false)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmOverwrite}>覆盖</AlertDialogAction>
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
            onRestoreInputChange(nextFile);
          }
          event.target.value = "";
        }}
      />
    </>
  );
}
