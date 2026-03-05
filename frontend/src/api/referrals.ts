import { apiClient, publicApiClient } from "./client";
import type {
  ApiEnvelope,
  ReferralDashboardPayload,
  ReferralInviteCreatePayload,
  ReferralInviteCreateResponse,
} from "../types";

export async function fetchReferrals(): Promise<ReferralDashboardPayload> {
  const response = await apiClient.get<ApiEnvelope<ReferralDashboardPayload>>("/referrals");
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch referrals");
  }
  return response.data.data;
}

export async function createReferralInvite(
  payload: ReferralInviteCreatePayload
): Promise<ReferralInviteCreateResponse> {
  const response = await apiClient.post<ApiEnvelope<ReferralInviteCreateResponse>>("/referrals/invite", payload);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to create referral invite");
  }
  return response.data.data;
}

export async function acceptReferralInvitePublic(payload: {
  invite_code: string;
  referred_name: string;
  referred_contact: string;
  source?: string;
}): Promise<{
  status: string;
  lead_id: string;
  invite_id: string;
  invite_code: string;
  referrer_gc_id: string;
  accepted: boolean;
}> {
  const response = await publicApiClient.post("/referrals/accept", payload);
  return response.data as {
    status: string;
    lead_id: string;
    invite_id: string;
    invite_code: string;
    referrer_gc_id: string;
    accepted: boolean;
  };
}
