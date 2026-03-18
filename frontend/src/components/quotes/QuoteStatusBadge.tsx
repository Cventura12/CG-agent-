import type { QuoteStatus } from "../../types";
import { Badge } from "../ui/Badge";

const statusColor: Record<QuoteStatus, Parameters<typeof Badge>[0]["color"]> = {
  draft: "muted",
  sent: "blue",
  viewed: "purple",
  accepted: "green",
  rejected: "red",
  expired: "amber",
};

export interface QuoteStatusBadgeProps {
  status: QuoteStatus;
}

export function QuoteStatusBadge({ status }: QuoteStatusBadgeProps) {
  return <Badge label={status} color={statusColor[status]} />;
}
