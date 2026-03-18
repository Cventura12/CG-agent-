import { motion } from "framer-motion";
import { Clock3, Link2, PhoneCall, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { InputSource, TodayViewProps } from "../../types/today";
import { Badge } from "../ui/Badge";
import { AgentFeedEmpty } from "./AgentFeedEmpty";
import { fadeUp } from "./animations";
import { FeedAside } from "./FeedAside";
import { IconRail } from "./IconRail";
import { Sidebar } from "./Sidebar";
import { StatRow } from "./StatRow";
import { Topbar } from "./Topbar";

function parseCurrentTime(currentTime?: Date): Date {
  if (currentTime instanceof Date && !Number.isNaN(currentTime.getTime())) {
    return currentTime;
  }
  return new Date();
}

function formatRelative(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "now";
  }

  const deltaMs = Date.now() - parsed.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) return "now";
  if (deltaMs < hour) return `${Math.max(1, Math.floor(deltaMs / minute))}m`;
  if (deltaMs < day) return `${Math.max(1, Math.floor(deltaMs / hour))}h`;
  return `${Math.max(1, Math.floor(deltaMs / day))}d`;
}

function sourceTone(source: InputSource) {
  if (source === "CALL") return "accent" as const;
  if (source === "SMS") return "warn" as const;
  if (source === "EMAIL") return "neutral" as const;
  return "blue" as const;
}

function sourceIcon(source: InputSource) {
  if (source === "CALL") return <PhoneCall className="h-[12px] w-[12px]" strokeWidth={2} />;
  if (source === "UPLOAD") return <Upload className="h-[12px] w-[12px]" strokeWidth={2} />;
  return <Link2 className="h-[12px] w-[12px]" strokeWidth={2} />;
}

export function TodayView({
  user,
  agentStatus,
  queueItems,
  openQuotes,
  followUpsDue,
  activeJobs,
  recentJobs,
  setupStepsCompleted,
  currentTime,
}: TodayViewProps) {
  const navigate = useNavigate();
  const now = parseCurrentTime(currentTime);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)] text-[var(--t1)]">
      <IconRail initials={user.initials} />
      <Sidebar agentStatus={agentStatus} queueItems={queueItems} recentJobs={recentJobs} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          currentTime={now}
          onImportTranscript={() => navigate("/queue")}
          onNewQuote={() => navigate("/quote")}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <StatRow
              queueItems={queueItems}
              openQuotes={openQuotes}
              followUpsDue={followUpsDue}
              activeJobs={activeJobs}
            />

            <div className="today-scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <motion.section
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                custom={4}
                className="min-h-full overflow-hidden rounded-[12px] border border-[var(--line-2)] bg-[var(--bg-2)]"
              >
                <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
                  <div>
                    <div className="text-[14px] font-medium text-[var(--t1)]">Needs review</div>
                    <div className="mt-[3px] text-[11px] text-[var(--t3)]">
                      The agent is surfacing live calls, threads, and unresolved work.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/queue")}
                    className="text-[11px] font-medium text-[var(--accent-2)] transition hover:text-[var(--t1)]"
                  >
                    Open queue ?
                  </button>
                </div>

                <div className="border-b border-[var(--line)] px-5 py-[10px]">
                  <div className="relative h-[2px] overflow-hidden rounded-sm bg-[var(--bg-4)]">
                    <div className="animate-scan absolute inset-y-0 w-[30%] bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent" />
                  </div>
                </div>

                <div className="p-5">
                  {queueItems.length === 0 ? (
                    <AgentFeedEmpty
                      onPhoneClick={() => navigate("/onboarding")}
                      onUploadClick={() => navigate("/quote")}
                      onSmsClick={() => navigate("/onboarding")}
                    />
                  ) : (
                    <div className="overflow-hidden rounded-[10px] border border-[var(--line-2)] bg-[var(--bg-3)]">
                      {queueItems.map((item, index) => (
                        <motion.div
                          key={item.id}
                          custom={index}
                          initial="hidden"
                          animate="visible"
                          variants={fadeUp}
                          className={`flex items-start gap-[14px] px-4 py-[14px] ${
                            index < queueItems.length - 1 ? "border-b border-[var(--line)]" : ""
                          }`}
                        >
                          <span
                            className={`mt-[6px] h-[8px] w-[8px] shrink-0 rounded-full ${
                              item.urgent ? "bg-[var(--accent)]" : "bg-[var(--blue)]"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] leading-[1.55] text-[var(--t1)]">{item.description}</div>
                            {item.jobName ? (
                              <div className="mt-[6px] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--t3)]">
                                {item.jobName}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-[10px]">
                            <Badge tone={sourceTone(item.source)} className="gap-[5px] normal-case tracking-normal">
                              {sourceIcon(item.source)}
                              {item.source}
                            </Badge>
                            <div className="inline-flex items-center gap-[5px] font-mono text-[10px] text-[var(--t3)]">
                              <Clock3 className="h-[11px] w-[11px]" strokeWidth={2} />
                              {formatRelative(item.createdAt)}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.section>
            </div>
          </div>

          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={5} className="shrink-0">
            <FeedAside setupStepsCompleted={setupStepsCompleted} agentStatus={agentStatus} />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
