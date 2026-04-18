import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Badge, Card, CardContent } from "../../shared/ui";

function getBarTone(value) {
  if (value >= 0.8) return "from-emerald-400 to-cyan-500";
  if (value >= 0.5) return "from-sky-400 to-blue-500";
  if (value > 0) return "from-slate-300 to-slate-400";
  return "from-slate-200 to-slate-200";
}

export function HeatmapChart({ report }) {
  const metric = report?.inputIntensity;

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-border bg-background/88 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.65)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.86))]" />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Metric 02</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-foreground">可理解输入强度</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{metric?.theory}</p>
          </div>
          <Badge className="rounded-full border-0 bg-slate-950 px-3 py-1 text-[10px] font-semibold tracking-[0.18em] text-white">
            {metric?.label}
          </Badge>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-5xl font-black tracking-tight text-foreground">{metric?.score}</p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">近 14 天输入强度评分</p>
            </div>
            <div className="rounded-[20px] border border-emerald-200/70 bg-emerald-50 px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Trend</p>
              <p className="mt-1 flex items-center justify-end gap-1 text-xl font-black text-emerald-950">
                <ArrowUpRight className="h-4 w-4" />
                {metric?.trendDelta ?? 0}%
              </p>
            </div>
          </div>

          <p className="text-sm leading-6 text-foreground/80">{metric?.insight}</p>

          <div className="rounded-[20px] border border-border bg-muted/50 p-4">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>14 日输入脉冲</span>
              <span>{metric?.recentMinutes} 分钟</span>
            </div>
            <div className="mt-4 grid h-[160px] grid-cols-14 items-end gap-2">
              {metric?.bars?.map((bar, index) => (
                <motion.div
                  key={bar.date}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + index * 0.025, duration: 0.25 }}
                  className="flex h-full items-end"
                  title={`${bar.date}: ${bar.minutes} 分钟`}
                >
                  <div
                    className={`w-full rounded-full bg-gradient-to-t ${getBarTone(bar.intensity)} shadow-[0_14px_24px_-18px_rgba(56,189,248,0.9)]`}
                    style={{ height: `${Math.max(bar.intensity * 100, bar.minutes > 0 ? 12 : 4)}%` }}
                  />
                </motion.div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[18px] border border-border bg-muted/50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">活跃天数</p>
              <p className="mt-1 text-2xl font-black text-foreground">{metric?.activeDays}/14</p>
            </div>
            <div className="rounded-[18px] border border-border bg-muted/50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">近期输入量</p>
              <p className="mt-1 text-2xl font-black text-foreground">{metric?.recentMinutes}m</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


