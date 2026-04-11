/**
 * CourseCreatePage — Create a new course (rendered inside shell).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Badge } from "../../shared/ui";
import { cn } from "../../lib/utils";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "../../store";
import { CEFR_LEVELS, CEFR_DESCRIPTIONS, SCENE_TYPE_ICONS } from "./constants";

export function CourseCreatePage() {
  const navigate = useNavigate();
  const { createCourse } = useAppStore((s) => s);
  const [materialText, setMaterialText] = useState("");
  const [targetLevel, setTargetLevel] = useState("B1");
  const [originalLevel, setOriginalLevel] = useState("B2");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!materialText.trim()) return;
    setIsCreating(true);

    try {
      const course = await createCourse({
        title: materialText.slice(0, 60) + (materialText.length > 60 ? "..." : ""),
        source_type: "text",
        material_text: materialText,
        cefr_level_original: originalLevel,
        cefr_level_target: targetLevel,
      });

      navigate(`/course/${course.id}/generate`);
    } catch (err) {
      toast.error("Course creation failed: " + (err?.message || "Unknown error"));
      setIsCreating(false);
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          Unlock Anything
        </CardTitle>
        <CardDescription>Transform any material into I+1 learning content</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Material input */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Paste your learning material
          </label>
          <textarea
            value={materialText}
            onChange={(e) => setMaterialText(e.target.value)}
            placeholder="Paste an English article, news, transcript, or any text you want to learn from..."
            className="h-40 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        {/* Material difficulty level */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Material Difficulty (estimated CEFR level)
          </label>
          <div className="flex gap-2">
            {CEFR_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setOriginalLevel(level)}
                className={cn(
                  "flex-1 rounded-lg border py-2 text-sm font-medium transition-all",
                  originalLevel === level
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Target CEFR Level selector */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Your English Level (I+1 will target one level above)
          </label>
          <div className="flex gap-2">
            {CEFR_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => setTargetLevel(level)}
                className={cn(
                  "flex-1 rounded-lg border py-2 text-sm font-medium transition-all",
                  targetLevel === level
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
              >
                {level}
                <span className="mt-0.5 block text-[10px] opacity-60">{CEFR_DESCRIPTIONS[level]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* What you'll get */}
        <div className="rounded-lg bg-muted/30 p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Your course will include
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(SCENE_TYPE_ICONS).map(([type, Icon]) => (
              <div key={type} className="flex items-center gap-2 text-sm">
                <Icon className="size-4 text-muted-foreground" />
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
              <Loader2 className="size-4 animate-spin" />
              Creating Course...
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Unlock This Material
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>

        {/* I+1 principle badge */}
        <div className="text-center">
          <Badge variant="outline" className="text-xs">
            Powered by Krashen's I+1 Comprehensible Input Principle
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
