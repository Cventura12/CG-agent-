import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { fetchWorkspaceJobDetail } from "../../api/workspaceJobs";
import { useAppStore } from "../../store/appStore";
import type { Job, JobStatus, WorkspaceJobDetailPayload } from "../../types";
import { EmptyState } from "../ui/EmptyState";
import { JobCard } from "./JobCard";
import { JobDetail } from "./JobDetail";

function mapBackendJobStatus(status: string): JobStatus {
  switch (status.trim().toLowerCase()) {
    case "complete":
    case "completed":
      return "completed";
    case "on-hold":
      return "stalled";
    case "quoted":
      return "quoted";
    case "in_progress":
    case "in-progress":
      return "in_progress";
    default:
      return "active";
  }
}

function mergePersistedJob(baseJob: Job, payload: WorkspaceJobDetailPayload | null): Job {
  if (!payload) {
    return baseJob;
  }

  const backendJob = payload.job;
  const persistedTimestamp = payload.audit_timeline.find((entry) => entry.timestamp)?.timestamp ?? undefined;

  return {
    ...baseJob,
    name: backendJob.name || baseJob.name,
    address: backendJob.address || baseJob.address,
    notes: backendJob.notes || baseJob.notes,
    status: mapBackendJobStatus(backendJob.status),
    openQueueItems: backendJob.operational_summary?.open_item_count ?? baseJob.openQueueItems,
    lastActivityAt: persistedTimestamp ?? baseJob.lastActivityAt,
  };
}

function JobsViewContent({ jobs }: { jobs: Job[] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [query, setQuery] = useState("");
  const [jobDetail, setJobDetail] = useState<WorkspaceJobDetailPayload | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const filteredJobs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return jobs;
    return jobs.filter((job) => [job.name, job.customerName, ...(job.tags ?? [])].some((value) => value.toLowerCase().includes(normalized)));
  }, [jobs, query]);

  const selectedJob = filteredJobs.find((job) => job.id === id) ?? jobs.find((job) => job.id === id) ?? filteredJobs[0] ?? null;
  const selectedJobWithPersistedDetail = useMemo(
    () => (selectedJob ? mergePersistedJob(selectedJob, jobDetail) : null),
    [jobDetail, selectedJob]
  );
  const initialTab = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("tab") === "followups" ? "followups" : "activity";
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;

    async function loadJobDetail() {
      if (!selectedJob) {
        setJobDetail(null);
        setHistoryError(null);
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const payload = await fetchWorkspaceJobDetail(selectedJob.id);
        if (!cancelled) {
          setJobDetail(payload);
        }
      } catch (error) {
        if (!cancelled) {
          setJobDetail(null);
          setHistoryError(error instanceof Error ? error.message : "Could not load job history.");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadJobDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedJob?.id]);

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
              onClick={() => navigate(`/jobs/${job.id}`)}
            />
          ))}
        </div>
      </div>

      <div className={`absolute inset-0 z-20 bg-[var(--bg)] ${selectedJobWithPersistedDetail ? "block" : "hidden"} lg:static lg:block lg:min-w-0 lg:flex-1 lg:overflow-hidden`}>
        {selectedJobWithPersistedDetail ? (
          <JobDetail
            job={selectedJobWithPersistedDetail}
            onSaveNotes={() => {}}
            onClose={() => navigate("/jobs")}
            initialTab={initialTab}
            auditTimeline={jobDetail?.audit_timeline ?? []}
            followupState={jobDetail?.followup_state ?? null}
            historyLoading={historyLoading}
            historyError={historyError}
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
  return <JobsViewContent jobs={jobs} />;
}

export function JobsViewDemo() {
  return <JobsViewContent jobs={useAppStore.getState().jobs} />;
}
