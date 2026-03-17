import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {  ArrowRight,
  CheckCircle2,
  Clock3,
  MessageSquareWarning,
  Orbit,
  RadioTower,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

import { fetchContractorBriefing, hasContractorApiCredentials } from "../api/contractor";
import { useAnalytics } from "../hooks/useAnalytics";
import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useQueue } from "../hooks/useQueue";
import type { BriefingPayload, Job, QueueJobGroup, TranscriptInboxItem } from "../types";
import { loadCachedJson, saveCachedJson } from "../utils/offlineCache";

const BRIEFING_CACHE_KEY = "gc-agent:cache:public-briefing:v1";

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  tone: "orange" | "blue";
  ctaLabel: string;
  href: string;
  stageLabel?: string;
};

function formatRelativeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Awaiting update";
  }

  const deltaMs = Date.now() - parsed.getTime();
  const deltaHours = Math.floor(deltaMs / (1000 * 60 * 60));
  if (deltaHours < 1) return "Just now";
  if (deltaHours < 24) return `${deltaHours} hour${deltaHours === 1 ? "" : "s"} ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays === 1) return "Yesterday";
  if (deltaDays < 7) return `${deltaDays} days ago`;
  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatToday(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function openItemStageClass(stage: string | null | undefined): string {
  if (stage === "approved") return "gc-chip info";
  if (stage === "sent") return "gc-chip warn";
  if (stage === "customer-approved") return "gc-chip success";
  if (stage === "drafted") return "gc-chip soft";
  return "gc-chip soft";
}

function actionFromQueue(group: QueueJobGroup): AttentionItem {
  const latest = group.drafts[0];
  const confidence = latest?.transcript?.confidence;
  const detail = latest?.transcript?.summary || latest?.why || "Queue item needs contractor review.";
  const confidenceCopy = typeof confidence === "number" ? ` Confidence score: ${Math.round(confidence)}%.` : "";

  return {
    id: `queue-${group.job_id}`,
    title: `Approve drafted quote for ${group.job_name}`,
    detail: `${detail}${confidenceCopy}`.trim(),
    tone: "orange",
    ctaLabel: "Review",
    href: "/queue",
  };
}

function actionFromTranscript(transcript: TranscriptInboxItem): AttentionItem {
  return {
    id: `transcript-${transcript.transcript_id}`,
    title: transcript.summary || "Review unlinked call transcript",
    detail: transcript.missing_information[0]
      ? `Missing: ${transcript.missing_information[0]}`
      : "Transcript needs routing before it becomes job work.",
    tone: "orange",
    ctaLabel: "Route Call",
    href: "/queue",
  };
}

function actionFromJob(job: Job): AttentionItem {
  const financialItem = job.open_items.find((item) => item.financial_exposure);
  const changeItem = job.open_items.find((item) => item.change_related);
  const prioritizedItem = financialItem || changeItem || job.open_items[0];
  const note = prioritizedItem?.description || "Review the latest operational issue on this job.";
  if (financialItem) {
    return {
      id: `job-${job.id}`,
      title: `${job.name} has unresolved money at risk`,
      detail: prioritizedItem?.action_stage_summary || note,
      tone: "orange",
      ctaLabel: prioritizedItem?.action_stage === "approved" ? "Mark Sent" : "Review Change",
      href: `/jobs/${job.id}`,
      stageLabel: prioritizedItem?.action_stage_label,
    };
  }
  return {
    id: `job-${job.id}`,
    title: `${job.name} needs attention`,
    detail: note,
    tone: job.health === "blocked" ? "orange" : "blue",
    ctaLabel: job.health === "blocked" ? "Review Risk" : "Open Job",
    href: `/jobs/${job.id}`,
    stageLabel: prioritizedItem?.action_stage_label,
  };
}

export function BriefingPage() {
  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const isOnline = useOnlineStatus();

  const queueQuery = useQueue(currentUserId);
  const jobsQuery = useJobs(currentUserId);
  const analyticsQuery = useAnalytics(currentUserId, 30);
  const initialBriefing = loadCachedJson<BriefingPayload>(BRIEFING_CACHE_KEY) ?? undefined;
  const briefingQuery = useQuery({
    queryKey: ["public-briefing"],
    queryFn: async () => {
      const payload = await fetchContractorBriefing();
      saveCachedJson(BRIEFING_CACHE_KEY, payload);
      return payload;
    },
    enabled: hasContractorApiCredentials(),
    retry: (failureCount) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return false;
      return failureCount < 2;
    },
    staleTime: 30000,
    initialData: initialBriefing,
  });

  const jobs = jobsQuery.data?.jobs ?? [];
  const queueGroups = queueQuery.data?.jobs ?? [];
  const transcriptInbox = queueQuery.data?.inbox?.transcripts ?? [];
  const analytics = analyticsQuery.data;

  const queueCount = queueGroups.reduce((sum, group) => sum + group.drafts.length, 0);
  const activeQuotes = jobs.filter((job) => job.status !== "complete").length;
  const followupJobs = jobs.filter(
    (job) =>
      (job.operational_summary?.followthrough_count ?? 0) > 0 ||
      job.open_items.some((item) => item.type === "follow-up" || item.type === "followup")
  );
  const followupsToday = analytics?.followup.active ?? followupJobs.length;
  const winRate = analytics?.quotes.conversion_rate_pct ?? analytics?.quotes.approval_rate_pct ?? 0;
  const moneyAtRiskCount = jobs.reduce(
    (sum, job) => sum + (job.operational_summary?.financial_exposure_count ?? 0),
    0
  );

  const attentionItems = useMemo(() => {
    const items: AttentionItem[] = [];

    for (const group of queueGroups.slice(0, 2)) {
      items.push(actionFromQueue(group));
    }

    for (const transcript of transcriptInbox.slice(0, 1)) {
      items.push(actionFromTranscript(transcript));
    }

    for (const job of jobs.filter((entry) => entry.health !== "on-track").slice(0, 3)) {
      if (items.length >= 4) break;
      items.push(actionFromJob(job));
    }

    return items.slice(0, 4);
  }, [jobs, queueGroups, transcriptInbox]);

  const insightText = useMemo(() => {
    const notes = (briefingQuery.data?.briefing ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^action/i.test(line));

    if (notes.length > 0) {
      return notes[0];
    }

    if (analytics?.transcripts.linkage_rate_pct !== undefined) {
      return `Call transcript linkage is ${analytics.transcripts.linkage_rate_pct}%. Stronger routing means more calls become job work.`;
    }

    return "Keep routing calls and reviewing real quotes so GC Agent can tighten follow-through and pricing patterns.";
  }, [analytics?.transcripts.linkage_rate_pct, briefingQuery.data?.briefing]);

  const recentUpdates = useMemo(() => {
    return [...jobs]
      .sort((left, right) => new Date(right.last_updated).getTime() - new Date(left.last_updated).getTime())
      .slice(0, 4);
  }, [jobs]);

  return (
    <div className="pw gc-page">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <article className="gc-command-card dark gc-fade-up">
          <div className="gc-command-body flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-[44rem]">
              <div className="gc-overline">Today / command surface</div>
              <div className="mt-2 text-[40px] font-semibold tracking-[-0.07em] text-white">Morning Briefing</div>
              <div className="mt-3 max-w-[38rem] text-[14px] leading-7 text-white/62">
                Start where money, calls, and follow-through are most likely to slip. This page is for triage first, browsing second.
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="gc-hero-status">{isOnline ? "Queue and job signals live" : "Offline cache active"}</span>
                <span className="gc-micro-pill">{formatToday()}</span>
                {moneyAtRiskCount > 0 ? <span className="gc-micro-pill">{moneyAtRiskCount} money-at-risk items</span> : null}
              </div>
            </div>
            <div className="flex min-w-[220px] flex-col gap-2">
              <Link
                to="/queue"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] font-semibold text-white no-underline transition hover:bg-white/[0.1]"
              >
                <Orbit className="h-4 w-4" aria-hidden="true" />
                <span>Open queue</span>
              </Link>
              <Link
                to="/quote"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#5f81ff]/20 bg-[linear-gradient(135deg,#5f81ff,#2f5dff)] px-4 text-[12px] font-semibold text-white no-underline shadow-[0_18px_36px_rgba(49,95,255,0.28)] transition hover:brightness-105"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span>Create quote</span>
              </Link>
            </div>
          </div>
        </article>

        <article className="gc-command-card gc-fade-up gc-delay-2">
          <div className="gc-command-head">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-[var(--gc-ink)]">System read</div>
                <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">What the office should care about before diving into detail.</div>
              </div>
            </div>
          </div>
          <div className="gc-command-body">
            <div className="rounded-[18px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.74)] px-4 py-4">
              <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Quote conversion</div>
              <div className="mt-2 text-[22px] font-semibold tracking-[-0.05em] text-[var(--gc-ink)]">{winRate}%</div>
              <div className="mt-1 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                {moneyAtRiskCount > 0
                  ? `${moneyAtRiskCount} open item${moneyAtRiskCount === 1 ? "" : "s"} could affect margin if the office doesn’t move today.`
                  : "No financially exposed items are leading the board right now."}
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-3">
        <article className="gc-mini-kpi gc-fade-up gc-delay-1">
          <div className="label">Queue pressure</div>
          <div className="value">{queueCount}</div>
          <div className="hint">{queueCount > 0 ? "Office review is waiting" : "Nothing stacked up"}</div>
        </article>
        <article className="gc-mini-kpi gc-fade-up gc-delay-2">
          <div className="label">Quotes moving</div>
          <div className="value">{activeQuotes}</div>
          <div className="hint">In review, sent, or awaiting response</div>
        </article>
        <article className="gc-mini-kpi gc-fade-up gc-delay-3">
          <div className="label">Follow-through due</div>
          <div className="value">{followupsToday}</div>
          <div className="hint">{followupsToday > 0 ? "Responses still need pressure" : "No reminders due now"}</div>
        </article>
      </section>

      <section className="gc-command-grid mt-4">
        <div className="space-y-4">
          <article className="gc-command-card dark gc-fade-up gc-delay-2">
            <div className="gc-command-head border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(255,140,47,0.14)] text-[#ffb06c]">
                  <ShieldAlert className="h-4.5 w-4.5" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-white">Priority stack</div>
                    <div className="mt-1 text-[12px] text-white/48">What deserves a decision before the day runs away.</div>
                </div>
              </div>
              <Link to="/queue" className="text-[11px] font-semibold text-white/72 no-underline transition hover:text-white">
                Open queue
              </Link>
            </div>
            <div className="gc-command-body">
              {attentionItems.length === 0 ? (
                <div className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-5 text-[13px] leading-7 text-white/60">
                  Nothing urgent is demanding review right now. New calls, unresolved changes, and stalled follow-through will appear here automatically.
                </div>
              ) : (
                <div className="gc-action-stack">
                  {attentionItems.map((item) => (
                    <div key={item.id} className={`gc-action-item ${item.tone === "orange" ? "warn" : ""} border-white/10 bg-white/[0.05]`}>
                      <span className="dot" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="title text-white">{item.title}</div>
                          {item.stageLabel ? <span className="gc-chip soft bg-white/10 text-white/72">{item.stageLabel}</span> : null}
                        </div>
                        <div className="copy text-white/62">{item.detail}</div>
                      </div>
                      <Link to={item.href} className="gc-action-cta border-white/10 bg-white/10 text-white hover:bg-white/14">
                        {item.ctaLabel}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <article className="gc-command-card gc-fade-up gc-delay-3">
              <div className="gc-command-head">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                    <RadioTower className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--gc-ink)]">Live changes</div>
                    <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">Signals coming in from jobs and calls.</div>
                  </div>
                </div>
              </div>
              <div>
                {recentUpdates.length === 0 ? (
                  <div className="px-4 py-5 text-[13px] leading-7 text-[var(--gc-ink-soft)]">No fresh operational changes yet.</div>
                ) : (
                  recentUpdates.map((job) => (
                    <Link key={job.id} to={`/jobs/${job.id}`} className="gc-list-row text-inherit no-underline">
                      <div
                        className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${
                          job.health === "blocked"
                            ? "bg-[rgba(255,140,47,0.14)] text-[#bc610b]"
                            : job.health === "at-risk"
                              ? "bg-[rgba(49,95,255,0.1)] text-[#214be0]"
                              : "bg-[rgba(29,155,102,0.12)] text-[#147a4f]"
                        }`}
                      >
                        {job.health === "blocked" ? (
                          <MessageSquareWarning className="h-4.5 w-4.5" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-4.5 w-4.5" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="gc-row-title">{job.name}</div>
                          {job.open_items[0]?.action_stage_label ? (
                            <span className={openItemStageClass(job.open_items[0].action_stage)}>
                              {job.open_items[0].action_stage_label}
                            </span>
                          ) : null}
                        </div>
                        <div className="gc-row-copy">
                          {job.open_items[0]?.action_stage_summary || job.open_items[0]?.description || `Latest status is ${job.status}.`}
                        </div>
                        <div className="mt-2 inline-flex items-center gap-2 text-[11px] text-[var(--gc-ink-muted)]">
                          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{formatRelativeDate(job.last_updated)}</span>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </article>

            <article className="gc-command-card gc-fade-up gc-delay-4">
              <div className="gc-command-head">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                    <Clock3 className="h-4.5 w-4.5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-[var(--gc-ink)]">Follow-through live</div>
                    <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">Responses and reminders that still need handling.</div>
                  </div>
                </div>
                <span className="gc-chip soft">{followupJobs.length} active</span>
              </div>
              <div className="px-4 py-4">
                <div className="space-y-3">
                  {(followupJobs.length > 0 ? followupJobs : jobs.filter((job) => job.open_items.length > 0))
                    .slice(0, 3)
                    .map((job) => (
                      <div key={job.id} className="rounded-[18px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.74)] px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[14px] font-semibold text-[var(--gc-ink)]">{job.name}</div>
                          {job.open_items[0]?.action_stage_label ? (
                            <span className={openItemStageClass(job.open_items[0].action_stage)}>
                              {job.open_items[0].action_stage_label}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                          {job.open_items[0]?.action_stage_summary || job.open_items[0]?.description || `Last update ${formatRelativeDate(job.last_updated)}`}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </article>
          </div>
        </div>

        <div className="space-y-4">
          <aside className="gc-command-card gc-fade-up gc-delay-3">
            <div className="gc-command-head">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                  <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-[var(--gc-ink)]">Operator read</div>
                  <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">The one recommendation worth acting on first.</div>
                </div>
              </div>
            </div>
            <div className="gc-command-body">
              <p className="text-[14px] leading-7 text-[var(--gc-ink-soft)]">{insightText}</p>
              <Link
                to="/analytics"
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--gc-line-strong)] bg-white px-3.5 text-[12px] font-semibold text-[var(--gc-ink)] no-underline transition hover:border-[rgba(49,95,255,0.22)] hover:bg-[rgba(49,95,255,0.04)]"
              >
                Review analytics
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </aside>

          <aside className="gc-command-card gc-fade-up gc-delay-4">
            <div className="gc-command-head">
              <div>
                <div className="text-[14px] font-semibold text-[var(--gc-ink)]">System watch</div>
                <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">Fast signal summary before you drop into queue or jobs.</div>
              </div>
            </div>
            <div className="gc-command-body">
              <div className="space-y-3">
                <div className="rounded-[18px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.74)] px-4 py-4">
                  <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Calls waiting for routing</div>
                  <div className="mt-2 text-[22px] font-semibold tracking-[-0.05em] text-[var(--gc-ink)]">{transcriptInbox.length}</div>
                  <div className="mt-1 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                    {transcriptInbox.length > 0 ? "Unlinked communication still needs a job or quote path." : "No unlinked call work is waiting."}
                  </div>
                </div>
                <div className="rounded-[18px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.74)] px-4 py-4">
                  <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Money at risk</div>
                  <div className="mt-2 text-[22px] font-semibold tracking-[-0.05em] text-[var(--gc-ink)]">{moneyAtRiskCount}</div>
                  <div className="mt-1 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                    {moneyAtRiskCount > 0 ? "Unpriced change or unresolved approvals are still exposed." : "No financially exposed open items detected."}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

