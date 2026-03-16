import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { Activity, ArrowLeft, Clock3, FileText, History, MessageSquareMore, Phone, Sparkles } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { advanceOpenItemLifecycle, createOpenItemDraftAction, fetchJobDetail } from "../api/jobs";
import { approveDraft, discardDraft, editDraft } from "../api/queue";
import { logTranscriptAsUpdate } from "../api/transcripts";
import { useQueue } from "../hooks/useQueue";
import type { JobCallHistoryEntry, OpenItem, OpenItemActionStage, QueuePayload, TranscriptClassification } from "../types";

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

function removeDraftFromQueue(queue: QueuePayload, draftId: string): QueuePayload {
  return {
    jobs: queue.jobs
      .map((group) => ({
        ...group,
        drafts: group.drafts.filter((draft) => draft.id !== draftId),
      }))
      .filter((group) => group.drafts.length > 0),
    inbox: queue.inbox,
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Awaiting update";
  }
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

function followupTag(status: string | undefined): { label: string; className: string } {
  if (status === "scheduled") return { label: "Active", className: "border border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (status === "stopped") return { label: "Stopped", className: "border border-orange-200 bg-orange-50 text-orange-600" };
  if (status === "pending_destination") return { label: "Pending", className: "border border-slate-200 bg-slate-100 text-slate-600" };
  return { label: "Inactive", className: "border border-slate-200 bg-slate-100 text-slate-600" };
}

function followupHeadline(status: string | undefined): string {
  if (status === "stopped") return "Automatic follow-through is paused for this quote.";
  if (status === "scheduled") return "Automatic follow-through is active for this quote.";
  if (status === "pending_destination") return "Automatic follow-through is waiting on a destination.";
  return "No automatic follow-through is active for this quote.";
}

function followupReason(reason: string | null): string {
  const normalized = (reason ?? "").trim().toLowerCase();
  if (normalized === "max_reminders_reached") return "Two follow-through reminders have already been sent.";
  if (normalized === "manual_stop") return "You paused automatic follow-through for this quote.";
  if (normalized === "quote_discarded") return "This quote was discarded.";
  if (normalized === "quote_accepted") return "The customer already accepted this quote.";
  if (!normalized) return "Sequence activates after the quote is sent.";
  return normalized.replace(/_/g, " ");
}

function transcriptUrgencyTone(urgency: string): string {
  const normalized = urgency.trim().toLowerCase();
  if (normalized === "high") return "border border-orange-200 bg-orange-50 text-orange-600";
  if (normalized === "low") return "border border-slate-200 bg-slate-100 text-slate-600";
  return "border border-amber-200 bg-amber-50 text-amber-700";
}

function transcriptClassificationLabel(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "unknown";
  return normalized.replace(/_/g, " ");
}

function transcriptConfidenceLabel(value: number | null): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Manual";
  }
  const normalized = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return `${normalized}%`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return "";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes <= 0) {
    return `${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function transcriptSummary(entry: Pick<JobCallHistoryEntry, "summary" | "transcript_text">): string {
  return entry.summary || entry.transcript_text || "Manual transcript review needed.";
}

function transcriptRawText(entry: Pick<JobCallHistoryEntry, "transcript_text">): string {
  return entry.transcript_text || "Transcript text unavailable.";
}

function shortTrace(traceId: string): string {
  const normalized = traceId.trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 18 ? `${normalized.slice(0, 15)}...` : normalized;
}

function timelineTone(eventType: string): string {
  if (eventType.includes("quote") || eventType.includes("delivery")) return "bg-blue-50 text-[#2453d4]";
  if (eventType.includes("follow")) return "bg-emerald-50 text-emerald-700";
  if (eventType.includes("transcript")) return "bg-violet-50 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

function unresolvedItemTone(item: OpenItem): string {
  if (item.financial_exposure) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  if (item.change_related) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function unresolvedItemLabel(item: OpenItem): string {
  return item.kind_label || item.type.replace(/-/g, " ");
}

function unresolvedItemStageTone(stage: OpenItemActionStage | null | undefined): string {
  if (stage === "approved") return "border border-blue-200 bg-blue-50 text-[#2453d4]";
  if (stage === "sent") return "border border-amber-200 bg-amber-50 text-amber-700";
  if (stage === "customer-approved") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  if (stage === "drafted") return "border border-slate-200 bg-slate-100 text-slate-600";
  return "border border-slate-200 bg-slate-100 text-slate-600";
}

const UPDATE_ACTION_TRANSCRIPT_CLASSES = new Set<TranscriptClassification>([
  "job_update",
  "reschedule",
  "complaint_or_issue",
  "followup_response",
  "vendor_or_subcontractor",
]);

function canLogTranscriptAsUpdate(classification: TranscriptClassification): boolean {
  return UPDATE_ACTION_TRANSCRIPT_CLASSES.has(classification);
}

export function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId ?? "";

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [expandedTranscriptIds, setExpandedTranscriptIds] = useState<Record<string, boolean>>({});
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});

  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const scope = currentUserId ?? "anonymous";

  const queryClient = useQueryClient();
  const queueQuery = useQueue(currentUserId);
  const detailQuery = useQuery({
    queryKey: ["job-detail", scope, jobId],
    queryFn: () => fetchJobDetail(jobId),
    enabled: Boolean(currentUserId) && jobId.length > 0,
  });

  const job = detailQuery.data?.job;
  const callHistory = useMemo(() => (detailQuery.data?.call_history ?? []).slice(0, 8), [detailQuery.data]);
  const auditTimeline = useMemo(() => {
    const events = detailQuery.data?.audit_timeline ?? [];
    const withoutTranscriptDuplicates =
      callHistory.length > 0 ? events.filter((event) => event.event_type !== "call_transcript_received") : events;

    if (withoutTranscriptDuplicates.length > 0) {
      return withoutTranscriptDuplicates.slice(0, 16);
    }

    return (detailQuery.data?.recent_updates ?? []).map((entry) => ({
      id: entry.id,
      event_type: "update_logged",
      timestamp: entry.created_at,
      title: "Update logged",
      summary: entry.raw_input,
      trace_id: "",
      metadata: entry.parsed_changes,
    }));
  }, [callHistory.length, detailQuery.data]);
  const followupState = detailQuery.data?.followup_state ?? null;
  const unresolvedItems = useMemo(
    () => (job?.open_items ?? []).filter((item) => item.type !== "follow-up" && item.type !== "followup"),
    [job?.open_items]
  );

  const pendingDrafts = useMemo(() => {
    const groups = queueQuery.data?.jobs ?? [];
    return groups.find((group) => group.job_id === jobId)?.drafts ?? [];
  }, [queueQuery.data, jobId]);
  const pendingDraftTraceIds = useMemo(
    () => new Set(pendingDrafts.map((draft) => draft.trace_id).filter((value): value is string => Boolean(value))),
    [pendingDrafts]
  );

  useEffect(() => {
    if (!jobId || !currentUserId) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["job-detail", scope, jobId] });
  }, [queueQuery.dataUpdatedAt, jobId, currentUserId, scope, queryClient]);

  const approveMutation = useMutation({
    mutationFn: ({ draftId }: DraftMutationVars) => approveDraft(draftId),
    onMutate: async ({ draftId }): Promise<QueueMutationContext> => {
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: ["queue", scope] });
      const previousQueue = queryClient.getQueryData<QueuePayload>(["queue", scope]);
      if (previousQueue) {
        queryClient.setQueryData<QueuePayload>(["queue", scope], removeDraftFromQueue(previousQueue, draftId));
      }
      return { previousQueue };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousQueue) {
        queryClient.setQueryData(["queue", scope], context.previousQueue);
      }
      setErrorMessage("Could not approve draft. Changes were reverted.");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["queue", scope] }),
        queryClient.invalidateQueries({ queryKey: ["job-detail", scope, jobId] }),
        queryClient.invalidateQueries({ queryKey: ["jobs", scope] }),
      ]);
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ draftId, content }: EditMutationVars) => editDraft(draftId, content),
    onMutate: async ({ draftId }): Promise<QueueMutationContext> => {
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: ["queue", scope] });
      const previousQueue = queryClient.getQueryData<QueuePayload>(["queue", scope]);
      if (previousQueue) {
        queryClient.setQueryData<QueuePayload>(["queue", scope], removeDraftFromQueue(previousQueue, draftId));
      }
      return { previousQueue };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousQueue) {
        queryClient.setQueryData(["queue", scope], context.previousQueue);
      }
      setErrorMessage("Could not save edit. Changes were reverted.");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["queue", scope] }),
        queryClient.invalidateQueries({ queryKey: ["job-detail", scope, jobId] }),
        queryClient.invalidateQueries({ queryKey: ["jobs", scope] }),
      ]);
    },
  });

  const discardMutation = useMutation({
    mutationFn: ({ draftId }: DraftMutationVars) => discardDraft(draftId),
    onMutate: async ({ draftId }): Promise<QueueMutationContext> => {
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: ["queue", scope] });
      const previousQueue = queryClient.getQueryData<QueuePayload>(["queue", scope]);
      if (previousQueue) {
        queryClient.setQueryData<QueuePayload>(["queue", scope], removeDraftFromQueue(previousQueue, draftId));
      }
      return { previousQueue };
    },
    onError: (_error, _vars, context) => {
      if (context?.previousQueue) {
        queryClient.setQueryData(["queue", scope], context.previousQueue);
      }
      setErrorMessage("Could not discard draft. Changes were reverted.");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["queue", scope] }),
        queryClient.invalidateQueries({ queryKey: ["job-detail", scope, jobId] }),
        queryClient.invalidateQueries({ queryKey: ["jobs", scope] }),
      ]);
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
        queryClient.invalidateQueries({ queryKey: ["job-detail", scope, jobId] }),
        queryClient.invalidateQueries({ queryKey: ["jobs", scope] }),
      ]);
    },
  });

  const openItemDraftMutation = useMutation({
    mutationFn: (openItemId: string) => createOpenItemDraftAction(jobId, openItemId),
    onMutate: () => {
      setErrorMessage(null);
      setActionMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not create follow-through draft.");
    },
    onSuccess: async (payload) => {
      setActionMessage(`${payload.draft.title} is ready in the review queue.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["queue", scope] }),
        queryClient.invalidateQueries({ queryKey: ["job-detail", scope, jobId] }),
        queryClient.invalidateQueries({ queryKey: ["jobs", scope] }),
      ]);
    },
  });

  const openItemLifecycleMutation = useMutation({
    mutationFn: ({ openItemId, stage }: { openItemId: string; stage: OpenItemActionStage }) =>
      advanceOpenItemLifecycle(jobId, openItemId, stage),
    onMutate: () => {
      setErrorMessage(null);
      setActionMessage(null);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not update unresolved item lifecycle.");
    },
    onSuccess: async ({ open_item }, variables) => {
      const label = open_item.kind_label || "Open item";
      if (variables.stage === "sent") {
        setActionMessage(`${label} marked sent and is now waiting on the customer.`);
      } else if (variables.stage === "customer-approved") {
        setActionMessage(`${label} marked customer approved.`);
      } else {
        setActionMessage(`${label} marked completed and removed from unresolved work.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["queue", scope] }),
        queryClient.invalidateQueries({ queryKey: ["job-detail", scope, jobId] }),
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

  const toggleTranscript = (transcriptId: string) => {
    setExpandedTranscriptIds((current) => ({
      ...current,
      [transcriptId]: !current[transcriptId],
    }));
  };

  const followupChip = followupTag(followupState?.status);

  if (detailQuery.isLoading) {
    return <div className="pw"><div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-[15px] text-slate-500 shadow-sm">Loading job details...</div></div>;
  }

  if (detailQuery.isError || !job) {
    return <div className="pw"><div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-[15px] text-slate-500 shadow-sm">Job detail unavailable. Check backend connectivity and auth.</div></div>;
  }

  return (
    <div className="pw">
      <div className="mb-8 flex flex-col gap-4">
        <Link
          to="/jobs"
          className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-[14px] font-semibold text-slate-700 no-underline transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Jobs</span>
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-[48px] font-bold tracking-[-0.05em] text-slate-950">{job.name}</h1>
            <p className="mt-3 text-[18px] text-slate-500">{job.address || `${job.type} job record`}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm font-medium uppercase tracking-[0.08em] text-slate-400">Job ID</div>
            <div className="mt-2 text-[18px] font-semibold text-slate-950">{job.id}</div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-[15px] text-orange-700">
          {errorMessage}
        </div>
      ) : null}
      {actionMessage ? (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-[15px] text-emerald-700">
          {actionMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="space-y-6">
          <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-3 text-[18px] font-semibold text-slate-950">
              <Sparkles className="h-5 w-5 text-[#2453d4]" aria-hidden="true" />
              <span>Job overview</span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                ["Type", job.type],
                ["Status", job.status],
                ["Contract value", formatCurrency(job.contract_value)],
                ["Completion target", job.est_completion || "Not set"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</div>
                  <div className="mt-2 text-[17px] font-semibold text-slate-950">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-400">Notes</div>
              <div className="mt-3 text-[15px] leading-7 text-slate-600">{job.notes || "No site notes recorded yet."}</div>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-[18px] font-semibold text-slate-950">
                <History className="h-5 w-5 text-orange-500" aria-hidden="true" />
                <span>Unresolved changes & approvals</span>
              </div>
              <span className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600">
                {unresolvedItems.length} tracked
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {unresolvedItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-6 text-[15px] text-slate-500">
                  No unresolved change or approval items are tracked on this job.
                </div>
              ) : (
                unresolvedItems.map((item) => (
                  <div key={item.id} className={`rounded-2xl border px-5 py-5 ${unresolvedItemTone(item)}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-current/20 bg-white/70 px-3 py-1 text-sm font-semibold">
                        {unresolvedItemLabel(item)}
                      </span>
                      {item.financial_exposure ? (
                        <span className="inline-flex rounded-full border border-current/20 bg-white/70 px-3 py-1 text-sm font-semibold">
                          Financial exposure
                        </span>
                      ) : null}
                      {item.stalled ? (
                        <span className="inline-flex rounded-full border border-current/20 bg-white/70 px-3 py-1 text-sm font-semibold">
                          {item.days_silent} days silent
                        </span>
                      ) : null}
                      {item.action_stage_label ? (
                        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${unresolvedItemStageTone(item.action_stage)}`}>
                          {item.action_stage_label}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 text-[16px] font-semibold text-slate-950">{item.description}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-[15px] text-slate-500">
                      <span>Owner: {item.owner}</span>
                      {item.due_date ? <span>Due {item.due_date}</span> : null}
                      <span>Status: {item.status}</span>
                    </div>
                    {item.action_stage_summary ? (
                      <div className="mt-3 text-[15px] leading-7 text-slate-600">{item.action_stage_summary}</div>
                    ) : null}
                    {item.action_trace_id && item.action_label ? (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {pendingDraftTraceIds.has(item.action_trace_id) ? (
                          <Link
                            to="/queue"
                            className="inline-flex h-10 items-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-[15px] font-semibold text-[#2453d4] no-underline transition hover:bg-blue-100"
                          >
                            Open review draft
                          </Link>
                        ) : item.action_stage === "approved" ? (
                          <button
                            type="button"
                            className="inline-flex h-10 items-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-[15px] font-semibold text-[#2453d4] transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => openItemLifecycleMutation.mutate({ openItemId: item.id, stage: "sent" })}
                            disabled={openItemLifecycleMutation.isPending}
                          >
                            {openItemLifecycleMutation.isPending &&
                            openItemLifecycleMutation.variables?.openItemId === item.id &&
                            openItemLifecycleMutation.variables?.stage === "sent"
                              ? "Updating..."
                              : "Mark sent"}
                          </button>
                        ) : item.action_stage === "sent" ? (
                          <>
                            <button
                              type="button"
                              className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[15px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() =>
                                openItemLifecycleMutation.mutate({
                                  openItemId: item.id,
                                  stage: "customer-approved",
                                })
                              }
                              disabled={openItemLifecycleMutation.isPending}
                            >
                              {openItemLifecycleMutation.isPending &&
                              openItemLifecycleMutation.variables?.openItemId === item.id &&
                              openItemLifecycleMutation.variables?.stage === "customer-approved"
                                ? "Updating..."
                                : "Mark customer approved"}
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() =>
                                openItemLifecycleMutation.mutate({
                                  openItemId: item.id,
                                  stage: "completed",
                                })
                              }
                              disabled={openItemLifecycleMutation.isPending}
                            >
                              {openItemLifecycleMutation.isPending &&
                              openItemLifecycleMutation.variables?.openItemId === item.id &&
                              openItemLifecycleMutation.variables?.stage === "completed"
                                ? "Updating..."
                                : "Mark completed"}
                            </button>
                          </>
                        ) : item.action_stage === "customer-approved" ? (
                          <button
                            type="button"
                            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() =>
                              openItemLifecycleMutation.mutate({
                                openItemId: item.id,
                                stage: "completed",
                              })
                            }
                            disabled={openItemLifecycleMutation.isPending}
                          >
                            {openItemLifecycleMutation.isPending &&
                            openItemLifecycleMutation.variables?.openItemId === item.id &&
                            openItemLifecycleMutation.variables?.stage === "completed"
                              ? "Updating..."
                              : "Mark completed"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => openItemDraftMutation.mutate(item.id)}
                            disabled={openItemDraftMutation.isPending}
                          >
                            {openItemDraftMutation.isPending && openItemDraftMutation.variables === item.id
                              ? "Drafting..."
                              : item.action_label}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-[18px] font-semibold text-slate-950">
                <MessageSquareMore className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                <span>Customer follow-through</span>
              </div>
              <span className={`inline-flex rounded-xl px-3 py-1 text-sm font-semibold ${followupChip.className}`}>{followupChip.label}</span>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="text-[18px] font-semibold text-slate-950">{followupHeadline(followupState?.status)}</div>
              <div className="mt-2 text-[15px] leading-7 text-slate-500">{followupReason(followupState?.stop_reason ?? null)}</div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-400">Channel</div>
                  <div className="mt-2 text-[16px] font-semibold text-slate-950">{followupState?.channel ? followupState.channel.charAt(0).toUpperCase() + followupState.channel.slice(1) : "None"}</div>
                </div>
                <div>
                  <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-400">Reminders sent</div>
                  <div className="mt-2 text-[16px] font-semibold text-slate-950">{followupState?.reminder_count ?? 0}</div>
                </div>
                <div>
                  <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-400">Last reminder</div>
                  <div className="mt-2 text-[16px] font-semibold text-slate-950">{formatTimestamp(followupState?.last_reminder_at ?? null)}</div>
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-3 text-[18px] font-semibold text-slate-950">
              <FileText className="h-5 w-5 text-[#2453d4]" aria-hidden="true" />
              <span>Work waiting on review</span>
            </div>
            <div className="mt-6 space-y-4">
              {pendingDrafts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-6 text-[15px] text-slate-500">No review items are waiting on this job.</div>
              ) : (
                pendingDrafts.map((draft) => {
                  const editValue = draftEdits[draft.id] ?? draft.content;
                  return (
                    <div key={draft.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[17px] font-semibold text-slate-950">{draft.title || draft.type}</div>
                        <span className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600">{draft.type}</span>
                      </div>
                      <div className="mt-3 text-[15px] leading-7 text-slate-500">{draft.why}</div>
                      <label className="mt-4 block text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-400" htmlFor={`job-draft-${draft.id}`}>
                        Draft content
                      </label>
                      <textarea
                        id={`job-draft-${draft.id}`}
                        className="mt-3 min-h-[132px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-7 text-slate-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        value={editValue}
                        onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: event.target.value }))}
                      />
                      <div className="mt-4 flex flex-wrap gap-3">
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
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </section>

        <section className="space-y-6">
          <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-3 text-[18px] font-semibold text-slate-950">
              <Phone className="h-5 w-5 text-[#2453d4]" aria-hidden="true" />
              <span>Calls &amp; communication</span>
            </div>
            <div className="mt-6 space-y-4">
              {callHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-6 text-[15px] text-slate-500">No calls or transcripts are linked to this job yet.</div>
              ) : (
                callHistory.map((entry) => {
                  const isOpen = !!expandedTranscriptIds[entry.id];
                  const duration = formatDuration(entry.duration_seconds);
                  return (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[18px] font-semibold text-slate-950">{transcriptSummary(entry)}</div>
                        <span className={`inline-flex rounded-xl px-3 py-1 text-sm font-semibold ${transcriptUrgencyTone(entry.urgency)}`}>{entry.urgency || "normal"}</span>
                        <span className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600">{transcriptClassificationLabel(entry.classification)}</span>
                        <span className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600">{transcriptConfidenceLabel(entry.confidence)}</span>
                        {entry.linked_quote_id ? (
                          <span className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-[#2453d4]">{entry.linked_quote_id}</span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-4 text-[15px] text-slate-500">
                        <span>{entry.caller_label || "Inbound call transcript"}</span>
                        <span>{formatTimestamp(entry.timestamp)}</span>
                        {duration ? <span>{duration}</span> : null}
                        {shortTrace(entry.trace_id) ? <span>Trace {shortTrace(entry.trace_id)}</span> : null}
                      </div>

                      {entry.recommended_actions.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {entry.recommended_actions.slice(0, 3).map((action) => (
                            <span key={`${entry.id}-${action}`} className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-[#2453d4]">{action}</span>
                          ))}
                        </div>
                      ) : null}

                      {entry.risk_flags.length > 0 ? (
                        <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-[15px] text-orange-700">{entry.risk_flags[0]}</div>
                      ) : null}

                      {entry.missing_information.length > 0 ? (
                        <div className="mt-4">
                          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-400">Missing information</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {entry.missing_information.map((item) => (
                              <span key={`${entry.id}-${item}`} className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600">{item}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-5 flex flex-wrap gap-3">
                        {entry.related_queue_item_ids.length > 0 ? (
                          <Link to="/queue" className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 no-underline transition hover:bg-slate-50">Queue review</Link>
                        ) : null}
                        {entry.classification === "estimate_request" ? (
                          <Link to={`/quote?transcript_id=${encodeURIComponent(entry.id)}`} className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 no-underline transition hover:bg-slate-50">Create quote draft</Link>
                        ) : null}
                        {canLogTranscriptAsUpdate(entry.classification) ? (
                          <button
                            type="button"
                            className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => transcriptLogUpdateMutation.mutate(entry.id)}
                            disabled={transcriptLogUpdateMutation.isPending}
                          >
                            Log as update
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50"
                          onClick={() => toggleTranscript(entry.id)}
                        >
                          {isOpen ? "Hide transcript" : "View transcript"}
                        </button>
                      </div>

                      {isOpen ? (
                        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
                          <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-400">Raw transcript</div>
                          <pre className="mt-3 whitespace-pre-wrap font-mono text-[12px] leading-6 text-slate-600">{transcriptRawText(entry)}</pre>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-3 text-[18px] font-semibold text-slate-950">
              <Activity className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <span>What changed</span>
            </div>
            <div className="mt-6 space-y-4">
              {auditTimeline.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-6 text-[15px] text-slate-500">No job activity recorded yet.</div>
              ) : (
                auditTimeline.map((event) => (
                  <div key={event.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${timelineTone(event.event_type)}`}>
                      {event.event_type.includes("quote") ? <FileText className="h-5 w-5" aria-hidden="true" /> : event.event_type.includes("follow") ? <Sparkles className="h-5 w-5" aria-hidden="true" /> : event.event_type.includes("transcript") ? <Phone className="h-5 w-5" aria-hidden="true" /> : <History className="h-5 w-5" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-[17px] font-semibold text-slate-950">{event.title}</div>
                        <div className="inline-flex items-center gap-1 text-sm text-slate-500">
                          <Clock3 className="h-4 w-4" aria-hidden="true" />
                          <span>{formatTimestamp(event.timestamp)}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-[15px] leading-7 text-slate-500">{event.summary}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
