import { X } from "lucide-react";

import type { Quote } from "../../types";
import { formatCurrency, formatTimestamp } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { QuoteStatusBadge } from "./QuoteStatusBadge";

const steps = ["draft", "sent", "viewed", "response"] as const;

function stepReached(quote: Quote, step: (typeof steps)[number]): boolean {
  if (step === "draft") return true;
  if (step === "sent") return Boolean(quote.sentAt) || ["sent", "viewed", "accepted", "rejected", "expired"].includes(quote.status);
  if (step === "viewed") return Boolean(quote.viewedAt) || ["viewed", "accepted", "rejected"].includes(quote.status);
  return ["accepted", "rejected", "expired"].includes(quote.status);
}

export interface QuoteDetailProps {
  quote: Quote;
  onClose: () => void;
  onStatusChange: (status: Quote["status"]) => void;
}

export function QuoteDetail({ quote, onClose, onStatusChange }: QuoteDetailProps) {
  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-[var(--line-2)] bg-[var(--bg-2)]">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-[var(--t1)]">{quote.jobName}</div>
            <div className="mt-1 text-[12px] text-[var(--t2)]">{quote.customerName} · {quote.customerContact}</div>
            <div className="mt-2 flex items-center gap-2">
              <QuoteStatusBadge status={quote.status} />
              <span className="font-mono text-[10px] text-[var(--t3)]">Created {formatTimestamp(quote.createdAt)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-[24px] w-[24px] items-center justify-center rounded-md text-[var(--t3)] transition hover:bg-[var(--bg-4)] hover:text-[var(--t1)]">
            <X className="h-[14px] w-[14px]" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="scrollbar-none flex-1 overflow-y-auto px-5 py-5">
        <section className="border-b border-[var(--line)] pb-5">
          <div className="flex items-start justify-between gap-2">
            {steps.map((step, index) => {
              const reached = stepReached(quote, step);
              return (
                <div key={step} className="flex flex-1 items-center gap-2 last:flex-[0.8]">
                  <div className="flex flex-col items-center gap-2">
                    <span className={`flex h-[20px] w-[20px] items-center justify-center rounded-full border ${reached ? "border-[var(--accent)] bg-[var(--acl)] text-[var(--accent-2)]" : "border-dashed border-[var(--line-3)] text-[var(--t3)]"}`}>
                      <span className="font-mono text-[10px]">{index + 1}</span>
                    </span>
                    <span className="font-mono text-[10px] text-[var(--t3)]">{step}</span>
                  </div>
                  {index < steps.length - 1 ? <div className={`mt-[-16px] h-px flex-1 ${reached ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`} /> : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="py-5">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--line)] text-left font-mono text-[10px] uppercase tracking-wider text-[var(--t3)]">
                <th className="py-3 pr-3 font-medium">Description</th>
                <th className="py-3 pr-3 font-medium">Qty</th>
                <th className="py-3 pr-3 font-medium">Unit price</th>
                <th className="py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.lineItems.map((item) => (
                <tr key={item.id} className="border-b border-[var(--line)]">
                  <td className="py-3 pr-3 text-[var(--t1)]">{item.description}</td>
                  <td className="py-3 pr-3 font-mono text-[var(--t2)]">{item.quantity}</td>
                  <td className="py-3 pr-3 font-mono text-[var(--t2)]">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-3 text-right font-mono text-[var(--t1)]">{formatCurrency(item.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--line-3)]">
                <td colSpan={3} className="py-4 font-medium text-[var(--t1)]">Total</td>
                <td className="py-4 text-right font-mono text-[var(--green)]">{formatCurrency(quote.totalValue)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <div className="border-t border-[var(--line)] p-4">
        <div className="flex flex-col gap-2">
          {quote.status === "draft" ? (
            <>
              <Button variant="accent" className="w-full justify-center" onClick={() => onStatusChange("sent")}>Send to customer</Button>
              <Button variant="ghost" className="w-full justify-center">Edit</Button>
            </>
          ) : null}
          {(quote.status === "sent" || quote.status === "viewed") ? (
            <>
              <Button variant="outline-accent" className="w-full justify-center">Follow up</Button>
              <Button variant="ghost" className="w-full justify-center" onClick={() => onStatusChange("accepted")}>Mark accepted</Button>
              <Button variant="destructive" className="w-full justify-center" onClick={() => onStatusChange("rejected")}>Mark rejected</Button>
            </>
          ) : null}
          {quote.status === "accepted" ? <Button variant="accent" className="w-full justify-center">Create job</Button> : null}
          {quote.status === "rejected" ? <Button variant="ghost" className="w-full justify-center">Revise quote</Button> : null}
        </div>
      </div>
    </div>
  );
}
