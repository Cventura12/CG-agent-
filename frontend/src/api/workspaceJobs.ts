import { apiClient, publicApiClient } from "./client";
import type { WorkspaceJobFollowUpState } from "../types";

const betaContractorId =
  (import.meta.env.VITE_BETA_CONTRACTOR_ID as string | undefined)?.trim() ??
  "00000000-0000-0000-0000-000000000001";

const betaApiKey = (import.meta.env.VITE_BETA_API_KEY as string | undefined)?.trim() ?? "";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: string | null;
};

type FollowUpStatePayload = {
  followup_state: WorkspaceJobFollowUpState | null;
};

function hasBetaWorkspaceCredentials(): boolean {
  return Boolean(betaContractorId && betaApiKey);
}

function normalizeEnvelope<T>(response: ApiEnvelope<T> | T): T {
  if (typeof response === "object" && response !== null && "success" in response) {
    const envelope = response as ApiEnvelope<T>;
    if (!envelope.success) {
      throw new Error(envelope.error ?? "Workspace jobs request failed");
    }
    return envelope.data;
  }
  return response as T;
}

export async function fetchWorkspaceJobFollowUpState(jobId: string): Promise<WorkspaceJobFollowUpState | null> {
  const normalizedJobId = jobId.trim();
  if (!normalizedJobId) {
    return null;
  }

  if (hasBetaWorkspaceCredentials()) {
    const response = await publicApiClient.get<FollowUpStatePayload>(`/jobs/${encodeURIComponent(normalizedJobId)}/followup`, {
      params: {
        contractor_id: betaContractorId,
      },
      headers: {
        "X-API-Key": betaApiKey,
      },
    });
    return response.data.followup_state ?? null;
  }

  const response = await apiClient.get<ApiEnvelope<FollowUpStatePayload>>(`/jobs/${encodeURIComponent(normalizedJobId)}/followup`);
  const payload = normalizeEnvelope(response.data);
  return payload.followup_state ?? null;
}


