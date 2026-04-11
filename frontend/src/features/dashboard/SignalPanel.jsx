import { motion } from "framer-motion";
import { Activity, Crosshair, Gauge, Sparkles } from "lucide-react";
import { Badge, Card, CardContent } from "../../shared/ui";

const ICONS = [Gauge, Sparkles, Activity, Crosshair];

export function SignalPanel({ report }) {
  return (
    <Card className="relative overflow-hidden rounded-2xl border border-border bg-background/80 shadow-lg backdrop-blur-xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.2),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.12),transparent_30%)]" />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Signal Deck</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-foreground">{report.stage.label}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{report.heroSummary}</p>
          </div>
          <Badge className="rounded-full border-0 bg-slate-950 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-white">
            {report.stage.badge}
          </Badge>
        </div>

        <div className="mt-5 grid gap-3">
          {report.signals.map((signal, index) => {
            const Icon = ICONS[index] || Sparkles;
            return (
              <motion.div
                key={signal.label}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18 + index * 0.07, duration: 0.35 }}
                className="rounded-2xl border border-border bg-muted/50 p-4 shadow-[0_16px_40px_-36px_rgba(15,23,42,0.75)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{signal.label}</p>
                      <p className="text-lg font-black tracking-tight text-foreground">{signal.value}</p>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{signal.caption}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
