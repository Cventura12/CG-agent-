import { apiClient } from "./client";
import type { ApiEnvelope, UsageAnalyticsPayload } from "../types";

export async function fetchUsageAnalytics(days = 30): Promise<UsageAnalyticsPayload> {
  const response = await apiClient.get<ApiEnvelope<UsageAnalyticsPayload>>("/analytics/usage", {
    params: { days },
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch usage analytics");
  }
  return response.data.data;
}


