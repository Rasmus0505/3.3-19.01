/**
 * SectionProgress — top bar showing "第 N 节 / 共 M 节" and current phase name.
 */
import { cn } from "../../../lib/utils";

const PHASE_LABELS = {
  read:    "阅读",
  explain: "讲解",
  quiz:    "做题",
  discuss: "讨论",
};

export function SectionProgress({ sectionIndex, totalSections, phase, className }) {
  const phaseLabel = PHASE_LABELS[phase] || phase;
  const dots = Array.from({ length: totalSections }, (_, i) => i);

  return (
    <div className={cn("sp-bar", className)}>
      <div className="sp-bar__dots">
        {dots.map((i) => (
          <span
            key={i}
            className={cn(
              "sp-bar__dot",
              i === sectionIndex && "sp-bar__dot--active",
              i < sectionIndex && "sp-bar__dot--done",
            )}
          />
        ))}
      </div>
      <span className="sp-bar__label">
        第 {sectionIndex + 1} 节 / 共 {totalSections} 节
      </span>
      <span className="sp-bar__phase">{phaseLabel}</span>
    </div>
  );
}
