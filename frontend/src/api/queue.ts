import { apiClient } from "./client";
import type { ApiEnvelope, Draft, QueuePayload } from "../types";

export async function fetchQueue(): Promise<QueuePayload> {
  const response = await apiClient.get<ApiEnvelope<QueuePayload>>("/queue");
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch queue");
  }
  return response.data.data;
}

export async function approveDraft(draftId: string): Promise<Draft> {
  const response = await apiClient.post<ApiEnvelope<Draft>>(`/queue/${draftId}/approve`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to approve draft");
  }
  return response.data.data;
}

export async function editDraft(draftId: string, content: string): Promise<Draft> {
  const response = await apiClient.post<ApiEnvelope<Draft>>(`/queue/${draftId}/edit`, {
    content,
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to edit draft");
  }
  return response.data.data;
}

export async function discardDraft(draftId: string): Promise<Draft> {
  const response = await apiClient.post<ApiEnvelope<Draft>>(`/queue/${draftId}/discard`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to discard draft");
  }
  return response.data.data;
}

export async function approveAll(): Promise<number> {
  const response = await apiClient.post<ApiEnvelope<{ approved_count: number }>>("/queue/approve-all");
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to approve all drafts");
  }
  return response.data.data.approved_count;
}

