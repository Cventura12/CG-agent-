import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Clock3 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { fadeUp } from "../../lib/animations";
import { formatLongDate, formatTimeAgo } from "../../lib/formatters";
import { useAppStore } from "../../store/appStore";
import type { AgentStatus, Job, QueueItem, User } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { InputSourceIcon } from "../ui/InputSourceIcon";
import { AgentFeedEmpty } from "./AgentFeedEmpty";
import { FeedAside } from "./FeedAside";
import { StatRow } from "./StatRow";

export interface TodayViewProps {
  user?: User;
  agentStatus?: AgentStatus;
  queueItems?: QueueItem[];
  openQuotes?: number;
  followUpsDue?: number;
  activeJobs?: number;
  recentJobs?: Job[];
  setupStepsCompleted?: 0 | 1 | 2 | 3;
  currentTime?: Date;
}

function deriveSetupSteps(queueItems: QueueItem[], openQuotes: number, followUpsDue: number, recentJobs: Job[]): 0 | 1 | 2 | 3 {
  if (openQuotes > 0 || followUpsDue > 0) return 3;
  if (queueItems.some((item) => item.status !== "pending")) return 2;
  if (queueItems.length > 0 || recentJobs.length > 0) return 1;
  return 0;
}

function TodayViewContent({
  user,
  agentStatus,
  queueItems,
  openQuotes,
  followUpsDue,
  activeJobs,
  recentJobs,
  setupStepsCompleted,
  currentTime,
}: Required<TodayViewProps>) {
  const navigate = useNavigate();
  const pendingItems = queueItems.filter((item) => item.status === "pending");
  const urgentItems = pendingItems.filter((item) => item.urgent);
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-[var(--bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StatRow queueItems={queueItems} openQuotes={openQuotes} followUpsDue={followUpsDue} activeJobs={activeJobs} />

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

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="scrollbar-none min-h-0 overflow-y-auto p-3 sm:p-5">
            <motion.section initial="hidden" animate="visible" variants={fadeUp} custom={4} className="overflow-hidden rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)]">
              <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                  <div className="text-[13px] font-medium text-[var(--t1)]">Agent feed</div>
                  <div className="mt-1 text-[12px] text-[var(--t2)]">
                    {agentStatus.active ? `Watching live for ${firstName} · ${formatLongDate(currentTime)}` : "Offline mode"}
                  </div>
                </div>
                <Button variant="ghost" onClick={() => navigate("/queue")} className="w-full justify-center sm:w-auto">Open queue</Button>
              </div>
              <div className="border-b border-[var(--line)] px-4 py-2 sm:px-5">
                <div className="relative h-[2px] overflow-hidden rounded-sm bg-[var(--bg-4)]">
                  <div className="anim-scan absolute inset-y-0 w-[30%] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent" />
                </div>
              </div>
              <div className="p-4 sm:p-5">
                {pendingItems.length === 0 ? (
                  <AgentFeedEmpty
                    onPhoneClick={() => navigate("/queue")}
                    onUploadClick={() => navigate("/quotes")}
                    onSmsClick={() => navigate("/queue")}
                  />
                ) : (
                  <div className="overflow-hidden rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-3)]">
                    {pendingItems.map((item, index) => (
                      <motion.button
                        key={item.id}
                        type="button"
                        custom={index}
                        initial="hidden"
                        animate="visible"
                        variants={fadeUp}
                        onClick={() => navigate(`/queue/${item.id}`)}
                        className={`flex w-full items-start gap-3 px-4 py-[14px] text-left transition hover:bg-[var(--bg-4)] ${index < pendingItems.length - 1 ? "border-b border-[var(--line)]" : ""}`}
                      >
                        <InputSourceIcon source={item.source} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-[13px] font-medium text-[var(--t1)]">{item.title}</div>
                            {item.urgent ? <Badge label="Urgent" color="amber" /> : null}
                          </div>
                          <div className="mt-1 text-[12px] leading-relaxed text-[var(--t2)]">{item.description}</div>
                          <div className="mt-2 font-mono text-[10px] text-[var(--t3)]">{item.jobName ?? "Unassigned"} · {formatTimeAgo(item.createdAt)}</div>
                        </div>
                        <ArrowRight className="mt-[4px] h-[14px] w-[14px] text-[var(--t3)]" strokeWidth={2} />
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.section>

            {recentJobs.length > 0 ? (
              <motion.section initial="hidden" animate="visible" variants={fadeUp} custom={5} className="mt-4 overflow-hidden rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-2)]">
                <div className="border-b border-[var(--line)] px-4 py-4 sm:px-5">
                  <div className="text-[13px] font-medium text-[var(--t1)]">Recent job movement</div>
                </div>
                <div className="divide-y divide-[var(--line)]">
                  {recentJobs.map((job) => (
                    <button key={job.id} type="button" onClick={() => navigate(`/jobs/${job.id}`)} className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-[var(--bg-3)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0">
                        <div className="text-[13px] text-[var(--t1)]">{job.name}</div>
                        <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">{job.status.replace("_", " ")} · {formatTimeAgo(job.lastActivityAt ?? job.createdAt)}</div>
                      </div>
                      <div className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--t3)]">
                        <Clock3 className="h-[11px] w-[11px]" strokeWidth={2} />
                        live
                      </div>
                    </button>
                  ))}
                </div>
              </motion.section>
            ) : null}
          </div>

          <div className="border-t border-[var(--line)] bg-[var(--bg)] xl:border-l xl:border-t-0">
            <FeedAside setupStepsCompleted={setupStepsCompleted} agentStatus={agentStatus} />
          </div>
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

  const user = props.user ?? storeUser ?? { id: "user", name: "GC Agent", initials: "GC", role: "Operator", companyName: "GC Agent" };
  const agentStatus = props.agentStatus ?? storeAgentStatus;
  const queueItems = props.queueItems ?? storeQueueItems;
  const openQuotes = props.openQuotes ?? storeQuotes.filter((quote) => ["draft", "sent", "viewed"].includes(quote.status)).length;
  const followUpsDue = props.followUpsDue ?? storeFollowUps.filter((followUp) => followUp.status === "scheduled" || followUp.status === "overdue").length;
  const activeJobs = props.activeJobs ?? storeJobs.filter((job) => job.status === "active" || job.status === "in_progress").length;
  const recentJobs = props.recentJobs ?? [...storeJobs].sort((left, right) => new Date(right.lastActivityAt ?? right.createdAt).getTime() - new Date(left.lastActivityAt ?? left.createdAt).getTime()).slice(0, 4);
  const setupStepsCompleted = props.setupStepsCompleted ?? deriveSetupSteps(queueItems, openQuotes, followUpsDue, recentJobs);
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
      setupStepsCompleted={setupStepsCompleted}
      currentTime={currentTime}
    />
  );
}

export function TodayViewDemo() {
  return <TodayView />;
}


