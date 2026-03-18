import type { Quote } from "../../types";
import { formatCurrency, formatTimeAgo } from "../../lib/formatters";
import { Badge } from "../ui/Badge";
import { QuoteStatusBadge } from "./QuoteStatusBadge";

export interface QuoteCardProps {
  quote: Quote;
  selected: boolean;
  onClick: () => void;
}

export function QuoteCard({ quote, selected, onClick }: QuoteCardProps) {
  const intakeLabel =
    quote.intakeSource === "voice"
      ? "VOICE"
      : quote.intakeSource === "pdf"
        ? "PDF"
        : quote.intakeSource === "photo"
          ? "FILE"
          : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-4 border-b border-[var(--line)] px-5 py-4 text-left transition hover:bg-[var(--bg-3)] ${
        selected ? "bg-[var(--bg-3)]" : ""
      }`}
    >
      <QuoteStatusBadge status={quote.status} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[var(--t1)]">{quote.jobName}</div>
        <div className="mt-1 text-[12px] text-[var(--t2)]">{quote.customerName}</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="font-mono text-[10px] text-[var(--t3)]">{quote.lineItems.length} line items</div>
          {intakeLabel ? <Badge label={intakeLabel} color="blue" /> : null}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[14px] text-[var(--t1)]">{formatCurrency(quote.totalValue)}</div>
        <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">{formatTimeAgo(quote.createdAt)}</div>
      </div>
    </button>
  );
}
