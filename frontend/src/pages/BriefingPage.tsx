import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import clsx from "clsx";
import { Link } from "react-router-dom";

import { fetchContractorBriefing, hasContractorApiCredentials } from "../api/contractor";
import { PageHeader } from "../components/PageHeader";
import { SurfaceCard } from "../components/SurfaceCard";
import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useQueue } from "../hooks/useQueue";
import type { BriefingPayload } from "../types";
import { loadCachedJson, saveCachedJson } from "../utils/offlineCache";

const BRIEFING_CACHE_KEY = "gc-agent:cache:public-briefing:v1";

function lineTone(line: string): string {
  const normalized = line.trimStart().toUpperCase();
  if (
    normalized.startsWith("ACTION") ||
    normalized.startsWith("WATCH") ||
    normalized.startsWith("READY FOR")
  ) {
    return "border-orange/40 bg-orange/10 text-text";
  }
  if (normalized.startsWith("ON TRACK")) {
    return "border-green/40 bg-green/10 text-text";
  }
  return "border-border bg-surface text-text";
}

function formatToday(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Awaiting first update";
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function BriefingPage() {
  const { userId } = useAuth();
  const isOnline = useOnlineStatus();
  const currentUserId = userId ?? null;

  const queueQuery = useQueue(currentUserId);
  const jobsQuery = useJobs(currentUserId);
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
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return false;
      }
      return failureCount < 2;
    },
    staleTime: 30000,
    initialData: initialBriefing,
  });

  const queueCount = useMemo(() => {
    return (queueQuery.data?.jobs ?? []).reduce((total, group) => total + group.drafts.length, 0);
  }, [queueQuery.data]);

  const briefingLines = useMemo(() => {
    const raw = briefingQuery.data?.briefing ?? "";
    return raw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }, [briefingQuery.data]);

  const urgentLines = useMemo(() => {
    return briefingLines.filter((line) => {
      const normalized = line.toUpperCase();
      return (
        normalized.startsWith("ACTION") ||
        normalized.startsWith("WATCH") ||
        normalized.startsWith("READY FOR")
      );
    });
  }, [briefingLines]);

  const fyiLines = useMemo(() => {
    return briefingLines.filter((line) => !urgentLines.includes(line));
  }, [briefingLines, urgentLines]);

  const urgentJobs = useMemo(() => {
    return (jobsQuery.data?.jobs ?? [])
      .filter((job) => job.health !== "on-track" || job.open_items.length > 0)
      .slice(0, 4);
  }, [jobsQuery.data]);

  const riskSummary = useMemo(() => {
    const jobs = jobsQuery.data?.jobs ?? [];
    const blockedJobs = jobs.filter((job) => job.health === "blocked").length;
    const atRiskJobs = jobs.filter((job) => job.health === "at-risk").length;
    const staleOpenItems = jobs.reduce((count, job) => {
      const stale = job.open_items.filter((item) => item.days_silent >= 5).length;
      return count + stale;
    }, 0);

    return {
      blockedJobs,
      atRiskJobs,
      staleOpenItems,
      hasCriticalRisk: blockedJobs > 0 || staleOpenItems > 0,
    };
  }, [jobsQuery.data]);

  return (
    <main className="page-wrap">
      <div className="section-stack">
        <PageHeader
          eyebrow="Command center"
          title={formatToday()}
          description="Start here. Review the live morning briefing, clear the queue, and move straight into the jobs that need attention first."
          actions={
            <>
              <Link to="/queue" className="action-button-primary">
                Open queue
              </Link>
              <Link to="/quote" className="action-button-secondary">
                New quote
              </Link>
              <Link to="/analytics" className="action-button-secondary">
                Analytics
              </Link>
            </>
          }
          stats={[
            {
              label: isOnline ? "Runtime" : "Runtime",
              value: isOnline ? "Live" : "Offline",
              tone: isOnline ? "success" : "warning",
            },
            { label: "Queued drafts", value: queueCount, tone: queueCount > 0 ? "warning" : "default" },
            {
              label: "Blocked jobs",
              value: riskSummary.blockedJobs,
              tone: riskSummary.blockedJobs > 0 ? "danger" : "default",
            },
            {
              label: "Stale open items",
              value: riskSummary.staleOpenItems,
              tone: riskSummary.staleOpenItems > 0 ? "warning" : "default",
            },
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
          <SurfaceCard
            eyebrow="Urgent now"
            title="Live briefing"
            description="Pulled from the contractor-facing briefing endpoint. This is the fastest view of what needs movement today."
            actions={
              <button
                type="button"
                onClick={() => void briefingQuery.refetch()}
                disabled={!hasContractorApiCredentials() || briefingQuery.isFetching}
                className="action-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {briefingQuery.isFetching ? "Refreshing..." : "Refresh"}
              </button>
            }
          >
            {!hasContractorApiCredentials() ? (
              <p className="rounded-[1.2rem] border border-yellow/40 bg-yellow/10 px-4 py-3 text-sm text-yellow">
                Set `VITE_BETA_API_KEY` and `VITE_BETA_CONTRACTOR_ID` in `frontend/.env` to load live public briefing data.
              </p>
            ) : null}

            {briefingQuery.isLoading ? <p className="text-sm text-muted">Loading briefing...</p> : null}

            {!briefingQuery.isLoading && briefingQuery.isError ? (
              <p className="rounded-[1.2rem] border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                Briefing unavailable from network. Cached data is shown when present.
              </p>
            ) : null}

            {!briefingQuery.isLoading && !briefingQuery.isError ? (
              <div className="space-y-3">
                {urgentLines.length === 0 ? (
                  <p className="rounded-[1.2rem] border border-border bg-bg/55 px-4 py-3 text-sm text-muted">
                    No urgent briefing items right now.
                  </p>
                ) : (
                  urgentLines.map((line) => (
                    <article
                      key={line}
                      className={clsx("rounded-[1.2rem] border px-4 py-3 text-sm leading-6", lineTone(line))}
                    >
                      {line}
                    </article>
                  ))
                )}
              </div>
            ) : null}
          </SurfaceCard>

          <SurfaceCard eyebrow="Risk radar" title="Where attention is stacking up">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <article className="rounded-[1.2rem] border border-border bg-bg/55 px-4 py-4">
                <p className="data-label">Blocked jobs</p>
                <p className="mt-2 text-3xl font-semibold text-red-200">{riskSummary.blockedJobs}</p>
                <p className="mt-2 text-sm text-muted">Jobs currently blocked by missing decisions or unresolved field issues.</p>
              </article>
              <article className="rounded-[1.2rem] border border-border bg-bg/55 px-4 py-4">
                <p className="data-label">At-risk jobs</p>
                <p className="mt-2 text-3xl font-semibold text-yellow">{riskSummary.atRiskJobs}</p>
                <p className="mt-2 text-sm text-muted">Jobs trending toward delay or additional coordination load.</p>
              </article>
              <article className="rounded-[1.2rem] border border-border bg-bg/55 px-4 py-4">
                <p className="data-label">Stale open items</p>
                <p className="mt-2 text-3xl font-semibold text-text">{riskSummary.staleOpenItems}</p>
                <p className="mt-2 text-sm text-muted">Open items untouched for 5+ days and likely to create downstream friction.</p>
              </article>
            </div>
          </SurfaceCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <SurfaceCard
            eyebrow="Needs action"
            title="Jobs to move today"
            description="Blocked or active jobs with open items. Use this list to decide where your next call or approval should go."
            actions={
              <Link to="/jobs" className="action-button-secondary">
                View all jobs
              </Link>
            }
          >
            {jobsQuery.isLoading ? <p className="text-sm text-muted">Loading jobs...</p> : null}

            {!jobsQuery.isLoading && urgentJobs.length === 0 ? (
              <p className="rounded-[1.2rem] border border-border bg-bg/55 px-4 py-3 text-sm text-muted">
                No urgent jobs. Everything is currently on track.
              </p>
            ) : null}

            <div className="space-y-3">
              {urgentJobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="block rounded-[1.3rem] border border-border bg-bg/55 px-4 py-4 transition hover:border-orange hover:bg-bg/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-xl uppercase tracking-[0.04em] text-text">{job.name}</p>
                      <p className="mt-2 text-sm text-muted">{job.address}</p>
                    </div>
                    <span
                      className={clsx(
                        "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                        job.health === "blocked"
                          ? "border-red-400/50 bg-red-400/10 text-red-300"
                          : "border-yellow/60 bg-yellow/10 text-yellow"
                      )}
                    >
                      {job.health}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/70 bg-surface/70 px-3 py-3">
                      <p className="data-label">Open items</p>
                      <p className="mt-2 text-lg font-semibold text-text">{job.open_items.length}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-surface/70 px-3 py-3">
                      <p className="data-label">Last update</p>
                      <p className="mt-2 text-sm text-text">{formatTimestamp(job.last_updated)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard eyebrow="Background" title="Secondary notes">
            <div className="space-y-3">
              {fyiLines.length === 0 ? (
                <p className="rounded-[1.2rem] border border-border bg-bg/55 px-4 py-3 text-sm text-muted">
                  No additional briefing notes.
                </p>
              ) : (
                fyiLines.map((line) => (
                  <article
                    key={line}
                    className={clsx("rounded-[1.2rem] border px-4 py-3 text-sm leading-6", lineTone(line))}
                  >
                    {line}
                  </article>
                ))
              )}
            </div>
          </SurfaceCard>
        </div>
      </div>
    </main>
  );
}
