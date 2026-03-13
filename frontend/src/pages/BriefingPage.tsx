import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, MessageSquareWarning } from "lucide-react";
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
  const note = job.open_items[0]?.description || "Review the latest operational issue on this job.";
  return {
    id: `job-${job.id}`,
    title: `${job.name} needs attention`,
    detail: note,
    tone: job.health === "blocked" ? "orange" : "blue",
    ctaLabel: job.health === "blocked" ? "Review Risk" : "Open Job",
    href: `/jobs/${job.id}`,
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
  const followupJobs = jobs.filter((job) => job.open_items.some((item) => item.type === "follow-up"));
  const followupsToday = analytics?.followup.active ?? followupJobs.length;
  const winRate = analytics?.quotes.conversion_rate_pct ?? analytics?.quotes.approval_rate_pct ?? 0;

  const attentionItems = useMemo(() => {
    const items: AttentionItem[] = [];

    for (const group of queueGroups.slice(0, 2)) {
      items.push(actionFromQueue(group));
    }

    for (const transcript of transcriptInbox.slice(0, 1)) {
      items.push(actionFromTranscript(transcript));
    }

    for (const job of jobs.filter((entry) => entry.health !== "on-track").slice(0, 3)) {
      if (items.length >= 3) break;
      items.push(actionFromJob(job));
    }

    return items.slice(0, 3);
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
      .slice(0, 3);
  }, [jobs]);

  return (
    <div className="pw">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[52px] font-bold tracking-[-0.05em] text-slate-950">Morning Briefing</h1>
          <p className="mt-3 text-[18px] text-slate-500">Here&apos;s what needs follow-through today, John.</p>
          <p className="mt-2 text-sm font-medium text-slate-400">{formatToday()} · {isOnline ? "Live data connected" : "Offline cache active"}</p>
        </div>
        <Link
          to="/quote"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-[#2453d4] px-6 text-[15px] font-semibold text-white no-underline shadow-[0_8px_20px_rgba(37,83,212,0.2)] transition hover:bg-[#1f46b3]"
        >
          Create Quote
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-4 md:grid-cols-2">
        {[
          { label: "Queue Items", value: queueCount, detail: queueCount > 0 ? "Needs review" : "Queue clear", tone: "text-orange-500" },
          { label: "Quotes in Motion", value: activeQuotes, detail: "Awaiting review or customer response", tone: "text-slate-500" },
          { label: "Follow-ups Today", value: followupsToday, detail: followupsToday > 0 ? "Scheduled" : "No reminders", tone: "text-slate-500" },
          { label: "Quote Conversion (30d)", value: `${winRate}%`, detail: winRate > 0 ? `? ${Math.max(1, Math.round(winRate / 32))}%` : "No trend yet", tone: "text-emerald-600" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="text-[15px] font-medium text-slate-500">{stat.label}</div>
            <div className="mt-5 flex items-end gap-3">
              <div className="text-[52px] font-bold tracking-[-0.05em] text-slate-950">{stat.value}</div>
              <div className={`mb-2 text-[15px] font-medium ${stat.tone}`}>{stat.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(340px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-orange-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50/50 px-7 py-6">
              <div className="flex items-center gap-3 text-[18px] font-semibold text-slate-950">
                <AlertTriangle className="h-6 w-6 text-orange-500" aria-hidden="true" />
                <span>Needs Attention</span>
              </div>
              <span className="rounded-xl border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-900">{attentionItems.length} items</span>
            </div>
            <div>
              {attentionItems.length === 0 ? (
                <div className="px-7 py-8 text-sm text-slate-500">No urgent queue or job issues right now.</div>
              ) : (
                attentionItems.map((item) => (
                  <div key={item.id} className="flex items-start gap-4 border-b border-slate-200 px-7 py-6 last:border-b-0">
                    <span className={`mt-2 h-3 w-3 rounded-full ${item.tone === "orange" ? "bg-orange-500" : "bg-blue-600"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[18px] font-semibold text-slate-950">{item.title}</div>
                      <div className="mt-2 text-[15px] leading-7 text-slate-500">{item.detail}</div>
                    </div>
                    <Link
                      to={item.href}
                      className="inline-flex h-10 shrink-0 items-center rounded-xl bg-slate-100 px-4 text-[15px] font-semibold text-slate-900 no-underline transition hover:bg-slate-200"
                    >
                      {item.ctaLabel}
                    </Link>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-slate-200 px-7 py-5 text-center">
              <Link to="/queue" className="inline-flex items-center gap-2 text-[15px] font-medium text-slate-500 no-underline hover:text-slate-900">
                View all queue items
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="px-7 py-6">
              <h2 className="text-[18px] font-semibold text-slate-950">Recent Job Activity</h2>
            </div>
            <div>
              {recentUpdates.length === 0 ? (
                <div className="px-7 pb-7 text-sm text-slate-500">No recent job activity yet.</div>
              ) : (
                recentUpdates.map((job) => (
                  <Link key={job.id} to={`/jobs/${job.id}`} className="flex items-start gap-4 border-t border-slate-200 px-7 py-6 text-inherit no-underline first:border-t-0 hover:bg-slate-50">
                    <div className={`mt-1 flex h-12 w-12 items-center justify-center rounded-2xl ${job.health === "blocked" ? "bg-orange-100 text-orange-600" : job.health === "at-risk" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"}`}>
                      {job.health === "blocked" ? <MessageSquareWarning className="h-6 w-6" aria-hidden="true" /> : <CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
                    </div>
                    <div>
                      <div className="text-[18px] font-semibold text-slate-950">{job.name}</div>
                      <div className="mt-1 text-[15px] leading-7 text-slate-500">
                        {job.open_items[0]?.description || `Latest status is ${job.status}.`}
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[15px] text-slate-500">
                        <Clock3 className="h-4 w-4" aria-hidden="true" />
                        <span>{formatRelativeDate(job.last_updated)}</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <h2 className="text-[18px] font-semibold text-slate-950">Today&apos;s Follow-ups</h2>
            <p className="mt-3 text-[15px] text-slate-500">Automated sequences running</p>
            <div className="mt-8 space-y-6">
              {(followupJobs.length > 0 ? followupJobs : jobs.filter((job) => job.open_items.length > 0)).slice(0, 2).map((job, index) => (
                <div key={job.id} className={`${index > 0 ? "border-t border-slate-200 pt-5" : ""}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[18px] font-semibold text-slate-950">{job.name}</div>
                      <div className="mt-1 text-[15px] text-slate-500">
                        {job.open_items[0]?.description || `Last update ${formatRelativeDate(job.last_updated)}`}
                      </div>
                    </div>
                    <button type="button" className="text-[15px] font-semibold text-slate-900">Skip</button>
                  </div>
                  <div className="mt-4 inline-flex items-center rounded-xl bg-blue-50 px-3 py-1 text-sm font-medium text-[#2453d4]">
                    {job.open_items.some((item) => item.type === "follow-up") ? "Follow-up scheduled today" : "Review follow-up timing"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-blue-100 bg-blue-50/60 p-7 shadow-sm">
            <h2 className="text-[18px] font-semibold text-[#2453d4]">Operational Insight</h2>
            <p className="mt-5 text-[15px] leading-7 text-slate-700">{insightText}</p>
            <Link
              to="/analytics"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-slate-900 bg-white px-5 text-[15px] font-semibold text-slate-900 no-underline transition hover:bg-slate-50"
            >
              Review analytics
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

