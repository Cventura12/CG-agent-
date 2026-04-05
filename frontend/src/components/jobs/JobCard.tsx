import type { Job } from "../../types";
import { formatCurrency, formatTimeAgo } from "../../lib/formatters";
import { JobStatusBadge } from "./JobStatusBadge";

export interface JobCardProps {
  job: Job;
  selected: boolean;
  onClick: () => void;
}

export function JobCard({ job, selected, onClick }: JobCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full border-b border-[var(--line)] px-3 py-3 text-left transition-colors hover:bg-[var(--bg-3)] ${selected ? "border-l-2 border-l-[var(--accent)] bg-[var(--bg-3)] pl-[10px]" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--t1)]">{job.name}</div>
          <div className="mt-1 text-[12px] text-[var(--t2)]">{job.customerName}</div>
        </div>
        <JobStatusBadge status={job.status} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="font-mono text-[11px] text-[var(--green)]">{formatCurrency(job.totalQuoted)}</div>
        <div className="font-mono text-[10px] text-[var(--t3)]">{formatTimeAgo(job.lastActivityAt ?? job.createdAt)}</div>
      </div>
    </button>
  );
}
