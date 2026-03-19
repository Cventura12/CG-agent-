import { apiClient, appApiBaseUrl, publicApiBaseUrl, publicApiClient } from "./client";
import type {
  VoiceCallDebug,
  VoiceCallSession,
  VoiceInterruptionHistoryEntry,
  VoiceMissingSlot,
  VoicePromptHistoryEntry,
} from "../types";

const betaContractorId =
  (import.meta.env.VITE_BETA_CONTRACTOR_ID as string | undefined)?.trim() ??
  "00000000-0000-0000-0000-000000000001";

const betaApiKey = (import.meta.env.VITE_BETA_API_KEY as string | undefined)?.trim() ?? "";

type BackendVoiceSession = {
  id: string;
  call_id?: string;
  caller_name?: string;
  from_number?: string;
  status?: VoiceCallSession["status"];
  goal?: VoiceCallSession["goal"];
  runtime_mode?: VoiceCallSession["runtimeMode"];
  stream_state?: VoiceCallSession["streamState"];
  summary?: string;
  last_prompt?: string;
  last_caller_transcript?: string;
  transfer_state?: VoiceCallSession["transferState"];
  transfer_target?: string;
  escalation_reason?: string;
  recording_url?: string;
  recording_duration_seconds?: number | null;
  transcript_id?: string;
  created_at?: string;
  updated_at?: string;
  extracted_fields?: Record<string, unknown>;
  missing_slots?: Array<{ name?: string; reason?: string; prompt?: string }>;
  metadata?: Record<string, unknown>;
  handoff_result?: Record<string, unknown>;
};

type VoiceListResponse = {
  success: boolean;
  data: { sessions: BackendVoiceSession[] };
  error: string | null;
};

type VoiceDetailResponse = {
  success: boolean;
  data: BackendVoiceSession;
  error: string | null;
};

function hasBetaVoiceCredentials(): boolean {
  return Boolean(betaApiKey && betaContractorId);
}

function buildRecordingUrl(sessionId: string): string {
  if (hasBetaVoiceCredentials()) {
    return `${publicApiBaseUrl}/voice/sessions/${sessionId}/recording?contractor_id=${encodeURIComponent(betaContractorId)}`;
  }
  return `${appApiBaseUrl}/voice/sessions/${sessionId}/recording`;
}

function normalizeMissingSlots(value: BackendVoiceSession["missing_slots"]): VoiceMissingSlot[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((slot) => ({
      name: String(slot?.name ?? "").trim(),
      reason: String(slot?.reason ?? "").trim(),
      prompt: String(slot?.prompt ?? "").trim(),
    }))
    .filter((slot) => slot.name && slot.reason && slot.prompt) as VoiceMissingSlot[];
}

function normalizePromptHistory(value: unknown): VoicePromptHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => ({
      text: String((entry as Record<string, unknown>)?.text ?? "").trim(),
      phase: String((entry as Record<string, unknown>)?.phase ?? "").trim(),
      at: String((entry as Record<string, unknown>)?.at ?? "").trim(),
    }))
    .filter((entry) => entry.text && entry.at);
}

function normalizeInterruptionHistory(value: unknown): VoiceInterruptionHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => ({
      reason: String((entry as Record<string, unknown>)?.reason ?? "").trim(),
      prompt: String((entry as Record<string, unknown>)?.prompt ?? "").trim(),
      excerpt: String((entry as Record<string, unknown>)?.excerpt ?? "").trim() || undefined,
      at: String((entry as Record<string, unknown>)?.at ?? "").trim(),
    }))
    .filter((entry) => entry.reason && entry.at);
}

