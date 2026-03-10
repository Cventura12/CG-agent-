import { useMemo, useState } from "react";
import { Filter, MoreHorizontal, Search, ChevronRight } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";

import { useJobs } from "../hooks/useJobs";

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
    return { label: "Completed", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" };
  }
  if (hasFollowup) {
    return { label: "Quoting", className: "bg-amber-50 text-amber-700 border border-amber-200" };
  }
  if (status === "on-hold") {
    return { label: "On Hold", className: "bg-slate-100 text-slate-700 border border-slate-200" };
  }
  return { label: "Active", className: "bg-blue-50 text-[#2453d4] border border-blue-200" };
}

function agentNote(job: {
  health: string;
  open_items: Array<{ type: string }>;
}): { label: string; className: string } | null {
  if (job.health === "blocked" || job.health === "at-risk") {
    return { label: "Review Risk", className: "bg-orange-50 text-orange-600" };
  }
  if (job.open_items.some((item) => item.type === "follow-up")) {
    return { label: "Follow-up Scheduled", className: "bg-slate-100 text-slate-500" };
  }
  return null;
}

export function JobsPage() {
  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const jobsQuery = useJobs(currentUserId);
  const jobs = jobsQuery.data?.jobs ?? [];
  const [searchValue, setSearchValue] = useState("");

  const filteredJobs = useMemo(() => {
    const needle = searchValue.trim().toLowerCase();
    if (!needle) return jobs;
    return jobs.filter((job) => {
      const haystack = [job.name, job.id, job.address, job.type, job.contract_type].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [jobs, searchValue]);

  return (
    <div className="pw">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[52px] font-bold tracking-[-0.05em] text-slate-950">Jobs</h1>
          <p className="mt-3 text-[18px] text-slate-500">Manage all your active and past projects.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-[320px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search jobs..."
              className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-[15px] text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
            />
          </div>
          <button type="button" className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-900 transition hover:bg-slate-50">
            <Filter className="h-5 w-5" aria-hidden="true" />
          </button>
          <Link
            to="/quote"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[#2453d4] px-6 text-[15px] font-semibold text-white no-underline shadow-[0_8px_20px_rgba(37,83,212,0.2)] transition hover:bg-[#1f46b3]"
          >
            New Job
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-[2fr_1.8fr_1.1fr_1fr_1.2fr_1.4fr_88px] gap-4 border-b border-slate-200 bg-slate-50 px-8 py-5 text-[15px] font-semibold text-slate-500">
          <div>Job</div>
          <div>Client</div>
          <div>Status</div>
          <div>Value</div>
          <div>Last Update</div>
          <div>Agent Note</div>
          <div className="text-right">Actions</div>
        </div>

        {jobsQuery.isLoading ? (
          <div className="px-8 py-10 text-[15px] text-slate-500">Loading jobs...</div>
        ) : filteredJobs.length === 0 ? (
          <div className="px-8 py-10 text-[15px] text-slate-500">No jobs found for this search.</div>
        ) : (
          filteredJobs.slice(0, 8).map((job) => {
            const hasFollowup = job.open_items.some((item) => item.type === "follow-up");
            const status = displayStatus(job.status, hasFollowup);
            const note = agentNote(job);
            return (
              <div key={job.id} className="grid grid-cols-[2fr_1.8fr_1.1fr_1fr_1.2fr_1.4fr_88px] gap-4 border-b border-slate-200 px-8 py-6 last:border-b-0">
                <div>
                  <div className="text-[18px] font-semibold text-slate-950">{job.name}</div>
                  <div className="mt-1 text-[15px] text-slate-500">{job.id}</div>
                </div>
                <div className="text-[15px] text-slate-700">{job.address || job.type}</div>
                <div>
                  <span className={`inline-flex rounded-xl px-3 py-1 text-[15px] font-semibold ${status.className}`}>{status.label}</span>
                </div>
                <div className="text-[18px] font-semibold text-slate-950">{formatCurrency(job.contract_value)}</div>
                <div className="text-[15px] text-slate-500">{formatRelativeDate(job.last_updated)}</div>
                <div>
                  {note ? (
                    <span className={`inline-flex rounded-xl px-3 py-1 text-[15px] font-medium ${note.className}`}>{note.label}</span>
                  ) : (
                    <span className="text-[15px] text-slate-400">-</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                    <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <Link to={`/jobs/${job.id}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            );
          })
        )}

        <div className="flex items-center justify-between border-t border-slate-200 px-8 py-5 text-[15px] text-slate-500">
          <div>Showing {Math.min(filteredJobs.length, 8)} of {jobs.length} jobs</div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-400">Previous</button>
            <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-600">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}

