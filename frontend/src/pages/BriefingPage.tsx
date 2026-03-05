import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserButton, useAuth, useClerk } from "@clerk/clerk-react";
import clsx from "clsx";
import { Link } from "react-router-dom";

import { fetchContractorBriefing, hasContractorApiCredentials } from "../api/contractor";
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
  const { signOut } = useClerk();
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
    <main className="min-h-screen bg-bg px-3 pb-6 pt-3 text-text sm:px-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">Morning Briefing</p>
              <h1 className="mt-1 text-xl font-semibold text-text">{formatToday()}</h1>
              <p className="mt-1 text-sm text-muted">Start here, then move into the queue.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void signOut({ redirectUrl: "/onboarding" })}
                className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
              >
                Sign Out
              </button>
              <UserButton afterSignOutUrl="/onboarding" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={clsx(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs uppercase tracking-wider",
                isOnline
                  ? "border-green/50 bg-green/10 text-green"
                  : "border-yellow/70 bg-yellow/10 text-yellow"
              )}
            >
              {isOnline ? "Online" : "Offline (cached mode)"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-orange/50 bg-orange/10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-orange">
              <span className="text-text">{queueCount}</span>
              <span>Queued</span>
            </span>
            <Link
              to="/queue"
              className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
            >
              Open Queue
            </Link>
            <Link
              to="/quote"
              className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
            >
              New Quote
            </Link>
            <Link
              to="/analytics"
              className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
            >
              Analytics
            </Link>
          </div>
        </header>

        <section
          className={clsx(
            "rounded-2xl border p-4",
            riskSummary.hasCriticalRisk
              ? "border-red-400/50 bg-red-400/10"
              : "border-border bg-surface"
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">Risk Radar</p>
              <p className="mt-1 text-sm text-muted">Prioritize blocked jobs and stale open items first.</p>
            </div>
            {riskSummary.hasCriticalRisk ? (
              <span className="rounded-full border border-red-400/60 bg-red-400/20 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-red-200">
                Action Required
              </span>
            ) : (
              <span className="rounded-full border border-green/50 bg-green/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-green">
                Stable
              </span>
            )}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-border bg-bg px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Blocked Jobs</p>
              <p className="mt-1 text-xl font-semibold text-red-200">{riskSummary.blockedJobs}</p>
            </article>
            <article className="rounded-xl border border-border bg-bg px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">At-Risk Jobs</p>
              <p className="mt-1 text-xl font-semibold text-yellow">{riskSummary.atRiskJobs}</p>
            </article>
            <article className="rounded-xl border border-border bg-bg px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Stale Open Items</p>
              <p className="mt-1 text-xl font-semibold text-text">{riskSummary.staleOpenItems}</p>
            </article>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Urgent Now</p>
              <p className="mt-1 text-sm text-muted">Pulled from the live morning briefing endpoint.</p>
            </div>
            <button
              type="button"
              onClick={() => void briefingQuery.refetch()}
              disabled={!hasContractorApiCredentials() || briefingQuery.isFetching}
              className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-60"
            >
              {briefingQuery.isFetching ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {!hasContractorApiCredentials() ? (
            <p className="mt-4 rounded-xl border border-yellow/40 bg-yellow/10 px-3 py-3 text-sm text-yellow">
              Set `VITE_BETA_API_KEY` and `VITE_BETA_CONTRACTOR_ID` in `frontend/.env` to load `GET /briefing`.
            </p>
          ) : null}

          {briefingQuery.isLoading ? <p className="mt-4 text-sm text-muted">Loading briefing...</p> : null}

          {!briefingQuery.isLoading && briefingQuery.isError ? (
            <p className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-3 text-sm text-red-200">
              Briefing unavailable from network. Showing cached data when available.
            </p>
          ) : null}

          {!briefingQuery.isLoading && !briefingQuery.isError ? (
            <div className="mt-4 space-y-3">
              {urgentLines.length === 0 ? (
                <p className="rounded-xl border border-border bg-bg px-3 py-3 text-sm text-muted">
                  No urgent briefing items right now.
                </p>
              ) : (
                urgentLines.map((line) => (
                  <article key={line} className={clsx("rounded-xl border px-3 py-3 text-sm", lineTone(line))}>
                    {line}
                  </article>
                ))
              )}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Jobs Needing Attention</p>
              <p className="mt-1 text-sm text-muted">Blocked or active jobs with open items.</p>
            </div>
            <Link
              to="/jobs"
              className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
            >
              View Jobs
            </Link>
          </div>

          {jobsQuery.isLoading ? <p className="mt-4 text-sm text-muted">Loading jobs...</p> : null}

          {!jobsQuery.isLoading && urgentJobs.length === 0 ? (
            <p className="mt-4 rounded-xl border border-border bg-bg px-3 py-3 text-sm text-muted">
              No urgent jobs. Everything is currently on track.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            {urgentJobs.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="block rounded-xl border border-border bg-bg px-3 py-3 transition hover:border-orange"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">{job.name}</p>
                    <p className="mt-1 text-xs text-muted">{job.open_items.length} open item(s)</p>
                  </div>
                  <span
                    className={clsx(
                      "rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider",
                      job.health === "blocked"
                        ? "border-red-400/50 bg-red-400/10 text-red-300"
                        : "border-yellow/60 bg-yellow/10 text-yellow"
                    )}
                  >
                    {job.health}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">Last update: {formatTimestamp(job.last_updated)}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">FYI</p>
          <div className="mt-3 space-y-3">
            {fyiLines.length === 0 ? (
              <p className="rounded-xl border border-border bg-bg px-3 py-3 text-sm text-muted">
                No additional briefing notes.
              </p>
            ) : (
              fyiLines.map((line) => (
                <article key={line} className={clsx("rounded-xl border px-3 py-3 text-sm", lineTone(line))}>
                  {line}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
