import { create } from "zustand";

import { mockAppState } from "../lib/mockData";
import type { AgentStatus, AnalyticsPeriod, FollowUp, Job, JobActivity, QueueItem, Quote, QuoteDraftInput, QuoteLineItem, User } from "../types";

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
  createQuoteDraft: (input: QuoteDraftInput) => string | null;
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "quote";
}

function buildStoreId(prefix: string, seed: string): string {
  return `${prefix}-${slugify(seed)}-${Date.now().toString(36).slice(-6)}`;
}

function estimateLineValue(fragment: string, index: number): number {
  const normalized = fragment.toLowerCase();
  const matches: Array<{ keywords: string[]; value: number }> = [
    { keywords: ["roof", "reroof", "shingle", "flashing", "chimney"], value: 840 },
    { keywords: ["window", "door", "frame"], value: 680 },
    { keywords: ["electrical", "lighting", "panel", "fixture"], value: 540 },
    { keywords: ["cabinet", "counter", "tile", "kitchen"], value: 760 },
    { keywords: ["drywall", "paint", "patch"], value: 320 },
    { keywords: ["drain", "plumbing", "water"], value: 610 },
    { keywords: ["framing", "buildout", "tenant", "finish"], value: 950 },
    { keywords: ["concrete", "footing", "slab"], value: 1120 },
  ];

  const matched = matches.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)));
  if (matched) {
    return matched.value + index * 90;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const estimated = 220 + wordCount * 38 + index * 70;
  return Math.max(220, Math.min(1800, Math.round(estimated / 10) * 10));
}

function buildDraftLineItems(notes: string, attachmentName?: string): QuoteLineItem[] {
  const fragments = notes
    .split(/\r?\n|[.;]+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0)
    .slice(0, 3);

  const baseItems = (fragments.length > 0 ? fragments : ["Initial field scope review"]).map((fragment, index) => {
    const description = fragment.charAt(0).toUpperCase() + fragment.slice(1);
    const unitPrice = estimateLineValue(fragment, index);
    return {
      id: buildStoreId("line", `${description}-${index}`),
      description,
      quantity: 1,
      unitPrice,
      total: unitPrice,
    } satisfies QuoteLineItem;
  });

  if (attachmentName && baseItems.length < 4) {
    const unitPrice = 180;
    baseItems.push({
      id: buildStoreId("line", attachmentName),
      description: `Attached scope reference · ${attachmentName}`,
      quantity: 1,
      unitPrice,
      total: unitPrice,
    });
  }

  return baseItems;
}

function appendAgentLog(agentStatus: AgentStatus, message: string, timestamp: string): AgentStatus {
  return {
    ...agentStatus,
    lastActivityAt: timestamp,
    currentTask: message,
    log: [
      {
        id: buildStoreId("log", message),
        message,
        timestamp,
        type: "action" as const,
      },
      ...agentStatus.log,
    ].slice(0, 10),
  };
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
  createQuoteDraft: (input) => {
    const trimmedNotes = input.notes.trim();
    if (!trimmedNotes) {
      return null;
    }

    let nextQuoteId: string | null = null;

    set((state) => {
      const timestamp = new Date().toISOString();
      const jobName = input.jobName.trim() || "New quote draft";
      const customerName = input.customerName.trim() || "Customer pending";
      const customerContact = input.customerContact.trim() || "Contact pending";
      const attachmentName = input.attachmentName?.trim() || undefined;
      const lineItems = buildDraftLineItems(trimmedNotes, attachmentName);
      const totalValue = lineItems.reduce((sum, item) => sum + item.total, 0);
      const existingJob = state.jobs.find((job) => normalizeLookupKey(job.name) === normalizeLookupKey(jobName));
      const jobId = existingJob?.id ?? buildStoreId("job", jobName);
      const quoteId = buildStoreId("quote", `${jobName}-${customerName}`);
      nextQuoteId = quoteId;

      const quote: Quote = {
        id: quoteId,
        jobId,
        jobName,
        customerName: existingJob?.customerName ?? customerName,
        customerContact: existingJob?.customerContact ?? customerContact,
        status: "draft",
        lineItems,
        totalValue,
        createdAt: timestamp,
        notes: attachmentName ? `${trimmedNotes}\n\nAttachment: ${attachmentName}` : trimmedNotes,
        intakeSource: input.intakeSource,
        attachmentName,
      };

      const activityDescriptionBySource: Record<QuoteDraftInput["intakeSource"], string> = {
        manual: "Manual intake turned into a quote draft.",
        voice: "Voice memo turned into a quote draft.",
        photo: "Photo or file intake turned into a quote draft.",
        pdf: "PDF scope turned into a quote draft.",
      };

      const activityEntry: JobActivity = {
        id: buildStoreId("activity", `${jobName}-${input.intakeSource}`),
        type: "note",
        description: activityDescriptionBySource[input.intakeSource],
        timestamp,
        value: totalValue,
      };

      const baseJobs = existingJob
        ? state.jobs.map((job) =>
            job.id === existingJob.id
              ? {
                  ...job,
                  lastActivityAt: timestamp,
                  activityLog: [activityEntry, ...job.activityLog],
                }
              : job
          )
        : [
            {
              id: jobId,
              name: jobName,
              customerName,
              customerContact,
              status: "quoted" as const,
              totalQuoted: 0,
              totalApproved: 0,
              openQueueItems: 0,
              quotes: [],
              followUps: [],
              activityLog: [activityEntry],
              createdAt: timestamp,
              lastActivityAt: timestamp,
              tags: [input.intakeSource === "voice" ? "voice memo" : "new draft"],
              notes: trimmedNotes,
            },
            ...state.jobs,
          ];

      const quotes = [quote, ...state.quotes];
      const jobs = syncJobQuotes(baseJobs, quotes, state.queueItems);
      const sourceLabel: Record<QuoteDraftInput["intakeSource"], string> = {
        manual: "manual intake",
        voice: "voice memo",
        photo: "file/photo intake",
        pdf: "PDF intake",
      };

      return {
        quotes,
        jobs,
        activeJobId: jobId,
        selectedQuoteId: quoteId,
        agentStatus: appendAgentLog(state.agentStatus, `Drafted ${jobName} from ${sourceLabel[input.intakeSource]}`, timestamp),
      };
    });

    return nextQuoteId;
  },
}));
