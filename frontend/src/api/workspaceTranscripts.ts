import { apiClient, publicApiClient } from "./client";
import type { WorkspaceTranscriptQuotePrefill } from "../types";

const betaContractorId =
  (import.meta.env.VITE_BETA_CONTRACTOR_ID as string | undefined)?.trim() ??
  "00000000-0000-0000-0000-000000000001";

const betaApiKey = (import.meta.env.VITE_BETA_API_KEY as string | undefined)?.trim() ?? "";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: string | null;
};

function hasBetaWorkspaceCredentials(): boolean {
  return Boolean(betaContractorId && betaApiKey);
}

function normalizeEnvelope<T>(response: ApiEnvelope<T> | T): T {
  if (typeof response === "object" && response !== null && "success" in response) {
    const envelope = response as ApiEnvelope<T>;
    if (!envelope.success) {
      throw new Error(envelope.error ?? "Transcript request failed");
    }
    return envelope.data;
  }
  return response as T;
}

export async function fetchWorkspaceTranscriptQuotePrefill(
  transcriptId: string
): Promise<WorkspaceTranscriptQuotePrefill> {
  const normalizedTranscriptId = transcriptId.trim();
  if (!normalizedTranscriptId) {
    throw new Error("Transcript id is required");
  }

  if (hasBetaWorkspaceCredentials()) {
    const response = await publicApiClient.get<WorkspaceTranscriptQuotePrefill>(
      `/transcripts/${encodeURIComponent(normalizedTranscriptId)}/quote-prefill`,
      {
        params: {
          contractor_id: betaContractorId,
        },
        headers: {
          "X-API-Key": betaApiKey,
        },
      }
    );
    return response.data;
  }

  const response = await apiClient.get<ApiEnvelope<WorkspaceTranscriptQuotePrefill>>(
    `/transcripts/${encodeURIComponent(normalizedTranscriptId)}/quote-prefill`
  );
  return normalizeEnvelope(response.data);
}
