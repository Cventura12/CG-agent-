import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import clsx from "clsx";
import { Link } from "react-router-dom";

import { approveAll, approveDraft, discardDraft, editDraft } from "../api/queue";
import { BriefingPanel } from "../components/BriefingPanel";
import { DraftCard } from "../components/DraftCard";
import { JobSidebar } from "../components/JobSidebar";
import { PageHeader } from "../components/PageHeader";
import { SurfaceCard } from "../components/SurfaceCard";
import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useQueue } from "../hooks/useQueue";
import type { JobHealth, QueuePayload } from "../types";

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

function updateDraftInQueue(queue: QueuePayload, updatedDraft: QueuePayload["jobs"][number]["drafts"][number]): QueuePayload {
  return {
    jobs: queue.jobs.map((group) => ({
      ...group,
      drafts: group.drafts.map((draft) => (draft.id === updatedDraft.id ? updatedDraft : draft)),
    })),
  };
}

function healthDotClass(health: JobHealth): string {
  if (health === "blocked") {
    return "bg-red-400";
  }
  if (health === "at-risk") {
    return "bg-yellow";
  }
  return "bg-green";
}

export function QueuePage() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exitingDrafts, setExitingDrafts] = useState<Record<string, "approved" | "discarded">>({});
  const [editedDrafts, setEditedDrafts] = useState<Record<string, boolean>>({});
  const autoSelectedRef = useRef(false);
  const exitTimersRef = useRef<Record<string, number>>({});

  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const isOnline = useOnlineStatus();
  const scope = currentUserId ?? "anonymous";

  const queryClient = useQueryClient();
  const queueQuery = useQueue(currentUserId);
  const jobsQuery = useJobs(currentUserId);

  const queueData = queueQuery.data;
  const jobs = jobsQuery.data?.jobs ?? [];
  const queueGroups = queueData?.jobs ?? [];

  const jobsById = useMemo(() => {
    return new Map(jobs.map((job) => [job.id, job]));
  }, [jobs]);

  const pendingCount = useMemo(() => {
    return queueGroups.reduce((total, group) => total + group.drafts.length, 0);
  }, [queueGroups]);

  const draftCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of queueGroups) {
      counts[group.job_id] = group.drafts.length;
    }
    return counts;
  }, [queueGroups]);

  const visibleGroups = useMemo(() => {
    if (!selectedJobId) {
      return queueGroups;
    }
    return queueGroups.filter((group) => group.job_id === selectedJobId);
  }, [queueGroups, selectedJobId]);

  const riskSummary = useMemo(() => {
    const blockedJobs = jobs.filter((job) => job.health === "blocked").length;
    const atRiskJobs = jobs.filter((job) => job.health === "at-risk").length;
    const staleOpenItems = jobs.reduce((count, job) => {
      const stale = job.open_items.filter((item) => item.days_silent >= 5).length;
      return count + stale;
    }, 0);
    return {
      blockedJobs,
      atRiskJobs,
      staleOpenItems,
      hasCriticalRisk: blockedJobs > 0 || staleOpenItems > 0,
    };
  }, [jobs]);

  useEffect(() => {
    if (autoSelectedRef.current) {
      return;
    }
    if (jobs.length === 0) {
      return;
    }

    const firstJobWithDrafts = jobs.find((job) => (draftCounts[job.id] ?? 0) > 0);
    if (firstJobWithDrafts) {
      setSelectedJobId(firstJobWithDrafts.id);
    }
    autoSelectedRef.current = true;
  }, [jobs, draftCounts]);

  useEffect(() => {
    return () => {
      Object.values(exitTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      exitTimersRef.current = {};
    };
  }, []);

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
      setEditedDrafts((current) => {
        if (!current[draftId]) {
          return current;
        }
        const next = { ...current };
        delete next[draftId];
        return next;
      });
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
      setEditedDrafts((current) => ({ ...current, [updatedDraft.id]: true }));
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
    <main className="page-wrap">
      <div className="section-stack">
        <PageHeader
          eyebrow="Queue"
          title="Fast draft triage"
          description="Approve, adjust, or discard queued communications and follow-ups without losing job context."
          actions={
            <>
              <Link to="/quote" className="action-button-secondary">
                New quote
              </Link>
              {pendingCount > 1 ? (
                <button
                  type="button"
                  onClick={() => approveAllMutation.mutate()}
                  disabled={approveAllMutation.isPending}
                  className="action-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {approveAllMutation.isPending ? "Approving..." : "Approve all"}
                </button>
              ) : null}
            </>
          }
          stats={[
            { label: "Queue", value: pendingCount, tone: pendingCount > 0 ? "warning" : "default" },
            { label: "Runtime", value: isOnline ? "Live" : "Offline", tone: isOnline ? "success" : "warning" },
            { label: "Blocked jobs", value: riskSummary.blockedJobs, tone: riskSummary.blockedJobs > 0 ? "danger" : "default" },
            { label: "Stale items", value: riskSummary.staleOpenItems, tone: riskSummary.staleOpenItems > 0 ? "warning" : "default" },
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <SurfaceCard eyebrow="Jobs" title="Filter the queue" description="Focus approvals by active job. Mobile stays chip-based for fast thumb scanning.">
              <JobSidebar
                jobs={jobs}
                selectedJobId={selectedJobId}
                onJobSelect={setSelectedJobId}
                draftCounts={draftCounts}
              />
            </SurfaceCard>

            <SurfaceCard eyebrow="Briefing" title="Keep the day in view">
              <BriefingPanel gcId={userId ?? null} />
            </SurfaceCard>
          </div>

          <div className="space-y-4">
            {errorMessage ? (
              <div className="rounded-[1.2rem] border border-red-400/50 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            ) : null}

            {queueQuery.isError ? (
              <div className="rounded-[1.2rem] border border-red-400/50 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                Queue unavailable. Try again shortly.
              </div>
            ) : null}

            {!queueQuery.isLoading && visibleGroups.length === 0 ? (
              <SurfaceCard eyebrow="All clear" title="Queue is empty">
                <p className="text-sm text-muted">No queued drafts are waiting on a decision right now.</p>
              </SurfaceCard>
            ) : null}

            {visibleGroups.map((group) => {
              const job = jobsById.get(group.job_id);
              const health = job?.health ?? "on-track";

              return (
                <SurfaceCard
                  key={group.job_id}
                  eyebrow="Queued work"
                  title={group.job_name}
                  description={`${group.drafts.length} draft${group.drafts.length === 1 ? "" : "s"} waiting. Move the highest-leverage messages first.`}
                  actions={
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg/55 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      <span className={clsx("inline-block h-2.5 w-2.5 rounded-full", healthDotClass(health))} />
                      {health}
                    </span>
                  }
                >
                  <div className="space-y-3">
                    {group.drafts.map((draft) => (
                      <DraftCard
                        key={draft.id}
                        draft={draft}
                        onApprove={(id) => approveMutation.mutate({ draftId: id })}
                        onEdit={(id, content) => editMutation.mutate({ draftId: id, content })}
                        onDiscard={(id) => discardMutation.mutate({ draftId: id })}
                        isLoading={isDraftLoading(draft.id)}
                        statusOverride={exitingDrafts[draft.id]}
                        isExiting={Boolean(exitingDrafts[draft.id])}
                        wasEdited={Boolean(editedDrafts[draft.id])}
                      />
                    ))}
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
