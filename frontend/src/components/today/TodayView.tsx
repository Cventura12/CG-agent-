import { AlertTriangle, ArrowRight, PhoneCall } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { formatLongDate, formatTimeAgo } from "../../lib/formatters";
import { useAppStore } from "../../store/appStore";
import type { AgentStatus, Job, QueueItem, User, VoiceCallSession } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { InputSourceIcon } from "../ui/InputSourceIcon";

export interface TodayViewProps {
  user?: User;
  agentStatus?: AgentStatus;
  queueItems?: QueueItem[];
  openQuotes?: number;
  followUpsDue?: number;
  activeJobs?: number;
  recentJobs?: Job[];
  voiceSessions?: VoiceCallSession[];
  currentTime?: Date;
}

function StatsStrip({ openQueue, openQuotes, followUpsDue, activeJobs }: {
  openQueue: number;
  openQuotes: number;
  followUpsDue: number;
  activeJobs: number;
}) {
  const cards = [
    { label: "Open queue", value: openQueue, hint: openQueue > 0 ? "Needs review" : "All clear" },
    { label: "Active quotes", value: openQuotes, hint: openQuotes > 0 ? "Drafts in flight" : "No quotes moving" },
    { label: "Follow-ups due", value: followUpsDue, hint: followUpsDue > 0 ? "Needs pressure" : "Nothing scheduled" },
    { label: "Active jobs", value: activeJobs, hint: activeJobs > 0 ? "Work in motion" : "No active jobs" },
  ];

  return (
    <section className="grid grid-cols-2 border-b border-[var(--line)] sm:grid-cols-4">
      {cards.map((card, index) => (
        <div
          key={card.label}
          className={`px-4 py-4 sm:px-5 ${index % 2 === 0 ? "border-r border-[var(--line)]" : ""} ${index < 2 ? "border-b border-[var(--line)] sm:border-b-0" : ""} ${index < cards.length - 1 ? "sm:border-r sm:border-[var(--line)]" : ""} ${index === cards.length - 1 ? "sm:border-r-0" : ""}`}
        >
          <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--t3)]">{card.label}</div>
          <div className="mb-1 font-mono text-[22px] tracking-[-1px] text-[var(--t1)]">{card.value}</div>
          <div className="font-mono text-[10px] text-[var(--t3)]">{card.hint}</div>
        </div>
      ))}
    </section>
  );
}

