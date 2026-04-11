import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { Badge, Card, CardContent } from "../../shared/ui";

const STAGE_TONES = [
  "from-slate-400 to-slate-500",
  "from-sky-400 to-cyan-500",
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-fuchsia-500",
];

export function VocabGrowthChart({ report }) {
  const metric = report?.conversion;

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-border bg-background/88 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.65)] backdrop-blur-xl">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.86))]" />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Metric 03</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-foreground">输入转化率</h3>
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
              <p className="mt-1 text-sm font-medium text-muted-foreground">从接触到内化的代理评分</p>
            </div>
            {metric?.outputMissing ? (
              <div className="flex items-center gap-2 rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                <AlertCircle className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">输出证据不足</span>
              </div>
            ) : null}
          </div>

          <p className="text-sm leading-6 text-foreground/80">{metric?.insight}</p>

          <div className="rounded-[20px] border border-border bg-muted/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">输入到输出的闭环漏斗</div>
            <div className="mt-4 space-y-3">
              {metric?.stages?.map((stage, index) => (
                <motion.div
                  key={stage.label}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + index * 0.05, duration: 0.24 }}
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground/80">{stage.label}</p>
                    <p className="text-sm font-black text-foreground">{stage.value}%</p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${STAGE_TONES[index] || STAGE_TONES.at(-1)}`}
                      style={{ width: `${stage.value}%` }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-border bg-muted/50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">理论解释</p>
            <p className="mt-1 text-sm leading-6 text-foreground/80">
              这项分数不是在看你“学了多久”，而是在看输入有没有留下可被提取、可被输出验证的证据。
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
