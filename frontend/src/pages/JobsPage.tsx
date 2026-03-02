import { UserButton, useAuth, useClerk } from "@clerk/clerk-react";
import clsx from "clsx";
import { Link } from "react-router-dom";

import { useJobs } from "../hooks/useJobs";

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
  const jobsQuery = useJobs(userId ?? null);
  const jobs = jobsQuery.data?.jobs ?? [];

  return (
    <main className="min-h-screen bg-bg px-3 pb-6 pt-3 text-text sm:px-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">Jobs</p>
              <h1 className="mt-1 text-xl font-semibold text-text">Active jobs</h1>
              <p className="mt-1 text-sm text-muted">Status, last update, and open item count in one list.</p>
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

        {jobsQuery.isLoading ? <p className="text-sm text-muted">Loading jobs...</p> : null}

        {!jobsQuery.isLoading && jobs.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-4 text-sm text-muted">
            No active jobs found.
          </p>
        ) : null}

        <div className="space-y-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="block rounded-2xl border border-border bg-surface px-4 py-4 transition hover:border-orange"
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
