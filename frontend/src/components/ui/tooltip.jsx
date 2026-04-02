import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import React, { useRef, useLayoutEffect, useCallback } from "react";
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

/**
 * SimpleTooltip — CSS hover for visibility, direct DOM for positioning.
 *
 * Why not React state for visibility?
 *   React 18's concurrent rendering can interrupt setState renders when
 *   other state updates happen in the same event cycle (e.g. playing audio).
 *   CSS :hover is synchronous and completely unaffected by React render
 *   scheduling. JS only handles the tooltip position.
 *
 * Why direct DOM manipulation for position?
 *   We need the tooltip's offsetWidth/Height to compute correct placement,
 *   but hidden (display:none) elements report 0 dimensions. By keeping the
 *   tooltip visible (but visually clipped) during measurement, we get
 *   accurate measurements on the first show — no flicker.
 */
export function SimpleTooltip({ children, content, side = "top", className }) {
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const measureKeyRef = useRef(0);

  // Compute and apply tooltip position directly to DOM (no React re-render).
  const position = useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    measureKeyRef.current += 1;
    const key = measureKeyRef.current;

    const apply = () => {
      if (key !== measureKeyRef.current) return; // stale
      if (!triggerRef.current || !tooltipRef.current) return;

      const t = triggerRef.current;
      const el = tooltipRef.current;
      const TW = el.offsetWidth || 160;
      const TH = el.offsetHeight || 32;
      const PADDING = 6;
      const rect = t.getBoundingClientRect();
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
    };

    requestAnimationFrame(apply);
  }, [side, content]);

  // Forward ref to the trigger element.
  const setTriggerRef = useCallback((node) => {
    triggerRef.current = node;
    const child = React.Children.only(children);
    if (child?.ref) {
      if (typeof child.ref === "function") child.ref(node);
      else child.ref.current = node;
    }
  }, [children]);

  // Merge event handlers so we can position on hover/show.
  const child = React.Children.only(children);
  const childProps = child.props ?? {};
  const mergedProps = {
    ...childProps,
    ref: setTriggerRef,
  };

  return (
    <div className="group/simplett relative inline-flex">
      {React.cloneElement(child, mergedProps)}
      <div
        ref={tooltipRef}
        className={cn(
          "pointer-events-none fixed z-[999999] hidden rounded-md border bg-black/80 px-2.5 py-1.5 text-sm text-white shadow-xl backdrop-blur-sm",
          "group-hover/simplett:block group-focus-within/simplett:block",
          className,
        )}
        role="tooltip"
      >
        <p className="whitespace-nowrap">{content}</p>
      </div>
    </div>
  );
}

// Convenience wrapper matching the old TooltipHint API.
export function TooltipHint({ children, content, side = "top" }) {
  return <SimpleTooltip children={children} content={content} side={side} />;
}
