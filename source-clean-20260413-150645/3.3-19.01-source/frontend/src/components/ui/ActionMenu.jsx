import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export function ActionMenu({
  label = "更多操作",
  items = [],
  align = "end",
  side = "bottom",
  className,
  triggerClassName,
}) {
  const [open, setOpen] = useState(false);
  const visibleItems = items.filter(Boolean);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1.5 rounded-xl", triggerClassName)}
          aria-label={label}
        >
          <MoreHorizontal className="size-4" />
          <span className="hidden sm:inline">操作</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} side={side} className={cn("w-56 rounded-2xl p-2", className)}>
        <div className="space-y-1">
          <div className="px-2 py-1">
            <p className="text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">统一入口，减少误触和横向拥挤。</p>
          </div>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const tone =
              item.variant === "destructive"
                ? "text-destructive hover:bg-destructive/10"
                : item.variant === "success"
                  ? "text-emerald-600 hover:bg-emerald-500/10"
                  : "hover:bg-muted";
            return (
              <button
                key={item.key || item.label}
                type="button"
                disabled={item.disabled}
                className={cn(
                  "flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                  tone,
                )}
                onClick={() => {
                  item.onSelect?.();
                  if (item.keepOpen !== true) {
                    setOpen(false);
                  }
                }}
              >
                <span className="flex min-w-0 items-start gap-2">
                  {Icon ? <Icon className="mt-0.5 size-4 shrink-0" /> : null}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.label}</span>
                    {item.description ? <span className="block text-xs text-muted-foreground">{item.description}</span> : null}
                  </span>
                </span>
                {item.badge ? <Badge variant="outline">{item.badge}</Badge> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
