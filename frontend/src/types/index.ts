export type InputSource = "CALL" | "SMS" | "UPLOAD" | "EMAIL" | "WHATSAPP";
export type QueueStatus = "pending" | "approved" | "dismissed" | "snoozed";
export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired";
export type JobStatus = "active" | "quoted" | "in_progress" | "completed" | "stalled";
export type FollowUpStatus = "scheduled" | "sent" | "responded" | "overdue";

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
}

export interface QuoteLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
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
