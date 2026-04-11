/**
 * ScoreBanner — Animated score display with SVG progress ring.
 *
 * Dynamic color: emerald (>=80%), amber (>=50%), red (<50%).
 */
import { cn } from "../../../lib/utils";

export function ScoreBanner({ score, correct, total, comment }) {
  const ringColor = score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500";
  const bgColor = score >= 80 ? "bg-emerald-50 dark:bg-emerald-950" : score >= 50 ? "bg-amber-50 dark:bg-amber-950" : "bg-red-50 dark:bg-red-950";

  return (
    <div className={cn("rounded-2xl p-8 text-center", bgColor)}>
      <div className="relative w-28 h-28 mx-auto mb-4">
        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
          <circle
            cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6"
            strokeDasharray={`${score * 2.64} 264`}
            strokeLinecap="round"
            className={ringColor}
            style={{ transition: "stroke-dasharray 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-3xl font-bold", ringColor)}>{score}%</span>
        </div>
      </div>
      <h3 className="text-lg font-semibold mb-1">
        {correct} / {total} correct
      </h3>
      {comment && (
        <p className="text-sm text-muted-foreground">{comment}</p>
      )}
    </div>
  );
}
