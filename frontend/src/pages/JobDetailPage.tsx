import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { Link, useParams } from "react-router-dom";

import { fetchJobDetail } from "../api/jobs";
import { approveDraft, discardDraft, editDraft } from "../api/queue";
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
  }).format(value || 0);
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 3)}...`;
}

function inputTone(inputType: string): string {
  const normalized = inputType.toLowerCase();
  if (normalized === "voice") return "tb";
  if (normalized === "whatsapp") return "tg";
  if (normalized === "sms") return "ta";
  return "ts";
}

function followupTag(status: string | undefined): { label: string; cls: string } {
  if (status === "scheduled") return { label: "Active", cls: "ta td" };
  if (status === "stopped") return { label: "Stopped", cls: "tr" };
  if (status === "pending_destination") return { label: "Pending", cls: "ts" };
  return { label: "Inactive", cls: "ts" };
}

function followupReason(reason: string | null): string {
  const normalized = (reason ?? "").trim().toLowerCase();
  if (normalized === "max_reminders_reached") return "Two reminders have already been sent.";
  if (normalized === "manual_stop") return "You paused automatic follow-up for this quote.";
  if (normalized === "quote_discarded") return "This quote was discarded.";
  if (!normalized) return "Sequence activates after the quote is sent.";
  return normalized.replace(/_/g, " ");
}

export function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId ?? "";

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedUpdateIds, setExpandedUpdateIds] = useState<Record<string, boolean>>({});
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
  const updates = useMemo(() => (detailQuery.data?.recent_updates ?? []).slice(0, 5), [detailQuery.data]);
  const auditTimeline = useMemo(() => (detailQuery.data?.audit_timeline ?? []).slice(0, 20), [detailQuery.data]);
  const followupState = detailQuery.data?.followup_state ?? null;

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

  const followupChip = followupTag(followupState?.status);

  return (
    <div className="pw">
      <div className="ph">
        <Link to="/jobs" className="btn bw sm" style={{ marginBottom: 10, fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "1.2px", display: "inline-flex" }}>← JOBS</Link>
        {detailQuery.isLoading ? <div className="psub">Loading job...</div> : null}
        {!detailQuery.isLoading && !job ? <div className="psub">Job not found.</div> : null}
        {job ? (
          <>
            <div className="eyebrow">{job.id} · Field Record</div>
            <div className="ptitle">{job.name}</div>
            <div className="psub">{job.address}</div>
          </>
        ) : null}
      </div>

      {job ? (
        <div className="tcol">
          <div className="vs">
            <div className="panel ani">
              <div className="ph2 sp"><span className="ptl">Job Overview</span><span className={`tag ${job.status === "complete" ? "tg" : job.status === "on-hold" ? "ta" : "tb"} td`}>{job.status}</span></div>
              <div className="pb">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                  {[["Phase", job.contract_type], ["Trade", job.type], ["Value", formatCurrency(job.contract_value)], ["Last updated", formatTimestamp(job.last_updated)]].map(([key, value]) => (
                    <div key={key} className="ir" style={{ padding: "7px 0" }}><span className="ik">{key}</span><span className="iv">{value}</span></div>
                  ))}
                </div>
                <hr className="wd" />
                <div className="lbl" style={{ marginBottom: 5 }}>Site notes</div>
                <div style={{ fontSize: 12, color: "var(--steel)", lineHeight: 1.6 }}>{job.notes || "No site notes recorded yet."}</div>
              </div>
            </div>

            <div className="panel ani a1">
              <div className="ph2 sp"><span className="ptl">Customer follow-up</span><span className={`tag ${followupChip.cls}`}>{followupChip.label}</span></div>
              <div className="pb">
                <div style={{ fontSize: 12, color: "var(--cream)", marginBottom: 8 }}>
                  {followupState?.status === "stopped"
                    ? "Automatic follow-up is paused for this quote."
                    : followupState?.status === "scheduled"
                      ? "GC Agent will continue reminder follow-up until the quote is answered or stopped."
                      : followupState?.status === "pending_destination"
                        ? "Send the quote first so GC Agent knows where to follow up."
                        : "No follow-up sent yet."}
                </div>
                <div className="ir"><span className="ik">Reminders sent</span><span className="iv m">{followupState?.reminder_count ?? 0}</span></div>
                <div className="ir"><span className="ik">Last reminder</span><span className="iv">{followupState?.last_reminder_at ? formatTimestamp(followupState.last_reminder_at) : "Not recorded yet"}</span></div>
                <div className="ir"><span className="ik">Channel</span><span className="iv">{followupState?.channel ? followupState.channel.charAt(0).toUpperCase() + followupState.channel.slice(1) : "Not chosen yet"}</span></div>
                <hr className="wd" />
                <div style={{ fontSize: 12, color: "var(--cream)" }}>{followupReason(followupState?.stop_reason ?? null)}</div>`r`n                <div style={{ marginTop: 6, fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", lineHeight: 1.8, letterSpacing: "0.5px" }}>FOLLOW-UP STATE IS TRACKED INSIDE THE JOB RECORD</div>
              </div>
            </div>

            <div className="panel ani a2">
              <div className="ph2"><span className="ptl">Pending drafts</span></div>
              <div className="pb">
                {errorMessage ? <div className="alert awarn" style={{ marginBottom: 12 }}><span>?</span><div>{errorMessage}</div></div> : null}
                {pendingDrafts.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--steel)" }}>No pending drafts for this job.</div>
                ) : (
                  <div className="vs">
                    {pendingDrafts.map((draft) => {
                      const editValue = draftEdits[draft.id] ?? draft.content;
                      return (
                        <div key={draft.id} className="panel" style={{ borderColor: "var(--wire2)" }}>
                          <div className="pb">
                            <div className="sp" style={{ marginBottom: 10 }}>
                              <div>
                                <div className="hs" style={{ gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 600, color: "var(--cream)", letterSpacing: "0.5px" }}>{draft.title}</span>
                                  <span className="tag ts" style={{ fontSize: 7 }}>{draft.id}</span>
                                  <span className="tag tb">{draft.type}</span>
                                </div>
                                <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "0.8px" }}>
                                  {formatTimestamp(draft.created_at).toUpperCase()} · {draft.status.toUpperCase()}
                                </div>
                              </div>
                            </div>
                            <div style={{ marginBottom: 12 }}>
                              <label className="lbl" htmlFor={`job-draft-${draft.id}`}>Draft content</label>
                              <textarea
                                id={`job-draft-${draft.id}`}
                                className="txta"
                                rows={4}
                                value={editValue}
                                onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: event.target.value }))}
                              />
                            </div>
                            <div className="hs" style={{ flexWrap: "wrap" }}>
                              <button type="button" className="btn bg sm" onClick={() => approveMutation.mutate({ draftId: draft.id })} disabled={isDraftLoading(draft.id)}>? Approve</button>
                              <button type="button" className="btn bw sm" onClick={() => editMutation.mutate({ draftId: draft.id, content: editValue })} disabled={isDraftLoading(draft.id)}>? Edit</button>
                              <button type="button" className="btn brd sm" onClick={() => discardMutation.mutate({ draftId: draft.id })} disabled={isDraftLoading(draft.id)}>? Discard</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="vs">
            <div className="panel ani a1">
              <div className="ph2"><span className="ptl">Recent Updates</span></div>
              <div className="pb">
                {updates.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--steel)" }}>No updates logged yet.</div>
                ) : (
                  <div className="vs">
                    {updates.map((entry) => {
                      const isExpanded = !!expandedUpdateIds[entry.id];
                      return (
                        <div key={entry.id} className="panel" style={{ borderColor: "var(--wire2)" }}>
                          <button type="button" className="pb" style={{ width: "100%", textAlign: "left", background: "transparent" }} onClick={() => toggleUpdate(entry.id)}>
                            <div className="sp">
                              <div>
                                <div className="hs" style={{ gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
                                  <span className="tag ts">{formatTimestamp(entry.created_at)}</span>
                                  <span className={`tag ${inputTone(entry.input_type)}`}>{entry.input_type}</span>
                                </div>
                                <div style={{ fontSize: 12, color: "var(--cream)", lineHeight: 1.6 }}>
                                  {truncate(entry.raw_input || "", RAW_INPUT_PREVIEW_CHARS)}
                                </div>
                              </div>
                              <span className="tag ts">{isExpanded ? "OPEN" : "VIEW"}</span>
                            </div>
                          </button>
                          {isExpanded ? (
                            <div style={{ borderTop: "1px solid var(--wire)", padding: "12px 14px" }}>
                              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "'Syne Mono', monospace", fontSize: 10, color: "var(--steel)", lineHeight: 1.8 }}>
                                {JSON.stringify(entry.parsed_changes, null, 2)}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="panel ani a2">
              <div className="ph2"><span className="ptl">Audit Timeline</span></div>
              <div className="pb">
                {auditTimeline.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--steel)" }}>No audit events yet.</div>
                ) : (
                  auditTimeline.map((event) => (
                    <div className="tli" key={event.id}>
                      <div className={`tln ${event.event_type.includes("approved") || event.event_type.includes("sent") ? "g" : event.event_type.includes("discard") || event.event_type.includes("failed") ? "a" : "m"}`}>
                        {event.event_type.includes("approved") || event.event_type.includes("sent") ? "?" : "?"}
                      </div>
                      <div>
                        <div className="tll">{event.title}</div>
                        <div style={{ marginTop: 3, fontSize: 12, color: "var(--steel)", lineHeight: 1.6 }}>{event.summary}</div>
                        <div className="tlt">{formatTimestamp(event.timestamp)}{event.trace_id ? ` · ${truncate(event.trace_id, 18)}` : ""}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


