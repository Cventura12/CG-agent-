import type { JobStatus } from "../../types";
import { Badge } from "../ui/Badge";

const statusColor: Record<JobStatus, Parameters<typeof Badge>[0]["color"]> = {
  active: "accent",
  quoted: "blue",
  in_progress: "purple",
  completed: "green",
  stalled: "amber",
};

export interface JobStatusBadgeProps {
  status: JobStatus;
}

export function JobStatusBadge({ status }: JobStatusBadgeProps) {
  return <Badge label={status.replace("_", " ")} color={statusColor[status]} />;
}

