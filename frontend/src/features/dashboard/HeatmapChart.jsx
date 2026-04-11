import { motion } from "framer-motion";
import { Activity, TrendingUp } from "lucide-react";
import { Card, CardContent } from "../../shared/ui";

function getToneClasses(bar) {
  if (bar.hotspot) return "from-cyan-500 to-blue-600";
  if ((bar.minutes || 0) > 0) return "from-emerald-400 to-cyan-500";
  return "from-slate-200 to-slate-200";
}

export function HeatmapChart({ report }) {
  const bars = report?.pulseBars || [];
  const activeCount = bars.filter((bar) => (bar.minutes || 0) > 0).length;

  return (
    <Card className="relative overflow-hidden rounded-[30px] border border-white/50 bg-white/80 shadow-[0_28px_80px_-44px_rgba(15,23,42,0.58)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.18),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.45),rgba(248,250,252,0.8))]" />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Learning Pulse</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">最近 28 天学习脉冲</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              不再展示传统热力图，而是直接把近阶段的强弱波峰打出来，方便截图呈现训练密度。
            </p>
          </div>
          <div className="rounded-[22px] border border-emerald-200/70 bg-emerald-50 px-3 py-2 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Trend</p>
            <p className="mt-1 text-lg font-black text-emerald-950">
              {report.momentum.direction === "down" ? "" : "+"}
              {report.momentum.trendDelta}%
            </p>
          </div>
        </div>

        <div className="mt-6 grid h-[170px] grid-cols-28 items-end gap-1.5">
          {bars.map((bar, index) => (
            <motion.div
              key={bar.date}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 + index * 0.02, duration: 0.28 }}
              className="group relative flex h-full items-end"
              title={`${bar.date}: ${bar.minutes} 分钟`}
            >
              <div className="relative w-full">
                <div className="absolute inset-x-0 bottom-0 rounded-full bg-slate-100" style={{ height: "100%" }} />
                <div
                  className={`relative w-full rounded-full bg-gradient-to-t ${getToneClasses(bar)} shadow-[0_18px_30px_-22px_rgba(14,165,233,0.9)] transition-transform duration-200 group-hover:-translate-y-1`}
                  style={{ height: `${Math.max(bar.intensity * 100, 8)}%` }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-slate-200/70 bg-slate-50/90 p-4">
            <div className="flex items-center gap-2 text-slate-500">
              <Activity className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">活跃密度</span>
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{activeCount}/28</p>
            <p className="mt-1 text-sm text-slate-600">最近 28 天中保持学习行为的天数。</p>
          </div>
          <div className="rounded-[22px] border border-slate-200/70 bg-slate-50/90 p-4">
            <div className="flex items-center gap-2 text-slate-500">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">学习势能</span>
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{report.momentum.score}</p>
            <p className="mt-1 text-sm text-slate-600">综合最近活跃频率、时长与连续性后的战报分值。</p>
          </div>
          <div className="rounded-[22px] border border-slate-200/70 bg-slate-50/90 p-4">
            <div className="flex items-center gap-2 text-slate-500">
              <Activity className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">近 14 天投入</span>
            </div>
            <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">{report.momentum.recentMinutes}m</p>
            <p className="mt-1 text-sm text-slate-600">这是评审更容易感知到的近期训练强度，而不是总量堆积。</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
