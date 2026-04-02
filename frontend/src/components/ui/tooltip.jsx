import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useState } from "react";
import { cn } from "../../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        style={{ zIndex: 999999, ...props.style }}
        className={cn(
          // Use opacity instead of tw-animate's animate-in/fade-in-0, which can leave
          // content stuck at opacity 0 in some Electron / build environments.
          "overflow-hidden rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

// Semi-transparent hint style for immersive learning buttons (D-18-04, D-18-05).
// Uses a React state ref to detect hover on the trigger and show/hide the tooltip.
// z-index 999999 sits above video elements even in Electron fullscreen mode.
export function TooltipHint({ children, content, side = "top" }) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={4}
        className="bg-black/80 text-white border-0 shadow-xl backdrop-blur-sm"
        style={{ zIndex: 999999 }}
      >
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}
