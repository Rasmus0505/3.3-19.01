import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import React, { useState, useRef, useCallback, useLayoutEffect } from "react";
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
 * SimpleTooltip — lightweight tooltip with no Radix Portal.
 *
 * Why a guard ref (visibleRef)?
 *   React 18 concurrent mode can interrupt the setVisible(true) render and
 *   postpone it behind a higher-priority update (e.g. audio play). The RAF
 *   inside useLayoutEffect fires AFTER the DOM update is committed, so even if
 *   React deferred the setVisible render, the tooltip div IS in the DOM by the
 *   time RAF runs — visibleRef.current === true is a reliable sentinel.
 *   Strict Mode double-invoke: the guard ref ensures we only position once
 *   per hover sequence (skip the cleanup re-run that sees visibleRef=false).
 *
 * Why RAF inside useLayoutEffect instead of useEffect?
 *   useLayoutEffect fires synchronously after all DOM mutations. The tooltip
 *   div is added to the DOM by the setVisible render, so by the time
 *   useLayoutEffect runs the tooltip exists in the tree. RAF is still needed
 *   because offsetWidth/offsetHeight are 0 until after layout/paint — we need
 *   one more tick for the browser to compute dimensions.
 */
export function SimpleTooltip({ children, content, side = "top", className }) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const visibleRef = useRef(false);   // guard: true when tooltip should be shown
  const guardKey = useRef(0);         // incremented on each show to cancel stale RAFs

  useLayoutEffect(() => {
    if (!visible) {
      visibleRef.current = false;
      return;
    }

    // New show sequence — bump the guard key to invalidate any RAF from a
    // previous show/hide cycle.
    guardKey.current += 1;
    const key = guardKey.current;
    visibleRef.current = true;

    const frame = requestAnimationFrame(() => {
      // Cancelled or tooltip was hidden since we scheduled this frame.
      if (key !== guardKey.current || !visibleRef.current) return;
      if (!triggerRef.current || !tooltipRef.current) return;

      const trigger = triggerRef.current;
      const el = tooltipRef.current;
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
    });
  }, [visible, side, content]);

  const setTriggerRef = useCallback((node) => {
    triggerRef.current = node;
    const child = React.Children.only(children);
    if (child?.ref) {
      if (typeof child.ref === "function") child.ref(node);
      else child.ref.current = node;
    }
  }, [children]);

  const child = React.Children.only(children);
  const childProps = child.props ?? {};
  const mergedProps = {
    ...childProps,
    ref: setTriggerRef,
    onMouseEnter: (e) => { setVisible(true); childProps.onMouseEnter?.(e); },
    onMouseLeave: (e) => { setVisible(false); childProps.onMouseLeave?.(e); },
    onFocus: (e) => { setVisible(true); childProps.onFocus?.(e); },
    onBlur: (e) => { setVisible(false); childProps.onBlur?.(e); },
  };

  return (
    <>
      {React.cloneElement(child, mergedProps)}
      {visible && content ? (
        <div
          ref={tooltipRef}
          style={{ position: "fixed", top: 0, left: 0, zIndex: 999999 }}
          className={cn(
            "pointer-events-none rounded-md border bg-black/80 px-2.5 py-1.5 text-sm text-white shadow-xl backdrop-blur-sm",
            className,
          )}
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
  return <SimpleTooltip children={children} content={content} side={side} />;
}
