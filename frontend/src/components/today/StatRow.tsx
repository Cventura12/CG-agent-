import { motion } from "framer-motion";

import { fadeUp } from "../../lib/animations";
import type { QueueItem } from "../../types";

export interface StatRowProps {
  queueItems: QueueItem[];
  openQuotes: number;
  followUpsDue: number;
  activeJobs: number;
}

export function StatRow({ queueItems, openQuotes, followUpsDue, activeJobs }: StatRowProps) {
  const openQueueItems = queueItems.filter((item) => item.status === "pending" || item.status === "manual_review");
  const urgentQueue = openQueueItems.some((item) => item.urgent);
  const manualReviewCount = queueItems.filter((item) => item.status === "manual_review").length;
  const cards = [
    {
      label: "Open queue",
      value: openQueueItems.length,
      hint: manualReviewCount > 0 ? "Manual review waiting" : urgentQueue ? "Needs review" : "All clear",
      tone: manualReviewCount > 0 ? "text-[var(--accent-2)]" : urgentQueue ? "text-[var(--amber)]" : "text-[var(--green)]",
    },
    {
      label: "Active quotes",
      value: openQuotes,
      hint: openQuotes > 0 ? "Drafts and sends in flight" : "No quotes moving",
      tone: "text-[var(--t3)]",
    },
    {
      label: "Follow-ups due",
      value: followUpsDue,
      hint: followUpsDue > 0 ? "Needs pressure" : "Nothing scheduled",
      tone: followUpsDue > 0 ? "text-[var(--amber)]" : "text-[var(--green)]",
    },
    {
      label: "Active jobs",
      value: activeJobs,
      hint: activeJobs > 0 ? "Work in motion" : "No active jobs",
      tone: "text-[var(--t3)]",
    },
  ];

  return (
    <section className="grid grid-cols-2 border-b border-[var(--line)] sm:grid-cols-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          custom={index}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className={`px-4 py-4 sm:px-5 ${index % 2 === 0 ? "border-r border-[var(--line)]" : ""} ${index < 2 ? "border-b border-[var(--line)] sm:border-b-0" : ""} ${index < cards.length - 1 ? "sm:border-r sm:border-[var(--line)]" : ""} ${index === cards.length - 1 ? "sm:border-r-0" : ""}`}
        >
          <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--t3)]">{card.label}</div>
          <div className="mb-1 font-mono text-[22px] tracking-[-1px] text-[var(--t1)]">{card.value}</div>
          <div className={`font-mono text-[10px] ${card.tone}`}>{card.hint}</div>
        </motion.div>
      ))}
    </section>
  );
}

