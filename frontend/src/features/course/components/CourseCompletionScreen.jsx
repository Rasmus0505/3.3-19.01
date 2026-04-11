/**
 * CourseCompletionScreen — Full-page celebration shown after all scenes are done.
 */
import { useNavigate } from "react-router-dom";
import { Card, Button, Badge } from "../../../shared/ui";
import { Trophy, RotateCcw, ArrowLeft, BookOpen } from "lucide-react";

export function CourseCompletionScreen({
  course,
  completedScenes,
  quizScores,
  totalScenes,
  onReview,
  onRestart,
}) {
  const navigate = useNavigate();

  // Aggregate quiz stats across all quiz scenes
  const quizEntries = Object.values(quizScores);
  const totalQuizCorrect = quizEntries.reduce((sum, s) => sum + (s.correct || 0), 0);
  const totalQuizQuestions = quizEntries.reduce((sum, s) => sum + (s.total || 0), 0);
  const quizPercent =
    totalQuizQuestions > 0 ? Math.round((totalQuizCorrect / totalQuizQuestions) * 100) : null;

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-8 gap-6">
      {/* Trophy */}
      <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
        <Trophy className="w-10 h-10 text-amber-500" />
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-1">课程完成！</h2>
        <p className="text-muted-foreground">{course.title}</p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant="outline" className="text-xs">
            {course.cefr_level_original} → {course.cefr_level_target}
          </Badge>
        </div>
      </div>

      {/* Stats card */}
      <Card className="w-full max-w-sm p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              完成场景
            </span>
            <span className="text-sm font-semibold">
              {completedScenes.size} / {totalScenes}
            </span>
          </div>

          {totalQuizQuestions > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">测验总得分</span>
              <span className="text-sm font-semibold">
                {totalQuizCorrect}/{totalQuizQuestions}
                <span className="text-muted-foreground ml-1">({quizPercent}%)</span>
              </span>
            </div>
          )}

          {totalQuizQuestions > 0 && (
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={
                  "h-1.5 rounded-full transition-all " +
                  (quizPercent >= 80
                    ? "bg-emerald-500"
                    : quizPercent >= 50
                    ? "bg-amber-500"
                    : "bg-red-500")
                }
                style={{ width: `${quizPercent}%` }}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onReview} className="gap-2">
          <BookOpen className="w-4 h-4" />
          回顾场景
        </Button>
        <Button onClick={() => navigate("/course")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          返回课程列表
        </Button>
      </div>

      <button
        onClick={onRestart}
        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
      >
        重置进度，重新学习
      </button>
    </div>
  );
}
