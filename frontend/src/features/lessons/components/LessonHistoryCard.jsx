import { CheckCircle2, Clock3, Download, MoreVertical, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";

import { cn } from "../../../lib/utils";
import { Badge, Button, MediaCover, Popover, PopoverContent, PopoverTrigger, Progress } from "../../../shared/ui";
import { getCoverAssistiveText } from "../lessonListHelpers";

export function LessonHistoryCard({
  card,
  selected,
  currentLessonNeedsBinding,
  isGuideTarget,
  menuOpen,
  exportingLessonId,
  renameBusy,
  deleteBusy,
  restoringLessonId,
  actionLessonId,
  isSelected,
  onSelectionChange,
  onStart,
  onExport,
  onMenuOpenChange,
  onRename,
  onGenerateMissingContent,
  onSetCompletion,
  onRestoreMedia,
  onDelete,
}) {
  const {
    lesson,
    mediaMeta,
    sentenceCount,
    progressState,
    actionLabel,
    isLocalLesson,
    createdAtLabel,
    difficultyLoading,
    difficultyDistribution,
  } = card;
  const contentStatus = lesson?.generated_content_status || {};
  const canRecoverTranslation = contentStatus.zh_translation && contentStatus.zh_translation !== "generated";
  const canRecoverVocabulary = contentStatus.vocabulary_annotation && contentStatus.vocabulary_annotation !== "generated";
  const canRecoverExplanation = contentStatus.word_explanation && contentStatus.word_explanation !== "generated";

  return (
    <div
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
            checked={isSelected}
            disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || isLocalLesson}
            onChange={(event) => onSelectionChange(lesson.id, event.target.checked)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`选择课程 ${lesson.title || lesson.source_filename || lesson.id}`}
          />
        </label>
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-col items-stretch gap-4 text-left sm:flex-row"
          onClick={() => {
            if (!isLocalLesson) {
              onStart(lesson.id);
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
                    句数待同步
                  </div>
                )}
              </div>
            </div>

            {difficultyLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 animate-pulse rounded-full bg-muted" />
                <span className="text-xs text-muted-foreground">分析中...</span>
              </div>
            ) : difficultyDistribution ? (
              <div className="flex items-center gap-2">
                <div className="difficulty-distribution-bar flex-1">
                  {difficultyDistribution.masteredPercent > 0 ? (
                    <div
                      className="difficulty-distribution-segment difficulty-distribution-segment--mastered"
                      style={{ width: `${difficultyDistribution.masteredPercent}%` }}
                    />
                  ) : null}
                  {difficultyDistribution.iPlusOnePercent > 0 ? (
                    <div
                      className="difficulty-distribution-segment difficulty-distribution-segment--i-plus-one"
                      style={{ width: `${difficultyDistribution.iPlusOnePercent}%` }}
                    />
                  ) : null}
                  {difficultyDistribution.aboveIPlusOnePercent > 0 ? (
                    <div
                      className="difficulty-distribution-segment difficulty-distribution-segment--above-i-plus-one"
                      style={{ width: `${difficultyDistribution.aboveIPlusOnePercent}%` }}
                    />
                  ) : null}
                </div>
                <span
                  className={`history-card-difficulty-badge ${
                    difficultyDistribution.iPlusOnePercent >= difficultyDistribution.aboveIPlusOnePercent
                      ? "history-card-difficulty-badge--i-plus-one"
                      : "history-card-difficulty-badge--above-i-plus-one"
                  }`}
                >
                  {difficultyDistribution.dominantLabel}: {Math.max(difficultyDistribution.iPlusOnePercent, difficultyDistribution.aboveIPlusOnePercent)}%
                </span>
              </div>
            ) : null}

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
            onClick={() => onStart(lesson.id)}
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
            onClick={() => onExport(lesson)}
            disabled={Boolean(exportingLessonId) || renameBusy || deleteBusy || Boolean(restoringLessonId)}
          >
            <Download className="size-4" />
            {exportingLessonId === String(lesson.id) ? "导出中..." : "导出"}
          </Button>
          {!isLocalLesson ? (
            <Popover open={menuOpen} onOpenChange={onMenuOpenChange}>
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
                    onClick={() => onRename(lesson)}
                    disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || Boolean(actionLessonId)}
                  >
                    <Pencil className="size-4" />
                    修改标题
                  </Button>
                  {canRecoverTranslation ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => onGenerateMissingContent(lesson, { zh_translation: true }, "已补充翻译，进入课程即可使用")}
                      disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || Boolean(actionLessonId)}
                    >
                      <RotateCcw className="size-4" />
                      {actionLessonId === String(lesson.id) ? "补翻译中..." : "补翻译"}
                    </Button>
                  ) : null}
                  {canRecoverVocabulary ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => onGenerateMissingContent(lesson, { vocabulary_annotation: true }, "已补充生词标注")}
                      disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || Boolean(actionLessonId)}
                    >
                      <RotateCcw className="size-4" />
                      {actionLessonId === String(lesson.id) ? "补标注中..." : "补生词标注"}
                    </Button>
                  ) : null}
                  {canRecoverExplanation ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => onGenerateMissingContent(lesson, { word_explanation: true }, "已补充生词讲解")}
                      disabled={renameBusy || deleteBusy || Boolean(restoringLessonId) || Boolean(actionLessonId)}
                    >
                      <RotateCcw className="size-4" />
                      {actionLessonId === String(lesson.id) ? "补讲解中..." : "补生词讲解"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => onSetCompletion(lesson, !progressState.isComplete)}
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
                    onClick={() => onRestoreMedia(lesson)}
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
                    onClick={() => onDelete(lesson)}
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
}



