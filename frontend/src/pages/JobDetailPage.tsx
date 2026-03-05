import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import clsx from "clsx";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { fetchJobDetail } from "../api/jobs";
import { approveDraft, discardDraft, editDraft } from "../api/queue";
import { DraftCard } from "../components/DraftCard";
import { useQueue } from "../hooks/useQueue";
import type { QueuePayload } from "../types";

const RAW_INPUT_PREVIEW_CHARS = 120;

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
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function healthBadgeClass(health: "on-track" | "at-risk" | "blocked"): string {
  if (health === "blocked") {
    return "border-red-400/60 bg-red-400/10 text-red-300";
  }
  if (health === "at-risk") {
    return "border-yellow/70 bg-yellow/10 text-yellow";
  }
  return "border-green/60 bg-green/10 text-green";
}

function inputTypeBadgeClass(inputType: string): string {
  const normalized = inputType.toLowerCase();
  if (normalized === "voice") {
    return "border-steel/60 bg-steel/15 text-steel";
  }
  if (normalized === "whatsapp") {
    return "border-green/60 bg-green/15 text-green";
  }
  if (normalized === "sms") {
    return "border-yellow/60 bg-yellow/15 text-yellow";
  }
  return "border-border bg-bg text-muted";
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 3)}...`;
}

function silentTone(daysSilent: number): string {
  if (daysSilent >= 7) {
    return "border-red-400/60 bg-red-400/10";
  }
  if (daysSilent >= 5) {
    return "border-yellow/70 bg-yellow/10";
  }
  return "border-border bg-surface";
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function eventTone(eventType: string): string {
  const normalized = eventType.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("discarded")) {
    return "border-red-400/40 bg-red-400/10";
  }
  if (normalized.includes("approved") || normalized.includes("sent")) {
    return "border-green/40 bg-green/10";
  }
  if (normalized.includes("edited")) {
    return "border-yellow/50 bg-yellow/10";
  }
  return "border-border bg-bg";
}

export function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId ?? "";

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedUpdateIds, setExpandedUpdateIds] = useState<Record<string, boolean>>({});

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
  const updates = useMemo(() => {
    return (detailQuery.data?.recent_updates ?? []).slice(0, 5);
  }, [detailQuery.data]);
  const auditTimeline = useMemo(() => {
    return (detailQuery.data?.audit_timeline ?? []).slice(0, 20);
  }, [detailQuery.data]);

  const pendingDrafts = useMemo(() => {
    const groups = queueQuery.data?.jobs ?? [];
    return groups.find((group) => group.job_id === jobId)?.drafts ?? [];
  }, [queueQuery.data, jobId]);

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

  const isDraftLoading = (draftId: string): boolean => {
    return (
      (approveMutation.isPending && approveMutation.variables?.draftId === draftId) ||
      (editMutation.isPending && editMutation.variables?.draftId === draftId) ||
      (discardMutation.isPending && discardMutation.variables?.draftId === draftId)
    );
  };

  const toggleUpdate = (updateId: string) => {
    setExpandedUpdateIds((current) => ({
      ...current,
      [updateId]: !current[updateId],
    }));
  };

  return (
    <main className="min-h-screen bg-bg px-3 py-4 text-text sm:px-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <Link to="/jobs" className="inline-flex font-mono text-xs uppercase tracking-wider text-orange">
          Back to Jobs
        </Link>

        {detailQuery.isLoading ? <p className="text-sm text-muted">Loading job...</p> : null}
        {!detailQuery.isLoading && !job ? <p className="text-sm text-muted">Job not found.</p> : null}

        {job ? (
          <>
            <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold text-text sm:text-3xl">{job.name}</h1>
                  <p className="mt-1 text-sm text-muted">
                    {job.type} - {formatCurrency(job.contract_value)}
                  </p>
                  <p className="mt-2 text-sm text-text/90">{job.address}</p>
                  <p className="mt-1 text-xs text-muted">Est. completion: {job.est_completion || "Unknown"}</p>
                </div>

                <span
                  className={clsx(
                    "inline-flex w-fit rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-wider",
                    healthBadgeClass(job.health)
                  )}
                >
                  {job.health}
                </span>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Open Items</h2>
              {job.open_items.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No open items.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {job.open_items.map((item) => {
                    const highRisk = item.days_silent >= 5;
                    return (
                      <article
                        key={item.id}
                        className={clsx("rounded-md border p-3", silentTone(item.days_silent))}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-border bg-bg px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-muted">
                                {item.type}
                              </span>
                              {highRisk ? (
                                <span className="inline-flex items-center gap-1 text-xs text-yellow">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  <span>Needs attention</span>
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm text-text">{item.description}</p>
                            <p className="mt-1 text-xs text-muted">Owner: {item.owner}</p>
                          </div>
                          <span
                            className={clsx(
                              "rounded-full border px-2 py-0.5 font-mono text-[11px]",
                              item.days_silent >= 7
                                ? "border-red-400/60 bg-red-400/10 text-red-300"
                                : item.days_silent >= 5
                                  ? "border-yellow/70 bg-yellow/10 text-yellow"
                                  : "border-border bg-bg text-muted"
                            )}
                          >
                            {item.days_silent}d silent
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Pending Drafts</h2>
                <span className="rounded-full border border-orange/70 bg-orange/10 px-2 py-0.5 font-mono text-[11px] text-orange">
                  {pendingDrafts.length}
                </span>
              </div>

              {errorMessage ? (
                <div className="mb-3 rounded-md border border-red-400/50 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                  {errorMessage}
                </div>
              ) : null}

              {queueQuery.isLoading ? <p className="text-sm text-muted">Loading drafts...</p> : null}
              {!queueQuery.isLoading && pendingDrafts.length === 0 ? (
                <p className="text-sm text-muted">No pending drafts for this job.</p>
              ) : null}

              <div className="space-y-3">
                {pendingDrafts.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    onApprove={(id) => approveMutation.mutate({ draftId: id })}
                    onEdit={(id, content) => editMutation.mutate({ draftId: id, content })}
                    onDiscard={(id) => discardMutation.mutate({ draftId: id })}
                    isLoading={isDraftLoading(draft.id)}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Recent Updates</h2>
              {updates.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No updates logged yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {updates.map((entry) => {
                    const isExpanded = !!expandedUpdateIds[entry.id];
                    return (
                      <article key={entry.id} className="rounded-md border border-border bg-bg">
                        <button
                          type="button"
                          onClick={() => toggleUpdate(entry.id)}
                          className="w-full px-3 py-3 text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[11px] text-muted">
                                  {formatTimestamp(entry.created_at)}
                                </span>
                                <span
                                  className={clsx(
                                    "rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider",
                                    inputTypeBadgeClass(entry.input_type)
                                  )}
                                >
                                  {entry.input_type}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-text/90">
                                {truncate(entry.raw_input || "", RAW_INPUT_PREVIEW_CHARS)}
                              </p>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="mt-0.5 h-4 w-4 text-muted" />
                            ) : (
                              <ChevronDown className="mt-0.5 h-4 w-4 text-muted" />
                            )}
                          </div>
                        </button>

                        {isExpanded ? (
                          <div className="border-t border-border px-3 pb-3 pt-2">
                            <pre className="whitespace-pre-wrap rounded-md bg-surface p-2 font-mono text-xs text-text/90">
                              {JSON.stringify(entry.parsed_changes, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Audit Trail</h2>
              <p className="mt-2 text-sm text-muted">
                Timeline of updates, quote decisions, and delivery events for this job.
              </p>

              {auditTimeline.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No audit events yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {auditTimeline.map((event) => (
                    <article key={event.id} className={clsx("rounded-md border p-3", eventTone(event.event_type))}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] text-muted">{formatTimestamp(event.timestamp)}</span>
                            <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-muted">
                              {event.event_type.replace(/_/g, " ")}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-text">{event.title}</p>
                          <p className="mt-1 text-sm text-text/90">{event.summary}</p>
                        </div>
                        {event.trace_id ? (
                          <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[11px] text-muted">
                            {truncate(event.trace_id, 18)}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
