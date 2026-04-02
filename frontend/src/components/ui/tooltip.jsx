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
          // tw-animate's animate-in/fade-in-0 can leave content stuck at opacity 0 in
          // Electron fullscreen builds; use plain CSS opacity transition instead.
          "overflow-hidden rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md transition-opacity duration-150",
          "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

// Semi-transparent hint style for immersive learning buttons (D-18-04, D-18-05).
// Uses controlled show/hide via React state and fixed positioning instead of Radix
// state + CSS animation, to guarantee visibility across all environments (incl.
// Electron fullscreen). z-index 999999 sits above video elements in fullscreen.
export function TooltipHint({ children, content, side = "top" }) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger
        asChild
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={4}
        className="bg-black/80 text-white border-0 shadow-xl backdrop-blur-sm"
        style={{
          display: open ? undefined : "none",
          position: "fixed",
          zIndex: 999999,
        }}
      >
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}
