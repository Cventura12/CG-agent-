import { create } from "zustand";

import { mockAppState } from "../lib/mockData";
import type { AgentStatus, AnalyticsPeriod, FollowUp, Job, QueueItem, Quote, User } from "../types";

interface AppStore {
  user: User | null;
  agentStatus: AgentStatus;
  queueItems: QueueItem[];
  jobs: Job[];
  quotes: Quote[];
  followUps: FollowUp[];
  analytics: AnalyticsPeriod[];
  activeJobId: string | null;
  activeView: string;
  selectedQueueItemId: string | null;
  selectedQuoteId: string | null;

  setUser: (user: User) => void;
  setAgentStatus: (status: AgentStatus) => void;
  approveAllQueueItems: () => void;
  approveQueueItem: (id: string) => void;
  dismissQueueItem: (id: string) => void;
  snoozeQueueItem: (id: string, until: string) => void;
  toggleExtractedAction: (queueItemId: string, actionId: string) => void;
  setActiveJob: (id: string | null) => void;
  setActiveView: (view: string) => void;
  setSelectedQueueItem: (id: string | null) => void;
  setSelectedQuote: (id: string | null) => void;
  updateJobNotes: (id: string, notes: string) => void;
  updateQuoteStatus: (id: string, status: Quote["status"]) => void;
}

function syncJobQuotes(jobs: Job[], quotes: Quote[], queueItems: QueueItem[]): Job[] {
  const countsByJob = queueItems.reduce<Record<string, number>>((acc, item) => {
    if (item.jobId && item.status === "pending") {
      acc[item.jobId] = (acc[item.jobId] ?? 0) + 1;
    }
    return acc;
  }, {});

  return jobs.map((job) => {
    const nextQuotes = quotes.filter((quote) => quote.jobId === job.id);
    const totalApproved = nextQuotes
      .filter((quote) => quote.status === "accepted")
      .reduce((sum, quote) => sum + quote.totalValue, 0);

    return {
      ...job,
      quotes: nextQuotes,
      totalQuoted: nextQuotes.reduce((sum, quote) => sum + quote.totalValue, 0),
      totalApproved,
      openQueueItems: countsByJob[job.id] ?? 0,
    };
  });
}

function pendingCount(queueItems: QueueItem[]): number {
  return queueItems.filter((item) => item.status === "pending").length;
}

function syncAgentStatus(agentStatus: AgentStatus, queueItems: QueueItem[], processedIncrement = 0, currentTask?: string): AgentStatus {
  const nextPending = pendingCount(queueItems);
  return {
    ...agentStatus,
    itemsProcessed: agentStatus.itemsProcessed + processedIncrement,
    openItems: nextPending,
    currentTask: currentTask ?? (nextPending > 0 ? "Waiting for contractor review" : "Watching for new inbound work"),
  };
}

export const useAppStore = create<AppStore>((set) => ({
  ...mockAppState,
  setUser: (user) => set({ user }),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
  approveAllQueueItems: () =>
    set((state) => {
      const processed = state.queueItems.filter((item) => item.status === "pending").length;
      const queueItems = state.queueItems.map((item) =>
        item.status === "pending"
          ? {
              ...item,
              status: "approved" as const,
              extractedActions: item.extractedActions.map((action) => ({ ...action, approved: true })),
            }
          : item
      );
      return {
        queueItems,
        jobs: syncJobQuotes(state.jobs, state.quotes, queueItems),
        agentStatus: syncAgentStatus(state.agentStatus, queueItems, processed),
      };
    }),
  approveQueueItem: (id) =>
    set((state) => {
      const queueItems = state.queueItems.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "approved" as const,
              extractedActions: item.extractedActions.map((action) => ({ ...action, approved: true })),
            }
          : item
      );
      return {
        queueItems,
        jobs: syncJobQuotes(state.jobs, state.quotes, queueItems),
        agentStatus: syncAgentStatus(state.agentStatus, queueItems, 1),
      };
    }),
  dismissQueueItem: (id) =>
    set((state) => {
      const queueItems = state.queueItems.map((item) => (item.id === id ? { ...item, status: "dismissed" as const } : item));
      return {
        queueItems,
        jobs: syncJobQuotes(state.jobs, state.quotes, queueItems),
        agentStatus: syncAgentStatus(state.agentStatus, queueItems),
      };
    }),
  snoozeQueueItem: (id, until) =>
    set((state) => {
      const queueItems = state.queueItems.map((item) =>
        item.id === id ? { ...item, status: "snoozed" as const, snoozedUntil: until } : item
      );
      return {
        queueItems,
        jobs: syncJobQuotes(state.jobs, state.quotes, queueItems),
        agentStatus: syncAgentStatus(state.agentStatus, queueItems),
      };
    }),
  toggleExtractedAction: (queueItemId, actionId) =>
    set((state) => ({
      queueItems: state.queueItems.map((item) =>
        item.id === queueItemId
          ? {
              ...item,
              extractedActions: item.extractedActions.map((action) =>
                action.id === actionId ? { ...action, approved: !action.approved } : action
              ),
            }
          : item
      ),
    })),
  setActiveJob: (activeJobId) => set({ activeJobId }),
  setActiveView: (activeView) => set({ activeView }),
  setSelectedQueueItem: (selectedQueueItemId) => set({ selectedQueueItemId }),
  setSelectedQuote: (selectedQuoteId) => set({ selectedQuoteId }),
  updateJobNotes: (id, notes) =>
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === id ? { ...job, notes } : job)),
    })),
  updateQuoteStatus: (id, status) =>
    set((state) => {
      const quotes = state.quotes.map((quote) => (quote.id === id ? { ...quote, status } : quote));
      return {
        quotes,
        jobs: syncJobQuotes(state.jobs, quotes, state.queueItems),
      };
    }),
}));
