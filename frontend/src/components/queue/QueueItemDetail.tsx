import { X } from "lucide-react";

import type { QueueItem } from "../../types";
import { formatTimestamp } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { InputSourceIcon } from "../ui/InputSourceIcon";
import { SectionLabel } from "../ui/SectionLabel";
import { ActionChip } from "./ActionChip";

export interface QueueItemDetailProps {
  item: QueueItem;
  onClose: () => void;
  onApproveAll: () => void;
  onDismiss: () => void;
  onToggleAction: (actionId: string) => void;
}

export function QueueItemDetail({ item, onClose, onApproveAll, onDismiss, onToggleAction }: QueueItemDetailProps) {
  return (
    <div className="flex h-full w-full shrink-0 flex-col border-l border-[var(--line-2)] bg-[var(--bg-2)] sm:w-[380px] lg:w-[340px]">
      <div className="border-b border-[var(--line)] px-4 py-4">
        <div className="flex items-start gap-3">
          <InputSourceIcon source={item.source} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[var(--t1)]">{item.title}</div>
            <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">{item.source} · {formatTimestamp(item.createdAt)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[24px] w-[24px] items-center justify-center rounded-md text-[var(--t3)] transition hover:bg-[var(--bg-4)] hover:text-[var(--t1)]"
          >
            <X className="h-[14px] w-[14px]" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="scrollbar-none flex-1 overflow-y-auto px-4 py-4">
        {item.rawTranscriptSnippet ? (
          <section className="border-b border-[var(--line)] pb-4">
            <SectionLabel>Transcript excerpt</SectionLabel>
            <div className="mt-2 rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] p-3 font-mono text-[11px] leading-relaxed text-[var(--t2)]">
              {item.rawTranscriptSnippet}
            </div>
          </section>
        ) : null}

        <section className="pt-4">
          <SectionLabel>Agent extracted</SectionLabel>
          <div className="mt-2">
            {item.extractedActions.map((action) => (
              <ActionChip key={action.id} action={action} onToggle={() => onToggleAction(action.id)} />
            ))}
          </div>
        </section>
      </div>

      <div className="border-t border-[var(--line)] p-4">
        <div className="flex flex-col gap-2">
          <Button variant="accent" className="w-full justify-center" onClick={onApproveAll}>
            Approve all & create quote
          </Button>
          <Button variant="ghost" className="w-full justify-center" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

