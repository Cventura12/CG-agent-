import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fadeUp } from "../../lib/animations";
import { formatLongDate, formatTimeAgo } from "../../lib/formatters";
import { useAppStore } from "../../store/appStore";
import type { AgentStatus, Job, QueueItem, User, VoiceCallSession } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { InputSourceIcon } from "../ui/InputSourceIcon";
import { VoiceSessionList } from "../voice/VoiceSessionList";
import { ZeroDragOnboarding } from "../onboarding/ZeroDragOnboarding";
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
  voiceSessions?: VoiceCallSession[];
  setupStepsCompleted?: 0 | 1 | 2 | 3;
  currentTime?: Date;
}

type BudgetOverviewSummary = {
  total_jobs: number;
  flagged_jobs: number;
  stale_pending_jobs: number;
  total_pending_value: number;
};

type BudgetOverviewResponse = {
  summary: BudgetOverviewSummary;
};

function deriveSetupSteps(queueItems: QueueItem[], openQuotes: number, followUpsDue: number, recentJobs: Job[]): 0 | 1 | 2 | 3 {
  if (openQuotes > 0 || followUpsDue > 0) return 3;
  if (queueItems.some((item) => item.status === "approved" || item.status === "dismissed" || item.status === "snoozed")) return 2;
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
  voiceSessions,
  requestVoiceTransfer,
  setupStepsCompleted,
  currentTime,
}: Required<TodayViewProps> & { requestVoiceTransfer: (id: string) => void }) {
  const navigate = useNavigate();
  const pendingItems = queueItems.filter((item) => item.status === "pending" || item.status === "manual_review");
  const urgentItems = pendingItems.filter((item) => item.urgent);
  const firstName = user.name.split(" ")[0] ?? user.name;
  const [budgetSummary, setBudgetSummary] = useState<BudgetOverviewSummary | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const apiUrl = import.meta.env.VITE_API_URL;
  const apiKey = import.meta.env.VITE_API_KEY;

  useEffect(() => {
    if (!apiUrl || !apiKey) {
      setBudgetError("Budget API not configured.");
      return;
    }
    setBudgetLoading(true);
    setBudgetError(null);
    fetch(`${apiUrl}/budget/overview`, {
      headers: { "X-API-Key": apiKey },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed");
        }
        return response.json() as Promise<BudgetOverviewResponse>;
      })
      .then((payload) => setBudgetSummary(payload.summary))
      .catch(() => setBudgetError("Could not load budget overview."))
      .finally(() => setBudgetLoading(false));
  }, [apiKey, apiUrl]);

  return (
    <div className="flex h-full min-w-0 overflow-hidden bg-[var(--bg)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StatRow queueItems={queueItems} openQuotes={openQuotes} followUpsDue={followUpsDue} activeJobs={activeJobs} />
        <div className="border-b border-[var(--line)] px-3 py-3 sm:px-5">
          <div className="flex flex-col gap-2 rounded-md border border-[var(--line-2)] bg-[var(--bg-2)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[12px] text-[var(--t1)]">
              <AlertTriangle className="h-[14px] w-[14px] text-[var(--accent)]" strokeWidth={2} />
              {budgetLoading ? (
                <span>Loading budget signal...</span>
              ) : budgetError ? (
                <span className="text-[var(--t2)]">{budgetError}</span>
              ) : budgetSummary ? (
                <span>
                  Budget at risk: {budgetSummary.flagged_jobs} flagged · ${budgetSummary.total_pending_value.toLocaleString()} pending · {budgetSummary.stale_pending_jobs} stale
                </span>
              ) : (
                <span className="text-[var(--t2)]">Budget signal unavailable</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => navigate("/jobs")}
              className="text-left text-[11px] font-medium text-[var(--accent-2)] transition hover:text-[var(--t1)]"
            >
              Review budgets →
            </button>
          </div>
        </div>

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
              <ZeroDragOnboarding />
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
                            {item.status === "manual_review" ? <Badge label="Manual review" color="accent" /> : null}
                          </div>
                          <div className="mt-1 text-[12px] leading-relaxed text-[var(--t2)]">{item.description}</div>
                          {item.status === "manual_review" && item.manualReviewReason ? (
                            <div className="mt-2 text-[11px] text-[var(--accent-2)]">{item.manualReviewReason}</div>
                          ) : null}
                          <div className="mt-2 font-mono text-[10px] text-[var(--t3)]">{item.jobName ?? "Unassigned"} · {formatTimeAgo(item.createdAt)}</div>
                        </div>
                        <ArrowRight className="mt-[4px] h-[14px] w-[14px] text-[var(--t3)]" strokeWidth={2} />
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.section>
            <div className="mt-3 sm:mt-5">
              <VoiceSessionList
                sessions={voiceSessions}
                detail="Streaming calls, office transfers, and saved recordings stay visible here even when downstream routing needs help."
                onRequestTransfer={requestVoiceTransfer}
              />
            </div>
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
  const voiceSessions = useAppStore((state) => state.voiceSessions);
  const requestVoiceTransfer = useAppStore((state) => state.requestVoiceTransfer);

  const user = props.user ?? storeUser ?? { id: "user", name: "Arbor Agent", initials: "AR", role: "Operator", companyName: "Arbor" };
  const agentStatus = props.agentStatus ?? storeAgentStatus;
  const queueItems = props.queueItems ?? storeQueueItems;
  const openQuotes = props.openQuotes ?? storeQuotes.filter((quote) => ["draft", "sent", "viewed"].includes(quote.status)).length;
  const followUpsDue = props.followUpsDue ?? storeFollowUps.filter((followUp) => followUp.status === "scheduled" || followUp.status === "overdue").length;
  const activeJobs = props.activeJobs ?? storeJobs.filter((job) => job.status === "active" || job.status === "in_progress").length;
  const recentJobs = props.recentJobs ?? [...storeJobs].sort((left, right) => new Date(right.lastActivityAt ?? right.createdAt).getTime() - new Date(left.lastActivityAt ?? left.createdAt).getTime()).slice(0, 4);
  const todayVoiceSessions = props.voiceSessions ?? voiceSessions;
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
      voiceSessions={todayVoiceSessions}
      requestVoiceTransfer={requestVoiceTransfer}
      setupStepsCompleted={setupStepsCompleted}
      currentTime={currentTime}
    />
  );
}

export function TodayViewDemo() {
  return <TodayView />;
}













