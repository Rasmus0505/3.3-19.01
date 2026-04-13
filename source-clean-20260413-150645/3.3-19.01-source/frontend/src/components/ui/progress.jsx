import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "../../lib/utils";

export function Progress({ className, value = 0, ...props }) {
  const safeValue = Math.min(100, Math.max(0, Number(value) || 0));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={safeValue}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-transform"
        style={{ transform: `translateX(-${100 - safeValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

