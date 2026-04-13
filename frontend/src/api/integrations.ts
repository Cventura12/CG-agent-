import { apiClient } from "./client";
import type { ApiEnvelope } from "../types";

export interface GoogleIntegrationStatus {
  connected: boolean;
  gmail_enabled: boolean;
  calendar_enabled: boolean;
  scopes: string[];
  gmail_last_checked: string | null;
  updated_at: string | null;
}

export async function fetchGoogleIntegrationStatus(): Promise<GoogleIntegrationStatus> {
  const response = await apiClient.get<ApiEnvelope<GoogleIntegrationStatus>>(
    "/integrations/google/status"
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch integration status");
  }
  return response.data.data;
}

export async function fetchGoogleAuthUrl(): Promise<string> {
  const response = await apiClient.get<ApiEnvelope<{ url: string }>>(
    "/integrations/google/auth-url"
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to get Google auth URL");
  }
  return response.data.data.url;
}

export async function disconnectGoogle(): Promise<void> {
  const response = await apiClient.delete<ApiEnvelope<{ disconnected: boolean }>>(
    "/integrations/google/disconnect"
  );
  if (!response.data.success) {
    throw new Error(response.data.error ?? "Failed to disconnect Google integration");
  }
}

export async function syncJobToCalendar(jobId: string): Promise<string> {
  const response = await apiClient.post<ApiEnvelope<{ event_id: string }>>(
    `/integrations/google/sync-calendar/${jobId}`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Calendar sync failed");
  }
  return response.data.data.event_id;
}
