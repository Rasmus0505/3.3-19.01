/**
 * UnlockAnimation — I+1 unlock animation.
 *
 * Shows the transition from original CEFR level to target level,
 * with difficult words highlighted as "unlockable" pills.
 */
import { useState, useEffect } from "react";
import { cn } from "../../../lib/utils";
import { Unlock, Lock, ArrowRight } from "lucide-react";

export function UnlockAnimation({ originalLevel, targetLevel, difficultWords = [], onComplete }) {
  const [phase, setPhase] = useState("locked");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("unlocking"), 500);
    const t2 = setTimeout(() => setPhase("unlocked"), 1500);
    const t3 = setTimeout(() => onComplete?.(), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-8">
      {/* Lock icon */}
      <div className={cn(
        "w-20 h-20 rounded-full flex items-center justify-center mb-4 transition-all duration-500",
        phase === "locked" && "bg-muted scale-100",
        phase === "unlocking" && "bg-purple-100 dark:bg-purple-900 scale-110 animate-pulse",
        phase === "unlocked" && "bg-emerald-100 dark:bg-emerald-900 scale-100",
      )}>
        {phase === "unlocked" ? (
          <Unlock className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Lock className={cn(
            "w-10 h-10",
            phase === "unlocking" ? "text-purple-600 dark:text-purple-400" : "text-muted-foreground",
          )} />
        )}
      </div>

      {/* Level transition */}
      <div className="flex items-center gap-3 mb-4">
        <span className={cn(
          "text-lg font-bold px-3 py-1 rounded-lg transition-all duration-500",
          "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
          phase === "unlocked" && "opacity-50",
        )}>
          {originalLevel}
        </span>
        <ArrowRight className={cn(
          "w-5 h-5 text-muted-foreground transition-all duration-300",
          phase === "unlocking" && "animate-bounce text-purple-500",
          phase === "unlocked" && "text-emerald-500",
        )} />
        <span className={cn(
          "text-lg font-bold px-3 py-1 rounded-lg transition-all duration-500",
          "bg-muted text-muted-foreground",
          phase === "unlocked" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
        )}>
          {targetLevel}
        </span>
      </div>

      {/* Difficult words */}
      {difficultWords.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {difficultWords.map((word, idx) => (
            <span
              key={word}
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium transition-all duration-500",
                "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
                phase === "unlocked" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
              )}
              style={{ transitionDelay: `${idx * 100}ms` }}
            >
              {word}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
