ï»¿import clsx from "clsx";

import type { QueueItem as QueueItemType } from "../../types";
import { formatTimeAgo } from "../../lib/formatters";
import { Badge } from "../ui/Badge";
import { InputSourceIcon } from "../ui/InputSourceIcon";

export interface QueueItemProps {
  item: QueueItemType;
  selected: boolean;
  onClick: () => void;
}

export function QueueItem({ item, selected, onClick }: QueueItemProps) {
  const hasBackendArtifactErrors = (item.backendArtifactErrors?.length ?? 0) > 0;
  const statusLabel =
    item.status === "manual_review"
      ? "Manual review"
      : item.status.charAt(0).toUpperCase() + item.status.slice(1).replace("_", " ");
  const statusColor =
    item.status === "approved"
      ? "green"
      : item.status === "dismissed"
        ? "red"
        : item.status === "snoozed"
          ? "purple"
          : item.status === "manual_review"
            ? "accent"
            : "muted";

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full items-start gap-3 border-b border-[var(--line)] px-5 py-4 text-left transition-colors hover:bg-[var(--bg-3)]",
        selected && "border-l-2 border-l-[var(--accent)] bg-[var(--bg-3)] pl-[18px]"
      )}
    >
      <InputSourceIcon source={item.source} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[var(--t1)]">{item.title}</div>
        <div className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--t2)]">{item.description}</div>
        {item.status === "manual_review" && item.manualReviewReason ? (
          <div className="mt-2 line-clamp-2 text-[11px] text-[var(--accent-2)]">{item.manualReviewReason}</div>
        ) : null}
        {hasBackendArtifactErrors ? (
          <div className="mt-2 line-clamp-2 text-[11px] text-[var(--amber)]">
            {item.backendArtifactErrors?.[0] ?? "One backend step still needs attention."}
          </div>
        ) : null}
        <div className="mt-2 font-mono text-[10px] text-[var(--t3)]">
          {item.jobName ?? "Unassigned"} Â· {formatTimeAgo(item.createdAt)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {item.urgent ? <Badge label="Urgent" color="amber" /> : null}
        {item.status === "manual_review" && typeof item.confidenceScore === "number" ? (
          <Badge label={`${Math.round(item.confidenceScore * 100)}%`} color="accent" />
        ) : null}
        {hasBackendArtifactErrors ? <Badge label="Artifact issue" color="amber" /> : null}
        <Badge label={statusLabel} color={statusColor} />
      </div>
    </button>
  );
}
