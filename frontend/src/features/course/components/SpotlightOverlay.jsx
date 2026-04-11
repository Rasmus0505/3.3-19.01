/**
 * SpotlightOverlay — SVG mask-based dimming with animated cutout.
 *
 * Focuses user attention on a specific area by dimming everything else.
 */
import { useEffect, useState } from "react";

export function SpotlightOverlay({ targetRect, active, padding = 12 }) {
  if (!active || !targetRect) return null;

  const x = targetRect.left - padding;
  const y = targetRect.top - padding;
  const w = targetRect.width + padding * 2;
  const h = targetRect.height + padding * 2;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <svg className="w-full h-full">
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx="8"
              fill="black"
            >
              <animate
                attributeName="width"
                from={w + 40}
                to={w}
                dur="0.3s"
                fill="freeze"
              />
              <animate
                attributeName="height"
                from={h + 40}
                to={h}
                dur="0.3s"
                fill="freeze"
              />
            </rect>
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.5)"
          mask="url(#spotlight-mask)"
        />
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          rx="8"
          fill="none"
          stroke="white"
          strokeWidth="2"
          opacity="0.8"
        />
      </svg>
    </div>
  );
}
