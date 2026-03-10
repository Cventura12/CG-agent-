import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Plus,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

import { approveAll, approveDraft, discardDraft, editDraft } from "../api/queue";
import {
  discardTranscript,
  linkTranscriptToJob,
  logTranscriptAsUpdate,
  markTranscriptReviewed,
} from "../api/transcripts";
import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useQueue } from "../hooks/useQueue";
import type { Draft, QueuePayload, TranscriptInboxItem } from "../types";

type QueueMutationContext = {
  previousQueue: QueuePayload | undefined;
};

type DraftMutationVars = {
  draftId: string;
};

type EditMutationVars = {
  draftId: string;
  content: string;
};

function updateDraftInQueue(queue: QueuePayload, updatedDraft: Draft): QueuePayload {
  return {
    jobs: queue.jobs.map((group) => ({
      ...group,
      drafts: group.drafts.map((draft) => (draft.id === updatedDraft.id ? updatedDraft : draft)),
    })),
    inbox: queue.inbox,
  };
}

function formatCreatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("approved")) return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (normalized.includes("discard")) return "border border-orange-200 bg-orange-50 text-orange-600";
  if (normalized.includes("edit")) return "border border-blue-200 bg-blue-50 text-[#2453d4]";
  return "border border-slate-200 bg-slate-100 text-slate-600";
}

function draftTone(type: string): string {
  if (type === "follow-up") return "border border-orange-200 bg-orange-50 text-orange-600";
  if (type === "material-order") return "border border-blue-200 bg-blue-50 text-[#2453d4]";
  if (type === "transcript-review") return "border border-violet-200 bg-violet-50 text-violet-700";
  return "border border-slate-200 bg-slate-100 text-slate-600";
}

function transcriptUrgencyTone(urgency: string | undefined): string {
  const normalized = (urgency ?? "").trim().toLowerCase();
  if (normalized === "high") return "border border-orange-200 bg-orange-50 text-orange-600";
  if (normalized === "low") return "border border-slate-200 bg-slate-100 text-slate-600";
  return "border border-amber-200 bg-amber-50 text-amber-700";
}

function classificationLabel(value: string | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "unknown";
  return normalized.replace(/_/g, " ");
}