function TodayViewContent({
  user,
  agentStatus,
  queueItems,
  openQuotes,
  followUpsDue,
  activeJobs,
  recentJobs,
  voiceSessions,
  currentTime,
}: Required<TodayViewProps>) {
  const navigate = useNavigate();
  const pendingItems = queueItems.filter((item) => item.status === "pending" || item.status === "manual_review");
  const urgentItems = pendingItems.filter((item) => item.urgent);
  const latestVoice = voiceSessions.slice(0, 3);
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-[var(--bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StatsStrip
          openQueue={pendingItems.length}
          openQuotes={openQuotes}
          followUpsDue={followUpsDue}
          activeJobs={activeJobs}
        />

        {urgentItems.length > 0 ? (
          <div className="border-b border-[var(--line)] px-3 py-3 sm:px-5">
            <div className="flex flex-col gap-2 rounded-md border border-[var(--amber-b)] border-l-2 border-l-[var(--amber)] bg-[var(--amber-b)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-[12px] text-[var(--t1)]">
                <AlertTriangle className="h-[14px] w-[14px] text-[var(--amber)]" strokeWidth={2} />
                <span>{urgentItems.length} items need immediate review</span>
              </div>
              <button type="button" onClick={() => navigate("/queue")} className="text-left text-[11px] font-medium text-[var(--accent-2)] transition hover:text-[var(--t1)]">
                Go to queue →
              </button>
            </div>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="scrollbar-none min-h-0 overflow-y-auto p-3 sm:p-5">
            <section className="overflow-hidden rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)]">
              <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <div className="text-[13px] font-medium text-[var(--t1)]">Today</div>
                  <div className="mt-1 text-[12px] text-[var(--t2)]">
                    {agentStatus.active ? `Watching live for ${firstName} · ${formatLongDate(currentTime)}` : "Offline mode"}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => navigate("/queue")} className="w-full justify-center sm:w-auto">Open queue</Button>
              </div>

              <div className="p-4 sm:p-5">
                {pendingItems.length === 0 ? (
                  <div className="rounded-[10px] border border-[var(--line)] bg-[var(--bg-3)] p-4 text-[13px] text-[var(--t2)]">
                    No pending queue items right now. The agent is watching for the next field update.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-3)]">
                    {pendingItems.map((item, index) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate("/queue")}
                        className={`flex w-full items-start gap-3 px-4 py-[14px] text-left transition hover:bg-[var(--bg-4)] ${index < pendingItems.length - 1 ? "border-b border-[var(--line)]" : ""}`}
                      >
                        <InputSourceIcon source={item.source} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-[13px] font-medium text-[var(--t1)]">{item.title}</div>
                            {item.urgent ? <Badge label="Urgent" color="amber" /> : null}
                            {item.status === "manual_review" ? <Badge label="Manual review" color="accent" /> : null}
                          </div>
                          <div className="mt-1 text-[12px] leading-relaxed text-[var(--t2)]">{item.description}</div>
                          <div className="mt-2 font-mono text-[10px] text-[var(--t3)]">{item.jobName ?? "Unassigned"} · {formatTimeAgo(item.createdAt)}</div>
                        </div>
                        <ArrowRight className="mt-[4px] h-[14px] w-[14px] text-[var(--t3)]" strokeWidth={2} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="border-t border-[var(--line)] bg-[var(--bg)] p-[14px] xl:border-l xl:border-t-0">
            <div className="flex flex-col gap-[14px]">
              <section className="rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)] p-[14px]">
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--t3)]">Agent activity</div>
                <div className="mt-3 space-y-2">
                  {agentStatus.log.slice(0, 5).map((entry, index) => (
                    <div key={entry.id} className={`text-[11px] leading-[1.6] ${index === 0 ? "text-[var(--t1)]" : "text-[var(--t2)]"}`}>
                      <span className="font-mono text-[10px] text-[var(--t3)]">{formatTimeAgo(entry.timestamp)}</span>
                      <div className="mt-1">{entry.message}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)] p-[14px]">
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--t3)]">Live call history</div>
                <div className="mt-3 space-y-3">
                  {latestVoice.length === 0 ? (
                    <div className="text-[12px] text-[var(--t2)]">No live calls yet.</div>
                  ) : (
                    latestVoice.map((session) => (
                      <div key={session.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--bg-3)] p-3">
                        <div className="flex items-center gap-2 text-[12px] text-[var(--t1)]">
                          <PhoneCall className="h-[12px] w-[12px] text-[var(--accent)]" strokeWidth={2} />
                          <span>{session.jobName ?? session.callerName}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--t2)]">{session.summary}</div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)] p-[14px]">
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--t3)]">Recent jobs</div>
                <div className="mt-3 space-y-3">
                  {recentJobs.map((job) => (
                    <div key={job.id} className="rounded-[8px] border border-[var(--line)] bg-[var(--bg-3)] p-3">
                      <div className="text-[12px] font-medium text-[var(--t1)]">{job.name}</div>
                      <div className="mt-1 text-[11px] text-[var(--t2)]">{job.customerName}</div>
                      <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">{formatTimeAgo(job.lastActivityAt ?? job.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function TodayView(props: TodayViewProps) {
  const storeUser = useAppStore((state) => state.user);
  const storeAgentStatus = useAppStore((state) => state.agentStatus);
  const storeQueueItems = useAppStore((state) => state.queueItems);
  const storeQuotes = useAppStore((state) => state.quotes);
  const storeFollowUps = useAppStore((state) => state.followUps);
  const storeJobs = useAppStore((state) => state.jobs);
  const voiceSessions = useAppStore((state) => state.voiceSessions);

  const user = props.user ?? storeUser ?? { id: "user", name: "Arbor Agent", initials: "AR", role: "Operator", companyName: "Arbor" };
  const agentStatus = props.agentStatus ?? storeAgentStatus;
  const queueItems = props.queueItems ?? storeQueueItems;
  const openQuotes = props.openQuotes ?? storeQuotes.filter((quote) => ["draft", "sent", "viewed"].includes(quote.status)).length;
  const followUpsDue = props.followUpsDue ?? storeFollowUps.filter((followUp) => followUp.status === "scheduled" || followUp.status === "overdue").length;
  const activeJobs = props.activeJobs ?? storeJobs.filter((job) => job.status === "active" || job.status === "in_progress").length;
  const recentJobs = props.recentJobs ?? [...storeJobs]
    .sort((left, right) => new Date(right.lastActivityAt ?? right.createdAt).getTime() - new Date(left.lastActivityAt ?? left.createdAt).getTime())
    .slice(0, 4);
  const todayVoiceSessions = props.voiceSessions ?? voiceSessions;
  const currentTime = props.currentTime ?? new Date();

  return (
    <TodayViewContent
      user={user}
      agentStatus={agentStatus}
      queueItems={queueItems}
      openQuotes={openQuotes}
      followUpsDue={followUpsDue}
      activeJobs={activeJobs}
      recentJobs={recentJobs}
      voiceSessions={todayVoiceSessions}
      currentTime={currentTime}
    />
  );
}

export function TodayViewDemo() {
  return <TodayView />;
}
