/**
 * PostLessonSummary — Completion screen shown after all 3 post-lesson scenes.
 */
import { Button, Card, Badge } from "../../../shared/ui";
import { Trophy, Puzzle, HelpCircle, Mic, ArrowLeft } from "lucide-react";

export function PostLessonSummary({ postLessonData, lesson, onGoToScene, onExit, onReset }) {
  const progress = postLessonData?.progress || {};
  const vocabResults = postLessonData?.vocabResults;
  const quizResults = postLessonData?.quizResults;
  const shadowingResults = postLessonData?.shadowingResults;

  const completedCount = [
    progress.scene1_completed,
    progress.scene2_completed,
    progress.scene3_completed,
  ].filter(Boolean).length;

  const scenes = [
    { num: 1, label: "词汇回顾", icon: Puzzle, done: progress.scene1_completed },
    { num: 2, label: "听力测验", icon: HelpCircle, done: progress.scene2_completed },
    { num: 3, label: "跟读练习", icon: Mic, done: progress.scene3_completed },
  ];

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-8 gap-6">
      {/* Trophy */}
      <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
        <Trophy className="w-10 h-10 text-amber-500" />
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold mb-1">课后学习完成！</h2>
        <p className="text-muted-foreground text-sm">你已完成所有学习活动</p>
      </div>

      {/* Stats */}
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">完成场景</span>
          <span className="text-sm font-semibold">{completedCount} / 3</span>
        </div>

        {/* Scene list */}
        <div className="space-y-2">
          {scenes.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.num}
                onClick={() => onGoToScene(s.num)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm flex-1">{s.label}</span>
                {s.done ? (
                  <Badge
                    variant="secondary"
                    className="text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 text-xs"
                  >
                    完成
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">未完成</Badge>
                )}
              </button>
            );
          })}
        </div>

        {/* Detailed stats */}
        <div className="pt-3 border-t space-y-3">
          {vocabResults && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">词汇掌握</span>
              <span className="font-medium">
                {vocabResults.knownCount} / {vocabResults.totalCount} 个
              </span>
            </div>
          )}

          {quizResults && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">测验得分</span>
              <span className="font-medium">
                {quizResults.correct} / {quizResults.total} ({quizResults.percent}%)
              </span>
            </div>
          )}

          {shadowingResults && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">跟读平均分</span>
              <span className="font-medium">{shadowingResults.averageScore} 分</span>
            </div>
          )}
        </div>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onExit} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          返回课程
        </Button>
      </div>

      <button
        onClick={onReset}
        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
      >
        重置进度，重新学习
      </button>
    </div>
  );
}


