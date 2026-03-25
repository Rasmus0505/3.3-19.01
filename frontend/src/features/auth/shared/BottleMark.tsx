import React from "react";

interface BottleMarkProps {
  size?: number;
  className?: string;
  title?: string;
}

export function BottleMark({
  size = 44,
  className,
  title = "Bottle",
}: BottleMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="2" width="60" height="60" rx="20" fill="url(#bottle-bg)" />
      <rect x="24" y="12" width="16" height="7" rx="3.5" fill="#0F172A" />
      <rect x="21" y="17" width="22" height="8" rx="4" fill="#164E63" />
      <path
        d="M22 25C22 21.6863 24.6863 19 28 19H36C39.3137 19 42 21.6863 42 25V45C42 50.5228 37.5228 55 32 55C26.4772 55 22 50.5228 22 45V25Z"
        fill="#ECFEFF"
      />
      <path
        d="M24 34.25C26.6667 32.4167 29.5 32.125 32.5 33.375C35.5 34.625 38 34.6667 40 33.5V45C40 49.4183 36.4183 53 32 53C27.5817 53 24 49.4183 24 45V34.25Z"
        fill="#38BDF8"
      />
      <path
        d="M23.5 34.5C26.6429 32 29.9286 31.5536 33.3571 33.1607C36.1429 34.4643 38.5238 34.5774 40.5 33.5"
        stroke="#0EA5E9"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M22 26.5H42"
        stroke="#BAE6FD"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="22"
        y="19"
        width="20"
        height="34"
        rx="10"
        stroke="#155E75"
        strokeWidth="2.4"
      />
      <defs>
        <linearGradient id="bottle-bg" x1="10" y1="6" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F766E" />
          <stop offset="0.52" stopColor="#0EA5A4" />
          <stop offset="1" stopColor="#67E8F9" />
        </linearGradient>
      </defs>
    </svg>
  );
}
