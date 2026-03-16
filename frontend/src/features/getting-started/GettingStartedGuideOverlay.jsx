import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../../shared/ui";

const SPOTLIGHT_PADDING = 12;

function getTargetElement(targetId) {
  if (!targetId || typeof document === "undefined") return null;
  return document.querySelector(`[data-guide-id="${targetId}"]`);
}

function measureTarget(targetId) {
  const element = getTargetElement(targetId);
  if (!(element instanceof HTMLElement)) return null;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    top: Math.max(0, rect.top),
    left: Math.max(0, rect.left),
    width: rect.width,
    height: rect.height,
    highlightTop: Math.max(8, rect.top - SPOTLIGHT_PADDING),
    highlightLeft: Math.max(8, rect.left - SPOTLIGHT_PADDING),
    highlightWidth: Math.max(48, rect.width + SPOTLIGHT_PADDING * 2),
    highlightHeight: Math.max(48, rect.height + SPOTLIGHT_PADDING * 2),
  };
}

function buildBlockers(targetRect) {
  if (typeof window === "undefined") return [];

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  if (!targetRect) {
    return [
      {
        top: 0,
        left: 0,
        width: viewportWidth,
        height: viewportHeight,
      },
    ];
  }

  const rightStart = targetRect.left + targetRect.width;
  const bottomStart = targetRect.top + targetRect.height;

  return [
    {
      top: 0,
      left: 0,
      width: viewportWidth,
      height: Math.max(0, targetRect.top),
    },
    {
      top: targetRect.top,
      left: 0,
      width: Math.max(0, targetRect.left),
      height: targetRect.height,
    },
    {
      top: targetRect.top,
      left: rightStart,
      width: Math.max(0, viewportWidth - rightStart),
      height: targetRect.height,
    },
    {
      top: bottomStart,
      left: 0,
      width: viewportWidth,
      height: Math.max(0, viewportHeight - bottomStart),
    },
  ].filter((blocker) => blocker.width > 0 && blocker.height > 0);
}

export function GettingStartedGuideOverlay({
  active = false,
  step = null,
  stepIndex = 0,
  instructionText = "",
  onPrevious,
  onExit,
  onTargetAction,
}) {
  const [targetRect, setTargetRect] = useState(null);

  useEffect(() => {
    if (!active || !step?.targetId || typeof window === "undefined") {
      setTargetRect(null);
      return undefined;
    }

    function updateTargetRect() {
      setTargetRect(measureTarget(step.targetId));
    }

    updateTargetRect();
    const intervalId = window.setInterval(updateTargetRect, 120);
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [active, step?.targetId]);

  useEffect(() => {
    if (!active || !step?.targetId || !step.advanceOnTargetClick || typeof document === "undefined") {
      return undefined;
    }

    function handleTargetClick(event) {
      const targetElement = getTargetElement(step.targetId);
      const nextTarget = event.target;

      if (!(targetElement instanceof HTMLElement) || !(nextTarget instanceof Node)) {
        return;
      }

      if (targetElement.contains(nextTarget)) {
        window.setTimeout(() => {
          onTargetAction?.(step.id);
        }, 0);
      }
    }

    document.addEventListener("click", handleTargetClick, true);
    return () => {
      document.removeEventListener("click", handleTargetClick, true);
    };
  }, [active, onTargetAction, step]);

  const blockers = useMemo(() => buildBlockers(targetRect), [targetRect]);
  const visibleInstruction = instructionText || step?.instruction || "";

  if (!active || !step || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[120]">
      {blockers.map((blocker, index) => (
        <div
          key={`${blocker.top}-${blocker.left}-${index}`}
          className="pointer-events-auto fixed bg-slate-950/60"
          style={{
            top: `${blocker.top}px`,
            left: `${blocker.left}px`,
            width: `${blocker.width}px`,
            height: `${blocker.height}px`,
          }}
        />
      ))}

      {targetRect ? (
        <div
          className="pointer-events-none fixed rounded-[28px] border-2 border-primary bg-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.35)] transition-all duration-150"
          style={{
            top: `${targetRect.highlightTop}px`,
            left: `${targetRect.highlightLeft}px`,
            width: `${targetRect.highlightWidth}px`,
            height: `${targetRect.highlightHeight}px`,
          }}
        />
      ) : null}

      <div className="pointer-events-none fixed inset-x-0 top-3 flex justify-center px-3">
        <div className="pointer-events-auto flex w-full max-w-4xl items-center gap-2 rounded-full border border-border/80 bg-background/98 px-3 py-2 shadow-2xl backdrop-blur">
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground md:text-base">{visibleInstruction}</p>
          <Button
            type="button"
            variant="ghost"
            className="h-8 rounded-full px-3 text-xs md:text-sm"
            onClick={onPrevious}
            disabled={stepIndex === 0}
          >
            上一步
          </Button>
          <Button type="button" variant="ghost" className="h-8 rounded-full px-3 text-xs md:text-sm" onClick={onExit}>
            退出
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
