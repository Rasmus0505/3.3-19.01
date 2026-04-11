import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui";

const LABELS = [
  { key: "listening", label: "听力" },
  { key: "reading", label: "阅读" },
  { key: "vocabulary", label: "词汇" },
  { key: "grammar", label: "语法" },
  { key: "speaking", label: "口语" },
];

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 100;

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

  return (
    <Card className="border-0 bg-gradient-to-br from-card to-muted/30 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">能力雷达</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full max-w-[260px]">
          {/* Grid rings */}
          {[0.33, 0.66, 1].map((level) => (
            <polygon
              key={level}
              points={gridPolygon(level)}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-border"
            />
          ))}
          {/* Axis lines */}
          {LABELS.map((_, i) => {
            const [x, y] = polarToXY((360 / 5) * i, R);
            return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="currentColor" strokeWidth="0.5" className="text-border" />;
          })}
          {/* Data polygon */}
          <polygon
            points={polygonPoints(values, R)}
            fill="hsl(var(--primary) / 0.2)"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Data points */}
          {values.map((v, i) => {
            const [x, y] = polarToXY((360 / 5) * i, (v / 100) * R);
            return <circle key={i} cx={x} cy={y} r="3" fill="hsl(var(--primary))" />;
          })}
          {/* Labels */}
          {LABELS.map((l, i) => {
            const [x, y] = polarToXY((360 / 5) * i, R + 22);
            return (
              <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[11px] font-medium">
                {l.label}
                <tspan x={x} dy="13" className="fill-muted-foreground text-[10px]">
                  {values[i]}
                </tspan>
              </text>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
