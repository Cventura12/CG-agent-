import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { Job, JobActivity } from "../../types";
import { formatCurrency, formatMonoTime } from "../../lib/formatters";
import { useAppStore } from "../../store/appStore";
import { QuoteStatusBadge } from "../quotes/QuoteStatusBadge";
import { InputSourceIcon } from "../ui/InputSourceIcon";
import { VoiceSessionList } from "../voice/VoiceSessionList";
import { JobStatusBadge } from "./JobStatusBadge";

const tabs = ["activity", "quotes", "followups", "calls", "notes"] as const;

type JobTab = (typeof tabs)[number];

const activityIconTone: Record<JobActivity["type"], { color: string; source?: "CALL" | "EMAIL" }> = {
  call: { color: "bg-[var(--green-b)] text-[var(--green)]", source: "CALL" },
  quote_sent: { color: "bg-[var(--blue-b)] text-[var(--blue)]" },
  quote_accepted: { color: "bg-[var(--green-b)] text-[var(--green)]" },
  note: { color: "bg-[var(--bg-4)] text-[var(--t2)]" },
  change_order: { color: "bg-[var(--acl)] text-[var(--accent-2)]" },
  follow_up: { color: "bg-[var(--amber-b)] text-[var(--amber)]" },
};

export interface JobDetailProps {
  job: Job;
  onSaveNotes: (notes: string) => void;
  onClose?: () => void;
  initialTab?: JobTab;
}

export function JobDetail({ job, onSaveNotes, onClose, initialTab = "activity" }: JobDetailProps) {
  const [activeTab, setActiveTab] = useState<JobTab>(initialTab);
  const [notesDraft, setNotesDraft] = useState(job.notes ?? "");
  const voiceSessions = useAppStore((state) =>
    state.voiceSessions.filter(
      (session) =>
        session.jobId === job.id ||
        (session.jobName?.trim().toLowerCase() ?? "") === job.name.trim().toLowerCase()
    )
  );
  const requestVoiceTransfer = useAppStore((state) => state.requestVoiceTransfer);

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

  return (
    <div className="scrollbar-none h-full overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-medium tracking-[-0.4px] text-[var(--t1)]">{job.name}</h2>
            <JobStatusBadge status={job.status} />
          </div>
          <div className="mt-2 text-[13px] text-[var(--t2)]">{job.customerName} · {job.customerContact}</div>
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
          <button type="button" className="rounded-md border border-[var(--line-3)] px-3 py-[5px] text-[12px] text-[var(--t2)] transition hover:bg-[var(--bg-3)] hover:text-[var(--t1)]">
            Edit
          </button>
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
              {tab === "followups" ? "Follow-ups" : tab === "calls" ? "Calls" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {activeTab === tab ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--accent)]" /> : null}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "activity" ? (
        <div className="pt-3">
          {job.activityLog.map((entry) => {
            const tone = activityIconTone[entry.type];
            return (
              <div key={entry.id} className="flex gap-3 border-b border-[var(--line)] py-3 last:border-b-0">
                <div className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-lg ${tone.color}`}>
                  {tone.source ? <InputSourceIcon source={tone.source} size={18} /> : <span className="font-mono text-[10px] uppercase">{entry.type.slice(0, 2)}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-[var(--t1)]">{entry.description}</div>
                  <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">{formatMonoTime(entry.timestamp)}</div>
                </div>
                {typeof entry.value === "number" ? <div className="shrink-0 font-mono text-[11px] text-[var(--green)]">{formatCurrency(entry.value)}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {activeTab === "quotes" ? (
        <div className="space-y-3 pt-4">
          {job.quotes.map((quote) => (
            <div key={quote.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[var(--t1)]">{quote.customerName}</div>
                  <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">{quote.lineItems.length} line items</div>
                </div>
                <QuoteStatusBadge status={quote.status} />
              </div>
              <div className="mt-3 font-mono text-[12px] text-[var(--green)]">{formatCurrency(quote.totalValue)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "followups" ? (
        <div className="space-y-3 pt-4">
          {job.followUps.map((followUp) => (
            <div key={followUp.id} className="flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
              <span className={`mt-[6px] h-[8px] w-[8px] rounded-full ${followUp.status === "overdue" ? "bg-[var(--red)]" : followUp.status === "scheduled" ? "bg-[var(--amber)]" : followUp.status === "responded" ? "bg-[var(--green)]" : "bg-[var(--t3)]"}`} />
              <div className="min-w-0 flex-1">
                <div className={`text-[13px] ${followUp.status === "responded" ? "text-[var(--t3)] line-through" : "text-[var(--t1)]"}`}>{followUp.description}</div>
                <div className={`mt-1 font-mono text-[10px] ${followUp.status === "overdue" ? "text-[var(--red)]" : "text-[var(--t3)]"}`}>
                  {formatMonoTime(followUp.scheduledFor)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === "calls" ? (
        <div className="pt-4">
          <VoiceSessionList
            sessions={voiceSessions}
            title="Job call history"
            detail="Streaming call captures, transfer state, and replayable recordings tied to this job."
            emptyDescription="When the agent captures live calls for this job, they’ll show up here with transfer and recording state."
            onRequestTransfer={requestVoiceTransfer}
            compact
          />
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
