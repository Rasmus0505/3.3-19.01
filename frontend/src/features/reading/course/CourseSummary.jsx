/**
 * CourseSummary — Completion screen shown after all 4 scenes.
 */
import { Button, Card, Badge } from "../../../shared/ui";
import { Trophy, BookOpen, MessageSquare, Puzzle, HelpCircle, Pencil, ArrowLeft, RotateCcw } from "lucide-react";

export function CourseSummary({ courseData, pack, onGoToScene, onExit, onReset }) {
  const progress = courseData?.progress || {};
  const discussion = courseData?.discussion;
  const completedCount = [
    progress.scene1_completed,
    progress.scene2_completed,
    progress.scene3_completed,
    progress.scene4_completed,
    progress.scene5_completed,
  ].filter(Boolean).length;

  const scenes = [
    { num: 1, label: "阅读", icon: BookOpen, done: progress.scene1_completed },
    { num: 2, label: "讨论", icon: MessageSquare, done: progress.scene2_completed },
    { num: 3, label: "词汇", icon: Puzzle, done: progress.scene3_completed },
    { num: 4, label: "测验", icon: HelpCircle, done: progress.scene4_completed },
    { num: 5, label: "写作", icon: Pencil, done: progress.scene5_completed },
  ];

  return (
    <div className="flex flex-col items-center justify-center flex-1 p-8 gap-6">
      {/* Trophy with bounce animation */}
      <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-950 flex items-center justify-center course-trophy-enter">
        <Trophy className="w-10 h-10 text-amber-500" />
      </div>

      <div className="text-center course-stat-enter" style={{ animationDelay: "0.3s", opacity: 0 }}>
        <h2 className="text-2xl font-bold mb-1">课程完成！</h2>
        <p className="text-muted-foreground text-sm">You've completed all learning activities.</p>
      </div>

      {/* Stats */}
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">完成场景</span>
          <span className="text-sm font-semibold">{completedCount} / 5</span>
        </div>

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
                  <Badge variant="secondary" className="text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 text-xs">
                    完成
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">未完成</Badge>
                )}
              </button>
            );
          })}
        </div>

        {discussion?.summary && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1">讨论摘要</p>
            <p className="text-sm">{discussion.summary}</p>
          </div>
        )}
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onExit} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          返回阅读包
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


