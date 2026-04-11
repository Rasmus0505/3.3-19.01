import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui";

const LABELS = [
  { key: "listening", label: "听力", color: "#3b82f6" },
  { key: "reading", label: "阅读", color: "#22c55e" },
  { key: "vocabulary", label: "词汇", color: "#a855f7" },
  { key: "grammar", label: "语法", color: "#f97316" },
  { key: "speaking", label: "口语", color: "#ec4899" },
];

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 105;

function polarToXY(angle, radius) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

function polygonPoints(values, maxR) {
  return values
    .map((v, i) => {
      const angle = (360 / values.length) * i;
      return polarToXY(angle, (v / 100) * maxR);
    })
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
}

function gridPolygon(level) {
  const r = R * level;
  return Array.from({ length: 5 }, (_, i) => polarToXY((360 / 5) * i, r))
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
}

export function RadarChart({ skillScores = {} }) {
  const values = LABELS.map((l) => skillScores[l.key] || 0);
  const avgScore = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <Card className="overflow-hidden border-0 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent" />
        <CardHeader className="relative pb-2">
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-sm font-semibold">能力雷达</CardTitle>
            <span className="text-[11px] text-muted-foreground">综合 {avgScore} 分</span>
          </div>
        </CardHeader>
        <CardContent className="relative flex items-center justify-center pb-2">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full max-w-[280px]">
            {/* Defs for gradient */}
            <defs>
              <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(270 80% 60%)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="hsl(230 80% 60%)" stopOpacity="0.15" />
              </linearGradient>
              <linearGradient id="radarStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(270 80% 60%)" />
                <stop offset="100%" stopColor="hsl(230 80% 60%)" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Grid rings */}
            {[0.33, 0.66, 1].map((level) => (
              <polygon
                key={level}
                points={gridPolygon(level)}
                fill="none"
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-border/50"
                strokeDasharray={level < 1 ? "2 3" : "none"}
              />
            ))}

            {/* Axis lines */}
            {LABELS.map((_, i) => {
              const [x, y] = polarToXY((360 / 5) * i, R);
              return (
                <line
                  key={i}
                  x1={CX}
                  y1={CY}
                  x2={x}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  className="text-border/40"
                />
              );
            })}

            {/* Animated data polygon */}
            <motion.polygon
              points={polygonPoints(values.map(() => 0), R)}
              animate={{ points: polygonPoints(values, R) }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
              fill="url(#radarFill)"
              stroke="url(#radarStroke)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              filter="url(#glow)"
            />

            {/* Data points with glow */}
            {values.map((v, i) => {
              const [x, y] = polarToXY((360 / 5) * i, (v / 100) * R);
              return (
                <motion.g key={i}>
                  <motion.circle
                    cx={CX}
                    cy={CY}
                    animate={{ cx: x, cy: y }}
                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 + i * 0.05 }}
                    r="5"
                    fill={LABELS[i].color}
                    opacity="0.3"
                  />
                  <motion.circle
                    cx={CX}
                    cy={CY}
                    animate={{ cx: x, cy: y }}
                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 + i * 0.05 }}
                    r="3"
                    fill={LABELS[i].color}
                  />
                </motion.g>
              );
            })}

            {/* Labels */}
            {LABELS.map((l, i) => {
              const [x, y] = polarToXY((360 / 5) * i, R + 28);
              return (
                <motion.text
                  key={i}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-foreground text-[11px] font-semibold"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 + i * 0.1 }}
                >
                  {l.label}
                  <tspan x={x} dy="14" className="fill-muted-foreground text-[10px] font-normal">
                    {values[i]}
                  </tspan>
                </motion.text>
              );
            })}
          </svg>
        </CardContent>
      </Card>
    </motion.div>
  );
}
