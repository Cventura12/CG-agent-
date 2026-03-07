import { apiClient } from "./client";
import type { ApiEnvelope, TranscriptQuotePrefill } from "../types";

export async function fetchTranscriptQuotePrefill(
  transcriptId: string
): Promise<TranscriptQuotePrefill> {
  const response = await apiClient.get<ApiEnvelope<TranscriptQuotePrefill>>(
    `/transcripts/${encodeURIComponent(transcriptId)}/quote-prefill`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to load transcript prefill");
  }
  return response.data.data;
}
