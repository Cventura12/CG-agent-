export type OpenItemType =
  | "RFI"
  | "CO"
  | "sub-confirm"
  | "material"
  | "decision"
  | "approval"
  | "follow-up";

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
}

export type DraftType =
  | "CO"
  | "RFI"
  | "sub-message"
  | "follow-up"
  | "owner-update"
  | "material-order";

export type DraftStatus = "queued" | "pending" | "approved" | "edited" | "discarded" | "needs-review";
export type DraftApprovalStatus = "approved_without_edit" | "approved_with_edit" | "discarded";

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
  audit_timeline: Array<{
    id: string;
    event_type: string;
    timestamp: string;
    title: string;
    summary: string;
    trace_id: string;
    metadata: Record<string, unknown>;
  }>;
}

export interface QueuePayload {
  jobs: QueueJobGroup[];
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

export interface UsageAnalyticsPayload {
  window_days: number;
  since: string;
  quotes: {
    generated: number;
    approved: number;
    edited: number;
    discarded: number;
    approval_rate_pct: number;
    avg_quote_value: number;
    memory_updates: number;
  };
  delivery: {
    sent: number;
    failed: number;
    channel_breakdown: Record<string, number>;
  };
  updates: {
    ingested: number;
    drafts_suggested: number;
  };
  queue: {
    pending: number;
    approved: number;
    discarded: number;
    edited: number;
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

export interface ReferralInvite {
  id: string;
  gc_id: string;
  invite_code: string;
  channel: string;
  destination: string;
  invitee_name: string;
  note: string;
  status: string;
  trace_id: string;
  created_at: string;
  accepted_at: string | null;
}

export interface ReferralLead {
  id: string;
  invite_id: string;
  gc_id: string;
  invite_code: string;
  referred_name: string;
  referred_contact: string;
  source: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ReferralDashboardPayload {
  summary: {
    invites_total: number;
    invites_pending: number;
    invites_accepted: number;
    leads_total: number;
  };
  share_base_url: string;
  invites: ReferralInvite[];
  leads: ReferralLead[];
}

export interface ReferralInviteCreatePayload {
  channel: string;
  destination?: string;
  invitee_name?: string;
  note?: string;
}

export interface ReferralInviteCreateResponse {
  invite: ReferralInvite;
  share_url: string;
  share_message: string;
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
  };
  active_job_id: string;
  errors: string[];
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
