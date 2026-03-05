import { useMemo } from "react";
import { UserButton, useAuth, useClerk } from "@clerk/clerk-react";
import clsx from "clsx";
import { Link } from "react-router-dom";

import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

function healthBadgeClass(health: "on-track" | "at-risk" | "blocked"): string {
  if (health === "blocked") {
    return "border-red-400/60 bg-red-400/10 text-red-300";
  }
  if (health === "at-risk") {
    return "border-yellow/70 bg-yellow/10 text-yellow";
  }
  return "border-green/60 bg-green/10 text-green";
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

export function JobsPage() {
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const isOnline = useOnlineStatus();
  const jobsQuery = useJobs(userId ?? null);
  const jobs = jobsQuery.data?.jobs ?? [];
  const prioritizedJobs = useMemo(() => {
    const rank = (health: "on-track" | "at-risk" | "blocked"): number => {
      if (health === "blocked") {
        return 0;
      }
      if (health === "at-risk") {
        return 1;
      }
      return 2;
    };

    return [...jobs].sort((a, b) => {
      const riskDiff = rank(a.health) - rank(b.health);
      if (riskDiff !== 0) {
        return riskDiff;
      }
      return b.open_items.length - a.open_items.length;
    });
  }, [jobs]);

  const riskSummary = useMemo(() => {
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
  }, [jobs]);

  return (
    <main className="min-h-screen bg-bg px-3 pb-6 pt-3 text-text sm:px-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">Jobs</p>
              <h1 className="mt-1 text-xl font-semibold text-text">Active jobs</h1>
              <p className="mt-1 text-sm text-muted">Status, last update, and open item count in one list.</p>
              <p
                className={clsx(
                  "mt-2 inline-flex rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em]",
                  isOnline
                    ? "border-green/50 bg-green/10 text-green"
                    : "border-yellow/70 bg-yellow/10 text-yellow"
                )}
              >
                {isOnline ? "Online" : "Offline (cached jobs)"}
              </p>
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
              <p className="mt-1 text-sm text-muted">Jobs are sorted by risk priority.</p>
            </div>
            <span
              className={clsx(
                "rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em]",
                riskSummary.hasCriticalRisk
                  ? "border-red-400/60 bg-red-400/20 text-red-200"
                  : "border-green/50 bg-green/10 text-green"
              )}
            >
              {riskSummary.hasCriticalRisk ? "Action Required" : "Stable"}
            </span>
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

        {jobsQuery.isLoading ? <p className="text-sm text-muted">Loading jobs...</p> : null}

        {!jobsQuery.isLoading && jobs.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-4 text-sm text-muted">
            No active jobs found.
          </p>
        ) : null}

        <div className="space-y-3">
          {prioritizedJobs.map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className={clsx(
                "block rounded-2xl border bg-surface px-4 py-4 transition hover:border-orange",
                job.health === "blocked"
                  ? "border-red-400/60"
                  : job.health === "at-risk"
                    ? "border-yellow/70"
                    : "border-border"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text">{job.name}</h2>
                  <p className="mt-1 text-sm text-muted">{job.address}</p>
                </div>
                <span
                  className={clsx(
                    "rounded-full border px-2 py-1 font-mono text-[11px] uppercase tracking-wider",
                    healthBadgeClass(job.health)
                  )}
                >
                  {job.status}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-bg px-3 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Health</p>
                  <p className="mt-1 text-sm text-text">{job.health}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg px-3 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Last Update</p>
                  <p className="mt-1 text-sm text-text">{formatTimestamp(job.last_updated)}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg px-3 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Open Items</p>
                  <p className="mt-1 text-sm text-text">{job.open_items.length}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
