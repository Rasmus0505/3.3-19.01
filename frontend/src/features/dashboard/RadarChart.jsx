import { motion } from "framer-motion";
import { Badge, Card, CardContent } from "../../shared/ui";

const BAND_COLORS = {
  A1: "bg-slate-300",
  A2: "bg-sky-200",
  B1: "bg-cyan-300",
  B2: "bg-emerald-300",
  C1: "bg-violet-300",
};

function getScoreTone(score) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 65) return "text-sky-600";
  if (score >= 50) return "text-amber-600";
  return "text-rose-600";
}

export function RadarChart({ report }) {
  const metric = report?.inputFit;
  const circumference = 2 * Math.PI * 48;
  const dashOffset = circumference * (1 - (metric?.score || 0) / 100);

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-border bg-background/88 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.65)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.86))]" />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Metric 01</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-foreground">i+1 输入命中率</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{metric?.theory}</p>
          </div>
          <Badge className="rounded-full border-0 bg-slate-950 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-white">
            {metric?.label}
          </Badge>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[140px_minmax(0,1fr)] lg:items-center">
          <div className="flex items-center justify-center">
            <div className="relative h-32 w-32">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="10" />
                <motion.circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  stroke="url(#fitGradient)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: dashOffset }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  strokeDasharray={circumference}
                />
                <defs>
                  <linearGradient id="fitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="100%" stopColor="#10b981" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className={`text-4xl font-black tracking-tight ${getScoreTone(metric?.score || 0)}`}>{metric?.score}</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">i+1 Fit</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-sm leading-6 text-foreground/80">{metric?.insight}</p>

            <div className="rounded-[20px] border border-border bg-muted/50 p-4">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <span>词汇难度分布</span>
                <span>挑战区 {metric?.stretchRatio}%</span>
              </div>
              <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-slate-200">
                {metric?.bands?.map((band) => (
                  <div
                    key={band.level}
                    className={BAND_COLORS[band.level] || "bg-slate-300"}
                    style={{ width: `${Math.max(band.sharePercent, band.count > 0 ? 4 : 0)}%` }}
                    title={`${band.level}: ${band.sharePercent}%`}
                  />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {metric?.bands?.map((band) => (
                  <div key={band.level} className="rounded-2xl border border-border bg-background px-2.5 py-2 text-center">
                    <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">{band.level}</p>
                    <p className="mt-1 text-sm font-bold text-foreground">{band.sharePercent}%</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[18px] border border-border bg-muted/50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">过难输入</p>
                <p className="mt-1 text-xl font-black text-foreground">{metric?.overloadRatio}%</p>
              </div>
              <div className="rounded-[18px] border border-border bg-muted/50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">完成支撑</p>
                <p className="mt-1 text-xl font-black text-foreground">{metric?.completionRate}%</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


