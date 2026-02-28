import { apiClient } from "./client";
import type {
  ApiEnvelope,
  BriefingPayload,
  JobDetailPayload,
  JobsListPayload,
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
