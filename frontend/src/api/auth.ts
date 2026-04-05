import { apiClient } from "./client";
import type { ApiEnvelope, AuthProfile, OnboardingProfile } from "../types";

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

export async function fetchOnboardingProfile(): Promise<OnboardingProfile> {
  const response = await apiClient.get<ApiEnvelope<OnboardingProfile>>("/auth/onboarding");
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch onboarding profile");
  }
  return response.data.data;
}

export async function saveOnboardingProfile(
  payload: {
    company_name: string;
    labor_rate_per_square: number;
    default_markup_pct: number;
    tear_off_per_square: number;
    laminated_shingles_per_square: number;
    synthetic_underlayment_per_square: number;
    primary_trade?: string;
    service_area?: string;
    preferred_supplier?: string;
    preferred_shingle_brand?: string;
    notes?: string;
  }
): Promise<OnboardingProfile> {
  const response = await apiClient.post<ApiEnvelope<OnboardingProfile>>("/auth/onboarding", payload);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to save onboarding profile");
  }
  return response.data.data;
}

