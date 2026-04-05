import { useEffect, useMemo, useState } from "react";
import { Filter, MoreHorizontal, Search, ChevronRight, ShieldAlert, Radar, Sparkles } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useNavigate } from "react-router-dom";

import { useJobs } from "../hooks/useJobs";
import BudgetOverviewCard from "../components/budget/BudgetOverviewCard";

type BudgetOverviewJob = {
  job_id: string;
  job_name: string;
  contractor_id: string;
  job_status: string;
  original_contract: number;
  approved_changes: number;
  pending_changes: number;
  revised_total: number;
  approved_count: number;
  pending_count: number;
  over_budget: boolean;
  has_stale_pending: boolean;
  last_change_at: string | null;
  overage_percent: number | null;
  status_color: "green" | "yellow" | "red";
};

type BudgetOverviewResponse = {
  jobs: BudgetOverviewJob[];
  summary: {
    total_jobs: number;
    flagged_jobs: number;
    stale_pending_jobs: number;
    total_pending_value: number;
  };
};

function openItemStageClass(stage: string | null | undefined): string {
  if (stage === "approved") return "gc-chip info";
  if (stage === "sent") return "gc-chip warn";
  if (stage === "customer-approved") return "gc-chip success";
  if (stage === "drafted") return "gc-chip soft";
  return "gc-chip soft";
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "Pending";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Awaiting update";
  const deltaMs = Date.now() - parsed.getTime();
  const deltaHours = Math.floor(deltaMs / (1000 * 60 * 60));
  if (deltaHours < 24) return `${Math.max(1, deltaHours)} hours ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays === 1) return "Yesterday";
  if (deltaDays < 7) return `${deltaDays} days ago`;
  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function displayStatus(status: string, hasFollowup: boolean): { label: string; className: string } {
  if (status === "complete") {
    return { label: "Completed", className: "gc-chip success" };
  }
  if (hasFollowup) {
    return { label: "Quoting", className: "gc-chip warn" };
  }
  if (status === "on-hold") {
    return { label: "On Hold", className: "gc-chip soft" };
  }
  return { label: "Active", className: "gc-chip info" };
}

function operationalNote(job: {
  health: string;
  open_items: Array<{
    type: string;
    financial_exposure?: boolean;
    change_related?: boolean;
    action_stage?: string | null;
    action_stage_label?: string;
  }>;
  operational_summary?: {
    financial_exposure_count: number;
    unresolved_change_count: number;
    followthrough_count: number;
  };
}): { label: string; className: string; stageLabel?: string; stageClassName?: string } | null {
  const financialItem = job.open_items.find((item) => item.financial_exposure);
  const changeItem = job.open_items.find((item) => item.change_related);

  if ((job.operational_summary?.financial_exposure_count ?? 0) > 0) {
    return {
      label: "Money At Risk",
      className: "gc-chip warn",
      stageLabel: financialItem?.action_stage_label,
      stageClassName: openItemStageClass(financialItem?.action_stage),
    };
  }
  if ((job.operational_summary?.unresolved_change_count ?? 0) > 0) {
    return {
      label: "Change Needs Review",
      className: "gc-chip soft",
      stageLabel: changeItem?.action_stage_label,
      stageClassName: openItemStageClass(changeItem?.action_stage),
    };
  }
  if (job.health === "blocked" || job.health === "at-risk") {
    return { label: "Review Risk", className: "gc-chip warn" };
  }
  if (
    (job.operational_summary?.followthrough_count ?? 0) > 0 ||
    job.open_items.some((item) => item.type === "follow-up" || item.type === "followup")
  ) {
    return { label: "Reminder Scheduled", className: "gc-chip info" };
  }
  return null;
}

export function JobsPage() {
  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const navigate = useNavigate();
  const jobsQuery = useJobs(currentUserId);
  const jobs = jobsQuery.data?.jobs ?? [];
  const [searchValue, setSearchValue] = useState("");
  const [budgetData, setBudgetData] = useState<BudgetOverviewResponse | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const apiUrl = import.meta.env.VITE_API_URL;
  const apiKey = import.meta.env.VITE_API_KEY;

  useEffect(() => {
    if (!apiUrl || !apiKey) {
      setBudgetError("Budget API not configured.");
      return;
    }
    setBudgetLoading(true);
    setBudgetError(null);
    fetch(`${apiUrl}/budget/overview`, {
      headers: {
        "X-API-Key": apiKey,
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed");
        }
        return response.json() as Promise<BudgetOverviewResponse>;
      })
      .then((payload) => setBudgetData(payload))
      .catch(() => setBudgetError("Could not load budget overview."))
      .finally(() => setBudgetLoading(false));
  }, [apiKey, apiUrl]);

  const filteredJobs = useMemo(() => {
    const needle = searchValue.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((job) => {
      const haystack = [job.name, job.id, job.address, job.type, job.contract_type].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [jobs, searchValue]);

  const riskCount = jobs.filter((job) => job.health === "blocked" || job.health === "at-risk").length;
  const liveJobs = jobs.filter((job) => job.status !== "complete").length;

  return (
    <div className="pw gc-page">
      <section className="gc-page-header gc-fade-up rounded-[28px] px-5 py-6 sm:px-7 sm:py-7">
        <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[52rem]">
            <div className="gc-overline">Job control board</div>
            <h1 className="gc-page-title mt-3">Jobs</h1>
            <p className="gc-page-copy mt-4 max-w-[44rem]">
              Track active work, unresolved changes, and follow-through state without losing the thread between field and office.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="gc-micro-pill">{liveJobs} live jobs</span>
              <span className="gc-micro-pill">{riskCount} need attention</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[300px] max-w-full">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden="true" />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search jobs, IDs, addresses"
                className="h-11 w-full rounded-xl border border-white/12 bg-white/[0.06] pl-11 pr-4 text-[13px] text-white outline-none placeholder:text-white/34 focus:border-white/22 focus:bg-white/[0.1]"
              />
            </div>
            <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] text-white transition hover:bg-white/[0.1]">
              <Filter className="h-4 w-4" aria-hidden="true" />
            </button>
            <Link
              to="/quote"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#5f81ff]/20 bg-[linear-gradient(135deg,#5f81ff,#2f5dff)] px-5 text-[12px] font-semibold text-white no-underline shadow-[0_18px_36px_rgba(49,95,255,0.28)] transition hover:brightness-105"
            >
              New Job
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-[26px] border border-white/12 bg-white/[0.04] px-6 py-6 shadow-[0_20px_40px_rgba(8,12,22,0.25)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">Budget tracking</div>
            <div className="mt-2 text-[22px] font-semibold text-white">Contract exposure overview</div>
          </div>
          {budgetData?.summary ? (
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-white/45">
              <span>{budgetData.summary.total_jobs} jobs tracked</span>
              <span>â¢</span>
              <span>{budgetData.summary.flagged_jobs} flagged</span>
              <span>â¢</span>
              <span>${budgetData.summary.total_pending_value.toLocaleString()} pending</span>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {budgetLoading ? (
            <div className="text-[13px] text-white/45">Loading budget overview...</div>
          ) : budgetError ? (
            <div className="text-[13px] text-white/45">{budgetError}</div>
          ) : budgetData?.jobs?.length ? (
            budgetData.jobs.slice(0, 3).map((job) => (
              <BudgetOverviewCard
                key={job.job_id}
                jobId={job.job_id}
                jobName={job.job_name}
                originalContract={job.original_contract}
                revisedTotal={job.revised_total}
                pendingChanges={job.pending_changes}
                approvedChanges={job.approved_changes}
                pendingCount={job.pending_count}
                overagePercent={job.overage_percent}
                statusColor={job.status_color}
                hasstalePending={job.has_stale_pending}
                onReviewPending={(id) => navigate(`/queue?job_id=${encodeURIComponent(id)}`)}
              />
            ))
          ) : (
            <div className="text-[13px] text-white/45">No budget data yet.</div>
          )}
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-[30px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(245,248,255,0.82))] shadow-[var(--gc-shadow)] backdrop-blur-[18px]">
        <div className="grid grid-cols-[2fr_1.8fr_1.1fr_1fr_1.15fr_1.6fr_88px] gap-4 border-b border-[var(--gc-line)] bg-[linear-gradient(135deg,rgba(49,95,255,0.06),transparent_48%),rgba(255,255,255,0.58)] px-7 py-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gc-ink-muted)]">
          <div>Job</div>
          <div>Client</div>
          <div>Status</div>
          <div>Value</div>
          <div>Last signal</div>
          <div>Operational state</div>
          <div className="text-right">Open</div>
        </div>

        {jobsQuery.isLoading ? (
          <div className="px-7 py-10 text-[14px] text-[var(--gc-ink-soft)]">Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="px-7 py-10 text-[14px] text-[var(--gc-ink-soft)]">No jobs found for this search.</div>
        ) : (
          filteredJobs.slice(0, 8).map((job) => {
            const hasFollowup =
              (job.operational_summary?.followthrough_count ?? 0) > 0 ||
              job.open_items.some((item) => item.type === "follow-up" || item.type === "followup");
            const status = displayStatus(job.status, hasFollowup);
            const note = operationalNote(job);
            return (
              <div
                key={job.id}
                className="grid grid-cols-[2fr_1.8fr_1.1fr_1fr_1.15fr_1.6fr_88px] gap-4 border-b border-[var(--gc-line)] px-7 py-6 text-[14px] text-[var(--gc-ink-soft)] transition hover:bg-[rgba(49,95,255,0.03)] last:border-b-0"
              >
                <div>
                  <div className="text-[18px] font-semibold text-[var(--gc-ink)]">{job.name}</div>
                  <div className="mt-1 font-mono text-[12px] text-[var(--gc-ink-muted)]">{job.id}</div>
                </div>
                <div>{job.address || job.type}</div>
                <div>
                  <span className={status.className}>{status.label}</span>
                </div>
                <div className="text-[17px] font-semibold text-[var(--gc-ink)]">{formatCurrency(job.contract_value)}</div>
                <div>{formatRelativeDate(job.last_updated)}</div>
                <div>
                  {note ? (
                    <div className="flex flex-wrap gap-2">
                      <span className={note.className}>{note.label}</span>
                      {note.stageLabel ? <span className={note.stageClassName || "gc-chip soft"}>{note.stageLabel}</span> : null}
                    </div>
                  ) : (
                    <span className="text-[var(--gc-ink-muted)]">Stable</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--gc-line)] bg-white/60 text-[var(--gc-ink-muted)] transition hover:border-[var(--gc-line-strong)] hover:text-[var(--gc-ink)]">
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <Link
                    to={`/jobs/${job.id}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--gc-line)] bg-white/60 text-[var(--gc-ink-muted)] transition hover:border-[var(--gc-line-strong)] hover:text-[var(--gc-ink)]"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })
        )}

        <div className="flex items-center justify-between border-t border-[var(--gc-line)] bg-white/45 px-7 py-5 text-[13px] text-[var(--gc-ink-soft)]">
          <div>Showing {Math.min(filteredJobs.length, 8)} of {jobs.length} jobs</div>
          <div className="flex items-center gap-2">
            <span className="gc-chip soft"><Radar className="h-3.5 w-3.5" aria-hidden="true" />Live signal tracking</span>
            {riskCount > 0 ? <span className="gc-chip warn"><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />{riskCount} risks</span> : null}
            {liveJobs > 0 ? <span className="gc-chip info"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{liveJobs} active</span> : null}
          </div>
        </div>
      </section>
    </div>
  );
}


