import { apiClient, publicApiClient } from "./client";
import { shouldUseMockApi } from "../lib/offline";
import { mockAppState } from "../lib/mockData";
import type { ExtractedAction, FollowUpStatus, InputSource, JobActivity, QueueItem, QueueStatus } from "../types";

const betaContractorId =
  (import.meta.env.VITE_BETA_CONTRACTOR_ID as string | undefined)?.trim() ??
  "00000000-0000-0000-0000-000000000001";

const betaApiKey = (import.meta.env.VITE_BETA_API_KEY as string | undefined)?.trim() ?? "";
const manualReviewConfidenceFloor = 0.72;

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: string | null;
};

type BackendDraftTranscript = {
  transcript_id?: string;
  source?: string;
  caller_label?: string;
  caller_phone?: string;
  summary?: string;
  classification?: string;
  urgency?: "low" | "normal" | "high";
  confidence?: number | null;
  recommended_actions?: string[];
  missing_information?: string[];
  transcript_text?: string;
  linked_quote_id?: string;
  related_queue_item_ids?: string[];
  started_at?: string | null;
};

type BackendDraft = {
  id: string;
  job_id?: string;
  job_name?: string;
  type?: string;
  title?: string;
  content?: string;
  why?: string;
  status?: string;
  trace_id?: string;
  created_at?: string;
  transcript?: BackendDraftTranscript | null;
};

type BackendTranscriptInboxItem = {
  transcript_id: string;
  trace_id?: string;
  caller_label?: string;
  caller_phone?: string;
  source?: string;
  provider?: string;
  summary?: string;
  classification?: string;
  urgency?: "low" | "normal" | "high";
  confidence?: number | null;
  recommended_actions?: string[];
  risk_flags?: string[];
  missing_information?: string[];
  transcript_text?: string;
  linked_quote_id?: string;
  related_queue_item_ids?: string[];
  created_at?: string | null;
  started_at?: string | null;
  match_source?: string;
  review_state?: "pending" | "reviewed" | "discarded" | "logged_update";
};

type PublicQueueResponse = {
  items?: BackendDraft[];
  count?: number;
};

type TranscriptInboxResponse = {
  items?: BackendTranscriptInboxItem[];
  count?: number;
};

type InternalQueueResponse = ApiEnvelope<{
  jobs?: Array<{ job_id: string; job_name: string; drafts?: BackendDraft[] }>;
  inbox?: {
    transcripts?: BackendTranscriptInboxItem[];
  };
}>;

type BackendWorkspaceLineItem = {
  id?: string;
  description?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
};

export type BackendWorkspaceQuote = {
  id?: string;
  job_id?: string;
  job_name?: string;
  customer_name?: string;
  customer_contact?: string;
  status?: string;
  line_items?: BackendWorkspaceLineItem[];
  total_value?: number;
  created_at?: string;
  source_queue_item_id?: string;
  notes?: string;
};

export type BackendWorkspaceFollowUp = {
  id?: string;
  job_id?: string;
  job_name?: string;
  description?: string;
  status?: string;
  scheduled_for?: string;
};

export type BackendWorkspaceJobActivity = {
  id?: string;
  type?: string;
  description?: string;
  timestamp?: string;
  value?: number;
};

export type BackendWorkspaceArtifacts = {
  quote?: BackendWorkspaceQuote | null;
  followups?: BackendWorkspaceFollowUp[];
  job_activity?: BackendWorkspaceJobActivity[];
  active_job_id?: string;
  errors?: string[];
};

type BackendConfirmation = {
  status?: "sent" | "skipped" | "failed";
  channel?: "sms" | "whatsapp";
  to?: string;
  error?: string;
  reason?: string;
};

type BackendDraftApprovalPayload = {
  trace_id?: string;
  draft?: BackendDraft;
  send_result?: Record<string, unknown>;
  workspace_artifacts?: BackendWorkspaceArtifacts;
  confirmation?: BackendConfirmation | null;
};

