import { apiClient } from "./client";
import type { ApiEnvelope, TranscriptQuotePrefill } from "../types";

export interface TranscriptReviewStateResponse {
  transcript_id: string;
  review_state: "pending" | "reviewed" | "discarded" | "logged_update";
}

export interface LinkTranscriptToJobResponse extends TranscriptReviewStateResponse {
  active_job_id: string;
  job_id: string;
  job_name: string;
  created_draft_ids: string[];
}

export interface LogTranscriptAsUpdateResponse extends TranscriptReviewStateResponse {
  job_id: string;
  job_name: string;
  trace_id: string;
  created_draft_ids: string[];
  errors: string[];
}

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
  review_state: "pending" | "reviewed" | "discarded" | "logged_update";
  active_job_id: string;
  job_id: string;
  job_name: string;
  created_draft_ids: string[];
}> {
  const response = await apiClient.post<ApiEnvelope<LinkTranscriptToJobResponse>>(
    `/transcripts/${encodeURIComponent(transcriptId)}/link-job`,
    { job_id: jobId }
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to link transcript to job");
  }
  return response.data.data;
}

export async function markTranscriptReviewed(transcriptId: string): Promise<TranscriptReviewStateResponse> {
  const response = await apiClient.post<ApiEnvelope<TranscriptReviewStateResponse>>(
    `/transcripts/${encodeURIComponent(transcriptId)}/mark-reviewed`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to mark transcript reviewed");
  }
  return response.data.data;
}

export async function discardTranscript(transcriptId: string): Promise<TranscriptReviewStateResponse> {
  const response = await apiClient.post<ApiEnvelope<TranscriptReviewStateResponse>>(
    `/transcripts/${encodeURIComponent(transcriptId)}/discard`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to discard transcript");
  }
  return response.data.data;
}

export async function logTranscriptAsUpdate(
  transcriptId: string
): Promise<LogTranscriptAsUpdateResponse> {
  const response = await apiClient.post<ApiEnvelope<LogTranscriptAsUpdateResponse>>(
    `/transcripts/${encodeURIComponent(transcriptId)}/log-update`
  );
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error ?? "Failed to log transcript as update");
  }
  return response.data.data;
}


