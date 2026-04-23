import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Job, WorkspaceJobFollowUpState, WorkspaceJobTimelineEvent } from "../../types";
import { formatCurrency, formatMonoTime, formatTimeAgo } from "../../lib/formatters";
import { JobStatusBadge } from "./JobStatusBadge";

const tabs = ["activity", "quotes", "followups", "notes"] as const;
type JobTab = (typeof tabs)[number];

export interface JobDetailProps {
  job: Job;
  onSaveNotes: (notes: string) => void;
  onClose?: () => void;
  initialTab?: JobTab;
  auditTimeline?: WorkspaceJobTimelineEvent[];
  followupState?: WorkspaceJobFollowUpState | null;
  historyLoading?: boolean;
  historyError?: string | null;
}

function timelineLabel(eventType: string): string {
  switch (eventType.trim().toLowerCase()) {
    case "quote_draft_created":
      return "Draft created";
    case "quote_delivered":
      return "Quote sent";
    case "followup_scheduled":
      return "Follow-up scheduled";
    case "call_logged":
      return "Call logged";
    case "update_logged":
      return "Update logged";
    default:
      return eventType.replaceAll("_", " ") || "Activity";
  }
}

function renderFollowupStateSummary(followupState: WorkspaceJobFollowUpState | null): { title: string; detail: string } | null {
  if (!followupState || followupState.status === "none") {
    return null;
  }

  switch (followupState.status) {
    case "scheduled":
      return {
        title: "Follow-up is live",
        detail: followupState.next_due_at ? `Next touch ${formatTimeAgo(followupState.next_due_at)}` : "Waiting on the next reminder window.",
      };
    case "pending_destination":
      return {
        title: "Follow-up needs a destination",
        detail: "A follow-up exists, but Arbor still needs the best contact channel before it can send.",
      };
    case "stopped":
      return {
        title: "Follow-up closed",
        detail: followupState.stop_reason ? `Stopped because ${followupState.stop_reason}.` : "This follow-up was stopped manually.",
      };
    default:
      return {
        title: "Follow-up state updated",
        detail: `Current status: ${followupState.status}.`,
      };
  }
}

