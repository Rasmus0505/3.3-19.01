import { Compass } from "lucide-react";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "../../shared/ui";

export function LessonList({ lessons, currentLessonId, onSelect, loading = false }) {
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
        {loading ? (
          <>
            <Skeleton className="h-15 w-full" />
            <Skeleton className="h-15 w-full" />
          </>
        ) : null}

        {!loading && lessons.length === 0 ? <p className="text-sm text-muted-foreground">暂无课程，请先上传素材。</p> : null}

        {!loading
          ? lessons.map((lesson) => (
              <Button
                key={lesson.id}
                variant={currentLessonId === lesson.id ? "secondary" : "outline"}
                className="h-auto w-full items-start justify-start py-3 text-left"
                onClick={() => onSelect(lesson.id)}
              >
                <div>
                  <div className="font-medium">{lesson.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {lesson.status} · {lesson.asr_model} · {lesson.sentences?.length || 0} 句
                  </div>
                </div>
              </Button>
            ))
          : null}
      </CardContent>
    </Card>
  );
}