type PublicDraftApprovalResponse = BackendDraftApprovalPayload;
type InternalDraftApprovalResponse = ApiEnvelope<BackendDraftApprovalPayload>;

type TranscriptActionResponse = {
  transcript_id: string;
  review_state: "pending" | "reviewed" | "discarded" | "logged_update";
  active_job_id?: string;
  job_id?: string;
  job_name?: string;
  created_draft_ids?: string[];
  trace_id?: string;
  errors?: string[];
};

type InternalTranscriptActionResponse = ApiEnvelope<TranscriptActionResponse>;

export interface WorkspaceQueueApprovalResult {
  itemId: string;
  backendKind: "draft" | "transcript";
  status: QueueStatus;
  approvedAt: string;
  workspaceArtifacts?: BackendWorkspaceArtifacts;
  activeJobId?: string;
  generatedQuoteId?: string;
  generatedFollowUpIds?: string[];
  backendArtifactErrors?: string[];
  confirmationStatus?: "sent" | "skipped" | "failed";
  confirmationChannel?: "sms" | "whatsapp";
  confirmationTo?: string;
  confirmationError?: string;
}

function hasBetaQueueCredentials(): boolean {
  return Boolean(betaContractorId && betaApiKey);
}

function normalizeSource(value: string | undefined): InputSource {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "CALL" || normalized === "SMS" || normalized === "UPLOAD" || normalized === "EMAIL" || normalized === "WHATSAPP") {
    return normalized;
  }
  return "CALL";
}

function inferSourceFromDraft(draft: BackendDraft): InputSource {
  if (draft.transcript?.source) {
    return normalizeSource(draft.transcript.source);
  }
  const haystack = `${draft.type ?? ""} ${draft.title ?? ""} ${draft.content ?? ""} ${draft.why ?? ""}`.toLowerCase();
  if (haystack.includes("text") || haystack.includes("sms")) return "SMS";
  if (haystack.includes("email")) return "EMAIL";
  if (haystack.includes("upload") || haystack.includes("markup") || haystack.includes("photo")) return "UPLOAD";
  if (haystack.includes("whatsapp")) return "WHATSAPP";
  return "CALL";
}

function draftUrgent(draft: BackendDraft): boolean {
  return draft.type === "CO" || draft.transcript?.urgency === "high";
}

function transcriptUrgent(item: BackendTranscriptInboxItem): boolean {
  return item.urgency === "high";
}

