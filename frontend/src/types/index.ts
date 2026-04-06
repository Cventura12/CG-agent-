export type InputSource = "CALL" | "SMS" | "UPLOAD" | "EMAIL" | "WHATSAPP";
export type QueueStatus = "pending" | "manual_review" | "approved" | "dismissed" | "snoozed";
export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";
export type JobStatus = "active" | "quoted" | "in_progress" | "completed" | "stalled";
export type FollowUpStatus = "scheduled" | "sent" | "responded" | "overdue";
export type QuoteIntakeSource = "manual" | "voice" | "photo" | "pdf";
export type VoiceCallStatus = "active" | "awaiting_caller" | "streaming" | "ready_for_review" | "escalated" | "completed" | "failed";
export type VoiceTransferState = "none" | "requested" | "dialing" | "transferred" | "saved_for_review" | "failed";
export type VoiceRuntimeMode = "gather" | "stream";
export type VoiceStreamState = "idle" | "connecting" | "streaming" | "paused" | "closed" | "failed";

export interface User {
  id: string;
  name: string;
  initials: string;
  role: string;
  companyName: string;
}

export interface AgentLogEntry {
  id: string;
  message: string;
  timestamp: string;
  type: "info" | "action" | "waiting" | "error";
}

export interface AgentStatus {
  active: boolean;
  itemsProcessed: number;
  openItems: number;
  lastActivityAt: string;
  currentTask: string;
  log: AgentLogEntry[];
}

export interface ExtractedAction {
  id: string;
  type: "change_order" | "follow_up" | "quote_item" | "commitment" | "note";
  description: string;
  estimatedValue?: number;
  approved: boolean;
}

export interface QueueItem {
  id: string;
  title: string;
  description: string;
  source: InputSource;
  sourceRef?: string;
  jobId?: string;
  jobName?: string;
  urgent: boolean;
  status: QueueStatus;
  extractedActions: ExtractedAction[];
  rawTranscriptSnippet?: string;
  createdAt: string;
  snoozedUntil?: string;
  approvedAt?: string;
  generatedQuoteId?: string;
  generatedFollowUpIds?: string[];
  confidenceScore?: number;
  manualReviewReason?: string;
  backendLinked?: boolean;
  backendKind?: "draft" | "transcript";
  backendDraftType?: string;
  backendTraceId?: string;
  transcriptId?: string;
  relatedQueueItemIds?: string[];
  linkedQuoteId?: string;
  backendArtifactErrors?: string[];
  confirmationStatus?: "sent" | "skipped" | "failed";
  confirmationChannel?: "sms" | "whatsapp";
  confirmationTo?: string;
  confirmationError?: string;
}

export interface QuoteLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface QuoteDraftInput {
  jobName: string;
  customerName: string;
  customerContact: string;
  notes: string;
  intakeSource: QuoteIntakeSource;
  attachmentName?: string;
}

export interface Quote {
  id: string;
  jobId: string;
  jobName: string;
  customerName: string;
  customerContact: string;
  status: QuoteStatus;
  lineItems: QuoteLineItem[];
  totalValue: number;
  sentAt?: string;
  viewedAt?: string;
  respondedAt?: string;
  expiresAt?: string;
  createdAt: string;
  sourceQueueItemId?: string;
  notes?: string;
  intakeSource?: QuoteIntakeSource;
  attachmentName?: string;
}

export interface FollowUp {
  id: string;
  jobId: string;
  jobName: string;
  description: string;
  status: FollowUpStatus;
  scheduledFor: string;
  completedAt?: string;
}

export interface JobActivity {
  id: string;
  type: "call" | "quote_sent" | "quote_accepted" | "note" | "change_order" | "follow_up";
  description: string;
  timestamp: string;
  value?: number;
}

export interface Job {
  id: string;
  name: string;
  customerName: string;
  customerContact: string;
  address?: string;
  status: JobStatus;
  totalQuoted: number;
  totalApproved: number;
  openQueueItems: number;
  quotes: Quote[];
  followUps: FollowUp[];
  activityLog: JobActivity[];
  createdAt: string;
  lastActivityAt?: string;
  tags: string[];
  notes?: string;
}

export interface AnalyticsPeriod {
  label: string;
  quotesCreated: number;
  quotesAccepted: number;
  totalValueQuoted: number;
  totalValueWon: number;
  avgResponseTimeHours: number;
  topInputSource: InputSource;
  conversionRate: number;
}

export interface VoiceMissingSlot {
  name: string;
  reason: string;
  prompt: string;
}

export interface VoicePromptHistoryEntry {
  text: string;
  phase: string;
  at: string;
}

export interface VoiceInterruptionHistoryEntry {
  reason: string;
  prompt: string;
  excerpt?: string;
  at: string;
}

export interface VoiceCallDebug {
  interruptionCount: number;
  lastInterruptionReason?: string;
  lastInterruptedPrompt?: string;
  lastInterruptionExcerpt?: string;
  lastPartialTranscript?: string;
  vadTurnState?: string;
  promptHistory: VoicePromptHistoryEntry[];
  interruptionHistory: VoiceInterruptionHistoryEntry[];
}

export interface VoiceCallSession {
  id: string;
  callId: string;
  jobId?: string;
  jobName?: string;
  callerName: string;
  callerPhone: string;
  status: VoiceCallStatus;
  goal: "quote_request" | "job_update" | "issue_report" | "follow_up" | "general";
  runtimeMode: VoiceRuntimeMode;
  streamState: VoiceStreamState;
  summary: string;
  lastPrompt?: string;
  lastCallerTranscript?: string;
  transferState: VoiceTransferState;
  transferTarget?: string;
  escalationReason?: string;
  recordingUrl?: string;
  recordingDurationSeconds?: number;
  transcriptId?: string;
  createdAt: string;
  updatedAt: string;
  extractedFields: Record<string, string>;
  missingSlots: VoiceMissingSlot[];
  debug?: VoiceCallDebug;
}

export interface WorkspaceJobFollowUpState {
  open_item_id: string | null;
  quote_id: string | null;
  job_id: string | null;
  status: "none" | "scheduled" | "stopped" | "pending_destination";
  next_due_at: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  stopped_at: string | null;
  stop_reason: string | null;
  channel: string | null;
}

export interface WorkspaceTranscriptQuotePrefill {
  transcript_id: string;
  trace_id: string;
  classification: string;
  confidence: number | null;
  summary: string;
  urgency: string;
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