function normalizeDebug(metadata: Record<string, unknown>): VoiceCallDebug | undefined {
  const promptHistory = normalizePromptHistory(metadata.prompt_history);
  const interruptionHistory = normalizeInterruptionHistory(metadata.interruption_history);
  const interruptionCount = Number(metadata.interruption_count ?? 0) || 0;
  const lastInterruptionReason = String(metadata.last_interruption_reason ?? "").trim() || undefined;
  const lastInterruptedPrompt = String(metadata.last_interrupted_prompt ?? "").trim() || undefined;
  const lastInterruptionExcerpt = String(metadata.last_interruption_excerpt ?? "").trim() || undefined;
  const lastPartialTranscript = String(metadata.last_partial_transcript ?? "").trim() || undefined;
  const vadTurnState = String(metadata.vad_turn_state ?? "").trim() || undefined;

  if (
    interruptionCount === 0 &&
    promptHistory.length === 0 &&
    interruptionHistory.length === 0 &&
    !lastPartialTranscript &&
    !vadTurnState
  ) {
    return undefined;
  }

  return {
    interruptionCount,
    lastInterruptionReason,
    lastInterruptedPrompt,
    lastInterruptionExcerpt,
    lastPartialTranscript,
    vadTurnState,
    promptHistory,
    interruptionHistory,
  };
}

function mapVoiceSession(session: BackendVoiceSession): VoiceCallSession {
  const extractedFields = Object.entries(session.extracted_fields ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      acc[key] = normalized;
    }
    return acc;
  }, {});
  const handoffResult = session.handoff_result ?? {};
  const metadata = session.metadata ?? {};

  return {
    id: session.id,
    callId: String(session.call_id ?? session.id).trim(),
    jobId: String(handoffResult.active_job_id ?? metadata.active_job_id ?? "").trim() || undefined,
    jobName: String(extractedFields.job_reference ?? metadata.job_reference ?? "").trim() || undefined,
    callerName: String(session.caller_name ?? "Unknown caller").trim() || "Unknown caller",
    callerPhone: String(session.from_number ?? "").trim() || "Unknown number",
    status: session.status ?? "active",
    goal: session.goal ?? "general",
    runtimeMode: session.runtime_mode ?? "gather",
    streamState: session.stream_state ?? "idle",
    summary: String(session.summary ?? "").trim() || "Live call captured for review.",
    lastPrompt: String(session.last_prompt ?? "").trim() || undefined,
    lastCallerTranscript: String(session.last_caller_transcript ?? "").trim() || undefined,
    transferState: session.transfer_state ?? "none",
    transferTarget: String(session.transfer_target ?? "").trim() || undefined,
    escalationReason: String(session.escalation_reason ?? "").trim() || undefined,
    recordingUrl: buildRecordingUrl(session.id),
    recordingDurationSeconds:
      typeof session.recording_duration_seconds === "number" ? session.recording_duration_seconds : undefined,
    transcriptId: String(session.transcript_id ?? "").trim() || undefined,
    createdAt: String(session.created_at ?? new Date().toISOString()),
    updatedAt: String(session.updated_at ?? new Date().toISOString()),
    extractedFields,
    missingSlots: normalizeMissingSlots(session.missing_slots),
    debug: normalizeDebug(metadata),
  };
}

export async function fetchVoiceSessions(): Promise<VoiceCallSession[]> {
  if (hasBetaVoiceCredentials()) {
    const response = await publicApiClient.get<VoiceListResponse>("/voice/sessions", {
      params: {
        contractor_id: betaContractorId,
        limit: 25,
      },
      headers: {
        "X-API-Key": betaApiKey,
      },
    });
    return (response.data.data.sessions ?? []).map(mapVoiceSession);
  }

  const response = await apiClient.get<VoiceListResponse>("/voice/sessions", {
    params: { limit: 25 },
  });
  return (response.data.data.sessions ?? []).map(mapVoiceSession);
}

export async function transferVoiceSession(
  sessionId: string,
  payload: { targetNumber?: string; note?: string } = {}
): Promise<VoiceCallSession> {
  if (hasBetaVoiceCredentials()) {
    const response = await publicApiClient.post<VoiceDetailResponse>(
      `/voice/sessions/${sessionId}/transfer`,
      {
        contractor_id: betaContractorId,
        target_number: payload.targetNumber?.trim() || "",
        note: payload.note?.trim() || "",
      },
      {
        headers: {
          "X-API-Key": betaApiKey,
        },
      }
    );
    return mapVoiceSession(response.data.data);
  }

  const response = await apiClient.post<VoiceDetailResponse>(`/voice/sessions/${sessionId}/transfer`, {
    target_number: payload.targetNumber?.trim() || "",
    note: payload.note?.trim() || "",
  });
  return mapVoiceSession(response.data.data);
}
