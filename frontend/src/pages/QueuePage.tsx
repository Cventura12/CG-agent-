import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";

import { approveAll, approveDraft, discardDraft, editDraft } from "../api/queue";
import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useQueue } from "../hooks/useQueue";
import type { Draft, QueuePayload } from "../types";

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
  };
}

function formatCreatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function healthTone(health: string | undefined): "good" | "warn" | "risk" {
  if (health === "blocked") return "risk";
  if (health === "at-risk") return "warn";
  return "good";
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("approved")) return "tg";
  if (normalized.includes("discard")) return "tr";
  if (normalized.includes("edit")) return "ta";
  return "tb";
}

function draftTone(type: string): string {
  if (type === "follow-up") return "ta";
  if (type === "material-order") return "tb";
  if (type === "transcript-review") return "tb";
  return "ts";
}

function transcriptUrgencyTone(urgency: string | undefined): string {
  const normalized = (urgency ?? "").trim().toLowerCase();
  if (normalized === "high") return "tr";
  if (normalized === "low") return "ts";
  return "ta";
}

function classificationLabel(value: string | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "Unknown";
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

export function QueuePage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [openTranscriptIds, setOpenTranscriptIds] = useState<Record<string, boolean>>({});
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
  const jobs = jobsQuery.data?.jobs ?? [];

  const jobsById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const pendingCount = useMemo(() => queueGroups.reduce((total, group) => total + group.drafts.length, 0), [queueGroups]);

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
        job: jobsById.get(group.job_id) ?? null,
      }))
    );
  }, [jobsById, visibleGroups]);

  const draftCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of queueGroups) {
      counts[group.job_id] = group.drafts.length;
    }
    return counts;
  }, [queueGroups]);

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
        queryClient.setQueryData<QueuePayload>(["queue", scope], { jobs: [] });
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

  const isDraftLoading = (draftId: string): boolean => {
    return (
      (approveMutation.isPending && approveMutation.variables?.draftId === draftId) ||
      (editMutation.isPending && editMutation.variables?.draftId === draftId) ||
      (discardMutation.isPending && discardMutation.variables?.draftId === draftId)
    );
  };

  return (
    <div className="pw">
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="eyebrow">Draft Management</div>
            <div className="ptitle">Queue</div>
            <div className="psub">{pendingCount} drafts pending review · {isOnline ? "Live runtime" : "Offline cache"}</div>
          </div>
          <div className="hs" style={{ gap: 8, flexWrap: "wrap" }}>
            <Link to="/quote" className="cta him">+ NEW QUOTE</Link>
            {pendingCount > 1 ? (
              <button type="button" className="btn bw" onClick={() => approveAllMutation.mutate()} disabled={approveAllMutation.isPending}>
                {approveAllMutation.isPending ? "Approving..." : "Approve all"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="tabrow">
        <span className={`tabt ${selectedJobId === null ? "active" : ""}`} onClick={() => setSelectedJobId(null)}>all</span>
        {queueGroups.slice(0, 5).map((group) => (
          <span key={group.job_id} className={`tabt ${selectedJobId === group.job_id ? "active" : ""}`} onClick={() => setSelectedJobId(group.job_id)}>
            {group.job_name}
          </span>
        ))}
      </div>

      {errorMessage ? (
        <div className="alert awarn" style={{ marginBottom: 14 }}>
          <span>?</span>
          <div>{errorMessage}</div>
        </div>
      ) : null}

      {queueQuery.isError ? (
        <div className="alert awarn" style={{ marginBottom: 14 }}>
          <span>?</span>
          <div>Queue unavailable. Try again shortly.</div>
        </div>
      ) : null}

      {!queueQuery.isLoading && visibleDrafts.length === 0 ? (
        <div className="panel"><div className="pb">No queued drafts are waiting right now.</div></div>
      ) : null}

      <div className="vs">
        {visibleDrafts.map(({ draft, group, job }, index) => {
          const isOpen = openDraftId === draft.id;
          const editValue = draftEdits[draft.id] ?? draft.content;
          const isTranscriptDraft = draft.type === "transcript-review" && !!draft.transcript;
          const transcript = draft.transcript;
          const rawTranscriptOpen = !!openTranscriptIds[draft.id];
          return (
            <div
              key={draft.id}
              className={`panel ani a${index % 4}`}
              style={{
                cursor: "pointer",
                borderColor: isOpen ? "var(--amber)" : "var(--wire)",
                opacity: exitingDrafts[draft.id] ? 0.65 : 1,
                transition: "border-color 0.14s, opacity 0.14s",
              }}
              onClick={() => setOpenDraftId((current) => (current === draft.id ? null : draft.id))}
            >
              <div className="pb">
                <div className="sp" style={{ marginBottom: 10 }}>
                  <div>
                    <div className="hs" style={{ gap: 7, marginBottom: 5, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 600, color: "var(--cream)", letterSpacing: "0.5px" }}>{transcriptHeadline(draft)}</span>
                      <span className="tag ts" style={{ fontSize: 7 }}>{group.job_id}</span>
                      <span className={`tag ${draftTone(draft.type)}`}>{draft.type}</span>
                      {isTranscriptDraft ? <span className={`tag ${transcriptUrgencyTone(transcript?.urgency)}`}>{transcript?.urgency ?? "normal"}</span> : null}
                      {isTranscriptDraft && transcript?.classification ? <span className="tag ts">{classificationLabel(transcript.classification)}</span> : null}
                      {isTranscriptDraft && transcript?.linked_quote_id ? <span className="tag tb">{transcript.linked_quote_id}</span> : null}
                    </div>
                    <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "0.8px" }}>
                      {isTranscriptDraft
                        ? `${draft.title.toUpperCase()} · ${formatCreatedAt(draft.created_at).toUpperCase()} · ${(transcript?.source || "call transcript").replace(/_/g, " ").toUpperCase()}`
                        : `${draft.title.toUpperCase()} · ${formatCreatedAt(draft.created_at).toUpperCase()} · ${draft.id}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 600, color: "var(--cream)", letterSpacing: "0.5px" }}>
                      {isTranscriptDraft ? confidenceLabel(transcript?.confidence) : job ? job.contract_type : "QUEUE"}
                    </div>
                    <span className={`tag ${statusTone(draft.status)}`}>{draft.status}</span>
                  </div>
                </div>

                {isTranscriptDraft ? (
                  <div className="vs" style={{ gap: 10 }}>
                    <div style={{ fontSize: 13, color: "var(--cream)", lineHeight: 1.65 }}>
                      {transcriptSummary(draft)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--steel)", lineHeight: 1.6 }}>{transcriptActionLabel(draft)}</div>
                    {transcript?.recommended_actions?.length ? (
                      <div className="hs" style={{ flexWrap: "wrap", gap: 6 }}>
                        {transcript.recommended_actions.slice(0, 3).map((action) => (
                          <span key={`${draft.id}-${action}`} className="tag tb">{action}</span>
                        ))}
                      </div>
                    ) : null}
                    {transcript?.risk_flags?.length ? (
                      <div className="alert awarn" style={{ marginTop: 0 }}>
                        <span>!</span>
                        <div>{transcript.risk_flags[0]}</div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--steel)", lineHeight: 1.6 }}>{draft.why}</div>
                )}
                <div className="pt" style={{ marginTop: 12 }}>
                  <div
                    className="pf"
                    style={{
                      width: isTranscriptDraft
                        ? `${Math.max(28, Math.min(100, Math.round((transcript?.confidence ?? 48) <= 1 ? (transcript?.confidence ?? 48) * 100 : (transcript?.confidence ?? 48))))}%`
                        : `${Math.max(36, Math.min(100, draft.content.length / 2))}%`,
                    }}
                  />
                </div>

                {isOpen ? (
                  <div className="ani" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--wire)" }} onClick={(event) => event.stopPropagation()}>
                    <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "0.8px", marginBottom: 12 }}>
                      JOB · {job?.type?.toUpperCase() || "GENERAL"} · HEALTH {healthTone(job?.health).toUpperCase()} · OPEN ITEMS {job?.open_items?.length ?? 0}
                    </div>
                    {isTranscriptDraft && transcript ? (
                      <div className="vs" style={{ gap: 12, marginBottom: 12 }}>
                        <div className="g2">
                          <div className="panel" style={{ borderColor: "var(--wire2)" }}>
                            <div className="pb">
                              <div className="lbl">Caller / source</div>
                              <div style={{ fontSize: 12, color: "var(--cream)", lineHeight: 1.6 }}>
                                {transcript.caller_label || draft.title || "Inbound call transcript"}
                              </div>
                              <div style={{ marginTop: 6, fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "0.08em" }}>
                                {(transcript.source || "call_transcript").replace(/_/g, " ").toUpperCase()}
                                {transcript.provider ? ` · ${transcript.provider.toUpperCase()}` : ""}
                                {transcript.duration_seconds ? ` · ${transcript.duration_seconds}s` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="panel" style={{ borderColor: "var(--wire2)" }}>
                            <div className="pb">
                              <div className="lbl">Recommended actions</div>
                              {transcript.recommended_actions.length ? (
                                <div className="vs" style={{ gap: 6 }}>
                                  {transcript.recommended_actions.map((action) => (
                                    <div key={`${draft.id}-${action}-full`} style={{ fontSize: 12, color: "var(--cream)", lineHeight: 1.6 }}>
                                      - {action}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: "var(--steel)" }}>No action recommendation captured yet.</div>
                              )}
                            </div>
                          </div>
                        </div>
                        {transcript.missing_information.length ? (
                          <div className="panel" style={{ borderColor: "var(--wire2)" }}>
                            <div className="pb">
                              <div className="lbl">Missing information</div>
                              <div className="hs" style={{ flexWrap: "wrap", gap: 6 }}>
                                {transcript.missing_information.map((item) => (
                                  <span key={`${draft.id}-${item}-missing`} className="tag ts">{item}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className="hs" style={{ flexWrap: "wrap" }}>
                          {transcript.classification === "estimate_request" && transcript.transcript_id ? (
                            <Link
                              to={`/quote?transcript_id=${encodeURIComponent(transcript.transcript_id)}`}
                              className="btn bw"
                            >
                              Create quote draft
                            </Link>
                          ) : null}
                          <Link to={`/jobs/${draft.job_id}`} className="btn bw">
                            Open job
                          </Link>
                          <button
                            type="button"
                            className="btn bw"
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
                          <div className="panel" style={{ borderColor: "var(--wire2)" }}>
                            <div className="pb">
                              <div className="lbl">Raw transcript</div>
                              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "'Syne Mono', monospace", fontSize: 10, color: "var(--steel)", lineHeight: 1.8, margin: 0 }}>
                                {transcriptRawText(draft)}
                              </pre>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div style={{ marginBottom: 12 }}>
                      <label className="lbl" htmlFor={`draft-${draft.id}`}>{isTranscriptDraft ? "Review note" : "Draft content"}</label>
                      <textarea
                        id={`draft-${draft.id}`}
                        className="txta"
                        rows={6}
                        value={editValue}
                        onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: event.target.value }))}
                      />
                    </div>
                    <div className="hs" style={{ flexWrap: "wrap" }}>
                      <button type="button" className="btn bg" onClick={() => approveMutation.mutate({ draftId: draft.id })} disabled={isDraftLoading(draft.id)}>
                        {isTranscriptDraft ? "Mark reviewed" : "Approve"}
                      </button>
                      <button type="button" className="btn bw" onClick={() => editMutation.mutate({ draftId: draft.id, content: editValue })} disabled={isDraftLoading(draft.id)}>
                        {isTranscriptDraft ? "Save note" : "Edit"}
                      </button>
                      <button type="button" className="btn brd" onClick={() => discardMutation.mutate({ draftId: draft.id })} disabled={isDraftLoading(draft.id)}>
                        Discard
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {jobs.length > 0 ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <div className="ph2"><span className="ptl">Job Health</span></div>
          {jobs.slice(0, 4).map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="drow">
              <span className={`hdot ${healthTone(job.health)}`} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--cream)" }}>{job.name}</div>
                <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", marginTop: 1, letterSpacing: "0.5px" }}>{job.status.toUpperCase()} · {draftCounts[job.id] ?? 0} DRAFTS</div>
              </div>
              <span className="tag tb td">active</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

