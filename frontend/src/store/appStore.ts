import { create } from "zustand";

import {
  approveWorkspaceQueueItem,
  dismissWorkspaceQueueItem,
  fetchWorkspaceQueueItems,
  mapBackendFollowUpStatus,
  mapBackendJobActivityType,
  type BackendWorkspaceArtifacts,
  type BackendWorkspaceFollowUp,
  type BackendWorkspaceQuote,
  type WorkspaceQueueApprovalResult,
} from "../api/workspaceQueue";
import { fetchVoiceSessions, transferVoiceSession } from "../api/voice";
import { mockAppState } from "../lib/mockData";
import type { AgentStatus, AnalyticsPeriod, FollowUp, Job, JobActivity, QueueItem, Quote, QuoteDraftInput, QuoteIntakeSource, QuoteLineItem, User, VoiceCallSession } from "../types";

interface AppStore {
  user: User | null;
  agentStatus: AgentStatus;
  queueItems: QueueItem[];
  jobs: Job[];
  quotes: Quote[];
  followUps: FollowUp[];
  analytics: AnalyticsPeriod[];
  voiceSessions: VoiceCallSession[];
  activeJobId: string | null;
  activeView: string;
  selectedQueueItemId: string | null;
  selectedQuoteId: string | null;

  setUser: (user: User) => void;
  setAgentStatus: (status: AgentStatus) => void;
  setQueueItems: (items: QueueItem[]) => void;
  refreshQueueItems: () => Promise<void>;
  approveAllQueueItems: () => Promise<void>;
  approveQueueItem: (id: string) => Promise<void>;
  dismissQueueItem: (id: string) => Promise<void>;
  snoozeQueueItem: (id: string, until: string) => void;
  toggleExtractedAction: (queueItemId: string, actionId: string) => void;
  setActiveJob: (id: string | null) => void;
  setActiveView: (view: string) => void;
  setSelectedQueueItem: (id: string | null) => void;
  setSelectedQuote: (id: string | null) => void;
  setVoiceSessions: (sessions: VoiceCallSession[]) => void;
  refreshVoiceSessions: () => Promise<void>;
  updateJobNotes: (id: string, notes: string) => void;
  updateQuoteStatus: (id: string, status: Quote["status"]) => void;
  createQuoteDraft: (input: QuoteDraftInput) => string | null;
  requestVoiceTransfer: (id: string) => Promise<void>;
  seedGhostCallQueueItem: (phoneNumber: string) => { queueItemId: string; jobId: string } | null;
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

function buildGhostCallItem(phoneNumber: string) {
  const jobName = "Smith job";
  const jobId = buildStoreId("job", jobName);
  const queueItemId = buildStoreId("queue", "mock-change-order");
  const description =
    "Sub called in: add 4 recessed lights at the Smith job, add $600 before the next quote goes out.";

  return {
    queueItemId,
    jobId,
    jobName,
    description,
    phoneNumber: phoneNumber.trim(),
    transcript: "Hey, we are doing four extra recessed lights at the Smith job, add $600.",
  };
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
      description: `Attached scope reference - ${attachmentName}`,
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

function addDays(timestamp: string, days: number): string {
  return new Date(new Date(timestamp).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function quoteIntakeSourceFromQueueItem(item: QueueItem): QuoteIntakeSource {
  if (item.source === "CALL") {
    return "voice";
  }
  if (item.source === "UPLOAD") {
    return item.sourceRef?.toLowerCase().endsWith(".pdf") ? "pdf" : "photo";
  }
  return "manual";
}

function queueNeedsReview(item: QueueItem): boolean {
  return item.status === "pending" || item.status === "manual_review";
}

function syncJobsState(jobs: Job[], quotes: Quote[], followUps: FollowUp[], queueItems: QueueItem[]): Job[] {
  const jobIdByName = jobs.reduce<Record<string, string>>((acc, job) => {
    acc[normalizeLookupKey(job.name)] = job.id;
    return acc;
  }, {});

  const countsByJob = queueItems.reduce<Record<string, number>>((acc, item) => {
    const linkedJobId =
      (item.jobId && jobs.some((job) => job.id === item.jobId) ? item.jobId : undefined) ??
      (item.jobName ? jobIdByName[normalizeLookupKey(item.jobName)] : undefined);

    if (linkedJobId && queueNeedsReview(item)) {
      acc[linkedJobId] = (acc[linkedJobId] ?? 0) + 1;
    }
    return acc;
  }, {});

  return jobs.map((job) => {
    const nextQuotes = quotes.filter((quote) => quote.jobId === job.id);
    const nextFollowUps = followUps.filter((followUp) => followUp.jobId === job.id);
    const totalApproved = nextQuotes
      .filter((quote) => quote.status === "accepted")
      .reduce((sum, quote) => sum + quote.totalValue, 0);

    return {
      ...job,
      quotes: nextQuotes,
      followUps: nextFollowUps,
      totalQuoted: nextQuotes.reduce((sum, quote) => sum + quote.totalValue, 0),
      totalApproved,
      openQueueItems: countsByJob[job.id] ?? 0,
    };
  });
}

function pendingCount(queueItems: QueueItem[]): number {
  return queueItems.filter(queueNeedsReview).length;
}

function sortQueueItems(items: QueueItem[]): QueueItem[] {
  return [...items].sort((left, right) => {
    const leftPriority = left.status === "manual_review" ? 0 : left.urgent ? 1 : 2;
    const rightPriority = right.status === "manual_review" ? 0 : right.urgent ? 1 : 2;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function summarizeQueueTask(queueItems: QueueItem[]): string {
  const manualReviewCount = queueItems.filter((item) => item.status === "manual_review").length;
  if (manualReviewCount > 0) {
    return `Manual review needed on ${manualReviewCount} item${manualReviewCount === 1 ? "" : "s"}`;
  }

  const openCount = pendingCount(queueItems);
  return openCount > 0 ? "Waiting for contractor review" : "Watching for new inbound work";
}

function mergeLiveQueueItems(current: QueueItem[], incoming: QueueItem[]): QueueItem[] {
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const currentById = new Map(current.map((item) => [item.id, item]));

  const mergedIncoming = incoming.map((item) => {
    const existing = currentById.get(item.id);
    const existingActions = new Map((existing?.extractedActions ?? []).map((action) => [action.id, action]));
    const resolvedLocally = existing && !queueNeedsReview(existing);

    return {
      ...item,
      status: resolvedLocally ? existing.status : item.status,
      approvedAt: existing?.approvedAt,
      generatedQuoteId: existing?.generatedQuoteId,
      generatedFollowUpIds: existing?.generatedFollowUpIds,
      backendArtifactErrors: existing?.backendArtifactErrors,
      extractedActions: item.extractedActions.map((action) => {
        const existingAction = existingActions.get(action.id);
        return existingAction ? { ...action, approved: existingAction.approved } : action;
      }),
    } satisfies QueueItem;
  });

  const preservedExisting = current.filter((item) => {
    if (!incomingById.has(item.id)) {
      return !item.backendLinked || !queueNeedsReview(item);
    }
    return false;
  });

  return sortQueueItems([...mergedIncoming, ...preservedExisting]);
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

function mapBackendQuoteStatus(status: string | undefined): Quote["status"] {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "sent") return "sent";
  if (normalized === "viewed") return "viewed";
  if (normalized === "accepted") return "accepted";
  if (normalized === "rejected") return "rejected";
  if (normalized === "expired") return "expired";
  return "draft";
}

function toQuoteLineItem(item: NonNullable<BackendWorkspaceQuote["line_items"]>[number], index: number): QuoteLineItem {
  const quantity = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
  const unitPrice = typeof item.unit_price === "number" ? item.unit_price : 0;
  const total = typeof item.total === "number" ? item.total : quantity * unitPrice;

  return {
    id: item.id?.trim() || buildStoreId("line", `backend-${index}`),
    description: item.description?.trim() || `Line item ${index + 1}`,
    quantity,
    unitPrice,
    total,
  };
}

function upsertQuote(quotes: Quote[], quote: Quote): { quotes: Quote[]; inserted: boolean } {
  const index = quotes.findIndex((entry) => entry.id === quote.id);
  if (index === -1) {
    return { quotes: [quote, ...quotes], inserted: true };
  }

  const next = [...quotes];
  next[index] = quote;
  return { quotes: next, inserted: false };
}

function upsertFollowUps(
  existingFollowUps: FollowUp[],
  incoming: FollowUp[]
): { followUps: FollowUp[]; insertedCount: number } {
  let insertedCount = 0;
  const byId = new Map(existingFollowUps.map((followUp) => [followUp.id, followUp]));

  incoming.forEach((followUp) => {
    if (!byId.has(followUp.id)) {
      insertedCount += 1;
    }
    byId.set(followUp.id, followUp);
  });

  const followUps = Array.from(byId.values()).sort(
    (left, right) => new Date(right.scheduledFor).getTime() - new Date(left.scheduledFor).getTime()
  );
  return { followUps, insertedCount };
}

function ensureJobForApproval(
  jobs: Job[],
  item: QueueItem,
  result: WorkspaceQueueApprovalResult,
  quoteArtifact?: BackendWorkspaceQuote | null,
  followUpArtifacts: BackendWorkspaceFollowUp[] = []
): { jobs: Job[]; job: Job | null } {
  const artifactJobId =
    quoteArtifact?.job_id?.trim() ||
    followUpArtifacts.find((followUp) => followUp.job_id?.trim())?.job_id?.trim() ||
    result.activeJobId?.trim() ||
    item.jobId?.trim() ||
    "";
  const artifactJobName =
    quoteArtifact?.job_name?.trim() ||
    followUpArtifacts.find((followUp) => followUp.job_name?.trim())?.job_name?.trim() ||
    item.jobName?.trim() ||
    (artifactJobId ? "Linked job" : "");
  const artifactCustomerName =
    quoteArtifact?.customer_name?.trim() ||
    jobs.find((job) => job.id === artifactJobId)?.customerName ||
    "Customer pending";
  const artifactCustomerContact =
    quoteArtifact?.customer_contact?.trim() ||
    jobs.find((job) => job.id === artifactJobId)?.customerContact ||
    item.sourceRef?.trim() ||
    "Contact pending";

  const existingJob =
    jobs.find((job) => artifactJobId && job.id === artifactJobId) ??
    jobs.find((job) => artifactJobName && normalizeLookupKey(job.name) === normalizeLookupKey(artifactJobName));

  if (existingJob) {
    return { jobs, job: existingJob };
  }

  if (!artifactJobId && !artifactJobName) {
    return { jobs, job: null };
  }

  const createdAt = result.approvedAt;
  const createdJob: Job = {
    id: artifactJobId || buildStoreId("job", artifactJobName),
    name: artifactJobName,
    customerName: artifactCustomerName,
    customerContact: artifactCustomerContact,
    status: "active",
    totalQuoted: 0,
    totalApproved: 0,
    openQueueItems: 0,
    quotes: [],
    followUps: [],
    activityLog: [],
    createdAt,
    lastActivityAt: createdAt,
    tags: ["queue review", item.source.toLowerCase()],
    notes: item.description,
  };

  return { jobs: [createdJob, ...jobs], job: createdJob };
}

function buildQuoteFromBackendArtifact(
  artifact: BackendWorkspaceQuote,
  item: QueueItem,
  job: Job,
  fallbackTimestamp: string
): Quote | null {
  const quoteId = artifact.id?.trim();
  if (!quoteId) {
    return null;
  }

  const lineItems = Array.isArray(artifact.line_items)
    ? artifact.line_items.map((lineItem, index) => toQuoteLineItem(lineItem, index))
    : [];
  const totalValue =
    typeof artifact.total_value === "number"
      ? artifact.total_value
      : lineItems.reduce((sum, lineItem) => sum + lineItem.total, 0);

  return {
    id: quoteId,
    jobId: artifact.job_id?.trim() || job.id,
    jobName: artifact.job_name?.trim() || job.name,
    customerName: artifact.customer_name?.trim() || job.customerName,
    customerContact: artifact.customer_contact?.trim() || job.customerContact,
    status: mapBackendQuoteStatus(artifact.status),
    lineItems,
    totalValue,
    createdAt: artifact.created_at?.trim() || fallbackTimestamp,
    sourceQueueItemId: artifact.source_queue_item_id?.trim() || item.id,
    notes: artifact.notes?.trim() || item.description,
    intakeSource: quoteIntakeSourceFromQueueItem(item),
    attachmentName: item.source === "UPLOAD" ? item.sourceRef : undefined,
  };
}

function buildFollowUpsFromBackendArtifacts(
  artifacts: BackendWorkspaceFollowUp[],
  job: Job
): FollowUp[] {
  return artifacts
    .filter((artifact) => artifact.id?.trim())
    .map((artifact) => ({
      id: artifact.id!.trim(),
      jobId: artifact.job_id?.trim() || job.id,
      jobName: artifact.job_name?.trim() || job.name,
      description: artifact.description?.trim() || "Follow up with customer",
      status: mapBackendFollowUpStatus(artifact.status),
      scheduledFor: artifact.scheduled_for?.trim() || new Date().toISOString(),
    }));
}

function buildJobActivitiesFromBackendArtifacts(
  artifacts: NonNullable<BackendWorkspaceArtifacts["job_activity"]>
): JobActivity[] {
  return artifacts
    .filter((artifact) => artifact.description?.trim())
    .map((artifact) => ({
      id: artifact.id?.trim() || buildStoreId("activity", artifact.description ?? "backend-activity"),
      type: mapBackendJobActivityType(artifact.type),
      description: artifact.description!.trim(),
      timestamp: artifact.timestamp?.trim() || new Date().toISOString(),
      value: typeof artifact.value === "number" ? artifact.value : undefined,
    }));
}

function buildQueueQuote(item: QueueItem, job: Job, timestamp: string): Quote | null {
  const quoteActions = item.extractedActions.filter((action) => action.type === "change_order" || action.type === "quote_item");
  if (quoteActions.length === 0) {
    return null;
  }

  const lineItems: QuoteLineItem[] = quoteActions.map((action, index) => {
    const description = action.description.charAt(0).toUpperCase() + action.description.slice(1);
    const unitPrice = typeof action.estimatedValue === "number" ? action.estimatedValue : estimateLineValue(action.description, index);
    return {
      id: buildStoreId("line", `${item.id}-${index}`),
      description,
      quantity: 1,
      unitPrice,
      total: unitPrice,
    };
  });

  const notesParts = [`Approved from ${item.source} queue item.`, item.description];
  if (item.sourceRef) {
    notesParts.push(`Source ref: ${item.sourceRef}`);
  }

  return {
    id: buildStoreId("quote", `${job.name}-${item.title}`),
    jobId: job.id,
    jobName: job.name,
    customerName: job.customerName,
    customerContact: job.customerContact,
    status: "draft",
    lineItems,
    totalValue: lineItems.reduce((sum, lineItem) => sum + lineItem.total, 0),
    createdAt: timestamp,
    sourceQueueItemId: item.id,
    notes: notesParts.join("\n\n"),
    intakeSource: quoteIntakeSourceFromQueueItem(item),
    attachmentName: item.source === "UPLOAD" ? item.sourceRef : undefined,
  };
}

function buildQueueFollowUps(item: QueueItem, job: Job, timestamp: string, existingFollowUps: FollowUp[]): FollowUp[] {
  return item.extractedActions
    .filter((action) => action.type === "follow_up" || action.type === "commitment")
    .filter((action) => !existingFollowUps.some((followUp) => followUp.jobId === job.id && normalizeLookupKey(followUp.description) === normalizeLookupKey(action.description)))
    .map((action, index) => ({
      id: buildStoreId("followup", `${item.id}-${index}`),
      jobId: job.id,
      jobName: job.name,
      description: action.description,
      status: "scheduled" as const,
      scheduledFor: addDays(timestamp, 1),
    }));
}

function buildQueueActivities(item: QueueItem, quote: Quote | null, followUps: FollowUp[], timestamp: string): JobActivity[] {
  const activities: JobActivity[] = [
    {
      id: buildStoreId("activity", `${item.id}-approved`),
      type: item.extractedActions.some((action) => action.type === "change_order") ? "change_order" : "note",
      description: `Approved ${item.source.toLowerCase()} update: ${item.title}.`,
      timestamp,
      value: quote?.totalValue,
    },
  ];

  if (quote) {
    activities.push({
      id: buildStoreId("activity", `${item.id}-draft`),
      type: item.extractedActions.some((action) => action.type === "change_order") ? "change_order" : "note",
      description: `Draft quote prepared from queue review: ${item.title}.`,
      timestamp,
      value: quote.totalValue,
    });
  }

  followUps.forEach((followUp) => {
    activities.push({
      id: buildStoreId("activity", `${followUp.id}-scheduled`),
      type: "follow_up",
      description: `Follow-up scheduled: ${followUp.description}`,
      timestamp,
    });
  });

  return activities;
}

function applyQueueApprovals(
  state: Pick<AppStore, "agentStatus" | "followUps" | "jobs" | "queueItems" | "quotes" | "selectedQuoteId" | "activeJobId">,
  queueItemIds: string[]
): Pick<AppStore, "agentStatus" | "followUps" | "jobs" | "queueItems" | "quotes" | "selectedQuoteId" | "activeJobId"> {
  const timestamp = new Date().toISOString();
  let quotes = [...state.quotes];
  let followUps = [...state.followUps];
  let jobs = [...state.jobs];
  let firstQuoteId: string | null = state.selectedQuoteId;
  let firstJobId: string | null = state.activeJobId;
  let processedCount = 0;
  let draftedCount = 0;
  let followUpCount = 0;

  const queueItems = state.queueItems.map((item) => {
    if (!queueItemIds.includes(item.id) || !queueNeedsReview(item)) {
      return item;
    }

    processedCount += 1;

    const existingJob = jobs.find((job) => job.id === item.jobId) ?? jobs.find((job) => item.jobName && normalizeLookupKey(job.name) === normalizeLookupKey(item.jobName));
    const jobId = existingJob?.id ?? item.jobId ?? buildStoreId("job", item.jobName ?? item.title);
    const jobName = item.jobName?.trim() || existingJob?.name || item.title;
    const customerName = existingJob?.customerName ?? "Customer pending";
    const customerContact = existingJob?.customerContact ?? item.sourceRef ?? "Contact pending";

    if (!existingJob) {
      jobs = [
        {
          id: jobId,
          name: jobName,
          customerName,
          customerContact,
          status: "active",
          totalQuoted: 0,
          totalApproved: 0,
          openQueueItems: 0,
          quotes: [],
          followUps: [],
          activityLog: [],
          createdAt: timestamp,
          lastActivityAt: timestamp,
          tags: ["queue review", item.source.toLowerCase()],
          notes: item.description,
        },
        ...jobs,
      ];
    }

    const job = jobs.find((candidate) => candidate.id === jobId)!;
    const existingQuote = quotes.find((quote) => quote.sourceQueueItemId === item.id);
    const quote = existingQuote ?? buildQueueQuote(item, job, timestamp);
    if (!existingQuote && quote) {
      quotes = [quote, ...quotes];
      draftedCount += 1;
      if (!firstQuoteId) {
        firstQuoteId = quote.id;
      }
    }

    const nextFollowUps = buildQueueFollowUps(item, job, timestamp, followUps);
    if (nextFollowUps.length > 0) {
      followUps = [...nextFollowUps, ...followUps];
      followUpCount += nextFollowUps.length;
    }

    const activities = buildQueueActivities(item, quote, nextFollowUps, timestamp);
    jobs = jobs.map((candidate) =>
      candidate.id === jobId
        ? {
            ...candidate,
            status: quote ? "quoted" : candidate.status,
            notes: candidate.notes ?? item.description,
            lastActivityAt: timestamp,
            activityLog: [...activities, ...candidate.activityLog],
            tags: Array.from(new Set([...candidate.tags, item.source.toLowerCase(), ...(quote ? ["draft ready"] : []), ...(nextFollowUps.length > 0 ? ["follow-up scheduled"] : [])])),
          }
        : candidate
    );

    if (!firstJobId) {
      firstJobId = jobId;
    }

    return {
      ...item,
      jobId,
      jobName,
      status: "approved" as const,
      approvedAt: timestamp,
      generatedQuoteId: quote?.id,
      generatedFollowUpIds: nextFollowUps.map((followUp) => followUp.id),
      backendArtifactErrors: [],
      extractedActions: item.extractedActions.map((action) => ({ ...action, approved: true })),
    };
  });

  const summaryParts = [
    `Approved ${processedCount} queue item${processedCount === 1 ? "" : "s"}`,
    draftedCount > 0 ? `drafted ${draftedCount} quote${draftedCount === 1 ? "" : "s"}` : "",
    followUpCount > 0 ? `scheduled ${followUpCount} follow-up${followUpCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  const jobsWithSync = syncJobsState(jobs, quotes, followUps, queueItems);
  const summary = summaryParts.join(" · ");
  const agentStatus = summaryParts.length > 0
    ? appendAgentLog(syncAgentStatus(state.agentStatus, queueItems, processedCount, summary), summary, timestamp)
    : syncAgentStatus(state.agentStatus, queueItems, 0, summarizeQueueTask(queueItems));

  return {
    queueItems: sortQueueItems(queueItems),
    quotes,
    followUps,
    jobs: jobsWithSync,
    agentStatus,
    activeJobId: firstJobId,
    selectedQuoteId: firstQuoteId,
  };
}

function applyQueueApprovalResults(
  state: Pick<AppStore, "agentStatus" | "followUps" | "jobs" | "queueItems" | "quotes" | "selectedQuoteId" | "activeJobId">,
  approvalResults: WorkspaceQueueApprovalResult[]
): Pick<AppStore, "agentStatus" | "followUps" | "jobs" | "queueItems" | "quotes" | "selectedQuoteId" | "activeJobId"> {
  const resultsById = new Map(approvalResults.map((result) => [result.itemId, result]));
  let quotes = [...state.quotes];
  let followUps = [...state.followUps];
  let jobs = [...state.jobs];
  let firstQuoteId: string | null = state.selectedQuoteId;
  let firstJobId: string | null = state.activeJobId;
  let processedCount = 0;
  let draftedCount = 0;
  let followUpCount = 0;

  const queueItems = state.queueItems.map((item) => {
    const result = resultsById.get(item.id);
    if (!result || !queueNeedsReview(item)) {
      return item;
    }

    processedCount += 1;
    const workspaceArtifacts = result.workspaceArtifacts;
    const followUpArtifacts = workspaceArtifacts?.followups ?? [];
    const quoteArtifact = workspaceArtifacts?.quote;
    const ensured = ensureJobForApproval(jobs, item, result, quoteArtifact, followUpArtifacts);
    jobs = ensured.jobs;
    const job = ensured.job;
    const resolvedJobId = job?.id ?? result.activeJobId ?? item.jobId;
    const resolvedJobName = job?.name ?? item.jobName;

    const backendQuote = quoteArtifact && job ? buildQuoteFromBackendArtifact(quoteArtifact, item, job, result.approvedAt) : null;
    if (backendQuote) {
      const upsertedQuote = upsertQuote(quotes, backendQuote);
      quotes = upsertedQuote.quotes;
      if (upsertedQuote.inserted) {
        draftedCount += 1;
      }
      if (!firstQuoteId) {
        firstQuoteId = backendQuote.id;
      }
    }

    const backendFollowUps = job ? buildFollowUpsFromBackendArtifacts(followUpArtifacts, job) : [];
    if (backendFollowUps.length > 0) {
      const upsertedFollowUps = upsertFollowUps(followUps, backendFollowUps);
      followUps = upsertedFollowUps.followUps;
      followUpCount += upsertedFollowUps.insertedCount;
    }

    const backendActivities = buildJobActivitiesFromBackendArtifacts(workspaceArtifacts?.job_activity ?? []);
    const lastActivityAt =
      backendActivities[0]?.timestamp ||
      backendQuote?.createdAt ||
      backendFollowUps[0]?.scheduledFor ||
      result.approvedAt;

    if (job && resolvedJobId) {
      jobs = jobs.map((candidate) =>
        candidate.id === resolvedJobId
          ? {
              ...candidate,
              status: backendQuote ? "quoted" : candidate.status,
              notes: candidate.notes ?? item.description,
              lastActivityAt,
              activityLog: [...backendActivities, ...candidate.activityLog],
              tags: Array.from(
                new Set([
                  ...candidate.tags,
                  item.source.toLowerCase(),
                  ...(backendQuote ? ["draft ready"] : []),
                  ...(backendFollowUps.length > 0 ? ["follow-up scheduled"] : []),
                  ...(item.backendKind === "transcript" ? ["transcript reviewed"] : []),
                ])
              ),
            }
          : candidate
      );
    }

    if (!firstJobId && resolvedJobId) {
      firstJobId = resolvedJobId;
    }

      return {
        ...item,
        jobId: resolvedJobId,
        jobName: resolvedJobName,
        status: result.status,
        approvedAt: result.approvedAt,
        generatedQuoteId: result.generatedQuoteId ?? backendQuote?.id,
        generatedFollowUpIds: result.generatedFollowUpIds ?? backendFollowUps.map((followUp) => followUp.id),
        backendArtifactErrors: result.backendArtifactErrors ?? [],
        confirmationStatus: result.confirmationStatus,
        confirmationChannel: result.confirmationChannel,
        confirmationTo: result.confirmationTo,
        confirmationError: result.confirmationError,
        extractedActions: item.extractedActions.map((action) => ({ ...action, approved: true })),
      };
    });

  const summaryParts = [
    `Approved ${processedCount} queue item${processedCount === 1 ? "" : "s"}`,
    draftedCount > 0 ? `drafted ${draftedCount} quote${draftedCount === 1 ? "" : "s"}` : "",
    followUpCount > 0 ? `scheduled ${followUpCount} follow-up${followUpCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean);

  const jobsWithSync = syncJobsState(jobs, quotes, followUps, queueItems);
  const summary = summaryParts.join(" · ");
  const agentStatus = summaryParts.length > 0
    ? appendAgentLog(syncAgentStatus(state.agentStatus, queueItems, processedCount, summary), summary, new Date().toISOString())
    : syncAgentStatus(state.agentStatus, queueItems, 0, summarizeQueueTask(queueItems));

  return {
    queueItems: sortQueueItems(queueItems),
    quotes,
    followUps,
    jobs: jobsWithSync,
    agentStatus,
    activeJobId: firstJobId,
    selectedQuoteId: firstQuoteId,
  };
}

function mergeVoiceSessionList(current: VoiceCallSession[], incoming: VoiceCallSession): VoiceCallSession[] {
  const existingIndex = current.findIndex((session) => session.id === incoming.id);
  if (existingIndex === -1) {
    return [incoming, ...current].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }

  const next = [...current];
  next[existingIndex] = incoming;
  next.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  return next;
}

export const useAppStore = create<AppStore>((set, get) => ({
  ...mockAppState,
  setUser: (user) => set({ user }),
  setAgentStatus: (agentStatus) => set({ agentStatus }),
  setQueueItems: (queueItems) =>
    set((state) => ({
      queueItems: sortQueueItems(queueItems),
      jobs: syncJobsState(state.jobs, state.quotes, state.followUps, queueItems),
      agentStatus: syncAgentStatus(state.agentStatus, queueItems, 0, summarizeQueueTask(queueItems)),
    })),
  refreshQueueItems: async () => {
    try {
      const liveQueueItems = await fetchWorkspaceQueueItems();
      set((state) => {
        const queueItems = mergeLiveQueueItems(state.queueItems, liveQueueItems);
        return {
          queueItems,
          jobs: syncJobsState(state.jobs, state.quotes, state.followUps, queueItems),
          agentStatus: syncAgentStatus(state.agentStatus, queueItems, 0, summarizeQueueTask(queueItems)),
        };
      });
    } catch {
      // Keep the current queue visible when the live backend is unavailable.
    }
  },
  setVoiceSessions: (voiceSessions) => set({ voiceSessions }),
  refreshVoiceSessions: async () => {
    try {
      const voiceSessions = await fetchVoiceSessions();
      set({ voiceSessions });
    } catch {
      // Keep the current local sessions visible when the live backend is unavailable.
    }
  },
  approveAllQueueItems: async () => {
    const items = get().queueItems.filter(queueNeedsReview);
    const approvedIds: string[] = [];
    const approvalResults: WorkspaceQueueApprovalResult[] = [];

    for (const item of items) {
      try {
        const result = await approveWorkspaceQueueItem(item);
        if (result) {
          approvalResults.push(result);
        } else {
          approvedIds.push(item.id);
        }
      } catch {
        // Leave the item in the queue when the live approval fails.
      }
    }

    if (approvalResults.length > 0 || approvedIds.length > 0) {
      set((state) => {
        const nextState =
          approvalResults.length > 0 ? applyQueueApprovalResults(state, approvalResults) : state;
        return approvedIds.length > 0 ? applyQueueApprovals(nextState, approvedIds) : nextState;
      });
    }
  },
  approveQueueItem: async (id) => {
    const item = get().queueItems.find((candidate) => candidate.id === id);
    if (!item) {
      return;
    }

    try {
      const result = await approveWorkspaceQueueItem(item);
      if (result) {
        set((state) => applyQueueApprovalResults(state, [result]));
        return;
      }
    } catch {
      return;
    }

    set((state) => applyQueueApprovals(state, [id]));
  },
  dismissQueueItem: async (id) => {
    const item = get().queueItems.find((candidate) => candidate.id === id);
    if (!item) {
      return;
    }

    try {
      await dismissWorkspaceQueueItem(item);
    } catch {
      return;
    }

    set((state) => {
      const queueItems = sortQueueItems(state.queueItems.map((entry) => (entry.id === id ? { ...entry, status: "dismissed" as const } : entry)));
      return {
        queueItems,
        jobs: syncJobsState(state.jobs, state.quotes, state.followUps, queueItems),
        agentStatus: syncAgentStatus(state.agentStatus, queueItems, 0, summarizeQueueTask(queueItems)),
      };
    });
  },
  snoozeQueueItem: (id, until) =>
    set((state) => {
      const queueItems = sortQueueItems(state.queueItems.map((item) =>
        item.id === id ? { ...item, status: "snoozed" as const, snoozedUntil: until } : item
      ));
      return {
        queueItems,
        jobs: syncJobsState(state.jobs, state.quotes, state.followUps, queueItems),
        agentStatus: syncAgentStatus(state.agentStatus, queueItems, 0, summarizeQueueTask(queueItems)),
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
    seedGhostCallQueueItem: (phoneNumber) => {
      const seed = buildGhostCallItem(phoneNumber);
      if (!seed) return null;

      let alreadyExists = false;
      set((state) => {
        alreadyExists = state.queueItems.some((item) => item.title === "Mock change order" || item.id === seed.queueItemId);
        if (alreadyExists) {
          return state;
        }

        const newJob: Job = {
          id: seed.jobId,
          name: seed.jobName,
          customerName: "Smith",
          customerContact: "(555) 013-8890",
          address: "1187 Northgate Dr",
          status: "active",
          totalQuoted: 0,
          totalApproved: 0,
          openQueueItems: 1,
          quotes: [],
          followUps: [],
          tags: ["onboarding"],
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          notes: "Onboarding mock job for Arbor demo flow.",
          activityLog: [],
        };

        const queueItem: QueueItem = {
          id: seed.queueItemId,
          title: "Mock change order",
          description: seed.description,
          source: "CALL",
          jobId: seed.jobId,
          jobName: seed.jobName,
          urgent: true,
          status: "pending",
          extractedActions: [
            {
              id: buildStoreId("action", "recessed-lights"),
              type: "change_order",
              description: "Add 4 recessed lights to Smith job",
              estimatedValue: 600,
              approved: false,
            },
          ],
          rawTranscriptSnippet: seed.transcript,
          createdAt: new Date().toISOString(),
          confidenceScore: 0.88,
        };

        return {
          jobs: state.jobs.some((job) => job.id === seed.jobId) ? state.jobs : [newJob, ...state.jobs],
          queueItems: [queueItem, ...state.queueItems],
          agentStatus: appendAgentLog(state.agentStatus, "Onboarding mock change order captured", new Date().toISOString()),
        };
      });

      return alreadyExists ? null : { queueItemId: seed.queueItemId, jobId: seed.jobId };
    },
    requestVoiceTransfer: async (id) => {
    const timestamp = new Date().toISOString();
    let selectedLabel = "";

    set((state) => {
      const voiceSessions = state.voiceSessions.map((session) => {
        if (session.id !== id) {
          return session;
        }
        selectedLabel = session.jobName ?? session.callerName;
        const optimisticTransferState: VoiceCallSession["transferState"] =
          session.transferState === "requested" ? "dialing" : "requested";
        return {
          ...session,
          transferState: optimisticTransferState,
          updatedAt: timestamp,
        };
      });

      return {
        voiceSessions,
        agentStatus: selectedLabel
          ? appendAgentLog(state.agentStatus, `Voice handoff updated - ${selectedLabel}`, timestamp)
          : state.agentStatus,
      };
    });

    try {
      const session = await transferVoiceSession(id);
      set((state) => ({
        voiceSessions: mergeVoiceSessionList(state.voiceSessions, session),
        agentStatus: appendAgentLog(
          state.agentStatus,
          `Voice handoff updated - ${session.jobName ?? session.callerName}`,
          session.updatedAt
        ),
      }));
    } catch {
      set((state) => {
        const existing = state.voiceSessions.find((session) => session.id === id);
        const fallbackState: VoiceCallSession["transferState"] =
          existing?.transferState === "dialing"
            ? "requested"
            : existing?.transferState === "requested"
              ? "saved_for_review"
              : existing?.transferState ?? "saved_for_review";
        return {
          voiceSessions: state.voiceSessions.map((session) =>
            session.id === id
              ? {
                  ...session,
                  transferState: fallbackState,
                  updatedAt: new Date().toISOString(),
                }
              : session
          ),
        };
      });
    }
  },
  updateJobNotes: (id, notes) =>
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === id ? { ...job, notes } : job)),
    })),
  updateQuoteStatus: (id, status) =>
    set((state) => {
      const timestamp = new Date().toISOString();
      let activityEntry: JobActivity | null = null;
      const quotes = state.quotes.map((quote) => {
        if (quote.id !== id) {
          return quote;
        }

        const nextQuote: Quote = {
          ...quote,
          status,
          sentAt: status === "sent" ? quote.sentAt ?? timestamp : quote.sentAt,
          viewedAt: status === "viewed" ? quote.viewedAt ?? timestamp : quote.viewedAt,
          respondedAt: ["accepted", "rejected", "expired"].includes(status) ? quote.respondedAt ?? timestamp : quote.respondedAt,
        };

        if (status === "sent") {
          activityEntry = {
            id: buildStoreId("activity", `${quote.jobName}-quote-sent`),
            type: "quote_sent",
            description: `Quote sent to ${quote.customerName}.`,
            timestamp,
            value: quote.totalValue,
          };
        } else if (status === "accepted") {
          activityEntry = {
            id: buildStoreId("activity", `${quote.jobName}-quote-accepted`),
            type: "quote_accepted",
            description: `Quote accepted by ${quote.customerName}.`,
            timestamp,
            value: quote.totalValue,
          };
        } else if (status === "rejected") {
          activityEntry = {
            id: buildStoreId("activity", `${quote.jobName}-quote-rejected`),
            type: "note",
            description: `Quote marked rejected for ${quote.customerName}.`,
            timestamp,
            value: quote.totalValue,
          };
        }

        return nextQuote;
      });

      const jobs = syncJobsState(
        state.jobs.map((job) =>
          activityEntry && quotes.some((quote) => quote.id === id && quote.jobId === job.id)
            ? {
                ...job,
                status: status === "accepted" && job.status === "quoted" ? "in_progress" : job.status,
                lastActivityAt: timestamp,
                activityLog: [activityEntry, ...job.activityLog],
              }
            : job
        ),
        quotes,
        state.followUps,
        state.queueItems
      );

      return {
        quotes,
        jobs,
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
      const jobs = syncJobsState(baseJobs, quotes, state.followUps, state.queueItems);
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
