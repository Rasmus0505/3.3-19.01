/**
 * CourseListPage — Glassmorphism-styled course library page.
 *
 * Shows all the user's generated courses with AI model badges,
 * CEFR level transitions, and status indicators.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
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

const SCENE_TYPE_COLORS = {
  dictation: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  quiz: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  interactive: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  discussion: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const SCENE_TYPE_ICONS = {
  dictation: "🎧",
  quiz: "📝",
  interactive: "🎮",
  discussion: "💬",
};

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
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

function CEFRTransition({ from, to }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{from}</span>
      <span className="text-muted-foreground/50">→</span>
      <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
        {to}
      </span>
    </span>
  );
}

function CourseCard({ course, onClick }) {
  const sceneTypes = [...new Set((course.scenes || []).map((s) => s.scene_type))];

  return (
    <div
      className={cn(
        "glass-card rounded-2xl p-5 cursor-pointer group",
        "hover:-translate-y-0.5 hover:shadow-2xl transition-all duration-200",
        course.status === "ready" && "hover:glow-purple",
      )}
      onClick={onClick}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shrink-0">
            <Unlock className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm leading-tight line-clamp-1 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
              {course.title}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <CEFRTransition from={course.cefr_level_original} to={course.cefr_level_target} />
            </div>
          </div>
        </div>
        <StatusIcon status={course.status} />
      </div>

      {/* Scene type pills */}
      {sceneTypes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {sceneTypes.map((type) => (
            <span
              key={type}
              className={cn("px-2 py-0.5 rounded-full text-xs font-medium", SCENE_TYPE_COLORS[type])}
            >
              {SCENE_TYPE_ICONS[type]} {type}
            </span>
          ))}
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
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
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
        <span className="text-xs text-muted-foreground">
          {course.created_at ? new Date(course.created_at).toLocaleDateString("zh-CN") : "—"}
        </span>
        {course.status === "ready" && (
          <span className="text-xs text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1">
            <Zap className="w-3 h-3" /> Open
          </span>
        )}
      </div>
    </div>
  );
}

export function CourseListPage() {
  const navigate = useNavigate();
  const { courses, courseLoading, fetchCourses } = useAppStore();

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return (
    <div className="relative min-h-full overflow-hidden">
      {/* Background gradient blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -right-20 w-[500px] h-[500px] rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 70%)" }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold brand-gradient-text">My Courses</h1>
            <p className="text-muted-foreground text-sm mt-1">
              AI-generated I+1 learning courses from your materials
            </p>
          </div>
          <Button
            onClick={() => navigate("/course/create")}
            className="gap-2"
            style={{ background: "linear-gradient(135deg, #7c3aed, #3b82f6)" }}
          >
            <Plus className="w-4 h-4" />
            New Course
          </Button>
        </div>

        {/* Loading */}
        {courseLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-violet-500 mr-2" />
            <span className="text-muted-foreground text-sm">Loading courses…</span>
          </div>
        )}

        {/* Empty state */}
        {!courseLoading && courses.length === 0 && (
          <div className="glass-card rounded-3xl p-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center mx-auto mb-5">
              <BookOpen className="w-10 h-10 text-violet-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No courses yet</h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Paste any English text and let AI transform it into an interactive I+1 learning course.
            </p>
            <Button
              onClick={() => navigate("/course/create")}
              size="lg"
              className="gap-2"
              style={{ background: "linear-gradient(135deg, #7c3aed, #3b82f6)" }}
            >
              <Unlock className="w-5 h-5" />
              Create Your First Course
            </Button>
          </div>
        )}

        {/* Course grid */}
        {!courseLoading && courses.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
    </div>
  );
}
