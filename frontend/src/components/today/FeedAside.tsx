import { Check, UserPlus } from "lucide-react";

import type { AgentStatus } from "../../types/today";
import { Button } from "../ui/Button";
import { AgentLog } from "./AgentLog";

const setupSteps = [
  {
    title: "Connect an input",
    detail: "Phone, transcript, or SMS",
  },
  {
    title: "Review queue items",
    detail: "Agent extracts actions for you",
  },
  {
    title: "Approve and send",
    detail: "Quotes, follow-ups, change orders",
  },
];

export interface FeedAsideProps {
  setupStepsCompleted: 0 | 1 | 2 | 3;
  agentStatus: AgentStatus;
}

export function FeedAside({ setupStepsCompleted, agentStatus }: FeedAsideProps) {
  return (
    <aside className="today-scrollbar-hidden w-[260px] shrink-0 overflow-y-auto border-l border-[var(--line)] p-[14px]">
      <div className="flex flex-col gap-[14px]">
        {setupStepsCompleted < 3 ? (
          <section className="rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)] p-[14px]">
            <div className="mb-[10px] text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--t3)]">
              Getting started
            </div>
            <div>
              {setupSteps.map((step, index) => {
                const done = index < setupStepsCompleted;

                return (
                  <div
                    key={step.title}
                    className={`flex gap-[10px] py-[9px] ${index < setupSteps.length - 1 ? "border-b border-[var(--line)]" : ""}`}
                  >
                    <span
                      className={`mt-[1px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border text-[9px] font-mono ${
                        done
                          ? "border-[var(--green)] bg-[var(--green-b)] text-[var(--green)]"
                          : "border-[var(--line-3)] text-[var(--t3)]"
                      }`}
                    >
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
          <div className="text-[12px] font-medium text-[var(--t1)]">Bring the field in</div>
          <div className="mt-[6px] text-[11px] leading-[1.5] text-[var(--t2)]">
            Invite the person catching calls or field updates so the agent sees the real work
            earlier in the day.
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full justify-center py-[7px] text-[11px]"
            leftIcon={<UserPlus className="h-[13px] w-[13px]" strokeWidth={2} />}
          >
            Invite teammate
          </Button>
        </section>

        <AgentLog agentStatus={agentStatus} />
      </div>
    </aside>
  );
}
