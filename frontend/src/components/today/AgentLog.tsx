import { motion } from "framer-motion";

import type { AgentStatus } from "../../types/today";
import { fadeUp } from "./animations";

type LogLine = {
  id: string;
  current?: boolean;
  text: string;
};

function formatLastActivity(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "no recent events";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function buildLogLines(agentStatus: AgentStatus): LogLine[] {
  if (!agentStatus.active) {
    return [
      { id: "offline-1", text: "agent paused" },
      { id: "offline-2", text: `last seen ${formatLastActivity(agentStatus.lastActivity)}` },
      { id: "offline-3", current: true, text: "waiting for runtime to reconnect" },
    ];
  }

  return [
    { id: "active-1", text: "agent initialized" },
    { id: "active-2", text: `${agentStatus.itemsProcessed} items processed today` },
    { id: "active-3", text: `last activity ${formatLastActivity(agentStatus.lastActivity)}` },
    { id: "active-4", current: true, text: `waiting for ${agentStatus.waitingFor}` },
  ];
}

export interface AgentLogProps {
  agentStatus: AgentStatus;
}

export function AgentLog({ agentStatus }: AgentLogProps) {
  const lines = buildLogLines(agentStatus);

  return (
    <div>
      <div className="mb-[10px] text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--t3)]">
        Agent activity
      </div>
      <div className="rounded-[8px] border border-[var(--line-2)] bg-[var(--bg-3)] px-[12px] py-[10px]">
        <div className="space-y-[2px] font-mono text-[11px] leading-[1.8] text-[var(--t3)]">
          {lines.map((line, index) => (
            <motion.div
              key={line.id}
              custom={index}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
            >
              {line.current ? (
                <span className="text-[var(--accent)]">
                  ? <span className="text-[var(--t2)]">{line.text}</span>
                  <span className="ml-[3px] inline-block h-[11px] w-px translate-y-[2px] bg-[var(--accent)] animate-blink" />
                </span>
              ) : (
                <span>— {line.text}</span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
