import { motion } from "framer-motion";
import { ArrowUpRight, Target } from "lucide-react";
import { Badge, Card, CardContent } from "../../shared/ui";

const LEVEL_STYLES = {
  A1: "bg-slate-300 text-slate-700",
  A2: "bg-sky-100 text-sky-700",
  B1: "bg-cyan-100 text-cyan-700",
  B2: "bg-emerald-100 text-emerald-700",
  C1: "bg-violet-100 text-violet-700",
};

export function VocabGrowthChart({ report }) {
  const cefr = report?.cefr;
  const targetItem = cefr?.items.find((item) => item.target) || cefr?.items[2];

  return (
    <Card className="relative overflow-hidden rounded-[30px] border border-white/50 bg-white/80 shadow-[0_28px_80px_-44px_rgba(15,23,42,0.58)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.35),rgba(248,250,252,0.82))]" />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">CEFR Breakthrough</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">词汇层级突破面板</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              不做普通柱状图，直接展示当前词汇分布和下一层突破目标。
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Lexicon</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{cefr?.total || 0}</p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200/70 bg-slate-50/90 p-4">
          <div className="flex h-4 overflow-hidden rounded-full bg-slate-200">
            {cefr?.items.map((item) => (
              <div
                key={item.level}
                className={`h-full ${LEVEL_STYLES[item.level]?.split(" ")[0] || "bg-slate-300"}`}
                style={{ width: `${Math.max(item.share, item.count > 0 ? 4 : 0)}%` }}
              />
            ))}
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-5">
            {cefr?.items.map((item, index) => (
              <motion.div
                key={item.level}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 + index * 0.05, duration: 0.28 }}
                className="rounded-[18px] border border-slate-200/70 bg-white/90 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge className={`rounded-full border-0 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] ${LEVEL_STYLES[item.level]}`}>
                    {item.level}
                  </Badge>
                  {item.target ? <ArrowUpRight className="h-4 w-4 text-emerald-500" /> : null}
                </div>
                <p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{item.count}</p>
                <p className="mt-1 text-sm text-slate-600">{item.share}% 占比</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-[22px] border border-emerald-200/70 bg-emerald-50/90 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Next Target</p>
            <p className="mt-1 text-lg font-black tracking-tight text-emerald-950">
              冲击 {targetItem?.level || report.predictedLevel} 层词汇密度
            </p>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              当前高层级词汇还没完全撑开。优先补齐 {targetItem?.level || report.predictedLevel} 段材料，可以让整页战报更有“进阶感”。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
