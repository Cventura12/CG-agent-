import { apiClient } from "./client";
import type { ApiEnvelope, AuthProfile } from "../types";

export async function fetchCurrentGcProfile(): Promise<AuthProfile> {
  const response = await apiClient.get<ApiEnvelope<AuthProfile>>("/auth/me");
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch current profile");
  }
  return response.data.data;
}

export async function registerGc(phoneNumber: string): Promise<AuthProfile> {
  const response = await apiClient.post<ApiEnvelope<AuthProfile>>("/auth/register", {
    phone_number: phoneNumber,
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to register GC profile");
  }
  return response.data.data;
}
