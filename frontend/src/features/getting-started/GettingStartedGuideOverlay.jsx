import { ArrowLeft, MousePointerClick, SkipForward, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "../../lib/utils";
import { Badge, Button } from "../../shared/ui";

const SPOTLIGHT_PADDING = 12;
const CARD_WIDTH = 360;
const CARD_HEIGHT_ESTIMATE = 260;

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
    top: Math.max(8, rect.top - SPOTLIGHT_PADDING),
    left: Math.max(8, rect.left - SPOTLIGHT_PADDING),
    width: Math.max(48, rect.width + SPOTLIGHT_PADDING * 2),
    height: Math.max(48, rect.height + SPOTLIGHT_PADDING * 2),
  };
}

function computeCardPosition(targetRect) {
  if (typeof window === "undefined") {
    return { top: 16, left: 16, width: CARD_WIDTH };
  }

  const viewportWidth = window.innerWidth || 1280;
  const viewportHeight = window.innerHeight || 720;
  const width = Math.min(CARD_WIDTH, Math.max(300, viewportWidth - 32));
  let left = viewportWidth - width - 16;
  let top = 16;

  if (targetRect) {
    left = Math.min(Math.max(16, targetRect.left + targetRect.width + 16), viewportWidth - width - 16);
    if (left + width > viewportWidth - 16) {
      left = Math.max(16, targetRect.left - width - 16);
    }
    top = Math.min(Math.max(16, targetRect.top), viewportHeight - CARD_HEIGHT_ESTIMATE - 16);
    if (targetRect.top + targetRect.height + CARD_HEIGHT_ESTIMATE + 24 < viewportHeight) {
      top = targetRect.top + targetRect.height + 16;
    }
  }

  return { top, left, width };
}

export function GettingStartedGuideOverlay({
  active = false,
  step = null,
  stepIndex = 0,
  totalSteps = 0,
  statusText = "",
  onPrevious,
  onSkip,
  onExit,
  onTargetAction,
}) {
  const cardRef = useRef(null);
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
    if (!active || !step?.targetId || typeof document === "undefined") return undefined;

    function handleCapturedEvent(event) {
      const cardElement = cardRef.current;
      const targetElement = getTargetElement(step.targetId);
      const nextTarget = event.target;

      if (cardElement instanceof HTMLElement && nextTarget instanceof Node && cardElement.contains(nextTarget)) {
        return;
      }

      if (targetElement instanceof HTMLElement && nextTarget instanceof Node && targetElement.contains(nextTarget)) {
        if (event.type === "click" && step.advanceOnTargetClick) {
          window.setTimeout(() => {
            onTargetAction?.(step.id);
          }, 0);
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    document.addEventListener("pointerdown", handleCapturedEvent, true);
    document.addEventListener("click", handleCapturedEvent, true);

    return () => {
      document.removeEventListener("pointerdown", handleCapturedEvent, true);
      document.removeEventListener("click", handleCapturedEvent, true);
    };
  }, [active, onTargetAction, step]);

  const cardPosition = useMemo(() => computeCardPosition(targetRect), [targetRect]);

  if (!active || !step || typeof document === "undefined") {
    return null;
  }

  const overlayNode = (
    <div className="fixed inset-0 z-[120]">
      {targetRect ? (
        <div
          className="pointer-events-none fixed rounded-[28px] border-2 border-primary bg-transparent shadow-[0_0_0_9999px_rgba(15,23,42,0.55)] transition-all duration-150"
          style={{
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-slate-950/55" />
      )}

      <div
        ref={cardRef}
        className="fixed rounded-[28px] border border-border/80 bg-background/98 p-5 shadow-2xl backdrop-blur"
        style={{
          top: `${cardPosition.top}px`,
          left: `${cardPosition.left}px`,
          width: `${cardPosition.width}px`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                步骤 {Math.min(stepIndex + 1, totalSteps)}/{totalSteps}
              </Badge>
              <Badge variant="outline">只点高亮目标</Badge>
            </div>
            <p className="text-base font-semibold text-foreground">{step.title}</p>
          </div>
          <div className="rounded-full border bg-muted/20 p-2 text-primary">
            <MousePointerClick className="size-4" />
          </div>
        </div>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">{step.description}</p>
        <div className="mt-4 rounded-2xl border bg-muted/20 px-4 py-3 text-sm leading-6 text-foreground">
          <p className="font-medium">目标：{step.targetLabel}</p>
          <p className="mt-1 text-muted-foreground">{statusText || step.waitingText}</p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={onPrevious} disabled={stepIndex === 0}>
            <ArrowLeft className="size-4" />
            上一步
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            <SkipForward className="size-4" />
            跳过
          </Button>
          <Button variant="ghost" onClick={onExit} className={cn("ml-auto")}>
            <X className="size-4" />
            退出
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlayNode, document.body);
}
