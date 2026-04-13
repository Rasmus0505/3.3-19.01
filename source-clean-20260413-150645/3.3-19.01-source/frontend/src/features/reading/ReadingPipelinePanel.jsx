/**
 * ReadingPipelinePanel — OpenMAIC-style minimal generation progress screen.
 * Full-screen centered, progress dots + animated stage icon + stage name.
 */
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  FileText,
  GraduationCap,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "../../shared/ui";
import { cn } from "../../lib/utils";

// Icon per stage key
const STAGE_ICONS = {
  parsing:               FileText,
  difficulty_judgment:   BrainCircuit,
  simplification_planning: Wand2,
  text_rewriting:        BookOpen,
  reading_course_generation: GraduationCap,
};

function StageIcon({ stageKey, className }) {
  const Icon = STAGE_ICONS[stageKey] || Wand2;
  return <Icon className={className} />;
}

// Pulsing ring around the central icon while running
function PulsingRing({ color = "oklch(from var(--primary) l c h / 0.15)" }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-full"
      style={{ background: color }}
      animate={{ scale: [1, 1.18, 1], opacity: [0.7, 0, 0.7] }}
      transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
    />
  );
}

export function ReadingPipelinePanel({
  pipelineState,
  isGenerating = false,
  onContinue,
}) {
  const stages = Array.isArray(pipelineState?.stages) ? pipelineState.stages : [];
  const currentStage = pipelineState?.currentStage || null;
  const errorStage = pipelineState?.error?.stage || null;
  const hasError = Boolean(pipelineState?.error);

  const activeStage =
    stages.find((s) => s.key === currentStage) ||
    stages.find((s) => s.key === errorStage) ||
    stages.find((s) => s.key === pipelineState?.lastCompletedStage) ||
    stages[0] ||
    null;

  const activeIndex = activeStage ? stages.findIndex((s) => s.key === activeStage.key) : 0;
  const isComplete = !hasError && !currentStage && stages.length > 0 &&
    stages.every((s) => s.status === "completed");

  return (
    <div className="rpp-shell">
      {/* Background ambient blobs */}
      <div className="rpp-bg" aria-hidden="true">
        <div className="rpp-bg__blob rpp-bg__blob--1" />
        <div className="rpp-bg__blob rpp-bg__blob--2" />
      </div>

      <div className="rpp-card">
        {/* Progress dots */}
        {stages.length > 0 && (
          <div className="rpp-dots">
            {stages.map((stage, idx) => {
              const past = idx < activeIndex;
              const active = idx === activeIndex && !isComplete && !hasError;
              return (
                <div
                  key={stage.key}
                  className={cn(
                    "rpp-dot",
                    active  && "rpp-dot--active",
                    past    && "rpp-dot--past",
                    hasError && idx === activeIndex && "rpp-dot--error",
                    isComplete && "rpp-dot--done",
                  )}
                />
              );
            })}
          </div>
        )}

        {/* Central visualizer */}
        <div className="rpp-visual">
          <AnimatePresence mode="wait">
            {hasError ? (
              <motion.div
                key="error"
                className="rpp-visual__circle rpp-visual__circle--error"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <AlertCircle className="size-12 text-red-500" />
              </motion.div>
            ) : isComplete ? (
              <motion.div
                key="done"
                className="rpp-visual__circle rpp-visual__circle--done"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <CheckCircle2 className="size-12 text-green-500" />
              </motion.div>
            ) : (
              <motion.div
                key={activeStage?.key || "init"}
                className="rpp-visual__circle rpp-visual__circle--active"
                initial={{ scale: 0.85, opacity: 0, filter: "blur(8px)" }}
                animate={{ scale: 1,    opacity: 1, filter: "blur(0px)" }}
                exit={{  scale: 1.1,  opacity: 0, filter: "blur(8px)" }}
                transition={{ duration: 0.35 }}
              >
                <PulsingRing />
                <StageIcon stageKey={activeStage?.key} className="size-12 text-primary relative z-10" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stage name + sub-text */}
        <div className="rpp-text">
          <AnimatePresence mode="wait">
            <motion.div
              key={hasError ? "err-text" : isComplete ? "done-text" : activeStage?.key || "init-text"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rpp-text__inner"
            >
              <h2 className="rpp-text__title">
                {hasError
                  ? "生成中断"
                  : isComplete
                    ? "课堂已就绪"
                    : (activeStage?.label || "准备中")}
              </h2>
              {hasError && (
                <p className="rpp-text__sub rpp-text__sub--error">
                  {pipelineState?.error?.message || "请重试"}
                </p>
              )}
              {!hasError && !isComplete && (
                <p className="rpp-text__sub">
                  {activeStage?.detail || "正在处理…"}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* "AI Working" footer indicator */}
        {!hasError && !isComplete && (
          <motion.div
            className="rpp-working"
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            <Sparkles className="size-3" />
            AI 生成���
          </motion.div>
        )}

        {/* Actions: only show when error or paused */}
        {(hasError || (!isGenerating && !isComplete)) && (
          <div className="rpp-actions">
            <Button onClick={onContinue} disabled={isGenerating}>
              {isGenerating ? "生成中…" : hasError ? "重试" : "继续生成"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
