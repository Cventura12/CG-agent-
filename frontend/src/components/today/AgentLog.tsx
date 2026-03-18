import { motion } from "framer-motion";

import { fadeUp } from "../../lib/animations";
import { formatMonoTime } from "../../lib/formatters";
import type { AgentStatus } from "../../types";

export interface AgentLogProps {
  agentStatus: AgentStatus;
}

export function AgentLog({ agentStatus }: AgentLogProps) {
  return (
    <div>
      <div className="mb-[10px] font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--t3)]">
        Agent activity
      </div>
      <div className="rounded-[8px] border border-[var(--line-2)] bg-[var(--bg-3)] px-[12px] py-[10px]">
        <div className="space-y-[2px] font-mono text-[11px] leading-[1.8] text-[var(--t3)]">
          {agentStatus.log.map((entry, index) => {
            const current = index === agentStatus.log.length - 1;
            return (
              <motion.div key={entry.id} custom={index} initial="hidden" animate="visible" variants={fadeUp}>
                {current ? (
                  <span className="text-[var(--accent)]">
                    ? <span className="text-[var(--t2)]">{entry.message}</span>
                    <span className="ml-[3px] inline-block h-[11px] w-px translate-y-[2px] bg-[var(--accent)] anim-blink" />
                  </span>
                ) : (
                  <span>
                    — {entry.message}
                    <span className="ml-1 text-[var(--t4)]">{formatMonoTime(entry.timestamp)}</span>
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
