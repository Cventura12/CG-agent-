import { useMemo } from "react";
import { useAuth } from "@clerk/clerk-react";
import clsx from "clsx";
import { Link } from "react-router-dom";

import { PageHeader } from "../components/PageHeader";
import { SurfaceCard } from "../components/SurfaceCard";
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
    <main className="page-wrap">
      <div className="section-stack">
        <PageHeader
          eyebrow="Jobs"
          title="Active operations"
          description="Track job health, open items, and last activity without digging through separate admin screens."
          actions={
            <Link to="/quote" className="action-button-primary">
              Start quote
            </Link>
          }
          stats={[
            { label: "Runtime", value: isOnline ? "Live" : "Offline", tone: isOnline ? "success" : "warning" },
            { label: "Blocked jobs", value: riskSummary.blockedJobs, tone: riskSummary.blockedJobs > 0 ? "danger" : "default" },
            { label: "At-risk jobs", value: riskSummary.atRiskJobs, tone: riskSummary.atRiskJobs > 0 ? "warning" : "default" },
            { label: "Active jobs", value: jobs.length },
          ]}
        />

        {jobsQuery.isLoading ? (
          <SurfaceCard eyebrow="Loading" title="Pulling jobs">
            <p className="text-sm text-muted">Loading jobs...</p>
          </SurfaceCard>
        ) : null}

        {!jobsQuery.isLoading && jobs.length === 0 ? (
          <SurfaceCard eyebrow="No jobs" title="Nothing active yet">
            <p className="text-sm text-muted">No active jobs found.</p>
          </SurfaceCard>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <SurfaceCard eyebrow="Risk radar" title="Where jobs are drifting">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <article className="rounded-[1.2rem] border border-border bg-bg/55 px-4 py-4">
                <p className="data-label">Blocked jobs</p>
                <p className="mt-2 text-3xl font-semibold text-red-200">{riskSummary.blockedJobs}</p>
                <p className="mt-2 text-sm text-muted">Work currently blocked and likely to require a decision or escalation.</p>
              </article>
              <article className="rounded-[1.2rem] border border-border bg-bg/55 px-4 py-4">
                <p className="data-label">At-risk jobs</p>
                <p className="mt-2 text-3xl font-semibold text-yellow">{riskSummary.atRiskJobs}</p>
                <p className="mt-2 text-sm text-muted">Jobs with signs of schedule or coordination pressure.</p>
              </article>
              <article className="rounded-[1.2rem] border border-border bg-bg/55 px-4 py-4">
                <p className="data-label">Stale open items</p>
                <p className="mt-2 text-3xl font-semibold text-text">{riskSummary.staleOpenItems}</p>
                <p className="mt-2 text-sm text-muted">Items that have sat long enough to become operational risk.</p>
              </article>
            </div>
          </SurfaceCard>

          <SurfaceCard eyebrow="All jobs" title="Operational list" description="Sorted by risk first so the top of the list reflects what deserves office attention now.">
            <div className="space-y-3">
              {prioritizedJobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className={clsx(
                    "block rounded-[1.45rem] border px-4 py-4 transition hover:border-orange hover:bg-bg/65",
                    job.health === "blocked"
                      ? "border-red-400/60 bg-red-400/6"
                      : job.health === "at-risk"
                        ? "border-yellow/70 bg-yellow/6"
                        : "border-border bg-bg/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-display text-xl uppercase tracking-[0.04em] text-text">{job.name}</h2>
                      <p className="mt-2 text-sm text-muted">{job.address}</p>
                    </div>
                    <span
                      className={clsx(
                        "rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em]",
                        healthBadgeClass(job.health)
                      )}
                    >
                      {job.status}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/70 bg-surface/75 px-3 py-3">
                      <p className="data-label">Health</p>
                      <p className="mt-2 text-sm text-text">{job.health}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-surface/75 px-3 py-3">
                      <p className="data-label">Last update</p>
                      <p className="mt-2 text-sm text-text">{formatTimestamp(job.last_updated)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-surface/75 px-3 py-3">
                      <p className="data-label">Open items</p>
                      <p className="mt-2 text-sm text-text">{job.open_items.length}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </div>
    </main>
  );
}
