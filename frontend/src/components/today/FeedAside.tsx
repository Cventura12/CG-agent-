import { Check, UserPlus } from "lucide-react";

import type { AgentStatus } from "../../types";
import { Button } from "../ui/Button";
import { SectionLabel } from "../ui/SectionLabel";
import { AgentLog } from "./AgentLog";

const setupSteps = [
  { title: "Connect an input", detail: "Phone, transcript, or SMS" },
  { title: "Review queue items", detail: "Agent extracts actions for you" },
  { title: "Approve and send", detail: "Quotes, follow-ups, change orders" },
];

export interface FeedAsideProps {
  setupStepsCompleted: 0 | 1 | 2 | 3;
  agentStatus: AgentStatus;
}

export function FeedAside({ setupStepsCompleted, agentStatus }: FeedAsideProps) {
  return (
    <aside className="scrollbar-none w-full shrink-0 overflow-y-auto p-[14px] xl:w-[260px]">
      <div className="flex flex-col gap-[14px]">
        {setupStepsCompleted < 3 ? (
          <section className="rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)] p-[14px]">
            <SectionLabel>Getting started</SectionLabel>
            <div className="mt-2">
              {setupSteps.map((step, index) => {
                const done = index < setupStepsCompleted;
                return (
                  <div key={step.title} className={`flex gap-[10px] py-[9px] ${index < setupSteps.length - 1 ? "border-b border-[var(--line)]" : ""}`}>
                    <span className={`mt-[1px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border font-mono text-[9px] ${done ? "border-[var(--green)] bg-[var(--green-b)] text-[var(--green)]" : "border-[var(--line-3)] text-[var(--t3)]"}`}>
                      {done ? <Check className="h-[9px] w-[9px]" strokeWidth={2.6} /> : index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-[var(--t1)]">{step.title}</div>
                      <div className="mt-[2px] text-[10px] leading-[1.4] text-[var(--t3)]">{step.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="rounded-[8px] border border-[var(--acl)] bg-[var(--acl-2)] p-[14px]">
          <div className="text-[12px] font-medium text-[var(--t1)]">Invite the office in</div>
          <div className="mt-[6px] text-[11px] leading-[1.5] text-[var(--t2)]">
            Pull in the person routing calls or owning customer follow-through so the agent sees the real operating context.
          </div>
          <Button variant="outline-accent" className="mt-3 w-full justify-center py-[7px] text-[11px]" leftIcon={<UserPlus className="h-[13px] w-[13px]" strokeWidth={2} />}>
            Invite teammate
          </Button>
        </section>

        <AgentLog agentStatus={agentStatus} />
      </div>
    </aside>
  );
}

