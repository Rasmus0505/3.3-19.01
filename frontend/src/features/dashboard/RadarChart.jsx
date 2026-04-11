import { motion } from "framer-motion";
import { Badge, Card, CardContent } from "../../shared/ui";

function getScoreTone(score) {
  if (score >= 80) return "from-cyan-500 to-blue-600";
  if (score >= 65) return "from-emerald-400 to-teal-500";
  if (score >= 50) return "from-amber-400 to-orange-500";
  return "from-rose-400 to-pink-500";
}

export function RadarChart({ report }) {
  const items = report?.capabilityItems || [];

  return (
    <Card className="relative overflow-hidden rounded-[30px] border border-white/50 bg-white/80 shadow-[0_28px_80px_-44px_rgba(15,23,42,0.58)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.4),rgba(248,250,252,0.84))]" />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Capability Matrix</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">五维能力矩阵</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              用排序和能量条直接表达强弱关系，比雷达图更适合比赛截图。
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Overall</p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{report.overallScore}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {items.map((item, index) => (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.16 + index * 0.05, duration: 0.3 }}
              className="rounded-[22px] border border-slate-200/70 bg-slate-50/90 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Badge className="rounded-full border-0 bg-slate-950 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-white">
                    NO.{item.rank}
                  </Badge>
                  <div>
                    <p className="text-base font-bold text-slate-950">{item.label}</p>
                    <p className="text-sm text-slate-600">{item.summary}</p>
                  </div>
                </div>
                <p className="text-2xl font-black tracking-tight text-slate-950">{item.score}</p>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${getScoreTone(item.score)}`}
                  style={{ width: `${item.score}%` }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
