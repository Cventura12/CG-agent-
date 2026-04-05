import { ArrowRightLeft, Headphones, PhoneCall, Radio } from "lucide-react";

import { formatMonoTime, formatTimeAgo } from "../../lib/formatters";
import type { VoiceCallSession } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { SectionLabel } from "../ui/SectionLabel";

function statusTone(status: VoiceCallSession["status"]): { color: "green" | "amber" | "blue" | "accent" | "red" | "muted"; label: string } {
  if (status === "streaming" || status === "active") return { color: "accent", label: "Live" };
  if (status === "awaiting_caller") return { color: "amber", label: "Waiting" };
  if (status === "ready_for_review") return { color: "blue", label: "Review" };
  if (status === "escalated") return { color: "amber", label: "Escalated" };
  if (status === "completed") return { color: "green", label: "Completed" };
  return { color: "red", label: "Failed" };
}

function transferTone(state: VoiceCallSession["transferState"]): { color: "green" | "amber" | "accent" | "red" | "muted"; label: string } {
  if (state === "requested") return { color: "amber", label: "Transfer requested" };
  if (state === "dialing") return { color: "accent", label: "Dialing office" };
  if (state === "transferred") return { color: "green", label: "Transferred" };
  if (state === "saved_for_review") return { color: "muted", label: "Saved for review" };
  if (state === "failed") return { color: "red", label: "Transfer failed" };
  return { color: "muted", label: "Agent handled" };
}

function goalLabel(goal: VoiceCallSession["goal"]): string {
  return goal.replace(/_/g, " ");
}

function debugStateLabel(value?: string): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized.replace(/_/g, " ");
}

export interface VoiceSessionListProps {
  sessions: VoiceCallSession[];
  title?: string;
  detail?: string;
  emptyDescription?: string;
  onRequestTransfer?: (id: string) => void;
  compact?: boolean;
}

