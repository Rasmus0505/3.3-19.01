import { Compass } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../shared/ui";

export function LessonList({ lessons, currentLessonId, onSelect }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="size-4" />
          Explorer
        </CardTitle>
        <CardDescription>选择课程进入逐句拼写练习。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {lessons.length === 0 ? <p className="text-sm text-muted-foreground">暂无课程，请先上传素材。</p> : null}
        {lessons.map((lesson) => (
          <button
            key={lesson.id}
            className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${
              currentLessonId === lesson.id
                ? "border-primary bg-primary/10"
                : "border-input bg-background hover:bg-muted"
            }`}
            onClick={() => onSelect(lesson.id)}
            type="button"
          >
            <div className="font-medium">{lesson.title}</div>
            <div className="text-xs text-muted-foreground">
              {lesson.status} · {lesson.asr_model} · {lesson.sentences?.length || 0} 句
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
