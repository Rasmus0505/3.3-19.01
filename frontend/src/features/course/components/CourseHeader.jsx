/**
 * CourseHeader — Top bar with course title, I+1 badge, progress, navigation.
 */
import { ArrowLeft, ArrowRight, Unlock, BadgeCheck } from "lucide-react";
import { Button, Badge, Progress } from "../../../shared/ui";

const CEFR_LABELS = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Proficiency",
};

export function CourseHeader({ course, activeSceneIdx, totalScenes, completedScenes = new Set(), onSceneChange }) {
  const progress = totalScenes > 0 ? Math.round((completedScenes.size / totalScenes) * 100) : 0;

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Course title + I+1 badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold truncate">{course.title}</h1>
            <Badge variant="secondary" className="shrink-0 gap-1 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
              <Unlock className="w-3 h-3" />
              I+1
            </Badge>
            <Badge variant="outline" className="shrink-0 text-xs">
              {course.cefr_level_original} → {course.cefr_level_target}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">
              {CEFR_LABELS[course.cefr_level_original] || course.cefr_level_original} → {CEFR_LABELS[course.cefr_level_target] || course.cefr_level_target}
            </span>
            <span className="text-xs text-muted-foreground">
              {totalScenes} scenes
            </span>
          </div>
        </div>

        {/* Progress */}
        <div className="w-32 shrink-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Scene navigation */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onSceneChange(Math.max(0, activeSceneIdx - 1))}
            disabled={activeSceneIdx <= 0}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {activeSceneIdx + 1} / {totalScenes}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onSceneChange(Math.min(totalScenes - 1, activeSceneIdx + 1))}
            disabled={activeSceneIdx >= totalScenes - 1}
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {/* AI model badges */}
        {course.models_used?.length > 0 && (
          <div className="flex gap-1 shrink-0">
            {course.models_used.slice(0, 4).map((model) => (
              <Badge key={model} variant="outline" className="text-[10px] px-1.5 py-0">
                {model}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
