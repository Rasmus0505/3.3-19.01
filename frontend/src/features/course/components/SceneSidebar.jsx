/**
 * SceneSidebar — Left sidebar with scene navigation thumbnails.
 */
import { cn } from "../../../lib/utils";
import { BookOpen, HelpCircle, MessageSquare, MousePointer, Check, CheckCircle2, Loader2 } from "lucide-react";

const SCENE_ICONS = {
  dictation: BookOpen,
  quiz: HelpCircle,
  interactive: MousePointer,
  discussion: MessageSquare,
};

const SCENE_COLORS = {
  dictation: "text-blue-500",
  quiz: "text-amber-500",
  interactive: "text-emerald-500",
  discussion: "text-purple-500",
};

const SCENE_BG = {
  dictation: "bg-blue-50 dark:bg-blue-950",
  quiz: "bg-amber-50 dark:bg-amber-950",
  interactive: "bg-emerald-50 dark:bg-emerald-950",
  discussion: "bg-purple-50 dark:bg-purple-950",
};

export function SceneSidebar({ scenes, activeIdx, onSelect, completedScenes = new Set() }) {
  return (
    <div className="w-48 border-r bg-muted/30 flex flex-col shrink-0">
      <div className="p-3 border-b">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Scenes
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {scenes.map((scene, idx) => {
          const Icon = SCENE_ICONS[scene.scene_type] || BookOpen;
          const isActive = idx === activeIdx;
          const isLearned = completedScenes.has(idx);
          const isReady = scene.status === "ready";
          const isPending = scene.status === "pending";
          const isGenerating = scene.status === "generating";

          return (
            <button
              key={scene.id}
              onClick={() => onSelect(idx)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all text-sm",
                "hover:bg-muted/60",
                isActive && "bg-muted ring-1 ring-primary/20",
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-md flex items-center justify-center shrink-0",
                SCENE_BG[scene.scene_type] || "bg-muted",
                isActive && "ring-1 ring-primary/30",
              )}>
                <Icon className={cn("w-4 h-4", SCENE_COLORS[scene.scene_type])} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-xs">
                  {scene.title || `Scene ${idx + 1}`}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  {isLearned && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                  {!isLearned && isReady && <Check className="w-3 h-3 text-green-500" />}
                  {!isLearned && isGenerating && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
                  {!isLearned && isPending && <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />}
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {scene.scene_type}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