function confidenceLabel(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Manual";
  }
  const normalized = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${normalized}%`;
}

function transcriptHeadline(draft: Draft): string {
  if (draft.type !== "transcript-review") {
    return draft.job_name;
  }
  if (!draft.transcript) {
    return draft.title || "Call transcript review";
  }
  return draft.transcript.caller_label || "Inbound call transcript";
}

function transcriptActionLabel(draft: Draft): string {
  if (draft.type !== "transcript-review") {
    return draft.why;
  }
  if (!draft.transcript) {
    return draft.why || "Review transcript and choose the next step.";
  }
  const firstAction = draft.transcript.recommended_actions[0];
  if (firstAction) {
    return `Next action: ${firstAction}`;
  }
  return draft.why || "Review transcript and choose the next step.";
}

function transcriptSummary(draft: Draft): string {
  if (draft.type !== "transcript-review") {
    return draft.why;
  }
  return draft.transcript?.summary || draft.why || "Manual transcript review needed.";
}

function transcriptRawText(draft: Draft): string {
  if (draft.type !== "transcript-review") {
    return draft.content;
  }
  return draft.transcript?.transcript_text || "Transcript text unavailable.";
}

function inboxCallerLabel(transcript: TranscriptInboxItem): string {
  return transcript.caller_label || "Inbound call transcript";
}

function inboxSummary(transcript: TranscriptInboxItem): string {
  return transcript.summary || "Manual transcript review needed.";
}

function inboxActionCopy(transcript: TranscriptInboxItem): string {
  return (
    transcript.recommended_actions[0] ||
    (transcript.match_source
      ? `Needs routing from ${transcript.match_source.replace(/_/g, " ")}`
      : "Transcript needs routing before it becomes job work.")
  );
}

function inboxRawText(transcript: TranscriptInboxItem): string {
  return transcript.transcript_text || "Transcript text unavailable.";
}

function nextActionLabel(type: Draft["type"]): string {
  switch (type) {
    case "follow-up":
      return "Review follow-up";
    case "material-order":
      return "Review pricing";
    case "owner-update":
      return "Send update";
    case "sub-message":
      return "Review message";
    case "transcript-review":
      return "Route transcript";
    default:
      return "Review draft";
  }
}

export function QueuePage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [openTranscriptIds, setOpenTranscriptIds] = useState<Record<string, boolean>>({});
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [exitingDrafts, setExitingDrafts] = useState<Record<string, "approved" | "discarded">>({});
  const autoSelectedRef = useRef(false);
  const exitTimersRef = useRef<Record<string, number>>({});

  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const isOnline = useOnlineStatus();
  const scope = currentUserId ?? "anonymous";

  const queryClient = useQueryClient();
  const queueQuery = useQueue(currentUserId);
  const jobsQuery = useJobs(currentUserId);

  const queueGroups = queueQuery.data?.jobs ?? [];
  const transcriptInbox = queueQuery.data?.inbox?.transcripts ?? [];
  const jobs = jobsQuery.data?.jobs ?? [];

  const pendingCount = useMemo(
    () => queueGroups.reduce((total, group) => total + group.drafts.length, 0) + transcriptInbox.length,
    [queueGroups, transcriptInbox]
  );

  useEffect(() => {
    if (autoSelectedRef.current || jobs.length === 0) {
      return;
    }
    const firstJobWithDrafts = queueGroups.find((group) => group.drafts.length > 0);
    if (firstJobWithDrafts) {
      setSelectedJobId(firstJobWithDrafts.job_id);
    }
    autoSelectedRef.current = true;
  }, [jobs.length, queueGroups]);

  useEffect(() => {
    return () => {
      Object.values(exitTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const visibleGroups = useMemo(() => {
    if (!selectedJobId) {
      return queueGroups;
    }
    return queueGroups.filter((group) => group.job_id === selectedJobId);
  }, [queueGroups, selectedJobId]);

  const visibleDrafts = useMemo(() => {
    return visibleGroups.flatMap((group) =>
      group.drafts.map((draft) => ({
        draft,
        group,
      }))
    );
  }, [visibleGroups]);

  const jobFilterButtons = useMemo(
    () => [
      {
        job_id: null as string | null,
        job_name: "All queue items",
        count: queueGroups.reduce((sum, group) => sum + group.drafts.length, 0),
      },
      ...queueGroups.map((group) => ({
        job_id: group.job_id,
        job_name: group.job_name,
        count: group.drafts.length,
      })),
    ],
    [queueGroups]
  );

  const scheduleExitCleanup = (draftId: string) => {
    const existingTimer = exitTimersRef.current[draftId];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    exitTimersRef.current[draftId] = window.setTimeout(() => {
      setExitingDrafts((current) => {
        const next = { ...current };
        delete next[draftId];
        return next;
      });
      if (openDraftId === draftId) {
        setOpenDraftId(null);
      }
      void queryClient.invalidateQueries({ queryKey: ["queue", scope] });
      delete exitTimersRef.current[draftId];
    }, 320);
  };

  const approveMutation = useMutation({
    mutationFn: ({ draftId }: DraftMutationVars) => approveDraft(draftId),
    onMutate: async (): Promise<QueueMutationContext> => {
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: ["queue", scope] });
      const previousQueue = queryClient.getQueryData<QueuePayload>(["queue", scope]);
      return { previousQueue };
    },
    onSuccess: (_draft, { draftId }) => {
      setExitingDrafts((current) => ({ ...current, [draftId]: "approved" }));
      scheduleExitCleanup(draftId);
    },
    onError: (_error, _vars, context) => {
      if (context?.previousQueue) {
        queryClient.setQueryData(["queue", scope], context.previousQueue);
      }
      setErrorMessage("Could not approve draft. Changes were reverted.");
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ draftId, content }: EditMutationVars) => editDraft(draftId, content),
    onMutate: async (): Promise<QueueMutationContext> => {
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: ["queue", scope] });
      const previousQueue = queryClient.getQueryData<QueuePayload>(["queue", scope]);
      return { previousQueue };
    },
    onSuccess: (updatedDraft) => {
      queryClient.setQueryData<QueuePayload>(["queue", scope], (currentQueue) => {
        if (!currentQueue) {
          return currentQueue;
        }
        return updateDraftInQueue(currentQueue, updatedDraft);
      });
    },
    onError: (_error, _vars, context) => {
      if (context?.previousQueue) {
        queryClient.setQueryData(["queue", scope], context.previousQueue);
      }
      setErrorMessage("Could not save edit. Changes were reverted.");
    },
  });
  const discardMutation = useMutation({
    mutationFn: ({ draftId }: DraftMutationVars) => discardDraft(draftId),
    onMutate: async (): Promise<QueueMutationContext> => {
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: ["queue", scope] });
      const previousQueue = queryClient.getQueryData<QueuePayload>(["queue", scope]);
      return { previousQueue };
    },
    onSuccess: (_draft, { draftId }) => {
      setExitingDrafts((current) => ({ ...current, [draftId]: "discarded" }));
      scheduleExitCleanup(draftId);
    },
    onError: (_error, _vars, context) => {
      if (context?.previousQueue) {
        queryClient.setQueryData(["queue", scope], context.previousQueue);
      }
      setErrorMessage("Could not discard draft. Changes were reverted.");
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: () => approveAll(),
    onMutate: async (): Promise<QueueMutationContext> => {
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: ["queue", scope] });
      const previousQueue = queryClient.getQueryData<QueuePayload>(["queue", scope]);
      if (previousQueue) {
        queryClient.setQueryData<QueuePayload>(["queue", scope], {
          jobs: [],
          inbox: previousQueue.inbox,
        });
      }
      return { previousQueue };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousQueue) {
        queryClient.setQueryData(["queue", scope], context.previousQueue);
      }
      setErrorMessage("Could not approve all drafts. Changes were reverted.");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["queue", scope] });
    },
  });

  const transcriptLinkMutation = useMutation({
    mutationFn: ({ transcriptId, jobId }: { transcriptId: string; jobId: string }) =>
      linkTranscriptToJob(transcriptId, jobId),
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not link transcript to job.");
    },
    onSuccess: async () => {
      setErrorMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["queue", scope] }),
        queryClient.invalidateQueries({ queryKey: ["jobs", scope] }),
      ]);
    },
  });

  const transcriptReviewMutation = useMutation({
    mutationFn: (transcriptId: string) => markTranscriptReviewed(transcriptId),
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not mark transcript reviewed.");
    },
    onSuccess: async () => {
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["queue", scope] });
    },
  });

  const transcriptDiscardMutation = useMutation({
    mutationFn: (transcriptId: string) => discardTranscript(transcriptId),
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not discard transcript.");
    },
    onSuccess: async () => {
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["queue", scope] });
    },
  });

  const transcriptLogUpdateMutation = useMutation({
    mutationFn: (transcriptId: string) => logTranscriptAsUpdate(transcriptId),
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not log transcript as update.");
    },
    onSuccess: async () => {
      setErrorMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["queue", scope] }),
        queryClient.invalidateQueries({ queryKey: ["jobs", scope] }),
      ]);
    },
  });

  const isDraftLoading = (draftId: string): boolean => {
    return (
      (approveMutation.isPending && approveMutation.variables?.draftId === draftId) ||
      (editMutation.isPending && editMutation.variables?.draftId === draftId) ||
      (discardMutation.isPending && discardMutation.variables?.draftId === draftId)
    );
  };

  return (
    <div className="pw">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[52px] font-bold tracking-[-0.05em] text-slate-950">Queue</h1>
          <p className="mt-3 text-[18px] text-slate-500">
            Review quotes, updates, and call transcripts before they become customer-facing work.
          </p>
          <p className="mt-2 text-sm font-medium text-slate-400">
            {pendingCount} items waiting · {isOnline ? "Live runtime" : "Offline cache"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {pendingCount > 1 ? (
            <button
              type="button"
              className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => approveAllMutation.mutate()}
              disabled={approveAllMutation.isPending}
            >
              {approveAllMutation.isPending ? "Approving..." : "Approve all"}
            </button>
          ) : null}
          <Link
            to="/quote"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2453d4] px-5 text-[15px] font-semibold text-white no-underline shadow-[0_8px_18px_rgba(37,83,212,0.18)] transition hover:bg-[#1f46b3]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New Quote</span>
          </Link>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        {[
          {
            label: "Pending reviews",
            value: pendingCount,
            detail: pendingCount > 0 ? "Action needed" : "Queue clear",
            accent: "text-orange-500",
          },
          {
            label: "Transcript inbox",
            value: transcriptInbox.length,
            detail: transcriptInbox.length > 0 ? "Needs routing" : "No unlinked calls",
            accent: "text-slate-500",
          },
          {
            label: "Job-backed drafts",
            value: queueGroups.reduce((sum, group) => sum + group.drafts.length, 0),
            detail: queueGroups.length > 0 ? "Grouped by active job" : "No job drafts",
            accent: "text-slate-500",
          },
          {
            label: "Jobs in motion",
            value: jobs.filter((job) => job.status !== "complete").length,
            detail: jobs.length > 0 ? "Live contractor workload" : "No jobs found",
            accent: "text-slate-500",
          },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="text-[15px] font-medium text-slate-500">{card.label}</div>
            <div className="mt-5 flex items-end gap-3">
              <div className="text-[52px] font-bold tracking-[-0.05em] text-slate-950">{card.value}</div>
              <div className={`mb-2 text-[15px] font-medium ${card.accent}`}>{card.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {jobFilterButtons.map((group) => {
          const isActive = selectedJobId === group.job_id;
          return (
            <button
              key={group.job_id ?? "all"}
              type="button"
              onClick={() => setSelectedJobId(group.job_id)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-semibold transition ${
                isActive
                  ? "border-[#2453d4] bg-[#2453d4] text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{group.job_name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {group.count}
              </span>
            </button>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-[15px] text-orange-700">
          {errorMessage}
        </div>
      ) : null}

      {queueQuery.isError ? (
        <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-[15px] text-orange-700">
          Queue unavailable. Try again shortly.
        </div>
      ) : null}

      {transcriptInbox.length > 0 ? (
        <section className="mt-8 overflow-hidden rounded-[28px] border border-orange-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50/60 px-7 py-5">
            <div className="flex items-center gap-3 text-[20px] font-semibold text-slate-950">
              <AlertTriangle className="h-5 w-5 text-orange-500" aria-hidden="true" />
              <span>Transcript Inbox</span>
            </div>
            <span className="rounded-xl border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-900">
              {transcriptInbox.length}
            </span>
          </div>
          <div className="space-y-5 px-7 py-7">
            {transcriptInbox.map((transcript) => {
              const selectedJob = linkSelections[transcript.transcript_id] ?? "";
              const transcriptOpen = !!openTranscriptIds[`inbox-${transcript.transcript_id}`];
              const isBusy =
                transcriptLinkMutation.isPending ||
                transcriptReviewMutation.isPending ||
                transcriptDiscardMutation.isPending ||
                transcriptLogUpdateMutation.isPending;

              return (
                <article key={transcript.transcript_id} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[20px] font-semibold text-slate-950">{inboxCallerLabel(transcript)}</span>
                        <span className={`inline-flex rounded-xl px-3 py-1 text-sm font-semibold ${transcriptUrgencyTone(transcript.urgency)}`}>
                          {transcript.urgency || "normal"}
                        </span>
                        <span className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600">
                          {classificationLabel(transcript.classification)}
                        </span>
                        {transcript.linked_quote_id ? (
                          <span className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-[#2453d4]">
                            {transcript.linked_quote_id}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-4 text-[17px] leading-8 text-slate-900">{inboxSummary(transcript)}</p>
                      <p className="mt-3 text-[15px] leading-7 text-slate-500">{inboxActionCopy(transcript)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-right shadow-sm">
                      <div className="text-[28px] font-bold tracking-[-0.04em] text-slate-950">{confidenceLabel(transcript.confidence)}</div>
                      <div className="mt-1 text-sm font-medium text-slate-500">Inbox review</div>
                    </div>
                  </div>

                  {transcript.recommended_actions.length ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {transcript.recommended_actions.slice(0, 3).map((action) => (
                        <span key={`${transcript.transcript_id}-${action}`} className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-[#2453d4]">
                          {action}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {transcript.risk_flags.length ? (
                    <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-[15px] text-orange-700">
                      {transcript.risk_flags[0]}
                    </div>
                  ) : null}

                  {transcript.missing_information.length ? (
                    <div className="mt-5">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        Missing information
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {transcript.missing_information.map((item) => (
                          <span key={`${transcript.transcript_id}-${item}`} className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div>
                      <label className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500" htmlFor={`link-job-${transcript.transcript_id}`}>
                        Link to job
                      </label>
                      <select
                        id={`link-job-${transcript.transcript_id}`}
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-[15px] text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={selectedJob}
                        onChange={(event) =>
                          setLinkSelections((current) => ({
                            ...current,
                            [transcript.transcript_id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select existing job...</option>
                        {jobs.map((job) => (
                          <option key={`${transcript.transcript_id}-${job.id}`} value={job.id}>
                            {job.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">Caller / source</div>
                      <div className="mt-2 text-[15px] text-slate-600">
                        {(transcript.source || "call_transcript").replace(/_/g, " ")}
                        {transcript.provider ? ` · ${transcript.provider}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {transcript.classification === "estimate_request" ? (
                      <Link
                        to={`/quote?transcript_id=${encodeURIComponent(transcript.transcript_id)}`}
                        className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 no-underline transition hover:bg-slate-50"
                      >
                        Create quote draft
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => transcriptLinkMutation.mutate({ transcriptId: transcript.transcript_id, jobId: selectedJob })}
                      disabled={!selectedJob || isBusy}
                    >
                      Link to job
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={async () => {
                        if (!selectedJob) {
                          setErrorMessage("Link the transcript to a job before logging it as an update.");
                          return;
                        }
                        await transcriptLinkMutation.mutateAsync({ transcriptId: transcript.transcript_id, jobId: selectedJob });
                        await transcriptLogUpdateMutation.mutateAsync(transcript.transcript_id);
                      }}
                      disabled={isBusy || !selectedJob}
                    >
                      Log as update
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[15px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => transcriptReviewMutation.mutate(transcript.transcript_id)}
                      disabled={isBusy}
                    >
                      Mark reviewed
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-orange-50 px-4 text-[15px] font-semibold text-orange-600 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => transcriptDiscardMutation.mutate(transcript.transcript_id)}
                      disabled={isBusy}
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50"
                      onClick={() =>
                        setOpenTranscriptIds((current) => ({
                          ...current,
                          [`inbox-${transcript.transcript_id}`]: !current[`inbox-${transcript.transcript_id}`],
                        }))
                      }
                    >
                      {transcriptOpen ? "Hide transcript" : "View transcript"}
                    </button>
                  </div>

                  {transcriptOpen ? (
                    <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">Raw transcript</div>
                      <pre className="mt-3 whitespace-pre-wrap font-mono text-[12px] leading-6 text-slate-600">{inboxRawText(transcript)}</pre>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {queueQuery.isLoading ? (
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white px-7 py-8 text-[15px] text-slate-500 shadow-sm">
          Loading queue...
        </div>
      ) : null}

      {!queueQuery.isLoading && visibleDrafts.length === 0 && transcriptInbox.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white px-7 py-8 text-[15px] text-slate-500 shadow-sm">
          No queued drafts are waiting right now.
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_360px]">
        <section className="space-y-4">
          {visibleDrafts.map(({ draft, group }) => {
            const isOpen = openDraftId === draft.id;
            const editValue = draftEdits[draft.id] ?? draft.content;
            const isTranscriptDraft = draft.type === "transcript-review" && !!draft.transcript;
            const transcript = draft.transcript;
            const rawTranscriptOpen = !!openTranscriptIds[draft.id];
            const jobLabel = group.job_name || draft.job_name;

            return (
              <article key={draft.id} className={`rounded-[28px] border bg-white shadow-sm transition ${isOpen ? "border-[#2453d4] ring-4 ring-blue-100" : "border-slate-200"} ${exitingDrafts[draft.id] ? "opacity-60" : "opacity-100"}`}>
                <button
                  type="button"
                  className="block w-full rounded-[28px] px-7 py-7 text-left"
                  onClick={() => setOpenDraftId((current) => (current === draft.id ? null : draft.id))}
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[20px] font-semibold text-slate-950">{transcriptHeadline(draft)}</span>
                        <span className="inline-flex rounded-xl border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">{jobLabel}</span>
                        <span className={`inline-flex rounded-xl px-3 py-1 text-sm font-semibold ${draftTone(draft.type)}`}>{draft.type}</span>
                        {isTranscriptDraft ? (
                          <>
                            <span className={`inline-flex rounded-xl px-3 py-1 text-sm font-semibold ${transcriptUrgencyTone(transcript?.urgency)}`}>
                              {transcript?.urgency ?? "normal"}
                            </span>
                            <span className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600">
                              {classificationLabel(transcript?.classification)}
                            </span>
                            {transcript?.linked_quote_id ? (
                              <span className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-[#2453d4]">
                                {transcript.linked_quote_id}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>

                      <p className="mt-4 text-[17px] leading-8 text-slate-900">{isTranscriptDraft ? transcriptSummary(draft) : draft.why}</p>
                      <p className="mt-3 text-[15px] leading-7 text-slate-500">{isTranscriptDraft ? transcriptActionLabel(draft) : `Needs attention: ${nextActionLabel(draft.type)}`}</p>
                      {isTranscriptDraft && transcript?.recommended_actions?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {transcript.recommended_actions.slice(0, 2).map((action) => (
                            <span
                              key={`${draft.id}-collapsed-${action}`}
                              className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-[#2453d4]"
                            >
                              {action}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-right shadow-sm">
                      <div className="text-[28px] font-bold tracking-[-0.04em] text-slate-950">{isTranscriptDraft ? confidenceLabel(transcript?.confidence) : formatCreatedAt(draft.created_at)}</div>
                      <span className={`mt-2 inline-flex rounded-xl px-3 py-1 text-sm font-semibold ${statusTone(draft.status)}`}>{draft.status}</span>
                    </div>
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-slate-200 px-7 py-6">
                    {isTranscriptDraft ? (
                      <>
                        {transcript?.recommended_actions?.length ? (
                          <div className="mb-5 flex flex-wrap gap-2">
                            {transcript.recommended_actions.slice(0, 3).map((action) => (
                              <span key={`${draft.id}-${action}`} className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-[#2453d4]">
                                {action}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {transcript?.risk_flags?.length ? (
                          <div className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-[15px] text-orange-700">
                            {transcript.risk_flags[0]}
                          </div>
                        ) : null}

                        {transcript?.missing_information?.length ? (
                          <div className="mb-5">
                            <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">Missing information</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {transcript.missing_information.map((item) => (
                                <span key={`${draft.id}-${item}`} className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-3">
                          <Link
                            to={`/jobs/${encodeURIComponent(draft.job_id)}`}
                            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 no-underline transition hover:bg-slate-50"
                          >
                            Open job
                          </Link>
                          {transcript?.classification === "estimate_request" && transcript.transcript_id ? (
                            <Link
                              to={`/quote?transcript_id=${encodeURIComponent(transcript.transcript_id)}`}
                              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 no-underline transition hover:bg-slate-50"
                            >
                              Create quote draft
                            </Link>
                          ) : null}
                          {transcript?.transcript_id ? (
                            <button
                              type="button"
                              className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[15px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => transcriptReviewMutation.mutate(transcript.transcript_id)}
                              disabled={transcriptReviewMutation.isPending}
                            >
                              Mark reviewed
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50"
                            onClick={() =>
                              setOpenTranscriptIds((current) => ({
                                ...current,
                                [draft.id]: !current[draft.id],
                              }))
                            }
                          >
                            {rawTranscriptOpen ? "Hide transcript" : "View transcript"}
                          </button>
                        </div>

                        {rawTranscriptOpen ? (
                          <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
                            <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">Raw transcript</div>
                            <pre className="mt-3 whitespace-pre-wrap font-mono text-[12px] leading-6 text-slate-600">{transcriptRawText(draft)}</pre>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                          <label className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500" htmlFor={`draft-content-${draft.id}`}>
                            Draft content
                          </label>
                          <textarea
                            id={`draft-content-${draft.id}`}
                            className="mt-3 min-h-[160px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-7 text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                            value={editValue}
                            onChange={(event) =>
                              setDraftEdits((current) => ({
                                ...current,
                                [draft.id]: event.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            type="button"
                            className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[15px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => approveMutation.mutate({ draftId: draft.id })}
                            disabled={isDraftLoading(draft.id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => editMutation.mutate({ draftId: draft.id, content: editValue })}
                            disabled={isDraftLoading(draft.id)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-10 items-center rounded-xl border border-orange-200 bg-orange-50 px-4 text-[15px] font-semibold text-orange-600 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => discardMutation.mutate({ draftId: draft.id })}
                            disabled={isDraftLoading(draft.id)}
                          >
                            Discard
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-3 text-[18px] font-semibold text-slate-950">
              <ClipboardList className="h-5 w-5 text-[#2453d4]" aria-hidden="true" />
              <span>Queue guidance</span>
            </div>
            <div className="mt-6 space-y-5 text-[15px] leading-7 text-slate-500">
              <div>
                <div className="font-semibold text-slate-900">Review reason first</div>
                <div className="mt-1">Every item leads with the agent summary so you can decide before opening the full draft.</div>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Keep transcripts compact</div>
                <div className="mt-1">Raw call text stays hidden until you ask for it. Summary and next action stay on top.</div>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Route unlinked work quickly</div>
                <div className="mt-1">Use the inbox when a call has not been linked to a job yet. That keeps persisted transcripts actionable.</div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-3 text-[18px] font-semibold text-slate-950">
              <Sparkles className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <span>Jobs in motion</span>
            </div>
            <div className="mt-6 space-y-4">
              {jobs.slice(0, 4).map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-inherit no-underline transition hover:bg-white"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[16px] font-semibold text-slate-950">{job.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{job.type} · {job.contract_type}</div>
                  </div>
                  <span className="text-sm font-medium text-slate-400">{job.status}</span>
                </Link>
              ))}
              {jobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-[15px] text-slate-500">
                  No jobs loaded yet.
                </div>
              ) : null}
            </div>
            <Link to="/jobs" className="mt-5 inline-flex items-center gap-2 text-[15px] font-medium text-slate-500 no-underline hover:text-slate-900">
              Open jobs board
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          {!isOnline ? (
            <section className="rounded-3xl border border-blue-200 bg-blue-50 p-7 shadow-sm">
              <div className="flex items-center gap-3 text-[18px] font-semibold text-[#2453d4]">
                <RefreshCcw className="h-5 w-5" aria-hidden="true" />
                <span>Offline queue cache</span>
              </div>
              <p className="mt-3 text-[15px] leading-7 text-slate-600">
                Drafts remain visible while offline. Changes will sync when the browser reconnects.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
