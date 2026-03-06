import type { KeyboardEvent } from "react";
import clsx from "clsx";

import type { Job } from "../types";

type JobSidebarProps = {
  jobs: Job[];
  selectedJobId: string | null;
  onJobSelect: (id: string | null) => void;
  draftCounts: Record<string, number>;
};

function healthDotClass(health: Job["health"]): string {
  if (health === "blocked") {
    return "bg-red-400";
  }
  if (health === "at-risk") {
    return "bg-yellow";
  }
  return "bg-green";
}

function truncateLabel(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 3)}...`;
}

function optionId(jobId: string | null): string {
  return jobId ?? "__all__";
}

function parseOptionId(raw: string): string | null {
  return raw === "__all__" ? null : raw;
}

function handleArrowNavigation(
  event: KeyboardEvent<HTMLDivElement>,
  onJobSelect: (id: string | null) => void
): void {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const container = event.currentTarget;
  const options = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[data-job-option="true"]')
  );
  if (options.length === 0) {
    return;
  }

  const currentIndex = options.indexOf(target);
  if (currentIndex < 0) {
    return;
  }

  event.preventDefault();
  const isForward = event.key === "ArrowRight" || event.key === "ArrowDown";
  const isBackward = event.key === "ArrowLeft" || event.key === "ArrowUp";
  if (!isForward && !isBackward) {
    return;
  }

  let nextIndex = currentIndex + (isForward ? 1 : -1);
  if (nextIndex < 0) {
    nextIndex = options.length - 1;
  }
  if (nextIndex >= options.length) {
    nextIndex = 0;
  }

  const nextButton = options[nextIndex];
  if (!nextButton) {
    return;
  }
  nextButton.focus();

  const nextRawId = nextButton.dataset.jobId ?? "__all__";
  onJobSelect(parseOptionId(nextRawId));
}

export function JobSidebar({ jobs, selectedJobId, onJobSelect, draftCounts }: JobSidebarProps) {
  return (
    <aside className="w-full md:w-72 md:shrink-0">
      <div
        className="no-scrollbar flex gap-2 overflow-x-auto pb-2 md:hidden"
        role="tablist"
        aria-label="Job filters"
        onKeyDown={(event) => handleArrowNavigation(event, onJobSelect)}
      >
        <button
          type="button"
          data-job-option="true"
          data-job-id="__all__"
          onClick={() => onJobSelect(null)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition",
            "whitespace-nowrap",
            selectedJobId === null
              ? "border-orange bg-orange/10 text-text"
              : "border-border bg-surface/60 text-muted"
          )}
        >
          <span className="font-medium">All Jobs</span>
        </button>

        {jobs.map((job) => {
          const pendingDrafts = draftCounts[job.id] ?? 0;
          return (
            <button
              key={job.id}
              type="button"
              data-job-option="true"
              data-job-id={optionId(job.id)}
              onClick={() => onJobSelect(job.id)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition",
                "whitespace-nowrap",
                selectedJobId === job.id
                  ? "border-orange bg-orange/10 text-text"
                  : "border-border bg-surface/60 text-muted"
              )}
              title={job.name}
            >
              <span className={clsx("h-2 w-2 rounded-full", healthDotClass(job.health))} />
              <span className="font-medium">{truncateLabel(job.name, 12)}</span>
              {pendingDrafts > 0 ? (
                <span className="rounded-full border border-orange/70 bg-orange/10 px-1.5 py-0.5 text-[10px] text-orange">
                  {pendingDrafts}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        className="hidden space-y-3 md:block"
        role="listbox"
        aria-label="Job filters"
        onKeyDown={(event) => handleArrowNavigation(event, onJobSelect)}
      >
        <button
          type="button"
          data-job-option="true"
          data-job-id="__all__"
          onClick={() => onJobSelect(null)}
          className={clsx(
            "w-full rounded-[1.35rem] border px-4 py-3 text-left text-sm transition",
            selectedJobId === null
              ? "border-orange/55 bg-orange/10"
              : "border-border/80 bg-surface/72 hover:border-orange/35"
          )}
        >
          <p className="font-medium text-text">All Jobs</p>
          <p className="mt-0.5 text-xs text-muted">Show all pending drafts</p>
        </button>

        {jobs.map((job) => {
          const openCount = job.open_items.length;
          const pendingDrafts = draftCounts[job.id] ?? 0;

          return (
            <button
              key={job.id}
              type="button"
              data-job-option="true"
              data-job-id={optionId(job.id)}
              onClick={() => onJobSelect(job.id)}
              className={clsx(
                "w-full rounded-[1.35rem] border px-4 py-3 text-left text-sm transition",
                selectedJobId === job.id
                  ? "border-orange/55 bg-orange/10"
                  : "border-border/80 bg-surface/72 hover:border-orange/35"
              )}
              title={job.name}
            >
              <div className="flex items-center gap-2">
                <span className={clsx("h-2.5 w-2.5 rounded-full", healthDotClass(job.health))} />
                <span className="truncate font-medium text-text">{truncateLabel(job.name, 28)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{job.type}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {openCount > 0 ? (
                  <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-muted">
                    {openCount} open
                  </span>
                ) : null}

                {pendingDrafts > 0 ? (
                  <span className="rounded-full border border-orange/70 bg-orange/10 px-2 py-0.5 text-[11px] text-orange">
                    {pendingDrafts} pending
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
