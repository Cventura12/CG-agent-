export type OpenItemType =
  | "quote"
  | "action"
  | "RFI"
  | "CO"
  | "sub-confirm"
  | "material"
  | "decision"
  | "approval"
  | "follow-up"
  | "followup";

export type OpenItemStatus = "open" | "in-progress" | "resolved" | "overdue";

export interface OpenItem {
  id: string;
  job_id: string;
  type: OpenItemType;
  description: string;
  owner: string;
  status: OpenItemStatus;
  days_silent: number;
  due_date: string | null;
  financial_exposure?: boolean;
  change_related?: boolean;
  followthrough_related?: boolean;
  stalled?: boolean;
  kind_label?: string;
  action_trace_id?: string;
  action_draft_type?: DraftType;
  action_label?: string;
}

export interface JobOperationalSummary {
  open_item_count: number;
  financial_exposure_count: number;
  unresolved_change_count: number;
  approval_count: number;
  followthrough_count: number;
  stalled_count: number;
}

export type JobStatus = "active" | "on-hold" | "complete";
export type JobHealth = "on-track" | "at-risk" | "blocked";

export interface Job {
  id: string;
  name: string;
  type: string;
  status: JobStatus;
  address: string;
  contract_value: number;
  contract_type: string;
  est_completion: string;
  notes: string;
  last_updated: string;
  open_items: OpenItem[];
  health: JobHealth;
  operational_summary?: JobOperationalSummary;
}

export type DraftType =
  | "CO"
  | "RFI"
  | "sub-message"
  | "follow-up"
  | "owner-update"
  | "material-order"
  | "transcript-review";

export type TranscriptClassification =
  | "estimate_request"
  | "quote_question"
  | "job_update"
  | "reschedule"
  | "complaint_or_issue"
  | "followup_response"
  | "vendor_or_subcontractor"
  | "unknown";

export type TranscriptUrgency = "low" | "normal" | "high";

export type DraftStatus = "queued" | "pending" | "approved" | "edited" | "discarded" | "needs-review";
export type DraftApprovalStatus = "approved_without_edit" | "approved_with_edit" | "discarded";

export interface DraftTranscriptContext {
  transcript_id: string;
  source: string;
  provider: string;
  caller_label: string;
  caller_phone: string;
  summary: string;
  classification: TranscriptClassification;
  urgency: TranscriptUrgency;
  confidence: number | null;
  recommended_actions: string[];
  risk_flags: string[];
  missing_information: string[];
  transcript_text: string;
  linked_quote_id: string;
  recording_url: string;
  started_at: string | null;
  duration_seconds: number | null;
}

export interface TranscriptInboxItem {
  transcript_id: string;
  trace_id: string;
  caller_label: string;
  caller_phone: string;
  source: string;
  provider: string;
  summary: string;
  classification: TranscriptClassification;
  urgency: TranscriptUrgency;
  confidence: number | null;
  recommended_actions: string[];
  risk_flags: string[];
  missing_information: string[];
  transcript_text: string;
  linked_quote_id: string;
  related_queue_item_ids: string[];
  created_at: string | null;
  recording_url: string;
  started_at: string | null;
  duration_seconds: number | null;
  match_source: string;
  review_state: "pending" | "reviewed" | "discarded" | "logged_update";
}

export interface Draft {
  id: string;
  job_id: string;
  job_name: string;
  type: DraftType;
  title: string;
  content: string;
  why: string;
  status: DraftStatus;
  was_edited?: boolean;
  approval_status?: DraftApprovalStatus | null;
  approval_recorded_at?: string | null;
  created_at: string;
  trace_id?: string;
  transcript?: DraftTranscriptContext | null;
}

export interface QueueJobGroup {
  job_id: string;
  job_name: string;
  drafts: Draft[];
}

export interface UpdateLogEntry {
  id: string;
  job_id: string;
  input_type: string;
  raw_input: string;
  parsed_changes: Record<string, unknown>;
  drafts_created: string[];
  created_at: string;
}

export interface JobCallHistoryEntry {
  id: string;
  timestamp: string | null;
  trace_id: string;
  caller_label: string;
  caller_phone: string;
  source: string;
  provider: string;
  summary: string;
  classification: TranscriptClassification;
  urgency: TranscriptUrgency;
  confidence: number | null;
  risk_flags: string[];
  recommended_actions: string[];
  missing_information: string[];
  transcript_text: string;
  linked_quote_id: string;
  related_queue_item_ids: string[];
  recording_url: string;
  started_at: string | null;
  duration_seconds: number | null;
}

