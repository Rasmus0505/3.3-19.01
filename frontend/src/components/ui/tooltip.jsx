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
 * SimpleTooltip — no Radix Portal, no cloneElement.
 * Renders the tooltip div inline as a sibling to the trigger.
 * Uses Portal to document.body ONLY when in fullscreen to escape the
 * fullscreen stacking context. Falls back to inline otherwise.
 *
 * Usage:
 *   <SimpleTooltip content="tooltip text" side="top">
 *     <button onClick={...}>Label</button>
 *   </SimpleTooltip>
 */
export function SimpleTooltip({ children, content, side = "top", className }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [inFullscreen, setInFullscreen] = useState(false);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  // Detect fullscreen so we can Portal the tooltip to document.body.
  useLayoutEffect(() => {
    const check = () => {
      const el =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement ||
        (document.webkitIsFullScreen ? document.documentElement : null);
      setInFullscreen(!!el);
    };
    check();
    document.addEventListener("fullscreenchange", check);
    document.addEventListener("webkitfullscreenchange", check);
    return () => {
      document.removeEventListener("fullscreenchange", check);
      document.removeEventListener("webkitfullscreenchange", check);
    };
  }, []);

  // Compute tooltip position when shown.
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current) return;
    const trigger = triggerRef.current;
    const rect = trigger.getBoundingClientRect();
    const TW = tooltipRef.current ? tooltipRef.current.offsetWidth : 160;
    const TH = tooltipRef.current ? tooltipRef.current.offsetHeight : 32;
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

    left = Math.max(PADDING, Math.min(left, vw - TW - PADDING));
    top = Math.max(PADDING, Math.min(top, vh - TH - PADDING));
    setPos({ top, left });
  }, [visible, side, content]);

  const handleMouseEnter = useCallback(() => setVisible(true), []);
  const handleMouseLeave = useCallback(() => setVisible(false), []);
  const handleFocus = useCallback(() => setVisible(true), []);
  const handleBlur = useCallback(() => setVisible(false), []);

  // Extract the child element and merge event handlers + ref.
  const child = React.Children.only(children);
  const childProps = child.props ?? {};
  const { ref: childRef, ...restChildProps } = childRefKey(child) ? child.ref ? { ref: child.ref } : {} : {};

  // Build merged props: keep all original props, add our event/ref.
  const mergedProps = {
    ...restChildProps,
    ref: (node) => {
      triggerRef.current = node;
      if (childRef) {
        if (typeof childRef === "function") childRef(node);
        else childRef.current = node;
      }
    },
    onMouseEnter: (e) => { handleMouseEnter(); childProps.onMouseEnter?.(e); },
    onMouseLeave: (e) => { handleMouseLeave(); childProps.onMouseLeave?.(e); },
    onFocus: (e) => { handleFocus(); childProps.onFocus?.(e); },
    onBlur: (e) => { handleBlur(); childProps.onBlur?.(e); },
  };

  // In fullscreen: Portal to document.body to escape the fullscreen stacking context.
  // Otherwise: render inline as a sibling in the same DOM tree.
  const tooltipEl = (
    <div
      ref={tooltipRef}
      style={{ top: pos.top, left: pos.left, zIndex: 999999 }}
      className={cn(
        "pointer-events-none fixed rounded-md border bg-black/80 px-2.5 py-1.5 text-sm text-white shadow-xl backdrop-blur-sm",
        className,
      )}
      role="tooltip"
    >
      <p className="whitespace-nowrap">{content}</p>
    </div>
  );

  return (
    <>
      {React.cloneElement(child, mergedProps)}
      {visible && content ? (
        inFullscreen
          ? <TooltipPrimitive.Portal>{tooltipEl}</TooltipPrimitive.Portal>
          : tooltipEl
      ) : null}
    </>
  );
}

/** Returns the ref key used by a React element (ref or null). */
function childRefKey(child) {
  return child && child.ref;
}

// Convenience wrapper matching the old TooltipHint API.
export function TooltipHint({ children, content, side = "top" }) {
  return <SimpleTooltip children={children} content={content} side={side} />;
}
