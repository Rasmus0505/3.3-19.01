import { motion } from "framer-motion";

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: (index) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.08 + index * 0.05,
      duration: 0.45,
      ease: "easeOut",
    },
  }),
};

export function StatsCards({ items = [] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <motion.div
          key={item.label}
          custom={index}
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          className="rounded-2xl border border-white/45 bg-background/72 p-4 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{item.label}</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-3xl font-black tracking-tight text-foreground">{item.value}</p>
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-500/18 to-blue-500/10" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
        </motion.div>
      ))}
    </div>
  );
}