export interface TranscriptQuotePrefill {
  transcript_id: string;
  trace_id: string;
  classification: TranscriptClassification;
  confidence: number | null;
  summary: string;
  urgency: TranscriptUrgency;
  caller_name: string;
  caller_phone: string;
  linked_job_id: string;
  linked_quote_id: string;
  customer_name: string;
  job_type: string;
  scope_items: string[];
  customer_questions: string[];
  insurance_involved: boolean | null;
  missing_information: string[];
  recommended_actions: string[];
  scheduling_notes: string[];
  estimate_related: boolean;
  quote_input: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface JobsListPayload {
  jobs: Job[];
}

export interface JobDetailPayload {
  job: Job;
  recent_updates: UpdateLogEntry[];
  call_history: JobCallHistoryEntry[];
  audit_timeline: Array<{
    id: string;
    event_type: string;
    timestamp: string;
    title: string;
    summary: string;
    trace_id: string;
    metadata: Record<string, unknown>;
  }>;
  followup_state?: QuoteFollowupState | null;
}

export interface OpenItemDraftActionResponse {
  draft: Draft;
  open_item: OpenItem;
}

export interface QueuePayload {
  jobs: QueueJobGroup[];
  inbox: {
    transcripts: TranscriptInboxItem[];
  };
}

export interface BriefingPayload {
  briefing: string;
}

export interface AuthProfile {
  gc_id: string;
  name: string;
  phone_number: string;
}

export interface OnboardingProfile {
  registered: boolean;
  onboarding_complete: boolean;
  gc_id?: string;
  phone_number: string;
  company_name: string;
  labor_rate_per_square: number;
  default_markup_pct: number;
  tear_off_per_square: number;
  laminated_shingles_per_square: number;
  synthetic_underlayment_per_square: number;
  primary_trade: string;
  service_area: string;
  recommended_defaults: {
    labor_rate_per_square: number;
    default_markup_pct: number;
    tear_off_per_square: number;
    laminated_shingles_per_square: number;
    synthetic_underlayment_per_square: number;
  };
  preferred_supplier: string;
  preferred_shingle_brand: string;
  notes: string;
  missing_fields: string[];
}

export interface SpreadsheetImportMapping {
  item_name: string;
  category: string;
  unit: string;
  material_cost: string;
  labor_cost: string;
  markup_percent: string;
  default_price: string;
  notes: string;
  vendor: string;
  sku: string;
}

export interface NormalizedPriceBookRow {
  row_number: number;
  item_name: string;
  category: string;
  unit: string;
  material_cost: number | null;
  labor_cost: number | null;
  markup_percent: number | null;
  default_price: number | null;
  notes: string;
  vendor: string;
  sku: string;
  item_key: string;
  recognized_key: string;
  resolved_unit_cost: number | null;
  status: "ready" | "skipped";
  reason: string;
}

export interface PricingImportPreviewRow {
  row_number: number;
  raw: Record<string, string>;
  normalized: NormalizedPriceBookRow;
}

export interface PricingImportPreview {
  filename: string;
  source_type: "csv" | "xlsx";
  sheet_names: string[];
  selected_sheet: string;
  headers: string[];
  suggested_mapping: SpreadsheetImportMapping;
  preview_rows: PricingImportPreviewRow[];
  total_rows: number;
}

export interface PricingImportCommitSummary {
  import_log_id: string;
  trace_id: string;
  filename: string;
  source_type: "csv" | "xlsx";
  sheet_name: string;
  mapping: SpreadsheetImportMapping;
  imported_count: number;
  skipped_count: number;
  error_count: number;
  imported_rows: NormalizedPriceBookRow[];
  skipped_rows: NormalizedPriceBookRow[];
}

export interface UsageAnalyticsPayload {
  window_days: number;
  since: string;
  quotes: {
    generated: number;
    approved: number;
    edited: number;
    discarded: number;
    approval_rate_pct: number;
    conversion_rate_pct: number;
    avg_quote_value: number;
    avg_turnaround_minutes: number;
    memory_updates: number;
  };
  delivery: {
    sent: number;
    failed: number;
    channel_breakdown: Record<string, number>;
  };
  followup: {
    active: number;
    stopped: number;
    reminders_sent: number;
    effectiveness_rate_pct: number;
  };
  transcripts: {
    ingested: number;
    linked: number;
    unlinked: number;
    estimate_requests: number;
    linkage_rate_pct: number;
  };
  updates: {
    ingested: number;
    drafts_suggested: number;
  };
  queue: {
    pending: number;
    backlog: number;
    transcript_inbox: number;
    approved: number;
    discarded: number;
    edited: number;
    by_type: Record<string, number>;
  };
  runtime: {
    trace_rows: number;
    trace_errors: number;
    trace_error_rate_pct: number;
    avg_node_latency_ms: number;
    flow_breakdown: Record<string, number>;
  };
  warnings: string[];
}

export interface MultiJobInsightOpportunity {
  group_key: string;
  job_type: string;
  contract_type: string;
  job_count: number;
  jobs: Array<{
    id: string;
    name: string;
    est_completion: string | null;
    days_until_completion: number | null;
    contract_value: number;
    last_updated: string | null;
  }>;
  suggested_materials: string[];
  estimated_savings_pct: number;
  estimated_savings_amount: number;
  confidence: "high" | "medium" | "low";
  rationale: string;
  recommended_order_window_days: number;
  generated_at: string;
}

export interface MultiJobInsightsPayload {
  horizon_days: number;
  generated_at: string;
  summary: {
    active_jobs_considered: number;
    opportunities_found: number;
    estimated_total_savings_amount: number;
  };
  opportunities: MultiJobInsightOpportunity[];
}

export interface QuoteLineItem {
  item?: string;
  name?: string;
  quantity?: number;
  unit?: string;
  unit_cost?: number;
  total_cost?: number;
}

export interface QuoteDraft {
  company_name: string;
  customer_name?: string;
  project_address?: string;
  scope_of_work: string;
  line_items?: QuoteLineItem[];
  total_price: number;
  exclusions: string[];
  approval_notes?: string;
}

export interface QuoteSourceFile {
  storage_ref: string;
  bucket: string;
  path: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

export interface QuoteResponse {
  quote_id: string;
  trace_id: string;
  quote_draft: QuoteDraft;
  rendered_quote: string;
  assumptions: string[];
  clarification_questions: string[];
  cold_start: {
    active: boolean;
    primary_trade: string;
  };
  estimate_confidence: {
    level: "high" | "medium" | "low";
    score: number;
    extraction_confidence: "high" | "medium" | "low";
    missing_fields: string[];
    missing_prices: string[];
    reasons: string[];
    review_required: boolean;
    send_blocked: boolean;
    blocking_reasons: string[];
    missing_information: string[];
    evidence_signals: string[];
  };
  review_required: boolean;
  send_blocked: boolean;
  blocking_reasons: string[];
  missing_information: string[];
  evidence_signals: string[];
  active_job_id: string;
  errors: string[];
  source_files?: QuoteSourceFile[];
}

export type QuoteApprovalStatus = "approved" | "edited" | "discarded";

export interface QuoteDecisionResponse {
  quote_id: string;
  trace_id: string;
  approval_status: QuoteApprovalStatus;
  was_edited: boolean;
  quote_draft?: QuoteDraft;
  quote_delta: Record<string, unknown>;
  memory_updated: boolean;
  followup_created?: boolean;
  followup_open_item_id?: string;
}

export interface QuoteSendResponse {
  quote_id: string;
  trace_id: string;
  delivery_id: string;
  channel: string;
  destination: string;
  provider_message_id: string;
  status: string;
}

export interface QuoteDeliveryAttempt {
  delivery_id: string;
  channel: string;
  recipient: string;
  destination: string;
  status: string;
  sent_at: string | null;
  external_id: string;
  error_message: string;
}

export interface QuoteDeliveryResponse {
  quote_id: string;
  trace_id: string;
  deliveries: QuoteDeliveryAttempt[];
}

export type QuoteFollowupStatus = "scheduled" | "stopped" | "pending_destination" | "none";

export interface QuoteFollowupState {
  open_item_id: string | null;
  quote_id: string | null;
  job_id: string | null;
  status: QuoteFollowupStatus;
  next_due_at: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  stopped_at: string | null;
  stop_reason: string | null;
  channel: string | null;
}

export interface QuoteFollowupResponse {
  quote_id: string;
  trace_id: string;
  followup: QuoteFollowupState;
}

export interface QuoteFollowupStopResponse extends QuoteFollowupResponse {
  stopped: boolean;
  reason: string;
}

