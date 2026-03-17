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
      <section className="gc-page-header gc-fade-up rounded-[34px] px-6 py-7 sm:px-8 sm:py-8">
        <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[52rem]">
            <div className="gc-overline">Morning command surface</div>
            <h1 className="gc-page-title mt-3">Morning Briefing</h1>
            <p className="gc-page-copy mt-4 max-w-[44rem]">
              See what changed, what is stuck, and where money or follow-through needs a decision before it slips.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="gc-hero-status">{isOnline ? "Live queue and job signals connected" : "Offline cache active"}</span>
              <span className="gc-micro-pill">{formatToday()}</span>
              {moneyAtRiskCount > 0 ? <span className="gc-micro-pill">{moneyAtRiskCount} money-at-risk items</span> : null}
            </div>
          </div>
          <div className="gc-hero-actions">
            <Link
              to="/queue"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] font-semibold text-white no-underline transition hover:bg-white/[0.1]"
            >
              <Orbit className="h-4 w-4" aria-hidden="true" />
              <span>Open queue</span>
            </Link>
            <Link
              to="/quote"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#5f81ff]/20 bg-[linear-gradient(135deg,#5f81ff,#2f5dff)] px-4 text-[12px] font-semibold text-white no-underline shadow-[0_18px_36px_rgba(49,95,255,0.28)] transition hover:brightness-105"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Create quote</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="gc-kpi-grid gc-four mt-5">
        <article className={`gc-kpi-card gc-fade-up gc-delay-1 ${queueCount > 0 ? "warn" : "ok"}`}>
          <div className="gc-kpi-label">Queue pressure</div>
          <div className="gc-kpi-value">{queueCount}</div>
          <div className={`gc-kpi-hint ${queueCount > 0 ? "warn" : "ok"}`}>{queueCount > 0 ? "Review work is stacking up" : "All clear"}</div>
        </article>
        <article className="gc-kpi-card neutral gc-fade-up gc-delay-2">
          <div className="gc-kpi-label">Quotes in motion</div>
          <div className="gc-kpi-value">{activeQuotes}</div>
          <div className="gc-kpi-hint">Awaiting review, send, or customer response</div>
        </article>
        <article className={`gc-kpi-card gc-fade-up gc-delay-3 ${followupsToday > 0 ? "warn" : "ok"}`}>
          <div className="gc-kpi-label">Follow-through due</div>
          <div className="gc-kpi-value">{followupsToday}</div>
          <div className={`gc-kpi-hint ${followupsToday > 0 ? "warn" : "ok"}`}>{followupsToday > 0 ? "Active reminders running" : "No reminders queued"}</div>
        </article>
        <article className="gc-kpi-card neutral gc-fade-up gc-delay-4">
          <div className="gc-kpi-label">Quote conversion</div>
          <div className="gc-kpi-value">{winRate}%</div>
          <div className="gc-kpi-hint">30-day approval and conversion signal</div>
        </article>
      </section>

      <section className="gc-stack-grid mt-5">
        <div className="space-y-5">
          <article className="gc-stack-card gc-fade-up gc-delay-2">
            <div className="gc-stack-header">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(255,140,47,0.12)] text-[#bc610b]">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="gc-stack-title">Needs action now</div>
                  <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">The agent is surfacing unresolved work worth deciding today.</div>
                </div>
              </div>
              <Link to="/queue" className="gc-stack-link">
                View queue ?
              </Link>
            </div>
            <div>
              {attentionItems.length === 0 ? (
                <div className="px-6 py-8 text-[14px] leading-7 text-[var(--gc-ink-soft)]">
                  Nothing urgent is demanding review right now. New field updates, missed follow-through, and unresolved changes will land here automatically.
                </div>
              ) : (
                attentionItems.map((item) => (
                  <div key={item.id} className="gc-list-row">
                    <span className={`gc-signal-dot ${item.tone === "orange" ? "warn" : "info"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="gc-row-title">{item.title}</div>
                        {item.stageLabel ? <span className="gc-chip soft">{item.stageLabel}</span> : null}
                      </div>
                      <div className="gc-row-copy">{item.detail}</div>
                    </div>
                    <Link
                      to={item.href}
                      className="inline-flex h-10 shrink-0 items-center rounded-xl border border-[var(--gc-line-strong)] bg-white px-4 text-[12px] font-semibold text-[var(--gc-ink)] no-underline transition hover:border-[rgba(49,95,255,0.22)] hover:bg-[rgba(49,95,255,0.04)]"
                    >
                      {item.ctaLabel}
                    </Link>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="gc-stack-card gc-fade-up gc-delay-3">
            <div className="gc-stack-header">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                  <RadioTower className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="gc-stack-title">Recent operational changes</div>
                  <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">Signals from jobs, calls, and work moving through the office.</div>
                </div>
              </div>
            </div>
            <div>
              {recentUpdates.length === 0 ? (
                <div className="px-6 py-8 text-[14px] leading-7 text-[var(--gc-ink-soft)]">No recent job activity yet.</div>
              ) : (
                recentUpdates.map((job) => (
                  <Link key={job.id} to={`/jobs/${job.id}`} className="gc-list-row text-inherit no-underline">
                    <div
                      className={`mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                        job.health === "blocked"
                          ? "bg-[rgba(255,140,47,0.14)] text-[#bc610b]"
                          : job.health === "at-risk"
                            ? "bg-[rgba(49,95,255,0.1)] text-[#214be0]"
                            : "bg-[rgba(29,155,102,0.12)] text-[#147a4f]"
                      }`}
                    >
                      {job.health === "blocked" ? (
                        <MessageSquareWarning className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
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
                      <div className="mt-3 inline-flex items-center gap-2 text-[12px] text-[var(--gc-ink-muted)]">
                        <Clock3 className="h-4 w-4" aria-hidden="true" />
                        <span>{formatRelativeDate(job.last_updated)}</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </article>
        </div>

        <div className="space-y-5">
          <aside className="gc-side-panel gc-fade-up gc-delay-3">
            <div className="gc-side-body">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="gc-stack-title">Follow-through running today</div>
                  <div className="mt-1 text-[13px] leading-6 text-[var(--gc-ink-soft)]">What is already moving and what still needs a nudge.</div>
                </div>
                <span className="gc-chip soft">{followupJobs.length} live</span>
              </div>

              <div className="mt-5 space-y-4">
                {(followupJobs.length > 0 ? followupJobs : jobs.filter((job) => job.open_items.length > 0))
                  .slice(0, 3)
                  .map((job, index) => (
                    <div key={job.id} className={`${index > 0 ? "border-t border-[var(--gc-line)] pt-4" : ""}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[16px] font-semibold text-[var(--gc-ink)]">{job.name}</div>
                        {job.open_items[0]?.action_stage_label ? (
                          <span className={openItemStageClass(job.open_items[0].action_stage)}>
                            {job.open_items[0].action_stage_label}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-[14px] leading-7 text-[var(--gc-ink-soft)]">
                        {job.open_items[0]?.action_stage_summary || job.open_items[0]?.description || `Last update ${formatRelativeDate(job.last_updated)}`}
                      </div>
                      <div className="mt-3 inline-flex rounded-xl bg-[rgba(49,95,255,0.08)] px-3 py-2 text-[12px] font-medium text-[#214be0]">
                        {(job.operational_summary?.followthrough_count ?? 0) > 0 ||
                        job.open_items.some((item) => item.type === "follow-up" || item.type === "followup")
                          ? "Reminder is active"
                          : "Review timing before this stalls"}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </aside>

          <aside className="gc-side-panel gc-fade-up gc-delay-4">
            <div className="gc-side-body">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="gc-stack-title">Agent readout</div>
                  <div className="mt-1 text-[13px] leading-6 text-[var(--gc-ink-soft)]">One operating recommendation from the current runtime.</div>
                </div>
              </div>
              <p className="mt-5 text-[15px] leading-8 text-[var(--gc-ink-soft)]">{insightText}</p>
              <Link
                to="/analytics"
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--gc-line-strong)] bg-white px-4 text-[12px] font-semibold text-[var(--gc-ink)] no-underline transition hover:border-[rgba(49,95,255,0.22)] hover:bg-[rgba(49,95,255,0.04)]"
              >
                Review analytics
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

