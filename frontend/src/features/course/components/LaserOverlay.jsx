/**
 * LaserOverlay — Animated laser pointer effect.
 *
 * A red dot that flies from the nearest corner with a breathing glow ring.
 */
import { useEffect, useState } from "react";

export function LaserOverlay({ x, y, active }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [active]);

  if (!active || !visible) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Laser dot */}
      <div
        className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-lg shadow-red-500/50"
        style={{
          left: x,
          top: y,
          transition: "left 0.4s ease-out, top 0.4s ease-out",
        }}
      >
        {/* Breathing glow ring */}
        <div className="absolute inset-0 -m-2 rounded-full bg-red-500/30 animate-ping" />
      </div>
    </div>
  );
}
