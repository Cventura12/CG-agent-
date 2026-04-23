import { apiClient } from "./client";
import type {
  ApiEnvelope,
  BriefingPayload,
  JobDetailPayload,
  JobsListPayload,
  OpenItemDraftActionResponse,
  OpenItemActionStage,
  OpenItemLifecycleResponse,
} from "../types";

export async function fetchJobs(): Promise<JobsListPayload> {
  const response = await apiClient.get<ApiEnvelope<JobsListPayload>>("/jobs");
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch jobs");
  }
  return response.data.data;
}

export async function fetchJobDetail(jobId: string): Promise<JobDetailPayload> {
  const response = await apiClient.get<ApiEnvelope<JobDetailPayload>>(`/jobs/${jobId}`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch job detail");
  }
  return response.data.data;
}

export async function fetchBriefing(): Promise<BriefingPayload> {
  const response = await apiClient.get<ApiEnvelope<BriefingPayload>>("/jobs/briefing");
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch briefing");
  }
  return response.data.data;
}

export async function createOpenItemDraftAction(jobId: string, openItemId: string): Promise<OpenItemDraftActionResponse> {
  const response = await apiClient.post<ApiEnvelope<OpenItemDraftActionResponse>>(
    `/jobs/${jobId}/open-items/${openItemId}/draft-action`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to create follow-through draft");
  }
  return response.data.data;
}

export async function advanceOpenItemLifecycle(
  jobId: string,
  openItemId: string,
  stage: OpenItemActionStage
): Promise<OpenItemLifecycleResponse> {
  const response = await apiClient.post<ApiEnvelope<OpenItemLifecycleResponse>>(
    `/jobs/${jobId}/open-items/${openItemId}/lifecycle`,
    { stage }
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to update open item lifecycle");
  }
  return response.data.data;
}

