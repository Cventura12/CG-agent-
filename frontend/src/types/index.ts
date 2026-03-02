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
  quote_draft: QuoteDraft;
  rendered_quote: string;
  active_job_id: string;
  errors: string[];
}
