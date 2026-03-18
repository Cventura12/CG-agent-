import clsx from "clsx";

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
        <div className="mt-2 font-mono text-[10px] text-[var(--t3)]">
          {item.jobName ?? "Unassigned"} · {formatTimeAgo(item.createdAt)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {item.urgent ? <Badge label="Urgent" color="amber" /> : null}
        <Badge
          label={item.status}
          color={item.status === "approved" ? "green" : item.status === "dismissed" ? "red" : item.status === "snoozed" ? "purple" : "muted"}
        />
      </div>
    </button>
  );
}
