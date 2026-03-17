import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Clock3,
  ShieldAlert,
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
import type { Draft, OpenItem, QueuePayload, TranscriptClassification, TranscriptInboxItem } from "../types";

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

function draftTone(type: string, sourceOpenItem?: OpenItem): string {
  if (sourceOpenItem?.type === "CO") return "border border-orange-200 bg-orange-50 text-orange-600";
  if (sourceOpenItem?.type === "approval") return "border border-blue-200 bg-blue-50 text-[#2453d4]";
  if (type === "follow-up") return "border border-orange-200 bg-orange-50 text-orange-600";
  if (type === "material-order") return "border border-blue-200 bg-blue-50 text-[#2453d4]";
  if (type === "transcript-review") return "border border-violet-200 bg-violet-50 text-violet-700";
  return "border border-slate-200 bg-slate-100 text-slate-600";
}

function actionStageTone(stage: OpenItem["action_stage"]): string {
  if (stage === "approved") return "border border-blue-200 bg-blue-50 text-[#2453d4]";
  if (stage === "sent") return "border border-amber-200 bg-amber-50 text-amber-700";
  if (stage === "customer-approved") return "border border-emerald-200 bg-emerald-50 text-emerald-700";
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

function nextActionLabel(type: Draft["type"], sourceOpenItem?: OpenItem): string {
  if (sourceOpenItem?.type === "CO") {
    return "Approve for send";
  }
  if (sourceOpenItem?.type === "approval") {
    return "Approve approval request";
  }
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

function draftTypeLabel(draft: Draft, sourceOpenItem?: OpenItem): string {
  if (sourceOpenItem?.type === "CO") {
    return "Change order draft";
  }
  if (sourceOpenItem?.type === "approval") {
    return "Approval request";
  }
  return draft.type;
}

const UPDATE_ACTION_TRANSCRIPT_CLASSES = new Set<TranscriptClassification>([
  "job_update",
  "reschedule",
  "complaint_or_issue",
  "followup_response",
  "vendor_or_subcontractor",
]);

function canLogTranscriptAsUpdate(classification: TranscriptClassification | undefined): boolean {
  if (!classification) {
    return false;
  }
  return UPDATE_ACTION_TRANSCRIPT_CLASSES.has(classification);
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
  const openItemsByTraceId = useMemo(() => {
    const map = new Map<string, OpenItem>();
    jobs.forEach((job) => {
      job.open_items.forEach((item) => {
        if (item.action_trace_id) {
          map.set(item.action_trace_id, item);
        }
      });
    });
    return map;
  }, [jobs]);

  const pendingCount = useMemo(
    () => queueGroups.reduce((total, group) => total + group.drafts.length, 0) + transcriptInbox.length,
    [queueGroups, transcriptInbox]
  );
  const groupedDraftCount = useMemo(
    () => queueGroups.reduce((total, group) => total + group.drafts.length, 0),
    [queueGroups]
  );
  const activeJobCount = useMemo(
    () => jobs.filter((job) => job.status !== "complete").length,
    [jobs]
  );
  const moneyAtRiskCount = useMemo(
    () =>
      jobs.reduce(
        (total, job) => total + job.open_items.filter((item) => item.financial_exposure).length,
        0
      ),
    [jobs]
  );
  const stagedActionCount = useMemo(
    () =>
      jobs.reduce(
        (total, job) =>
          total +
          job.open_items.filter(
            (item) => item.action_stage && item.status.toLowerCase() !== "resolved"
          ).length,
        0
      ),
    [jobs]
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
      void queryClient.invalidateQueries({ queryKey: ["jobs", scope] });
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["queue", scope] }),
        queryClient.invalidateQueries({ queryKey: ["jobs", scope] }),
      ]);
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
  const queueHeadline =
    pendingCount === 0 ? "Nothing is waiting on the office" : `${pendingCount} item${pendingCount === 1 ? "" : "s"} surfaced for review`;
  const queueSubcopy =
    pendingCount === 0
      ? "The agent is watching calls, changes, approvals, and follow-through. It will interrupt you here when something actually needs a decision."
      : "Calls, unresolved changes, approvals, and follow-through drafts are stacked here in the order the office should clear them.";

  return (
    <div className="pw gc-page">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <article className="gc-command-card dark gc-fade-up">
          <div className="gc-command-body flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-[44rem]">
              <div className="gc-overline">Office review surface</div>
              <div className="mt-2 text-[40px] font-semibold tracking-[-0.07em] text-white">{queueHeadline}</div>
              <div className="mt-3 max-w-[38rem] text-[14px] leading-7 text-white/62">
                {queueSubcopy}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="gc-hero-status">
                  {pendingCount > 0 ? `${pendingCount} items in office review` : "Queue clear"}
                </span>
                <span className="gc-micro-pill">
                  {isOnline ? "Live runtime connected" : "Offline cache active"}
                </span>
                {transcriptInbox.length > 0 ? (
                  <span className="gc-micro-pill">{transcriptInbox.length} unlinked calls</span>
                ) : null}
              </div>
            </div>
            <div className="flex min-w-[220px] flex-col gap-2">
              {pendingCount > 1 ? (
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] px-4 text-[12px] font-semibold text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => approveAllMutation.mutate()}
                  disabled={approveAllMutation.isPending}
                >
                  {approveAllMutation.isPending ? "Approving..." : "Approve all waiting work"}
                </button>
              ) : null}
              <Link
                to="/quote"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#ff9e6f]/20 bg-[linear-gradient(135deg,#ff9158,#e8622a)] px-4 text-[12px] font-semibold text-white no-underline shadow-[0_18px_36px_rgba(232,98,42,0.24)] transition hover:brightness-105"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>New Quote</span>
              </Link>
            </div>
          </div>
        </article>

        <aside className="gc-command-card gc-fade-up gc-delay-2">
          <div className="gc-command-head">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                <ShieldAlert className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-[var(--gc-ink)]">Operator read</div>
                <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">The queue posture before you start clearing work.</div>
              </div>
            </div>
          </div>
          <div className="gc-command-body">
            <div className="space-y-3">
              <div className="rounded-[18px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.72)] px-4 py-4">
                <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Money at risk</div>
                <div className="mt-2 text-[22px] font-semibold tracking-[-0.05em] text-[var(--gc-ink)]">{moneyAtRiskCount}</div>
                <div className="mt-1 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
                  {moneyAtRiskCount > 0
                    ? "Open change or approval items still need office movement."
                    : "No financially exposed items are leading the queue right now."}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[18px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.72)] px-4 py-4">
                  <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Unlinked communication</div>
                  <div className="mt-2 text-[18px] font-semibold tracking-[-0.05em] text-[var(--gc-ink)]">{transcriptInbox.length}</div>
                  <div className="mt-1 text-[12px] leading-6 text-[var(--gc-ink-soft)]">
                    Calls still waiting for a job, quote, or logged update path.
                  </div>
                </div>
                <div className="rounded-[18px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.72)] px-4 py-4">
                  <div className="text-[12px] uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Staged follow-through</div>
                  <div className="mt-2 text-[18px] font-semibold tracking-[-0.05em] text-[var(--gc-ink)]">{stagedActionCount}</div>
                  <div className="mt-1 text-[12px] leading-6 text-[var(--gc-ink-soft)]">
                    Drafted, approved, or sent work that still needs customer movement.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3 md:grid-cols-3">
          <article className="gc-mini-kpi gc-fade-up gc-delay-1">
            <div className="label">Needs review</div>
            <div className="value">{pendingCount}</div>
            <div className="hint">{pendingCount > 0 ? "Office review is waiting" : "Nothing stacked up"}</div>
          </article>
          <article className="gc-mini-kpi gc-fade-up gc-delay-2">
            <div className="label">Drafts in motion</div>
            <div className="value">{groupedDraftCount}</div>
            <div className="hint">{groupedDraftCount > 0 ? "Quote, change, and approval work" : "No active draft work"}</div>
          </article>
          <article className="gc-mini-kpi gc-fade-up gc-delay-3">
            <div className="label">Active jobs</div>
            <div className="value">{activeJobCount}</div>
            <div className="hint">{activeJobCount > 0 ? "Jobs generating queue work" : "No jobs in motion"}</div>
          </article>
        </div>

        <article className="gc-command-card gc-fade-up gc-delay-4">
          <div className="gc-command-head">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                <Activity className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-[var(--gc-ink)]">Review lens</div>
                <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">Focus the queue by job without losing the live count.</div>
              </div>
            </div>
          </div>
          <div className="gc-command-body">
            <div className="flex flex-wrap gap-2.5">
              {jobFilterButtons.map((group) => {
                const isActive = selectedJobId === group.job_id;
                return (
                  <button
                    key={group.job_id ?? "all"}
                    type="button"
                    onClick={() => setSelectedJobId(group.job_id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition ${
                      isActive
                        ? "border-[#315fff]/18 bg-[linear-gradient(135deg,#5f81ff,#2f5dff)] text-white shadow-[0_16px_30px_rgba(49,95,255,0.24)]"
                        : "border-[var(--gc-line)] bg-white/72 text-[var(--gc-ink-soft)] hover:border-[var(--gc-line-strong)] hover:bg-white"
                    }`}
                  >
                    <span>{group.job_name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        isActive ? "bg-white/20 text-white" : "bg-[rgba(49,95,255,0.08)] text-[#214be0]"
                      }`}
                    >
                      {group.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </article>
      </section>

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
        <section className="gc-command-card mt-4 overflow-hidden gc-fade-up gc-delay-2">
          <div className="gc-command-head">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(255,140,47,0.14)] text-[#bc610b]">
                <AlertTriangle className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-[var(--gc-ink)]">Transcript inbox</div>
                <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">Calls that still need a job, quote path, or logged update.</div>
              </div>
            </div>
            <span className="gc-chip warn">{transcriptInbox.length}</span>
          </div>
          <div className="space-y-3 px-4 pb-4">
            {transcriptInbox.map((transcript) => {
              const selectedJob = linkSelections[transcript.transcript_id] ?? "";
              const transcriptOpen = !!openTranscriptIds[`inbox-${transcript.transcript_id}`];
              const isBusy =
                transcriptLinkMutation.isPending ||
                transcriptReviewMutation.isPending ||
                transcriptDiscardMutation.isPending ||
                transcriptLogUpdateMutation.isPending;

              return (
                <article key={transcript.transcript_id} className="rounded-[18px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.78)] p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[17px] font-semibold text-[var(--gc-ink)]">{inboxCallerLabel(transcript)}</span>
                        <span className={`inline-flex rounded-xl px-2.5 py-1 text-[11px] font-semibold ${transcriptUrgencyTone(transcript.urgency)}`}>
                          {transcript.urgency || "normal"}
                        </span>
                        <span className="inline-flex rounded-xl border border-[var(--gc-line)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--gc-ink-soft)]">
                          {classificationLabel(transcript.classification)}
                        </span>
                        {transcript.linked_quote_id ? (
                          <span className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#2453d4]">
                            {transcript.linked_quote_id}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2.5 text-[14px] leading-6 text-[var(--gc-ink)]">{inboxSummary(transcript)}</p>
                      <p className="mt-1.5 text-[12px] leading-6 text-[var(--gc-ink-soft)]">{inboxActionCopy(transcript)}</p>
                    </div>
                    <div className="rounded-[14px] border border-[var(--gc-line)] bg-white px-3.5 py-3 text-right shadow-sm">
                      <div className="text-[21px] font-bold tracking-[-0.04em] text-[var(--gc-ink)]">{confidenceLabel(transcript.confidence)}</div>
                      <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Inbox review</div>
                    </div>
                  </div>

                  {transcript.recommended_actions.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {transcript.recommended_actions.slice(0, 3).map((action) => (
                        <span key={`${transcript.transcript_id}-${action}`} className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-[#2453d4]">
                          {action}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {transcript.risk_flags.length ? (
                    <div className="mt-4 rounded-[16px] border border-orange-200 bg-orange-50 px-4 py-3 text-[13px] text-orange-700">
                      {transcript.risk_flags[0]}
                    </div>
                  ) : null}

                  {transcript.missing_information.length ? (
                    <div className="mt-4">
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

                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
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

                  <div className="mt-5 flex flex-wrap gap-2.5">
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
                    {canLogTranscriptAsUpdate(transcript.classification) ? (
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
                    ) : null}
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
                    <div className="mt-4 rounded-[18px] border border-slate-200 bg-white p-4">
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
        <div className="gc-command-card mt-4 overflow-hidden">
          <div className="gc-command-body flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-[var(--gc-line-strong)] bg-[rgba(255,255,255,0.62)] text-[var(--gc-ink-muted)]">
              <Clock3 className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div className="mt-4 text-[16px] font-semibold text-[var(--gc-ink)]">Queue is clear</div>
            <div className="mt-2 max-w-[28rem] text-[13px] leading-6 text-[var(--gc-ink-soft)]">
              Calls, unresolved changes, approvals, and follow-through drafts will appear here automatically as work needs office review.
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_320px]">
        <section className="space-y-4">
          {visibleDrafts.map(({ draft, group }) => {
            const isOpen = openDraftId === draft.id;
            const editValue = draftEdits[draft.id] ?? draft.content;
            const isTranscriptDraft = draft.type === "transcript-review" && !!draft.transcript;
            const transcript = draft.transcript;
            const rawTranscriptOpen = !!openTranscriptIds[draft.id];
            const jobLabel = group.job_name || draft.job_name;
            const sourceOpenItem = draft.trace_id ? openItemsByTraceId.get(draft.trace_id) : undefined;
            const isOpenItemActionDraft = Boolean(sourceOpenItem && (sourceOpenItem.type === "CO" || sourceOpenItem.type === "approval"));

            return (
              <article key={draft.id} className={`overflow-hidden rounded-[20px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,249,255,0.82))] shadow-[var(--gc-shadow)] transition ${isOpen ? "border-[#2453d4] ring-4 ring-blue-100" : "border-[var(--gc-line)]"} ${exitingDrafts[draft.id] ? "opacity-60" : "opacity-100"}`}>
                <button
                  type="button"
                  className="block w-full px-4 py-4 text-left"
                  onClick={() => setOpenDraftId((current) => (current === draft.id ? null : draft.id))}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--gc-ink-muted)]">
                        {isTranscriptDraft ? "Communication review" : isOpenItemActionDraft ? "Financial follow-through" : "Draft review"}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[16px] font-semibold text-[var(--gc-ink)]">{transcriptHeadline(draft)}</span>
                        <span className="inline-flex rounded-xl border border-[var(--gc-line)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--gc-ink-soft)]">{jobLabel}</span>
                        <span className={`inline-flex rounded-xl px-2.5 py-1 text-[11px] font-semibold ${draftTone(draft.type, sourceOpenItem)}`}>
                          {draftTypeLabel(draft, sourceOpenItem)}
                        </span>
                        {sourceOpenItem?.financial_exposure ? (
                          <span className="inline-flex rounded-xl border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-600">
                            Money at risk
                          </span>
                        ) : null}
                        {sourceOpenItem?.action_stage_label ? (
                          <span className={`inline-flex rounded-xl px-2.5 py-1 text-[11px] font-semibold ${actionStageTone(sourceOpenItem.action_stage)}`}>
                            {sourceOpenItem.action_stage_label}
                          </span>
                        ) : null}
                        {isTranscriptDraft ? (
                          <>
                            <span className={`inline-flex rounded-xl px-2.5 py-1 text-[11px] font-semibold ${transcriptUrgencyTone(transcript?.urgency)}`}>
                              {transcript?.urgency ?? "normal"}
                            </span>
                            <span className="inline-flex rounded-xl border border-[var(--gc-line)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--gc-ink-soft)]">
                              {classificationLabel(transcript?.classification)}
                            </span>
                            {transcript?.linked_quote_id ? (
                              <span className="inline-flex rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#2453d4]">
                                {transcript.linked_quote_id}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </div>

                      <p className="mt-2.5 text-[14px] leading-6 text-[var(--gc-ink)]">
                        {isTranscriptDraft ? transcriptSummary(draft) : isOpenItemActionDraft ? sourceOpenItem?.description || draft.why : draft.why}
                      </p>
                      <p className="mt-1.5 text-[12px] leading-6 text-[var(--gc-ink-soft)]">
                        {isTranscriptDraft
                          ? transcriptActionLabel(draft)
                          : isOpenItemActionDraft
                            ? sourceOpenItem?.action_stage_summary || `Needs attention: ${nextActionLabel(draft.type, sourceOpenItem)}`
                            : `Needs attention: ${nextActionLabel(draft.type)}`}
                      </p>
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

                    <div className="rounded-[14px] border border-[var(--gc-line)] bg-white px-3.5 py-3 text-right shadow-sm">
                      <div className="text-[20px] font-bold tracking-[-0.04em] text-[var(--gc-ink)]">{isTranscriptDraft ? confidenceLabel(transcript?.confidence) : formatCreatedAt(draft.created_at)}</div>
                      <span className={`mt-2 inline-flex rounded-xl px-2.5 py-1 text-[11px] font-semibold ${statusTone(draft.status)}`}>{draft.status}</span>
                    </div>
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-[var(--gc-line)] px-4 py-4">
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
                          <div className="mb-4 rounded-[14px] border border-orange-200 bg-orange-50 px-4 py-3 text-[13px] text-orange-700">
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
                          {transcript?.transcript_id && canLogTranscriptAsUpdate(transcript.classification) ? (
                            <button
                              type="button"
                              className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => transcriptLogUpdateMutation.mutate(transcript.transcript_id)}
                              disabled={transcriptLogUpdateMutation.isPending}
                            >
                              Log as update
                            </button>
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
                        {isOpenItemActionDraft ? (
                          <div className="mb-4 rounded-[16px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.62)] p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-xl px-3 py-1 text-sm font-semibold ${draftTone(draft.type, sourceOpenItem)}`}>
                                {draftTypeLabel(draft, sourceOpenItem)}
                              </span>
                              {sourceOpenItem?.action_stage_label ? (
                                <span className={`inline-flex rounded-xl px-3 py-1 text-sm font-semibold ${actionStageTone(sourceOpenItem.action_stage)}`}>
                                  {sourceOpenItem.action_stage_label}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-3 text-[16px] font-semibold text-slate-950">
                              {sourceOpenItem?.description || "Unresolved work needs follow-through."}
                            </div>
                            <div className="mt-2 text-[15px] leading-7 text-slate-500">
                              {sourceOpenItem?.action_stage_summary ||
                                "Approve this office draft before it goes out to the customer."}
                            </div>
                          </div>
                        ) : null}

                        <div className="rounded-[16px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.62)] p-4">
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
                            {isOpenItemActionDraft ? "Approve for send" : "Approve"}
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
                            {isOpenItemActionDraft ? "Return to open" : "Discard"}
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
          <section className="gc-command-card overflow-hidden">
            <div className="flex items-center gap-3 text-[15px] font-semibold text-[var(--gc-ink)]">
              <ClipboardList className="h-5 w-5 text-[#2453d4]" aria-hidden="true" />
              <span>Review posture</span>
            </div>
            <div className="mt-4 space-y-4 text-[13px] leading-6 text-[var(--gc-ink-soft)]">
              <div>
                <div className="font-semibold text-slate-900">Start with the financial edge</div>
                <div className="mt-1">Money-at-risk change orders and approvals should clear before lower-signal communication cleanup.</div>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Read summary before raw text</div>
                <div className="mt-1">The top of each item shows what changed, why it matters, and the next office move before you expand detail.</div>
              </div>
              <div>
                <div className="font-semibold text-slate-900">Route unlinked work fast</div>
                <div className="mt-1">Use the transcript inbox when a call has not been attached to a job yet, then turn it into a quote, update, or reviewed record.</div>
              </div>
            </div>
          </section>

          <section className="gc-command-card overflow-hidden">
            <div className="flex items-center gap-3 text-[15px] font-semibold text-[var(--gc-ink)]">
              <Sparkles className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              <span>Active job threads</span>
            </div>
            <div className="mt-4 space-y-3">
              {jobs.slice(0, 4).map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex items-start justify-between gap-4 rounded-[16px] border border-[var(--gc-line)] bg-white/72 px-4 py-3 text-inherit no-underline transition hover:bg-white"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-[var(--gc-ink)]">{job.name}</div>
                    <div className="mt-1 text-[12px] text-[var(--gc-ink-soft)]">{job.type} · {job.contract_type}</div>
                  </div>
                  <span className="text-[11px] font-medium text-[var(--gc-ink-muted)]">{job.status}</span>
                </Link>
              ))}
              {jobs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-[15px] text-slate-500">
                  No jobs loaded yet.
                </div>
              ) : null}
            </div>
            <Link to="/jobs" className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-[var(--gc-ink-soft)] no-underline hover:text-[var(--gc-ink)]">
              Open jobs board
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>

          {!isOnline ? (
            <section className="rounded-[20px] border border-blue-200 bg-blue-50 p-5 shadow-sm">
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



