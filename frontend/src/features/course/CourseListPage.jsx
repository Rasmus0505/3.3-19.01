/**
 * CourseListPage — Course library panel (rendered inside shell).
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store";
import { Button, Card, CardContent } from "../../shared/ui";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Unlock,
  XCircle,
  Zap,
} from "lucide-react";
import { ModelBadges } from "./components/ModelBadges";
import { cn } from "../../lib/utils";
import { SCENE_TYPE_COLORS, SCENE_TYPE_EMOJI } from "./constants";

const STATUS_META = {
  ready: { icon: CheckCircle2, color: "text-emerald-500", label: "Ready" },
  generating: { icon: Loader2, color: "text-blue-500 animate-spin", label: "Generating…" },
  outlining: { icon: Loader2, color: "text-amber-500 animate-spin", label: "Outlining…" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
  draft: { icon: Clock, color: "text-muted-foreground", label: "Draft" },
};

function StatusIcon({ status }) {
  const meta = STATUS_META[status] || STATUS_META.draft;
  const Icon = meta.icon;
  return (
    <span className={cn("flex items-center gap-1 text-xs", meta.color)}>
      <Icon className="size-3.5" />
      {meta.label}
    </span>
  );
}

function CEFRTransition({ from, to }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{from}</span>
      <span className="text-muted-foreground/50">→</span>
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{to}</span>
    </span>
  );
}

function CourseCard({ course, onClick }) {
  const sceneTypes = [...new Set((course.scenes || []).map((s) => s.scene_type))];

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-sm"
      onClick={onClick}
    >
      <CardContent className="p-5">
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-primary/10">
              <Unlock className="size-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="line-clamp-1 text-sm font-semibold leading-tight">
                {course.title}
              </h3>
              <div className="mt-0.5 flex items-center gap-2">
                <CEFRTransition from={course.cefr_level_original} to={course.cefr_level_target} />
              </div>
            </div>
          </div>
          <StatusIcon status={course.status} />
        </div>

        {/* Scene type pills */}
        {sceneTypes.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {sceneTypes.map((type) => (
              <span
                key={type}
                className={cn("rounded-full px-2 py-0.5 text-xs font-medium", SCENE_TYPE_COLORS[type])}
              >
                {SCENE_TYPE_EMOJI[type]} {type}
              </span>
            ))}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {course.scene_count} scenes
            </span>
          </div>
        )}

        {/* Model badges */}
        {course.models_used?.length > 0 && (
          <div className="mt-2">
            <ModelBadges models={course.models_used} maxVisible={4} />
          </div>
        )}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            {course.created_at ? new Date(course.created_at).toLocaleDateString("zh-CN") : "—"}
          </span>
          {course.status === "ready" && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary">
              <Zap className="size-3" /> Open
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CourseListPage() {
  const navigate = useNavigate();
  const { courses, courseLoading, fetchCourses } = useAppStore();

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">My Courses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-generated I+1 learning courses from your materials
          </p>
        </div>
        <Button onClick={() => navigate("/course/create")} className="gap-2">
          <Plus className="size-4" />
          New Course
        </Button>
      </div>

      {/* Loading */}
      {courseLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Loading courses…</span>
        </div>
      )}

      {/* Empty state */}
      {!courseLoading && courses.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-muted/15 px-6 py-10 text-center">
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border bg-primary/10">
            <BookOpen className="size-8 text-primary" />
          </div>
          <h2 className="text-base font-medium">No courses yet</h2>
          <p className="mx-auto mb-6 mt-2 max-w-md text-sm text-muted-foreground">
            Paste any English text and let AI transform it into an interactive I+1 learning course.
          </p>
          <Button onClick={() => navigate("/course/create")} size="lg" className="gap-2">
            <Unlock className="size-5" />
            Create Your First Course
          </Button>
        </div>
      )}

      {/* Course grid */}
      {!courseLoading && courses.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onClick={() => {
                if (course.status === "ready") {
                  navigate(`/course/${course.id}`);
                } else if (course.status === "draft") {
                  navigate(`/course/${course.id}/generate`);
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
