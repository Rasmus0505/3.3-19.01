/**
 * GenerationPreview — Course generation progress page with step visualizers.
 */
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Button, Badge, Progress } from "../../../shared/ui";
import { cn } from "../../../lib/utils";
import { Loader2, Check, Unlock, Sparkles } from "lucide-react";
import { api, parseResponse, toErrorText } from "../../../shared/api/client";
import { readSSEStream } from "../utils/readSSEStream";
import { SCENE_TYPE_ICONS } from "../constants";
import { useAppStore } from "../../../store";

const STEP_LABELS = [
  { key: "outlining", label: "Analyzing Material", icon: Sparkles },
  { key: "outlined", label: "Course Outline Ready", icon: Check },
  { key: "generating", label: "Generating Content", icon: Loader2 },
  { key: "completed", label: "Course Ready!", icon: Unlock },
];

export function GenerationPreview({ onComplete }) {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const accessToken = useAppStore((s) => s.accessToken);
  const markAuthExpired = useAppStore((s) => s.markAuthExpired);
  const [stage, setStage] = useState("outlining");
  const [percent, setPercent] = useState(0);
  const [sceneProgress, setSceneProgress] = useState([]);
  const [error, setError] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (!courseId || startedRef.current) return;
    startedRef.current = true;
    startGeneration();
  }, [courseId]);

  const startGeneration = async () => {
    if (!courseId) {
      setError("Missing course id");
      return;
    }
    if (!accessToken) {
      setError("请先登录");
      return;
    }
    try {
      const res = await api(`/api/courses/${courseId}/generate/stream`, {
        method: "POST",
      }, accessToken);
      if (!res.ok && !res.body) {
        const data = await parseResponse(res);
        const message = toErrorText(data, "Generation failed");
        if (res.status === 401 || res.status === 403) {
          markAuthExpired(message);
        }
        setError(message);
        return;
      }

      if (!res.body) {
        const fallbackRes = await api(`/api/courses/${courseId}/generate`, { method: "POST" }, accessToken);
        const data = await parseResponse(fallbackRes);
        if (!fallbackRes.ok) {
          const message = toErrorText(data, "Generation failed");
          if (fallbackRes.status === 401 || fallbackRes.status === 403) {
            markAuthExpired(message);
          }
          setError(message);
          return;
        }
        if (data.status === "ready") {
          setStage("completed");
          setPercent(100);
        }
        return;
      }

      await readSSEStream(res, handleEvent);
    } catch (err) {
      setError(err?.message || "Generation failed");
    }
  };

  const handleEvent = (event, data) => {
    switch (event) {
      case "progress":
        setStage(data.stage || "generating");
        setPercent(data.percent || 0);
        if (data.scene_type) {
          setSceneProgress((prev) => {
            const existing = prev.findIndex((s) => s.idx === data.scene_idx);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = { ...updated[existing], ...data, status: "generating" };
              return updated;
            }
            return [...prev, { idx: data.scene_idx, type: data.scene_type, title: data.scene_title, status: "generating" }];
          });
        }
        break;
      case "completed":
        setStage("completed");
        setPercent(100);
        break;
      case "error":
        setError(data.message || "Generation failed");
        break;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg p-8">
        {/* Unlock Animation */}
        <div className="text-center mb-8">
          <div className={cn(
            "w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all duration-500",
            stage === "completed"
              ? "bg-emerald-50 dark:bg-emerald-950 scale-110"
              : "bg-purple-50 dark:bg-purple-950",
          )}>
            {stage === "completed" ? (
              <Unlock className="w-8 h-8 text-emerald-500" />
            ) : (
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
            )}
          </div>
          <h2 className="text-xl font-semibold mb-1">
            {stage === "completed" ? "Course Unlocked!" : "Generating Course..."}
          </h2>
          <p className="text-sm text-muted-foreground">
            {stage === "completed"
              ? "Your I+1 learning material is ready"
              : "Applying I+1 comprehensible input principle"}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-muted-foreground mb-2">
            <span>Progress</span>
            <span>{percent}%</span>
          </div>
          <Progress value={percent} className="h-2" />
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-6">
          {STEP_LABELS.map((step, idx) => {
            const isActive = STEP_LABELS.findIndex((s) => s.key === stage) >= idx;
            const isCurrent = step.key === stage;
            const isDone = STEP_LABELS.findIndex((s) => s.key === stage) > idx;
            const Icon = isDone ? Check : step.icon;

            return (
              <div
                key={step.key}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-all",
                  isCurrent && "bg-primary/5 ring-1 ring-primary/20",
                  isDone && "opacity-60",
                )}
              >
                <Icon className={cn(
                  "w-5 h-5 shrink-0",
                  isDone && "text-emerald-500",
                  isCurrent && "text-primary animate-pulse",
                  !isActive && "text-muted-foreground",
                )} />
                <span className={cn(
                  "text-sm",
                  isCurrent && "font-medium",
                  !isActive && "text-muted-foreground",
                )}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Scene progress */}
        {sceneProgress.length > 0 && (
          <div className="mb-6">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Scenes
            </h4>
            <div className="space-y-1">
              {sceneProgress.map((scene) => {
                const SceneIcon = SCENE_TYPE_ICONS[scene.type] || BookOpen;
                return (
                  <div key={scene.idx} className="flex items-center gap-2 px-2 py-1.5 rounded text-sm">
                    <SceneIcon className="w-4 h-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{scene.title || `Scene ${scene.idx + 1}`}</span>
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Action buttons */}
        {stage === "completed" && (
          <Button
            onClick={() => {
              onComplete?.();
              navigate(`/course/${courseId}`);
            }}
            className="w-full gap-2"
            size="lg"
          >
            <Unlock className="w-4 h-4" />
            Start Learning
          </Button>
        )}
      </Card>
    </div>
  );
}
