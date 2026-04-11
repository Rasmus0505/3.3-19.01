import { motion } from "framer-motion";
import { BookOpen, BookOpenText, Clock, Flame, Languages, Mic2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const STAT_ITEMS = [
  {
    key: "total_lessons",
    label: "听力课程",
    icon: BookOpen,
    gradient: "from-blue-500 to-cyan-400",
    shadow: "shadow-blue-500/20",
    glow: "bg-blue-500/10",
    format: (v) => v,
  },
  {
    key: "total_reading_packs",
    label: "阅读材料",
    icon: BookOpenText,
    gradient: "from-emerald-500 to-teal-400",
    shadow: "shadow-emerald-500/20",
    glow: "bg-emerald-500/10",
    format: (v) => v,
  },
  {
    key: "total_study_minutes",
    label: "学习时长",
    icon: Clock,
    gradient: "from-amber-500 to-orange-400",
    shadow: "shadow-amber-500/20",
    glow: "bg-amber-500/10",
    format: (v) => `${v}m`,
  },
  {
    key: "streak_days",
    label: "连续打卡",
    icon: Flame,
    gradient: "from-red-500 to-rose-400",
    shadow: "shadow-red-500/20",
    glow: "bg-red-500/10",
    format: (v) => `${v}天`,
  },
  {
    key: "vocabulary_count",
    label: "掌握词汇",
    icon: Languages,
    gradient: "from-violet-500 to-purple-400",
    shadow: "shadow-violet-500/20",
    glow: "bg-violet-500/10",
    format: (v) => v,
  },
  {
    key: "avg_soe_score",
    label: "口语均分",
    icon: Mic2,
    gradient: "from-pink-500 to-fuchsia-400",
    shadow: "shadow-pink-500/20",
    glow: "bg-pink-500/10",
    format: (v) => (v > 0 ? v.toFixed(1) : "--"),
  },
];

/** Counter that animates from 0 to target. */
function AnimatedNumber({ value, format }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const target = typeof value === "number" ? value : 0;
    if (target === 0) { setDisplay(0); return; }
    const duration = 1200;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target * 10) / 10);
      if (progress < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => { if (ref.current) cancelAnimationFrame(ref.current); };
  }, [value]);

  return <>{format(display)}</>;
}

const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.9 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
      delay: i * 0.08,
    },
  }),
};

export function StatsCards({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {STAT_ITEMS.map((item, i) => {
        const Icon = item.icon;
        const value = stats?.[item.key] ?? 0;
        return (
          <motion.div
            key={item.key}
            custom={i}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            whileHover={{ y: -4, scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="group relative cursor-default overflow-hidden rounded-2xl border border-white/10 bg-card p-4 shadow-lg backdrop-blur dark:border-white/5"
          >
            {/* Glow background */}
            <motion.div
              className={`absolute -right-4 -top-4 h-20 w-20 rounded-full ${item.glow} blur-2xl`}
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
            />

            <div className="relative flex flex-col items-center gap-2 text-center">
              <motion.div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.gradient} shadow-md ${item.shadow}`}
                whileHover={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 0.5 }}
              >
                <Icon className="h-5 w-5 text-white" />
              </motion.div>
              <p className="text-2xl font-extrabold tracking-tight">
                <AnimatedNumber value={value} format={item.format} />
              </p>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {item.label}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
