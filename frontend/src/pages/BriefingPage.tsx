import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Link } from "react-router-dom";

import { fetchContractorBriefing, hasContractorApiCredentials } from "../api/contractor";
import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useQueue } from "../hooks/useQueue";
import type { BriefingPayload, Job, QueueJobGroup } from "../types";
import { loadCachedJson, saveCachedJson } from "../utils/offlineCache";
import { useAuth } from "@clerk/clerk-react";

const BRIEFING_CACHE_KEY = "gc-agent:cache:public-briefing:v1";

function formatToday(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function urgencyFromLine(line: string): { label: string; tone: string } {
  const normalized = line.trimStart().toUpperCase();
  if (normalized.startsWith("ACTION")) {
    return { label: "High", tone: "border-orange/45 bg-orange/10 text-orange" };
  }
  if (normalized.startsWith("WATCH")) {
    return { label: "Risk", tone: "border-red-400/45 bg-red-400/10 text-red-200" };
  }
  return { label: "Normal", tone: "border-steel/35 bg-steel/10 text-steel" };
}

function cleanBriefingLine(line: string): string {
  return line.replace(/^(ACTION|WATCH|READY FOR)\s*[-:]*\s*/i, "").trim();
}

function jobHealthTone(health: Job["health"]): string {
  if (health === "blocked") {
    return "bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.55)]";
  }
  if (health === "at-risk") {
    return "bg-yellow shadow-[0_0_12px_rgba(245,158,11,0.55)]";
  }
  return "bg-green shadow-[0_0_12px_rgba(56,166,104,0.55)]";
}

function queueSummary(group: QueueJobGroup): string {
  if (group.drafts.length === 0) {
    return "Awaiting draft details";
  }
  const latest = group.drafts[0];
  if (!latest) {
    return "Awaiting draft details";
  }
  const draftLabel = (latest.type || latest.title || "draft").replace(/-/g, " ");
  return `${draftLabel} · ${group.drafts.length} queued`;
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

  const jobs = jobsQuery.data?.jobs ?? [];
  const queueGroups = queueQuery.data?.jobs ?? [];

  const briefingLines = useMemo(() => {
    const raw = briefingQuery.data?.briefing ?? "";
    return raw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }, [briefingQuery.data]);

  const actionLines = useMemo(() => {
    const lines = briefingLines.filter((line) => {
      const normalized = line.toUpperCase();
      return normalized.startsWith("ACTION") || normalized.startsWith("WATCH") || normalized.startsWith("READY FOR");
    });

    if (lines.length > 0) {
      return lines.slice(0, 4).map((line, index) => ({
        id: `${index}-${line}`,
        line,
      }));
    }

    if (queueGroups.length > 0) {
      return queueGroups.slice(0, 3).map((group, index) => ({
        id: `${index}-${group.job_id}`,
        line: `READY FOR - ${group.job_name} has ${group.drafts.length} queued draft${group.drafts.length === 1 ? "" : "s"}`,
      }));
    }

    return [];
  }, [briefingLines, queueGroups]);

  const secondaryLines = useMemo(() => {
    const actionLineSet = new Set(actionLines.map((item) => item.line));
    return briefingLines.filter((line) => !actionLineSet.has(line));
  }, [actionLines, briefingLines]);

  const blockedJobs = jobs.filter((job) => job.health === "blocked").length;
  const atRiskJobs = jobs.filter((job) => job.health === "at-risk").length;
  const staleOpenItems = jobs.reduce((count, job) => count + job.open_items.filter((item) => item.days_silent >= 5).length, 0);
  const activeValue = jobs.reduce((sum, job) => sum + Number(job.contract_value || 0), 0);
  const queueCount = queueGroups.reduce((sum, group) => sum + group.drafts.length, 0);
  const urgentJobs = jobs.filter((job) => job.health !== "on-track" || job.open_items.length > 0).slice(0, 4);
  const healthJobs = jobs.slice(0, 4);

  return (
    <main className="page-wrap">
      <div className="section-stack">
        <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="kicker">System briefing · {formatToday()}</p>
            <h1 className="mt-3 font-display text-[2.4rem] uppercase leading-none tracking-[0.08em] text-text sm:text-[3.1rem]">
              Morning readout
            </h1>
            <p className="mt-3 text-sm text-muted sm:text-base">
              {jobs.length} open jobs · {queueCount} drafts in queue · {isOnline ? "System nominal" : "Offline cache active"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <Link to="/quote" className="action-button-primary">
              + New quote
            </Link>
          </div>
        </section>

        <section className="surface-panel overflow-hidden">
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Open jobs", value: jobs.length, detail: `${Math.max(jobs.length - 6, 0)} added this week`, tone: "text-text" },
              { label: "Queue", value: queueCount, detail: queueCount > 0 ? "needs review" : "clear", tone: queueCount > 0 ? "text-text" : "text-green" },
              { label: "At risk", value: blockedJobs + atRiskJobs, detail: staleOpenItems > 0 ? "follow-up overdue" : "monitoring only", tone: blockedJobs + atRiskJobs > 0 || staleOpenItems > 0 ? "text-red-200" : "text-text" },
              { label: "Active value", value: formatCurrency(activeValue), detail: isOnline ? "live from jobs" : "cached totals", tone: activeValue > 0 ? "text-green" : "text-text" },
            ].map((stat) => (
              <article key={stat.label} className="stat-cell">
                <p className="data-label">{stat.label}</p>
                <div className={clsx("stat-value", stat.tone)}>{stat.value}</div>
                <p className={clsx("mt-2 font-mono text-[10px] uppercase tracking-[0.16em]", stat.tone === "text-red-200" ? "text-red-200" : stat.tone === "text-green" ? "text-green" : "text-muted")}>{stat.detail}</p>
              </article>
            ))}
          </div>
        </section>

        {!hasContractorApiCredentials() ? (
          <section className="surface-panel-subtle px-4 py-3 text-sm text-yellow sm:px-5">
            Set `VITE_BETA_API_KEY` and `VITE_BETA_CONTRACTOR_ID` in `frontend/.env` to pull the live contractor-facing briefing endpoint.
          </section>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="surface-panel overflow-hidden">
            <div className="surface-card-header">
              <div>
                <p className="kicker">Action required</p>
                <h2 className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-steel">Live briefing signals</h2>
              </div>
              <span className="terminal-mini-chip border-orange/45 bg-orange/10 text-orange">{actionLines.length} items</span>
            </div>
            <div className="surface-card-body p-0">
              {briefingQuery.isLoading ? (
                <div className="px-5 py-5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Loading live briefing...</div>
              ) : null}

              {!briefingQuery.isLoading && briefingQuery.isError ? (
                <div className="px-5 py-5 text-sm text-red-200">Briefing unavailable from network. Cached data is shown when present.</div>
              ) : null}

              {!briefingQuery.isLoading && !briefingQuery.isError && actionLines.length === 0 ? (
                <div className="px-5 py-5 text-sm text-muted">No action items are stacked right now.</div>
              ) : null}

              {!briefingQuery.isLoading && !briefingQuery.isError ? (
                <div>
                  {actionLines.map((item, index) => {
                    const urgency = urgencyFromLine(item.line);
                    const relatedJob = urgentJobs[index] ?? jobs[index] ?? null;
                    return (
                      <article key={item.id} className="border-b border-border/80 px-5 py-4 last:border-b-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 border-l-2 border-orange pl-4">
                            <p className="text-lg text-text">{cleanBriefingLine(item.line)}</p>
                            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                              {relatedJob
                                ? `${relatedJob.id} · ${relatedJob.type} · ${formatCurrency(relatedJob.contract_value)}`
                                : "Briefing signal"}
                            </p>
                          </div>
                          <span className={clsx("terminal-mini-chip", urgency.tone)}>{urgency.label}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>

          <div className="grid gap-4">
            <section className="surface-panel overflow-hidden">
              <div className="surface-card-header">
                <div>
                  <p className="kicker">Draft queue</p>
                  <h2 className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-steel">Queued review work</h2>
                </div>
                <span className="terminal-mini-chip border-orange/45 bg-orange/10 text-orange">{queueCount}</span>
              </div>
              <div className="surface-card-body p-0">
                {queueGroups.length === 0 ? (
                  <div className="px-5 py-5 text-sm text-muted">No queued drafts waiting right now.</div>
                ) : (
                  <>
                    {queueGroups.slice(0, 3).map((group) => (
                      <article key={group.job_id} className="border-b border-border/80 px-5 py-4 last:border-b-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-lg text-text">{group.job_name}</p>
                            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{queueSummary(group)}</p>
                          </div>
                          <span className="font-mono text-xs uppercase tracking-[0.16em] text-green">{group.drafts.length}</span>
                        </div>
                      </article>
                    ))}
                    <div className="px-5 py-4">
                      <Link to="/queue" className="action-button-secondary flex w-full justify-center">
                        Review queue ?
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="surface-panel overflow-hidden">
              <div className="surface-card-header">
                <div>
                  <p className="kicker">Job health</p>
                  <h2 className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-steel">Where attention is stacking up</h2>
                </div>
              </div>
              <div className="surface-card-body p-0">
                {(healthJobs.length > 0 ? healthJobs : urgentJobs).length === 0 ? (
                  <div className="px-5 py-5 text-sm text-muted">No active job signals yet.</div>
                ) : (
                  (healthJobs.length > 0 ? healthJobs : urgentJobs).map((job) => (
                    <Link
                      key={job.id}
                      to={`/jobs/${job.id}`}
                      className="flex items-start justify-between gap-3 border-b border-border/80 px-5 py-4 transition hover:bg-surface/60 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className={clsx("mt-1 h-2.5 w-2.5 rounded-full", jobHealthTone(job.health))} aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="text-lg text-text">{job.name}</p>
                          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                            {job.type} · {job.open_items.length} open item{job.open_items.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <span className="terminal-mini-chip border-blue-500/45 bg-blue-500/10 text-blue-200">{job.status}</span>
                    </Link>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>

        <section className="surface-panel overflow-hidden">
          <div className="surface-card-header">
            <div>
              <p className="kicker">FYI</p>
              <h2 className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-steel">Background notes</h2>
            </div>
            <button
              type="button"
              onClick={() => void briefingQuery.refetch()}
              disabled={!hasContractorApiCredentials() || briefingQuery.isFetching}
              className="action-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {briefingQuery.isFetching ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div className="surface-card-body">
            {secondaryLines.length === 0 ? (
              <p className="text-sm text-muted">No additional briefing notes.</p>
            ) : (
              <div className="space-y-3">
                {secondaryLines.map((line) => (
                  <article key={line} className="rounded-[2px] border border-border/80 bg-surface/75 px-4 py-3 text-sm leading-6 text-text">
                    {line}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

