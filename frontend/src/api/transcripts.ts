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

export async function linkTranscriptToJob(transcriptId: string, jobId: string): Promise<{
  transcript_id: string;
  job_id: string;
  job_name: string;
  created_draft_ids: string[];
}> {
  const response = await apiClient.post<
    ApiEnvelope<{
      transcript_id: string;
      job_id: string;
      job_name: string;
      created_draft_ids: string[];
    }>
  >(`/transcripts/${encodeURIComponent(transcriptId)}/link-job`, { job_id: jobId });
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to link transcript to job");
  }
  return response.data.data;
}

export async function markTranscriptReviewed(transcriptId: string): Promise<void> {
  const response = await apiClient.post<ApiEnvelope<{ transcript_id: string; review_state: string }>>(
    `/transcripts/${encodeURIComponent(transcriptId)}/mark-reviewed`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to mark transcript reviewed");
  }
}

export async function discardTranscript(transcriptId: string): Promise<void> {
  const response = await apiClient.post<ApiEnvelope<{ transcript_id: string; review_state: string }>>(
    `/transcripts/${encodeURIComponent(transcriptId)}/discard`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to discard transcript");
  }
}

export async function logTranscriptAsUpdate(transcriptId: string): Promise<{
  transcript_id: string;
  job_id: string;
  trace_id: string;
  created_draft_ids: string[];
  errors: string[];
}> {
  const response = await apiClient.post<
    ApiEnvelope<{
      transcript_id: string;
      job_id: string;
      trace_id: string;
      created_draft_ids: string[];
      errors: string[];
    }>
  >(`/transcripts/${encodeURIComponent(transcriptId)}/log-update`);
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to log transcript as update");
  }
  return response.data.data;
}
