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

function getPosition(triggerEl, tooltipEl, preferredSide) {
  const rect = triggerEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const PADDING = 6;
  const TW = tooltipEl.offsetWidth || 160;
  const TH = tooltipEl.offsetHeight || 32;

  let top, left;

  if (preferredSide === "bottom") {
    top = rect.bottom + PADDING;
    left = rect.left + rect.width / 2 - TW / 2;
    if (top + TH > vh) top = rect.top - TH - PADDING;
  } else if (preferredSide === "top") {
    top = rect.top - TH - PADDING;
    left = rect.left + rect.width / 2 - TW / 2;
    if (top < 0) top = rect.bottom + PADDING;
  } else if (preferredSide === "right") {
    left = rect.right + PADDING;
    top = rect.top + rect.height / 2 - TH / 2;
    if (left + TW > vw) left = rect.left - TW - PADDING;
  } else if (preferredSide === "left") {
    left = rect.left - TW - PADDING;
    top = rect.top + rect.height / 2 - TH / 2;
    if (left < 0) left = rect.right + PADDING;
  }

  left = Math.max(PADDING, Math.min(left, vw - TW - PADDING));
  top = Math.max(PADDING, Math.min(top, vh - TH - PADDING));

  return { top, left };
}

export function SimpleTooltip({ children, content, side = "top", className }) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  // Must not gate render on a "ready" flag: tooltipRef only exists after the tooltip
  // div mounts, but that div was previously only rendered when ready — deadlock.
  // useLayoutEffect fires too early (offsetWidth/Height are 0 on first paint).
  // We read position synchronously after the browser has laid out the tooltip,
  // then update in the next frame via requestAnimationFrame.
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current) return;
    const update = () => {
      if (triggerRef.current && tooltipRef.current) {
        setPosition(getPosition(triggerRef.current, tooltipRef.current, side));
      }
    };
    requestAnimationFrame(update);
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
    [children.ref],
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
          style={{ top: position.top, left: position.left, zIndex: 999999 }}
          role="tooltip"
        >
          <p className="text-sm whitespace-nowrap">{content}</p>
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
