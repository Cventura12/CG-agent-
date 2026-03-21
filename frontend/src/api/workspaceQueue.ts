import { apiClient, publicApiClient } from "./client";
import type { ExtractedAction, InputSource, QueueItem, QueueStatus } from "../types";

const betaContractorId =
  (import.meta.env.VITE_BETA_CONTRACTOR_ID as string | undefined)?.trim() ??
  "00000000-0000-0000-0000-000000000001";

const betaApiKey = (import.meta.env.VITE_BETA_API_KEY as string | undefined)?.trim() ?? "";
const manualReviewConfidenceFloor = 0.72;

type BackendDraftTranscript = {
  source?: string;
  caller_label?: string;
  caller_phone?: string;
  summary?: string;
  urgency?: "low" | "normal" | "high";
  confidence?: number | null;
  recommended_actions?: string[];
  missing_information?: string[];
  transcript_text?: string;
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

type PublicQueueResponse = {
  items?: BackendDraft[];
  count?: number;
};

type InternalQueueResponse = {
  success: boolean;
  data?: {
    jobs?: Array<{ job_id: string; job_name: string; drafts?: BackendDraft[] }>;
  };
  error?: string | null;
};

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
    "Fieldr prepared this item for contractor review.";

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
    backendDraftType: draft.type?.trim() || undefined,
    backendTraceId: draft.trace_id?.trim() || undefined,
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

export async function fetchWorkspaceQueueItems(): Promise<QueueItem[]> {
  if (hasBetaQueueCredentials()) {
    const response = await publicApiClient.get<PublicQueueResponse>("/queue", {
      params: {
        contractor_id: betaContractorId,
      },
      headers: {
        "X-API-Key": betaApiKey,
      },
    });

    return sortQueueItems((response.data.items ?? []).map((draft) => mapDraftToQueueItem(draft)));
  }

  const response = await apiClient.get<InternalQueueResponse>("/queue");
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch live queue");
  }

  const items = (response.data.data.jobs ?? []).flatMap((group) =>
    (group.drafts ?? []).map((draft) => mapDraftToQueueItem(draft, group.job_id, group.job_name))
  );
  return sortQueueItems(items);
}

export async function approveWorkspaceQueueItem(item: QueueItem): Promise<void> {
  if (!item.backendLinked) {
    return;
  }

  if (hasBetaQueueCredentials()) {
    await publicApiClient.post(
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
    return;
  }

  await apiClient.post(`/queue/${encodeURIComponent(item.id)}/approve`);
}

export async function dismissWorkspaceQueueItem(item: QueueItem): Promise<void> {
  if (!item.backendLinked) {
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
