import { useAuth, useUser } from "@clerk/clerk-react";
import { useMemo } from "react";

import { TodayView } from "../components/today/TodayView";
import { useAnalytics } from "../hooks/useAnalytics";
import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useQueue } from "../hooks/useQueue";
import type {
  Draft,
  DraftStatus,
  Job as ApiJob,
  QueueJobGroup,
  TranscriptInboxItem,
  TranscriptUrgency,
} from "../types";
import type { AgentStatus, InputSource, Job, QueueItem } from "../types/today";

const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true";

function initialsFromName(value: string): string {
  const tokens = value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (tokens.length === 0) {
    return "GC";
  }

  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

function normalizeSource(value: string | undefined): InputSource {
  const normalized = value?.toUpperCase();
  if (normalized === "CALL" || normalized === "SMS" || normalized === "UPLOAD" || normalized === "EMAIL") {
    return normalized;
  }
  return "UPLOAD";
}

function mapDraftStatus(status: DraftStatus): QueueItem["status"] {
  if (status === "approved" || status === "edited") return "approved";
  if (status === "discarded") return "dismissed";
  return "pending";
}

function transcriptUrgent(urgency: TranscriptUrgency | undefined): boolean {
  return urgency === "high";
}

function mapDraft(group: QueueJobGroup, draft: Draft): QueueItem {
  return {
    id: draft.id,
    description: draft.transcript?.summary || draft.title || draft.why || "Draft waiting for review",
    source: normalizeSource(draft.transcript?.source),
    jobId: group.job_id,
    jobName: group.job_name,
    urgent: draft.type === "CO" || transcriptUrgent(draft.transcript?.urgency),
    status: mapDraftStatus(draft.status),
    createdAt: draft.transcript?.started_at || draft.created_at,
  };
}

function mapTranscript(item: TranscriptInboxItem): QueueItem {
  return {
    id: item.transcript_id,
    description: item.summary || `${item.caller_label || "Caller"} needs routing`,
    source: normalizeSource(item.source),
    urgent: transcriptUrgent(item.urgency),
    status: item.review_state === "pending" ? "pending" : item.review_state === "discarded" ? "dismissed" : "approved",
    createdAt: item.started_at || item.created_at || new Date().toISOString(),
  };
}

function mapJobStatus(job: ApiJob): Job["status"] {
  if (job.status === "complete") return "closed";
  if (job.status === "on-hold") return "quoted";
  return "active";
}

function sortQueueItems(items: QueueItem[]): QueueItem[] {
  return [...items].sort((left, right) => {
    if (left.urgent !== right.urgent) {
      return left.urgent ? -1 : 1;
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function mostRecentTimestamp(values: Array<string | null | undefined>): string {
  const timestamps = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return new Date().toISOString();
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function deriveSetupSteps(
  queueGroups: QueueJobGroup[],
  transcriptInbox: TranscriptInboxItem[],
  openQuotes: number,
  followUpsDue: number,
  jobsCount: number
): 0 | 1 | 2 | 3 {
  const hasConnectedInput = queueGroups.length > 0 || transcriptInbox.length > 0 || jobsCount > 0;
  const hasReviewed =
    queueGroups.some((group) =>
      group.drafts.some((draft) =>
        ["approved", "edited", "discarded"].includes(draft.status) || Boolean(draft.approval_status)
      )
    ) || transcriptInbox.some((item) => item.review_state !== "pending");
  const hasApprovedAndSent = openQuotes > 0 || followUpsDue > 0;

  if (hasApprovedAndSent) return 3;
  if (hasReviewed) return 2;
  if (hasConnectedInput) return 1;
  return 0;
}

export function BriefingPage() {
  const { userId } = useAuth();
  const { user } = useUser();
  const currentUserId = userId ?? null;
  const isOnline = useOnlineStatus();

  const queueQuery = useQueue(currentUserId);
  const jobsQuery = useJobs(currentUserId);
  const analyticsQuery = useAnalytics(currentUserId, 30);

  const queueGroups = queueQuery.data?.jobs ?? [];
  const transcriptInbox = queueQuery.data?.inbox?.transcripts ?? [];
  const jobs = jobsQuery.data?.jobs ?? [];
  const analytics = analyticsQuery.data;

  const queueItems = useMemo(() => {
    const mapped = [
      ...queueGroups.flatMap((group) => group.drafts.map((draft) => mapDraft(group, draft))),
      ...transcriptInbox.map(mapTranscript),
    ];
    return sortQueueItems(mapped);
  }, [queueGroups, transcriptInbox]);

  const openQuotes = useMemo(() => {
    return jobs.filter(
      (job) => job.status === "on-hold" || job.open_items.some((item) => item.type === "quote")
    ).length;
  }, [jobs]);

  const followUpsDue = analytics?.followup.active ?? jobs.reduce((sum, job) => {
    return sum + job.open_items.filter((item) => item.type === "follow-up" || item.type === "followup").length;
  }, 0);

  const activeJobs = useMemo(() => jobs.filter((job) => job.status === "active").length, [jobs]);

  const recentJobs = useMemo<Job[]>(() => {
    return [...jobs]
      .sort((left, right) => new Date(right.last_updated).getTime() - new Date(left.last_updated).getTime())
      .slice(0, 6)
      .map((job) => ({
        id: job.id,
        name: job.name,
        status: mapJobStatus(job),
        lastActivity: job.last_updated,
      }));
  }, [jobs]);

  const setupStepsCompleted = deriveSetupSteps(
    queueGroups,
    transcriptInbox,
    openQuotes,
    followUpsDue,
    jobs.length
  );

  const agentStatus = useMemo<AgentStatus>(() => {
    const itemsProcessed =
      (analytics?.queue.approved ?? 0) +
      (analytics?.queue.edited ?? 0) +
      (analytics?.queue.discarded ?? 0) +
      queueItems.length;

    return {
      active: isOnline,
      itemsProcessed,
      lastActivity: mostRecentTimestamp([
        ...jobs.map((job) => job.last_updated),
        ...queueItems.map((item) => item.createdAt),
      ]),
      waitingFor:
        queueItems.length > 0
          ? "contractor review"
          : followUpsDue > 0
            ? "follow-up response"
            : jobs.length > 0
              ? "next inbound call"
              : "first call",
    };
  }, [analytics?.queue.approved, analytics?.queue.discarded, analytics?.queue.edited, followUpsDue, isOnline, jobs, queueItems]);

  const operatorName =
    bypassAuth
      ? "Caleb Ventura"
      : user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "GC Operator";

  return (
    <TodayView
      user={{
        name: operatorName,
        initials: initialsFromName(operatorName),
        role: bypassAuth ? "Owner / GC" : "Operator",
      }}
      agentStatus={agentStatus}
      queueItems={queueItems}
      openQuotes={openQuotes}
      followUpsDue={followUpsDue}
      activeJobs={activeJobs}
      recentJobs={recentJobs}
      setupStepsCompleted={setupStepsCompleted}
      currentTime={new Date()}
    />
  );
}


