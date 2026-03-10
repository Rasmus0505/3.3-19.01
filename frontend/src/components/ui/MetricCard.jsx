import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "../../lib/utils";
import { Card, CardContent } from "./card";
import { Skeleton } from "./skeleton";

const TONE_STYLES = {
  default: "border-border/70 bg-card",
  success: "border-emerald-500/20 bg-emerald-500/5",
  warning: "border-amber-500/20 bg-amber-500/5",
  danger: "border-rose-500/20 bg-rose-500/5",
  info: "border-sky-500/20 bg-sky-500/5",
};

function TrendIcon({ direction }) {
  if (direction === "up") return <ArrowUpRight className="size-3.5" />;
  if (direction === "down") return <ArrowDownRight className="size-3.5" />;
  return <Minus className="size-3.5" />;
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  trend,
  loading = false,
  tone = "default",
  className,
}) {
  if (loading) {
    return <Skeleton className={cn("h-[148px] rounded-3xl", className)} />;
  }

  return (
    <Card className={cn("rounded-3xl border shadow-sm", TONE_STYLES[tone] || TONE_STYLES.default, className)}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-semibold tracking-tight">{value}</p>
          <div className="space-y-1">
            {trend ? (
              <p className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-1 text-xs font-medium text-foreground">
                <TrendIcon direction={trend.direction} />
                <span>{trend.value}</span>
              </p>
            ) : null}
            {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
        {Icon ? (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border bg-background/80 text-foreground shadow-sm">
            <Icon className="size-5" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
