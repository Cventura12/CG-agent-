import { CalendarDays, Plus } from "lucide-react";

import { Button } from "../ui/Button";

function formatDateTag(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(value);
}

export interface TopbarProps {
  currentTime: Date;
  onImportTranscript?: () => void;
  onNewQuote?: () => void;
}

export function Topbar({ currentTime, onImportTranscript, onNewQuote }: TopbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg)] px-5">
      <div className="flex items-center gap-3">
        <div className="text-[13px] text-[var(--t2)]">
          Arbor <span className="text-[var(--t3)]">/</span> <span className="text-[var(--t1)]">Today</span>
        </div>
        <div className="inline-flex items-center gap-[6px] rounded px-[6px] py-[2px] font-mono text-[9px] text-[var(--green)]">
          <span className="h-[5px] w-[5px] rounded-full bg-[var(--green)] animate-pulse-slow" />
          Live
        </div>
      </div>

      <div className="flex items-center gap-[8px]">
        <div className="inline-flex items-center gap-[6px] rounded border border-[var(--line-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--t3)]">
          <CalendarDays className="h-[11px] w-[11px]" strokeWidth={1.8} />
          {formatDateTag(currentTime)}
        </div>
        <Button variant="ghost" onClick={onImportTranscript}>
          Import transcript
        </Button>
        <Button
          variant="accent"
          onClick={onNewQuote}
          leftIcon={<Plus className="h-[12px] w-[12px]" strokeWidth={2.4} />}
          className="px-[14px] py-[6px]"
        >
          New quote
        </Button>
      </div>
    </header>
  );
}

