export type InputSource = "CALL" | "SMS" | "UPLOAD" | "EMAIL";
export type QueueItemStatus = "pending" | "approved" | "dismissed";
export type SetupStep = "connect" | "review" | "approve";

export interface AgentStatus {
  active: boolean;
  itemsProcessed: number;
  lastActivity: string;
  waitingFor: string;
}

export interface QueueItem {
  id: string;
  description: string;
  source: InputSource;
  jobId?: string;
  jobName?: string;
  urgent: boolean;
  status: QueueItemStatus;
  createdAt: string;
}

export interface Job {
  id: string;
  name: string;
  status: "active" | "quoted" | "closed";
  lastActivity?: string;
}

export interface TodayViewProps {
  user: {
    name: string;
    initials: string;
    role: string;
  };
  agentStatus: AgentStatus;
  queueItems: QueueItem[];
  openQuotes: number;
  followUpsDue: number;
  activeJobs: number;
  recentJobs: Job[];
  setupStepsCompleted: 0 | 1 | 2 | 3;
  currentTime?: Date;
}


