import { motion } from "framer-motion";

import type { QueueItem } from "../../types/today";
import { fadeUp } from "./animations";

type StatSpec = {
  label: string;
  value: number;
  hint: string;
  hintTone?: "ok" | "warn";
};

function queueStat(queueItems: QueueItem[]): StatSpec {
  const urgent = queueItems.some((item) => item.urgent);
  return {
    label: "Open queue",
    value: queueItems.length,
    hint:
      queueItems.length === 0
        ? "All clear"
        : urgent
          ? "Needs review"
          : "Waiting on office",
    hintTone: queueItems.length === 0 ? "ok" : urgent ? "warn" : undefined,
  };
}

export interface StatRowProps {
  queueItems: QueueItem[];
  openQuotes: number;
  followUpsDue: number;
  activeJobs: number;
}

export function StatRow({ queueItems, openQuotes, followUpsDue, activeJobs }: StatRowProps) {
  const stats: StatSpec[] = [
    queueStat(queueItems),
    {
      label: "Active quotes",
      value: openQuotes,
      hint: openQuotes > 0 ? "Awaiting send or reply" : "No quotes moving",
    },
    {
      label: "Follow-ups due",
      value: followUpsDue,
      hint: followUpsDue > 0 ? "Needs pressure" : "Nothing due",
      hintTone: followUpsDue > 0 ? "warn" : "ok",
    },
    {
      label: "Active jobs",
      value: activeJobs,
      hint: activeJobs > 0 ? "Work in motion" : "No active jobs",
    },
  ];

  return (
    <section className="grid grid-cols-4 border-b border-[var(--line)]">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          custom={index}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className={`px-5 py-4 ${index < stats.length - 1 ? "border-r border-[var(--line)]" : ""}`}
        >
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--t3)]">
            {stat.label}
          </div>
          <div className="mb-1 font-mono text-[22px] font-normal tracking-[-1px] text-[var(--t1)]">
            {stat.value}
          </div>
          <div
            className={`font-mono text-[10px] ${
              stat.hintTone === "ok"
                ? "text-[var(--green)]"
                : stat.hintTone === "warn"
                  ? "text-[var(--amber)]"
                  : "text-[var(--t3)]"
            }`}
          >
            {stat.hint}
          </div>
        </motion.div>
      ))}
    </section>
  );
}
