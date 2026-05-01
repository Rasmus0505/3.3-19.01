import { memo, useEffect, useRef } from "react";
import { Activity, Zap, Flag, Info } from "lucide-react";
import { cn } from "../../../lib/utils";

const kindConfig = {
  milestone: { icon: Flag, color: "text-emerald-500", bg: "bg-emerald-500/10", dot: "bg-emerald-500" },
  progress: { icon: Activity, color: "text-sky-500", bg: "bg-sky-500/10", dot: "bg-sky-500" },
  info: { icon: Info, color: "text-muted-foreground", bg: "bg-muted", dot: "bg-muted-foreground/40" },
  debug: { icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10", dot: "bg-amber-500" },
};

const ActivityTimeline = memo(function ActivityTimeline({ events = [] }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  if (!events || events.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">活动日志</p>
      <div
        ref={listRef}
        className="max-h-48 overflow-y-auto rounded-lg border bg-card/60 px-3 py-2"
      >
        <div className="space-y-0">
          {events.map((event, idx) => {
            const config = kindConfig[event.kind] || kindConfig.info;
            const Icon = config.icon;
            const isFirst = idx === 0;
            const isLast = idx === events.length - 1;

            return (
              <div key={idx} className="flex items-start gap-2.5">
                <div className="flex w-12 shrink-0 items-center justify-end pt-0.5">
                  <span className="text-[11px] tabular-nums text-muted-foreground/70">
                    {event.ts || ""}
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <div className={cn("flex size-5 items-center justify-center rounded-full", config.bg)}>
                    <Icon className={cn("size-3", config.color)} />
                  </div>
                  {!isLast && (
                    <div className={cn("mt-px w-px flex-1 min-h-[12px]", isFirst ? "bg-border" : "bg-border")} />
                  )}
                </div>

                <div className={cn("min-w-0 flex-1 pb-2.5 pt-0.5", isLast && "pb-0")}>
                  <p className="text-[12px] leading-5 text-foreground/85 break-words">
                    {event.text || ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default ActivityTimeline;
