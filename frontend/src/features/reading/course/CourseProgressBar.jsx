/**
 * CourseProgressBar — Horizontal step indicator for 4 course scenes.
 */
import { cn } from "../../../lib/utils";
import { Check, BookOpen, MessageSquare, Puzzle, HelpCircle, Trophy } from "lucide-react";

const STEPS = [
  { num: 1, label: "阅读", icon: BookOpen },
  { num: 2, label: "讨论", icon: MessageSquare },
  { num: 3, label: "词汇", icon: Puzzle },
  { num: 4, label: "测验", icon: HelpCircle },
];

export function CourseProgressBar({ activeScene, progress, onGoToScene }) {
  return (
    <div className="flex items-center gap-1 p-3 border-b bg-background/95 backdrop-blur">
      {STEPS.map((step, idx) => {
        const isCompleted = progress[`scene${step.num}_completed`];
        const isActive = activeScene === step.num;
        const isSummary = activeScene === 5;
        const Icon = isCompleted ? Check : step.icon;

        return (
          <div key={step.num} className="flex items-center">
            {idx > 0 && (
              <div className={cn(
                "w-6 h-px mx-1",
                isCompleted || (progress[`scene${idx}_completed`]) ? "bg-emerald-400" : "bg-border",
              )} />
            )}
            <button
              onClick={() => onGoToScene(step.num)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                isActive && !isSummary && "bg-primary/10 text-primary ring-1 ring-primary/20",
                isCompleted && !isActive && "text-emerald-600 dark:text-emerald-400",
                !isCompleted && !isActive && "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center",
                isCompleted ? "bg-emerald-100 dark:bg-emerald-900" : isActive ? "bg-primary/10" : "bg-muted",
              )}>
                <Icon className={cn(
                  "w-3 h-3",
                  isCompleted ? "text-emerald-600 dark:text-emerald-400" : isActive ? "text-primary" : "text-muted-foreground",
                )} />
              </div>
              {step.label}
            </button>
          </div>
        );
      })}

      {/* Summary indicator */}
      {activeScene === 5 && (
        <>
          <div className="w-6 h-px mx-1 bg-emerald-400" />
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200/50">
            <Trophy className="w-3.5 h-3.5" />
            完成
          </div>
        </>
      )}
    </div>
  );
}
