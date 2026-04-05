ï»¿import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useAppStore } from "../../store/appStore";
import type { Job } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { JobCard } from "./JobCard";
import { JobDetail } from "./JobDetail";

function JobsViewContent({ jobs, useStore = false }: { jobs: Job[]; useStore?: boolean }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const setActiveJob = useAppStore((state) => state.setActiveJob);
  const updateJobNotes = useAppStore((state) => state.updateJobNotes);
  const [query, setQuery] = useState("");
  const activeTabParam = searchParams.get("tab");
  const initialTab =
    activeTabParam === "activity" ||
    activeTabParam === "quotes" ||
    activeTabParam === "followups" ||
    activeTabParam === "calls" ||
    activeTabParam === "notes"
      ? activeTabParam
      : undefined;
  const currentSearch = searchParams.toString();

  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) => [job.name, job.customerName, ...(job.tags ?? [])].some((value) => value.toLowerCase().includes(normalized)));
  }, [jobs, query]);

  const selectedJob = filteredJobs.find((job) => job.id === id) ?? jobs.find((job) => job.id === id) ?? filteredJobs[0] ?? null;

  useEffect(() => {
    if (useStore) {
      setActiveJob(selectedJob?.id ?? null);
    }
  }, [selectedJob?.id, setActiveJob, useStore]);

  return (
    <div className="relative flex h-full overflow-hidden bg-[var(--bg)]">
      <div className="flex min-w-0 flex-1 flex-col border-r border-[var(--line)] bg-[var(--bg-2)] lg:w-[300px] lg:max-w-[300px] lg:min-w-[300px] lg:shrink-0">
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[var(--t3)]" strokeWidth={1.9} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search jobs"
              className="w-full rounded-md border border-[var(--line-2)] bg-[var(--bg-3)] py-1.5 pl-9 pr-3 text-[12px] text-[var(--t1)] outline-none transition placeholder:text-[var(--t3)] focus:border-[var(--line-4)]"
            />
          </div>
        </div>
        <div className="scrollbar-none flex-1 overflow-y-auto">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              selected={selectedJob?.id === job.id}
              onClick={() => navigate(`/jobs/${job.id}${currentSearch ? `?${currentSearch}` : ""}`)}
            />
          ))}
        </div>
      </div>

      <div className={`absolute inset-0 z-20 bg-[var(--bg)] ${selectedJob ? "block" : "hidden"} lg:static lg:block lg:min-w-0 lg:flex-1 lg:overflow-hidden`}>
        {selectedJob ? (
          <JobDetail
            job={selectedJob}
            initialTab={initialTab}
            onSaveNotes={(notes) => updateJobNotes(selectedJob.id, notes)}
            onClose={() => navigate("/jobs")}
          />
        ) : (
          <EmptyState icon={Search} title="No jobs match this search" description="Try a customer name, address tag, or clear the filter." />
        )}
      </div>
    </div>
  );
}

export default function JobsView() {
  const jobs = useAppStore((state) => state.jobs);
  return <JobsViewContent jobs={jobs} useStore />;
}

export function JobsViewDemo() {
  return <JobsViewContent jobs={useAppStore.getState().jobs} />;
}
