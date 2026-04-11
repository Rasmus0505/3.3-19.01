/**
 * CourseCreatePage — Entry point for creating a new Unlock Anything course.
 *
 * Users can paste text, enter a URL, or upload a file.
 * The system analyzes the material and generates a multi-scene course.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";
import { Unlock, Sparkles, BookOpen, MessageSquare, HelpCircle, MousePointer, ArrowRight, Loader2 } from "lucide-react";
import { useAppStore } from "../../store";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const CEFR_DESCRIPTIONS = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Proficiency",
};

const SCENE_TYPE_ICONS = {
  dictation: BookOpen,
  quiz: HelpCircle,
  interactive: MousePointer,
  discussion: MessageSquare,
};

export function CourseCreatePage() {
  const navigate = useNavigate();
  const { createCourse } = useAppStore((s) => s);
  const [materialText, setMaterialText] = useState("");
  const [targetLevel, setTargetLevel] = useState("B1");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!materialText.trim()) return;
    setIsCreating(true);

    try {
      const course = await createCourse({
        title: materialText.slice(0, 60) + (materialText.length > 60 ? "..." : ""),
        source_type: "text",
        material_text: materialText,
        cefr_level_original: "B2",
        cefr_level_target: targetLevel,
      });

      navigate(`/course/${course.id}/generate`);
    } catch (err) {
      console.error("Course creation failed:", err);
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradient blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-200/40 dark:bg-purple-900/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-200/40 dark:bg-blue-900/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <Card className="w-full max-w-xl p-8 backdrop-blur-xl bg-white/80 dark:bg-gray-900/80 border-white/20 shadow-2xl">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-950 flex items-center justify-center mx-auto mb-4 ring-2 ring-purple-200 dark:ring-purple-800">
            <Unlock className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <h1 className="text-2xl font-bold mb-1">Unlock Anything</h1>
          <p className="text-muted-foreground text-sm">
            Transform any material into I+1 learning content
          </p>
        </div>

        {/* Material input */}
        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block">
            Paste your learning material
          </label>
          <textarea
            value={materialText}
            onChange={(e) => setMaterialText(e.target.value)}
            placeholder="Paste an English article, news, transcript, or any text you want to learn from..."
            className="w-full h-40 px-4 py-3 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* CEFR Level selector */}
        <div className="mb-8">
          <label className="text-sm font-medium mb-2 block">
            Your English Level (I+1 will target one level above)
          </label>
          <div className="flex gap-2">
            {CEFR_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setTargetLevel(level)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-sm font-medium transition-all border",
                  targetLevel === level
                    ? "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-700"
                    : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted",
                )}
              >
                {level}
                <span className="block text-[10px] mt-0.5 opacity-60">{CEFR_DESCRIPTIONS[level]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* What you'll get */}
        <div className="mb-8 p-4 rounded-lg bg-muted/30">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Your course will include
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(SCENE_TYPE_ICONS).map(([type, Icon]) => (
              <div key={type} className="flex items-center gap-2 text-sm">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <span className="capitalize">{type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Create button */}
        <Button
          onClick={handleCreate}
          disabled={!materialText.trim() || isCreating}
          className="w-full gap-2"
          size="lg"
        >
          {isCreating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating Course...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Unlock This Material
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>

        {/* I+1 principle badge */}
        <div className="mt-4 text-center">
          <Badge variant="outline" className="text-[10px]">
            Powered by Krashen's I+1 Comprehensible Input Principle
          </Badge>
        </div>
      </Card>
    </div>
  );
}