export function JobDetail({
  job,
  onSaveNotes,
  onClose,
  initialTab = "activity",
  auditTimeline = [],
  followupState = null,
  historyLoading = false,
  historyError = null,
}: JobDetailProps) {
  const [activeTab, setActiveTab] = useState<JobTab>(initialTab);
  const [notesDraft, setNotesDraft] = useState(job.notes ?? "");

  useEffect(() => {
    setNotesDraft(job.notes ?? "");
  }, [job.id, job.notes]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, job.id]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (notesDraft !== (job.notes ?? "")) {
        onSaveNotes(notesDraft);
      }
    }, 800);

    return () => window.clearTimeout(handle);
  }, [job.notes, notesDraft, onSaveNotes]);

  const stats = useMemo(
    () => [
      { label: "Open queue items", value: job.openQueueItems.toString() },
      { label: "Quotes sent", value: job.quotes.filter((quote) => quote.status !== "draft").length.toString() },
      { label: "Total quoted", value: formatCurrency(job.totalQuoted) },
      { label: "Total approved", value: formatCurrency(job.totalApproved) },
    ],
    [job]
  );

  const followupSummary = useMemo(() => renderFollowupStateSummary(followupState), [followupState]);

  return (
    <div className="scrollbar-none h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-medium tracking-[-0.4px] text-[var(--t1)]">{job.name}</h2>
            <JobStatusBadge status={job.status} />
          </div>
          <div className="mt-2 text-[13px] text-[var(--t2)]">{job.customerName} - {job.customerContact}</div>
          {job.address ? <div className="mt-2 font-mono text-[12px] text-[var(--t3)]">{job.address}</div> : null}
          {job.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.tags.map((tag) => (
                <span key={tag} className="rounded-[4px] bg-[var(--bg-4)] px-2 py-0.5 font-mono text-[10px] text-[var(--t3)]">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-[32px] w-[32px] items-center justify-center rounded-md border border-[var(--line-3)] text-[var(--t2)] transition hover:bg-[var(--bg-3)] hover:text-[var(--t1)] lg:hidden"
            >
              <X className="h-[16px] w-[16px]" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-2)] md:flex md:items-stretch">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`px-4 py-4 ${index % 2 === 0 ? "border-r border-[var(--line)]" : ""} ${index < 2 ? "border-b border-[var(--line)] md:border-b-0" : ""} ${index < stats.length - 1 ? "md:flex-1 md:border-r md:border-[var(--line)]" : "md:flex-1"} ${index === stats.length - 1 ? "md:border-r-0" : ""}`}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.5px] text-[var(--t3)]">{stat.label}</div>
            <div className="mt-2 font-mono text-[16px] text-[var(--t1)]">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-b border-[var(--line)]">
        <div className="scrollbar-none flex gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`relative shrink-0 px-4 py-2.5 text-[12px] transition ${activeTab === tab ? "text-[var(--t1)]" : "text-[var(--t3)] hover:text-[var(--t2)]"}`}
            >
              {tab === "followups" ? "Follow-ups" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {activeTab === tab ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--accent)]" /> : null}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "activity" ? (
        <div className="pt-3">
          {historyLoading ? <div className="py-3 text-[12px] text-[var(--t3)]">Loading persisted job timeline...</div> : null}
          {historyError ? <div className="py-3 text-[12px] text-[var(--orange)]">{historyError}</div> : null}
          {!historyLoading && !historyError && auditTimeline.length > 0
            ? auditTimeline.map((entry) => (
                <div key={entry.id} className="border-b border-[var(--line)] py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[13px] text-[var(--t1)]">{entry.title || timelineLabel(entry.event_type)}</div>
                    <div className="font-mono text-[10px] text-[var(--t3)]">{entry.timestamp ? formatMonoTime(entry.timestamp) : "Unknown"}</div>
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--t2)]">{entry.summary || "Persisted job activity."}</div>
                  {entry.trace_id ? <div className="mt-2 font-mono text-[10px] text-[var(--t3)]">Trace {entry.trace_id}</div> : null}
                </div>
              ))
            : null}
          {!historyLoading && !historyError && auditTimeline.length === 0
            ? job.activityLog.map((entry) => (
                <div key={entry.id} className="border-b border-[var(--line)] py-3 last:border-b-0">
                  <div className="text-[13px] text-[var(--t1)]">{entry.description}</div>
                  <div className="mt-1 flex items-center gap-3 font-mono text-[10px] text-[var(--t3)]">
                    <span>{formatMonoTime(entry.timestamp)}</span>
                    {typeof entry.value === "number" ? <span className="text-[var(--green)]">{formatCurrency(entry.value)}</span> : null}
                  </div>
                </div>
              ))
            : null}
        </div>
      ) : null}

      {activeTab === "quotes" ? (
        <div className="space-y-3 pt-4">
          {job.quotes.length === 0 ? (
            <div className="text-[12px] text-[var(--t2)]">No quotes attached to this job yet.</div>
          ) : (
            job.quotes.map((quote) => (
              <div key={quote.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)] p-4">
                <div className="text-[13px] font-medium text-[var(--t1)]">{quote.customerName}</div>
                <div className="mt-2 font-mono text-[12px] text-[var(--green)]">{formatCurrency(quote.totalValue)}</div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {activeTab === "followups" ? (
        <div className="space-y-3 pt-4">
          {followupSummary ? (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
              <div className="text-[13px] text-[var(--t1)]">{followupSummary.title}</div>
              <div className="mt-1 text-[12px] text-[var(--t2)]">{followupSummary.detail}</div>
              {followupState?.reminder_count ? (
                <div className="mt-2 font-mono text-[10px] text-[var(--t3)]">{followupState.reminder_count} reminders sent</div>
              ) : null}
            </div>
          ) : null}
          {job.followUps.length === 0 ? (
            <div className="text-[12px] text-[var(--t2)]">No follow-ups on this job right now.</div>
          ) : (
            job.followUps.map((followUp) => (
              <div key={followUp.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
                <div className="text-[13px] text-[var(--t1)]">{followUp.description}</div>
                <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">{formatMonoTime(followUp.scheduledFor)}</div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {activeTab === "notes" ? (
        <div className="pt-4">
          <textarea
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            className="min-h-[160px] w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] p-3 text-[13px] text-[var(--t1)] outline-none transition focus:border-[var(--line-4)]"
          />
          <div className="mt-2 text-[11px] text-[var(--t3)]">Auto-saves after you stop typing.</div>
        </div>
      ) : null}
    </div>
  );
}
