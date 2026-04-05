import type { InputSource } from "../../types";

const sourceColors: Record<InputSource, string> = {
  CALL: "bg-[var(--green)]",
  SMS: "bg-[var(--amber)]",
  UPLOAD: "bg-[var(--blue)]",
  EMAIL: "bg-[var(--purple)]",
  WHATSAPP: "bg-[var(--green)]",
};

export interface SourceDatum {
  source: InputSource;
  percent: number;
}

export interface SourceBreakdownProps {
  data: SourceDatum[];
}

export function SourceBreakdown({ data }: SourceBreakdownProps) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
      <div className="space-y-3">
        {data.map((entry) => (
          <div key={entry.source} className="grid grid-cols-[60px_minmax(0,1fr)_40px] items-center gap-3">
            <div className="font-mono text-[10px] text-[var(--t3)]">{entry.source}</div>
            <div className="h-[8px] overflow-hidden rounded-full bg-[var(--bg-4)]">
              <div className={`h-full rounded-full ${sourceColors[entry.source]}`} style={{ width: `${entry.percent}%` }} />
            </div>
            <div className="text-right font-mono text-[10px] text-[var(--t2)]">{entry.percent}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

