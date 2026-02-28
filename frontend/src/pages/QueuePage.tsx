import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserButton, useAuth, useClerk } from "@clerk/clerk-react";
import clsx from "clsx";

import { approveAll, approveDraft, discardDraft, editDraft } from "../api/queue";
import { BriefingPanel } from "../components/BriefingPanel";
import { DraftCard } from "../components/DraftCard";
import { JobSidebar } from "../components/JobSidebar";
import { useJobs } from "../hooks/useJobs";
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
  const autoSelectedRef = useRef(false);

  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const { signOut } = useClerk();
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
      await queryClient.invalidateQueries({ queryKey: ["queue", scope] });
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
      await queryClient.invalidateQueries({ queryKey: ["queue", scope] });
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
      await queryClient.invalidateQueries({ queryKey: ["queue", scope] });
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
    <main className="min-h-screen bg-bg px-3 pb-6 pt-3 text-text sm:px-4">
      <div className="mx-auto max-w-6xl">
        <header className="sticky top-0 z-20 rounded-lg border border-border bg-surface/95 p-4 backdrop-blur-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-mono text-sm uppercase tracking-[0.18em] text-orange">GC AGENT</h1>
              <p className="mt-1 text-sm text-muted">
                {queueQuery.isLoading ? "Loading queue..." : `${pendingCount} pending draft(s)`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void signOut({ redirectUrl: "/onboarding" })}
                className="rounded-md border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
              >
                Sign Out
              </button>
              <UserButton afterSignOutUrl="/onboarding" />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="inline-flex min-w-10 items-center justify-center rounded-full border border-border bg-bg px-3 py-1 font-mono text-xs text-text">
              {pendingCount}
            </span>
            {pendingCount > 1 ? (
              <button
                type="button"
                onClick={() => approveAllMutation.mutate()}
                disabled={approveAllMutation.isPending}
                className={clsx(
                  "rounded-md bg-green px-4 py-2 text-sm font-medium text-bg transition-all duration-200",
                  "hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                )}
              >
                {approveAllMutation.isPending ? "Approving..." : "Approve All"}
              </button>
            ) : null}
          </div>
        </header>

        <div className="mt-4 flex flex-col gap-4 md:grid md:grid-cols-[240px_minmax(0,1fr)]">
          <JobSidebar
            jobs={jobs}
            selectedJobId={selectedJobId}
            onJobSelect={setSelectedJobId}
            draftCounts={draftCounts}
          />

          <section className="space-y-5">
            <BriefingPanel gcId={userId ?? null} />
            

            {errorMessage ? (
              <div className="rounded-md border border-red-400/50 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {errorMessage}
              </div>
            ) : null}

            {queueQuery.isError ? (
              <p className="text-sm text-muted">Queue unavailable. Try again shortly.</p>
            ) : null}

            {!queueQuery.isLoading && visibleGroups.length === 0 ? (
              <p className="text-sm text-muted">Queue is clear.</p>
            ) : null}

            {visibleGroups.map((group) => {
              const job = jobsById.get(group.job_id);
              const health = job?.health ?? "on-track";

              return (
                <section key={group.job_id} className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className={clsx("inline-block h-2.5 w-2.5 rounded-full", healthDotClass(health))} />
                    <h2 className="text-sm font-semibold tracking-wide text-text">{group.job_name}</h2>
                  </div>

                  <div className="space-y-3">
                    {group.drafts.map((draft) => (
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
              );
            })}
          </section>
        </div>
      </div>
    </main>
  );
}