export function VoiceSessionList({
  sessions,
  title = "Live call history",
  detail = "Calls the agent handled or routed for office review.",
  emptyDescription = "Live calls will show up here with transfer state and recordings once they start coming in.",
  onRequestTransfer,
  compact = false,
}: VoiceSessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)] p-4 sm:p-5">
        <SectionLabel>{title}</SectionLabel>
        <div className="mt-2">
          <EmptyState icon={Headphones} title="No live calls yet" description={emptyDescription} />
        </div>
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)]">
      <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <SectionLabel>{title}</SectionLabel>
        <div className="mt-2 text-[12px] text-[var(--t2)]">{detail}</div>
      </div>
      <div className="divide-y divide-[var(--line)]">
        {sessions.map((session) => {
          const status = statusTone(session.status);
          const transfer = transferTone(session.transferState);
          const canRequestTransfer = Boolean(onRequestTransfer) && !["transferred", "dialing", "failed"].includes(session.transferState);
          return (
            <article key={session.id} className={compact ? "px-4 py-4" : "px-4 py-4 sm:px-5"}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[13px] font-medium text-[var(--t1)]">{session.jobName ?? session.callerName}</div>
                    <Badge color={status.color} label={status.label} />
                    <Badge color={transfer.color} label={transfer.label} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--t3)]">
                    <span>{session.callerName}</span>
                    <span>-</span>
                    <span className="font-mono">{session.callerPhone}</span>
                    <span>-</span>
                    <span className="font-mono">{goalLabel(session.goal)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-[var(--t3)]">
                  <span>{formatMonoTime(session.updatedAt)}</span>
                  <span>-</span>
                  <span>{formatTimeAgo(session.updatedAt)}</span>
                </div>
              </div>

              <div className="mt-3 text-[13px] leading-relaxed text-[var(--t1)]">{session.summary}</div>

              {session.lastPrompt ? (
                <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--bg-3)] px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--t3)]">
                    <Radio className="h-[12px] w-[12px]" strokeWidth={2} />
                    Agent prompt
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--t2)]">{session.lastPrompt}</div>
                </div>
              ) : null}

              {session.lastCallerTranscript ? (
                <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--bg-3)] px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--t3)]">
                    <PhoneCall className="h-[12px] w-[12px]" strokeWidth={2} />
                    Last caller turn
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--t2)]">{session.lastCallerTranscript}</div>
                </div>
              ) : null}

              {session.debug ? (
                <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--bg-3)] px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--t3)]">
                    <Radio className="h-[12px] w-[12px]" strokeWidth={2} />
                    Voice debug
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {debugStateLabel(session.debug.vadTurnState) ? (
                      <span className="rounded-[4px] border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[10px] text-[var(--t2)]">
                        Turn end: {debugStateLabel(session.debug.vadTurnState)}
                      </span>
                    ) : null}
                    <span className="rounded-[4px] border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[10px] text-[var(--t2)]">
                      Interruptions: {session.debug.interruptionCount}
                    </span>
                    {session.debug.lastInterruptionReason ? (
                      <span className="rounded-[4px] border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-[10px] text-[var(--t2)]">
                        Last: {debugStateLabel(session.debug.lastInterruptionReason)}
                      </span>
                    ) : null}
                  </div>

                  {session.debug.promptHistory.length > 0 ? (
                    <div className="mt-3">
                      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--t3)]">Prompt history</div>
                      <div className="mt-2 space-y-2">
                        {session.debug.promptHistory.slice(-3).reverse().map((entry) => (
                          <div key={`${session.id}-${entry.at}-${entry.text}`} className="rounded-[6px] border border-[var(--line)] bg-[var(--bg)] px-2.5 py-2">
                            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-[var(--t3)]">
                              <span>{entry.phase}</span>
                              <span>-</span>
                              <span>{formatMonoTime(entry.at)}</span>
                            </div>
                            <div className="mt-1 text-[12px] text-[var(--t2)]">{entry.text}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {session.debug.interruptionHistory.length > 0 ? (
                    <div className="mt-3">
                      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--t3)]">Interruptions</div>
                      <div className="mt-2 space-y-2">
                        {session.debug.interruptionHistory.slice(-2).reverse().map((entry) => (
                          <div key={`${session.id}-${entry.at}-${entry.reason}`} className="rounded-[6px] border border-[var(--line)] bg-[var(--bg)] px-2.5 py-2">
                            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-[var(--t3)]">
                              <span>{debugStateLabel(entry.reason)}</span>
                              <span>-</span>
                              <span>{formatMonoTime(entry.at)}</span>
                            </div>
                            {entry.prompt ? <div className="mt-1 text-[12px] text-[var(--t2)]">Prompt: {entry.prompt}</div> : null}
                            {entry.excerpt ? <div className="mt-1 text-[12px] text-[var(--t2)]">Caller: {entry.excerpt}</div> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {Object.entries(session.extractedFields)
                  .slice(0, compact ? 3 : 5)
                  .map(([key, value]) => (
                    <span key={`${session.id}-${key}`} className="rounded-[4px] border border-[var(--line)] bg-[var(--bg-3)] px-2 py-1 font-mono text-[10px] text-[var(--t2)]">
                      {key.replace(/_/g, " ")}: {value}
                    </span>
                  ))}
              </div>

              {session.recordingUrl ? (
                <div className="mt-3">
                  <audio controls preload="none" className="h-[38px] w-full opacity-80">
                    <source src={session.recordingUrl} type="audio/wav" />
                  </audio>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {canRequestTransfer ? (
                  <Button
                    variant="outline-accent"
                    leftIcon={<ArrowRightLeft className="h-[13px] w-[13px]" strokeWidth={2} />}
                    className="py-[6px]"
                    onClick={() => onRequestTransfer?.(session.id)}
                  >
                    Route to office
                  </Button>
                ) : null}
                {session.transferTarget ? (
                  <span className="font-mono text-[10px] text-[var(--t3)]">Target - {session.transferTarget}</span>
                ) : null}
                {session.recordingDurationSeconds ? (
                  <span className="font-mono text-[10px] text-[var(--t3)]">
                    Recording - {session.recordingDurationSeconds.toFixed(1)}s
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

