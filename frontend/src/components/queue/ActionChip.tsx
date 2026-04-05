import { Check, CircleDollarSign, FileText, NotebookPen, RefreshCcw, ShieldCheck } from "lucide-react";

import type { ExtractedAction } from "../../types";
import { formatCompactCurrency } from "../../lib/formatters";

const actionMap: Record<ExtractedAction["type"], { icon: typeof FileText; tone: string; label: string }> = {
  change_order: { icon: CircleDollarSign, tone: "bg-[var(--accent)] text-white", label: "Change order" },
  follow_up: { icon: RefreshCcw, tone: "bg-[var(--amber-b)] text-[var(--amber)]", label: "Follow up" },
  quote_item: { icon: FileText, tone: "bg-[var(--blue-b)] text-[var(--blue)]", label: "Quote item" },
  commitment: { icon: ShieldCheck, tone: "bg-[var(--purple-b)] text-[var(--purple)]", label: "Commitment" },
  note: { icon: NotebookPen, tone: "bg-[var(--bg-4)] text-[var(--t2)]", label: "Note" },
};

export interface ActionChipProps {
  action: ExtractedAction;
  onToggle: () => void;
}

export function ActionChip({ action, onToggle }: ActionChipProps) {
  const meta = actionMap[action.type];
  const Icon = meta.icon;

  return (
    <div className="mb-2 flex items-start gap-2.5 rounded-lg border border-[var(--line-2)] bg-[var(--bg-3)] p-3">
      <span className={`mt-[2px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md ${meta.tone}`}>
        <Icon className="h-[13px] w-[13px]" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-[var(--t1)]">{action.description}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--t3)]">{meta.label}</span>
          {typeof action.estimatedValue === "number" ? (
            <span className="font-mono text-[10px] text-[var(--green)]">{formatCompactCurrency(action.estimatedValue)}</span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-md border transition ${
          action.approved
            ? "border-[var(--green)] bg-[var(--green-b)] text-[var(--green)]"
            : "border-[var(--line-3)] bg-transparent text-[var(--t3)] hover:border-[var(--line-4)] hover:text-[var(--t1)]"
        }`}
      >
        <Check className="h-[12px] w-[12px]" strokeWidth={2.4} />
      </button>
    </div>
  );
}

