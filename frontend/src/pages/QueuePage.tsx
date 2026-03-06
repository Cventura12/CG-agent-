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
  return type === "follow-up" ? "ta" : type === "material-order" ? "tb" : "ts";
}

export function QueuePage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
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
                      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 600, color: "var(--cream)", letterSpacing: "0.5px" }}>{group.job_name}</span>
                      <span className="tag ts" style={{ fontSize: 7 }}>{group.job_id}</span>
                      <span className={`tag ${draftTone(draft.type)}`}>{draft.type}</span>
                    </div>
                    <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "0.8px" }}>
                      {draft.title.toUpperCase()} · {formatCreatedAt(draft.created_at).toUpperCase()} · {draft.id}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 20, fontWeight: 600, color: "var(--cream)", letterSpacing: "0.5px" }}>
                      {job ? job.contract_type : "QUEUE"}
                    </div>
                    <span className={`tag ${statusTone(draft.status)}`}>{draft.status}</span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--steel)", lineHeight: 1.6 }}>{draft.why}</div>
                <div className="pt" style={{ marginTop: 12 }}>
                  <div className="pf" style={{ width: `${Math.max(36, Math.min(100, draft.content.length / 2))}%` }} />
                </div>

                {isOpen ? (
                  <div className="ani" style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--wire)" }} onClick={(event) => event.stopPropagation()}>
                    <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "0.8px", marginBottom: 12 }}>
                      JOB · {job?.type?.toUpperCase() || "GENERAL"} · HEALTH {healthTone(job?.health).toUpperCase()} · OPEN ITEMS {job?.open_items?.length ?? 0}
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label className="lbl" htmlFor={`draft-${draft.id}`}>Draft content</label>
                      <textarea
                        id={`draft-${draft.id}`}
                        className="txta"
                        rows={6}
                        value={editValue}
                        onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: event.target.value }))}
                      />
                    </div>
                    <div className="hs" style={{ flexWrap: "wrap" }}>
                      <button type="button" className="btn bg" onClick={() => approveMutation.mutate({ draftId: draft.id })} disabled={isDraftLoading(draft.id)}>? Approve</button>
                      <button type="button" className="btn bw" onClick={() => editMutation.mutate({ draftId: draft.id, content: editValue })} disabled={isDraftLoading(draft.id)}>? Edit</button>
                      <button type="button" className="btn brd" onClick={() => discardMutation.mutate({ draftId: draft.id })} disabled={isDraftLoading(draft.id)}>? Discard</button>
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