function extractCurrencyValue(value: string): number | undefined {
  const match = value.match(/\$?\s?(\d[\d,]*(?:\.\d{1,2})?)/);
  if (!match) {
    return undefined;
  }
  const parsed = Number(match[1]?.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeActionType(draftType: string | undefined, text: string): ExtractedAction["type"] {
  const normalizedType = (draftType ?? "").trim().toLowerCase();
  const normalizedText = text.toLowerCase();

  if (normalizedType === "co" || normalizedText.includes("change order") || normalizedText.includes("scope change")) {
    return "change_order";
  }
  if (normalizedType === "follow-up" || normalizedText.includes("follow up") || normalizedText.includes("follow-up")) {
    return "follow_up";
  }
  if (normalizedType === "material-order" || normalizedText.includes("pricing") || normalizedText.includes("quote")) {
    return "quote_item";
  }
  if (normalizedType === "owner-update" || normalizedType === "sub-message") {
    return "commitment";
  }
  return "note";
}

function normalizeTranscriptActionType(item: BackendTranscriptInboxItem, text: string): ExtractedAction["type"] {
  const classification = (item.classification ?? "").trim().toLowerCase();
  const normalizedText = text.toLowerCase();

  if (classification === "estimate_request" || classification === "quote_question") {
    return "quote_item";
  }
  if (classification === "followup_response" || normalizedText.includes("follow up")) {
    return "follow_up";
  }
  if (classification === "vendor_or_subcontractor") {
    return "commitment";
  }
  if (classification === "complaint_or_issue" || normalizedText.includes("change") || normalizedText.includes("issue")) {
    return "change_order";
  }
  return "note";
}

function buildExtractedActions(draft: BackendDraft): ExtractedAction[] {
  const transcript = draft.transcript;
  const primaryText =
    transcript?.recommended_actions?.[0]?.trim() ||
    draft.why?.trim() ||
    transcript?.summary?.trim() ||
    draft.title?.trim() ||
    draft.content?.trim() ||
    "Review draft with contractor context.";

  const actions: ExtractedAction[] = [
    {
      id: `${draft.id}-primary`,
      type: normalizeActionType(draft.type, primaryText),
      description: primaryText,
      estimatedValue: extractCurrencyValue(`${primaryText} ${draft.content ?? ""}`),
      approved: false,
    },
  ];

  transcript?.missing_information?.slice(0, 2).forEach((missing, index) => {
    const description = missing.trim();
    if (!description) {
      return;
    }
    actions.push({
      id: `${draft.id}-missing-${index}`,
      type: "note",
      description: `Needs confirmation: ${description}`,
      approved: false,
    });
  });

  return actions;
}

function buildTranscriptActions(item: BackendTranscriptInboxItem): ExtractedAction[] {
  const primaryText =
    item.recommended_actions?.find((entry) => entry.trim().length > 0)?.trim() ||
    item.summary?.trim() ||
    "Review transcript and decide the next office move.";

  const actions: ExtractedAction[] = [
    {
      id: `transcript-${item.transcript_id}-primary`,
      type: normalizeTranscriptActionType(item, primaryText),
      description: primaryText,
      estimatedValue: extractCurrencyValue(`${primaryText} ${item.transcript_text ?? ""}`),
      approved: false,
    },
  ];

  item.missing_information?.slice(0, 2).forEach((missing, index) => {
    const description = missing.trim();
    if (!description) {
      return;
    }
    actions.push({
      id: `transcript-${item.transcript_id}-missing-${index}`,
      type: "note",
      description: `Needs routing: ${description}`,
      approved: false,
    });
  });

  return actions;
}

function buildManualReviewReason(draft: BackendDraft): string | undefined {
  if ((draft.status ?? "").trim().toLowerCase() === "needs-review") {
    return "Agent flagged this for manual review before approval.";
  }

  const confidence = draft.transcript?.confidence;
  if (typeof confidence === "number" && confidence < manualReviewConfidenceFloor) {
    return `Low-confidence capture (${Math.round(confidence * 100)}%).`;
  }

  const firstMissing = draft.transcript?.missing_information?.find((item) => item.trim().length > 0);
  if (firstMissing) {
    return `Missing detail: ${firstMissing.trim()}`;
  }

  return undefined;
}

function buildTranscriptManualReviewReason(item: BackendTranscriptInboxItem): string | undefined {
  const confidence = item.confidence;
  if (typeof confidence === "number" && confidence < manualReviewConfidenceFloor) {
    return `Low-confidence transcript (${Math.round(confidence * 100)}%).`;
  }

  const firstMissing = item.missing_information?.find((entry) => entry.trim().length > 0);
  if (firstMissing) {
    return `Needs routing: ${firstMissing.trim()}`;
  }

  const firstRisk = item.risk_flags?.find((entry) => entry.trim().length > 0);
  if (firstRisk) {
    return firstRisk.trim();
  }

  if ((item.match_source ?? "").trim().toLowerCase() === "unlinked") {
    return "This call still needs to be attached to the right job before the office can act on it.";
  }

  return "Transcript needs a human decision before the agent routes the next step.";
}

function mapDraftStatus(draft: BackendDraft): QueueStatus {
  const manualReviewReason = buildManualReviewReason(draft);
  if (manualReviewReason) {
    return "manual_review";
  }

  const normalized = (draft.status ?? "").trim().toLowerCase();
  if (normalized === "approved" || normalized === "edited") return "approved";
  if (normalized === "discarded") return "dismissed";
  return "pending";
}

function mapTranscriptStatus(item: BackendTranscriptInboxItem): QueueStatus {
  const reviewState = (item.review_state ?? "pending").trim().toLowerCase();
  if (reviewState === "discarded") {
    return "dismissed";
  }
  if (reviewState === "reviewed" || reviewState === "logged_update") {
    return "approved";
  }
  return "manual_review";
}

function mapDraftToQueueItem(draft: BackendDraft, jobId?: string, jobName?: string): QueueItem {
  const transcript = draft.transcript;
  const source = inferSourceFromDraft(draft);
  const manualReviewReason = buildManualReviewReason(draft);
  const title =
    draft.title?.trim() ||
    transcript?.caller_label?.trim() ||
    transcript?.summary?.trim() ||
    "Queued field update";
  const description =
    transcript?.summary?.trim() ||
    draft.why?.trim() ||
    draft.content?.trim() ||
    "Arbor prepared this item for contractor review.";

  return {
    id: draft.id,
    title,
    description,
    source,
    sourceRef: transcript?.caller_phone?.trim() || undefined,
    jobId: (jobId ?? draft.job_id ?? "").trim() || undefined,
    jobName: (jobName ?? draft.job_name ?? "").trim() || undefined,
    urgent: draftUrgent(draft),
    status: mapDraftStatus(draft),
    extractedActions: buildExtractedActions(draft),
    rawTranscriptSnippet: transcript?.transcript_text?.trim() || draft.content?.trim() || undefined,
    createdAt: transcript?.started_at?.trim() || draft.created_at?.trim() || new Date().toISOString(),
    confidenceScore: typeof transcript?.confidence === "number" ? transcript.confidence : undefined,
    manualReviewReason,
    backendLinked: true,
    backendKind: "draft",
    backendDraftType: draft.type?.trim() || undefined,
    backendTraceId: draft.trace_id?.trim() || undefined,
    transcriptId: transcript?.transcript_id?.trim() || undefined,
    relatedQueueItemIds: transcript?.related_queue_item_ids?.filter((entry) => entry.trim().length > 0) ?? [],
    linkedQuoteId: transcript?.linked_quote_id?.trim() || undefined,
  };
}

function mapTranscriptToQueueItem(item: BackendTranscriptInboxItem): QueueItem {
  const transcriptId = item.transcript_id.trim();
  const title = item.caller_label?.trim() || "Inbound transcript";
  const description = item.summary?.trim() || "Manual transcript review needed.";
  const manualReviewReason = buildTranscriptManualReviewReason(item);

  return {
    id: `transcript-${transcriptId}`,
    title,
    description,
    source: normalizeSource(item.source),
    sourceRef: item.caller_phone?.trim() || undefined,
    urgent: transcriptUrgent(item),
    status: mapTranscriptStatus(item),
    extractedActions: buildTranscriptActions(item),
    rawTranscriptSnippet: item.transcript_text?.trim() || undefined,
    createdAt: item.started_at?.trim() || item.created_at?.trim() || new Date().toISOString(),
    confidenceScore: typeof item.confidence === "number" ? item.confidence : undefined,
    manualReviewReason,
    backendLinked: true,
    backendKind: "transcript",
    backendTraceId: item.trace_id?.trim() || undefined,
    transcriptId,
    relatedQueueItemIds: item.related_queue_item_ids?.filter((entry) => entry.trim().length > 0) ?? [],
    linkedQuoteId: item.linked_quote_id?.trim() || undefined,
  };
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

function normalizeEnvelope<T>(response: ApiEnvelope<T> | T): T {
  if (typeof response === "object" && response !== null && "success" in response) {
    const envelope = response as ApiEnvelope<T>;
    if (!envelope.success) {
      throw new Error(envelope.error ?? "Workspace queue request failed");
    }
    return envelope.data;
  }
  return response as T;
}

function normalizeWorkspaceArtifacts(value: BackendWorkspaceArtifacts | null | undefined): BackendWorkspaceArtifacts | undefined {
  if (!value) {
    return undefined;
  }
  return {
    quote: value.quote ?? undefined,
    followups: value.followups ?? [],
    job_activity: value.job_activity ?? [],
    active_job_id: value.active_job_id?.trim() || undefined,
    errors: value.errors ?? [],
  };
}

async function fetchPublicTranscriptInboxItems(): Promise<BackendTranscriptInboxItem[]> {
  const response = await publicApiClient.get<TranscriptInboxResponse>("/transcripts/inbox", {
    params: {
      contractor_id: betaContractorId,
      limit: 25,
    },
    headers: {
      "X-API-Key": betaApiKey,
    },
  });
  return response.data.items ?? [];
}

export async function fetchWorkspaceQueueItems(): Promise<QueueItem[]> {
  if (shouldUseMockApi()) {
    return sortQueueItems(mockAppState.queueItems);
  }

  if (hasBetaQueueCredentials()) {
    const [queueResponse, transcriptItems] = await Promise.all([
      publicApiClient.get<PublicQueueResponse>("/queue", {
        params: {
          contractor_id: betaContractorId,
        },
        headers: {
          "X-API-Key": betaApiKey,
        },
      }),
      fetchPublicTranscriptInboxItems(),
    ]);

    return sortQueueItems([
      ...(queueResponse.data.items ?? []).map((draft) => mapDraftToQueueItem(draft)),
      ...transcriptItems.map((item) => mapTranscriptToQueueItem(item)),
    ]);
  }

  const response = await apiClient.get<InternalQueueResponse>("/queue");
  const data = normalizeEnvelope(response.data);
  const draftItems = (data.jobs ?? []).flatMap((group) =>
    (group.drafts ?? []).map((draft) => mapDraftToQueueItem(draft, group.job_id, group.job_name))
  );
  const transcriptItems = (data.inbox?.transcripts ?? []).map((item) => mapTranscriptToQueueItem(item));
  return sortQueueItems([...draftItems, ...transcriptItems]);
}

export async function approveWorkspaceQueueItem(item: QueueItem): Promise<WorkspaceQueueApprovalResult | null> {
  if (shouldUseMockApi()) {
    return null;
  }
  if (!item.backendLinked) {
    return null;
  }

  const approvedAt = new Date().toISOString();

  if (item.backendKind === "transcript" && item.transcriptId) {
    if (hasBetaQueueCredentials()) {
      const response = await publicApiClient.post<TranscriptActionResponse>(
        `/transcripts/${encodeURIComponent(item.transcriptId)}/mark-reviewed`,
        {
          contractor_id: betaContractorId,
        },
        {
          headers: {
            "X-API-Key": betaApiKey,
          },
        }
      );
      return {
        itemId: item.id,
        backendKind: "transcript",
        status: "approved",
        approvedAt,
        activeJobId: response.data.active_job_id?.trim() || response.data.job_id?.trim() || undefined,
      };
    }

    const response = await apiClient.post<InternalTranscriptActionResponse>(
      `/transcripts/${encodeURIComponent(item.transcriptId)}/mark-reviewed`
    );
    const payload = normalizeEnvelope(response.data);
    return {
      itemId: item.id,
      backendKind: "transcript",
      status: "approved",
      approvedAt,
      activeJobId: payload.active_job_id?.trim() || payload.job_id?.trim() || undefined,
    };
  }

  if (hasBetaQueueCredentials()) {
    const response = await publicApiClient.post<PublicDraftApprovalResponse>(
      `/queue/${encodeURIComponent(item.id)}/approve`,
      {
        contractor_id: betaContractorId,
      },
      {
        headers: {
          "X-API-Key": betaApiKey,
        },
      }
    );
      const workspaceArtifacts = normalizeWorkspaceArtifacts(response.data.workspace_artifacts);
      const confirmation = response.data.confirmation ?? undefined;
      return {
        itemId: item.id,
        backendKind: "draft",
        status: "approved",
        approvedAt,
        activeJobId: workspaceArtifacts?.active_job_id?.trim() || undefined,
        generatedQuoteId: workspaceArtifacts?.quote?.id?.trim() || undefined,
        generatedFollowUpIds: (workspaceArtifacts?.followups ?? [])
          .map((followUp) => followUp.id?.trim() || "")
          .filter(Boolean),
        workspaceArtifacts,
        backendArtifactErrors: workspaceArtifacts?.errors?.filter((entry) => entry.trim().length > 0) ?? [],
        confirmationStatus: confirmation?.status,
        confirmationChannel: confirmation?.channel,
        confirmationTo: confirmation?.to,
        confirmationError: confirmation?.error ?? confirmation?.reason,
      };
    }

    const response = await apiClient.post<InternalDraftApprovalResponse>(`/queue/${encodeURIComponent(item.id)}/approve`);
    const payload = normalizeEnvelope(response.data);
    const workspaceArtifacts = normalizeWorkspaceArtifacts(payload.workspace_artifacts);
    const confirmation = payload.confirmation ?? undefined;
    return {
      itemId: item.id,
      backendKind: "draft",
      status: "approved",
      approvedAt,
      activeJobId: workspaceArtifacts?.active_job_id?.trim() || undefined,
      generatedQuoteId: workspaceArtifacts?.quote?.id?.trim() || undefined,
      generatedFollowUpIds: (workspaceArtifacts?.followups ?? [])
        .map((followUp) => followUp.id?.trim() || "")
        .filter(Boolean),
      workspaceArtifacts,
      backendArtifactErrors: workspaceArtifacts?.errors?.filter((entry) => entry.trim().length > 0) ?? [],
      confirmationStatus: confirmation?.status,
      confirmationChannel: confirmation?.channel,
      confirmationTo: confirmation?.to,
      confirmationError: confirmation?.error ?? confirmation?.reason,
    };
  }

export async function dismissWorkspaceQueueItem(item: QueueItem): Promise<void> {
  if (shouldUseMockApi()) {
    return;
  }
  if (!item.backendLinked) {
    return;
  }

  if (item.backendKind === "transcript" && item.transcriptId) {
    if (hasBetaQueueCredentials()) {
      await publicApiClient.post(
        `/transcripts/${encodeURIComponent(item.transcriptId)}/discard`,
        {
          contractor_id: betaContractorId,
        },
        {
          headers: {
            "X-API-Key": betaApiKey,
          },
        }
      );
      return;
    }

    await apiClient.post(`/transcripts/${encodeURIComponent(item.transcriptId)}/discard`);
    return;
  }

  if (hasBetaQueueCredentials()) {
    await publicApiClient.post(
      `/queue/${encodeURIComponent(item.id)}/discard`,
      {
        contractor_id: betaContractorId,
      },
      {
        headers: {
          "X-API-Key": betaApiKey,
        },
      }
    );
    return;
  }

  await apiClient.post(`/queue/${encodeURIComponent(item.id)}/discard`);
}

export function mapBackendFollowUpStatus(status: string | undefined): FollowUpStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "sent") return "sent";
  if (normalized === "responded") return "responded";
  if (normalized === "overdue") return "overdue";
  return "scheduled";
}

export function mapBackendJobActivityType(type: string | undefined): JobActivity["type"] {
  const normalized = (type ?? "").trim().toLowerCase();
  if (normalized === "quote_sent") return "quote_sent";
  if (normalized === "quote_accepted") return "quote_accepted";
  if (normalized === "change_order") return "change_order";
  if (normalized === "follow_up") return "follow_up";
  if (normalized === "call") return "call";
  return "note";
}

