import { apiClient } from "./client";
import type { ApiEnvelope, MultiJobInsightsPayload } from "../types";

export async function fetchMultiJobInsights(horizonDays = 14): Promise<MultiJobInsightsPayload> {
  const response = await apiClient.get<ApiEnvelope<MultiJobInsightsPayload>>("/insights/multi-job", {
    params: { horizon_days: horizonDays },
  });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to fetch multi-job insights");
  }
  return response.data.data;
}

