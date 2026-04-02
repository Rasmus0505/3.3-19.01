import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useState, useRef, useCallback, useLayoutEffect } from "react";
import React from "react";
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
          "overflow-hidden rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

// ---------------------------------------------------------------------------
// SimpleTooltip — lightweight tooltip with no Portal, no external CSS deps.
// Renders the tooltip inline (not via Portal) at a fixed position calculated
// from the trigger's bounding rect. This guarantees visibility inside
// Electron fullscreen mode where Radix Portals can be buried under the
// fullscreen video stacking context.
// ---------------------------------------------------------------------------

export function SimpleTooltip({ children, content, side = "top", className }) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  // Position the tooltip DOM directly (no state update, no re-render).
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;
    const el = tooltipRef.current;
    const trigger = triggerRef.current;
    const rect = trigger.getBoundingClientRect();
    const TW = el.offsetWidth || 160;
    const TH = el.offsetHeight || 32;
    const PADDING = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = 0, left = 0;

    if (side === "top") {
      top = rect.top - TH - PADDING;
      left = rect.left + rect.width / 2 - TW / 2;
      if (top < PADDING) top = rect.bottom + PADDING;
    } else if (side === "bottom") {
      top = rect.bottom + PADDING;
      left = rect.left + rect.width / 2 - TW / 2;
      if (top + TH > vh - PADDING) top = rect.top - TH - PADDING;
    } else if (side === "right") {
      left = rect.right + PADDING;
      top = rect.top + rect.height / 2 - TH / 2;
      if (left + TW > vw - PADDING) left = rect.left - TW - PADDING;
    } else if (side === "left") {
      left = rect.left - TW - PADDING;
      top = rect.top + rect.height / 2 - TH / 2;
      if (left < PADDING) left = rect.right + PADDING;
    }

    el.style.top = `${Math.max(PADDING, Math.min(top, vh - TH - PADDING))}px`;
    el.style.left = `${Math.max(PADDING, Math.min(left, vw - TW - PADDING))}px`;
  }, [visible, side, content]);

  const triggerCallbackRef = useCallback(
    (node) => {
      triggerRef.current = node;
      if (children.ref) {
        if (typeof children.ref === "function") {
          children.ref(node);
        } else if (children.ref) {
          children.ref.current = node;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const existingProps = children.props ?? {};
  const mergedProps = {
    ...existingProps,
    ref: triggerCallbackRef,
    onMouseEnter: (e) => {
      setVisible(true);
      existingProps.onMouseEnter?.(e);
    },
    onMouseLeave: (e) => {
      setVisible(false);
      existingProps.onMouseLeave?.(e);
    },
    onFocus: (e) => {
      setVisible(true);
      existingProps.onFocus?.(e);
    },
    onBlur: (e) => {
      setVisible(false);
      existingProps.onBlur?.(e);
    },
  };

  return (
    <>
      {React.cloneElement(children, mergedProps)}
      {visible ? (
        <div
          ref={tooltipRef}
          className={cn(
            "pointer-events-none fixed rounded-md border bg-black/80 px-2.5 py-1.5 text-sm text-white shadow-xl backdrop-blur-sm",
            className,
          )}
          style={{ top: 0, left: 0, zIndex: 999999 }}
          role="tooltip"
        >
          <p className="whitespace-nowrap">{content}</p>
        </div>
      ) : null}
    </>
  );
}

// Convenience wrapper matching the old TooltipHint API.
export function TooltipHint({ children, content, side = "top" }) {
  return (
    <SimpleTooltip children={children} content={content} side={side} />
  );
}
