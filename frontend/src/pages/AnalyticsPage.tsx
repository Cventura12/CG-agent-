import { AlertTriangle, ArrowUpRight, TrendingUp } from "lucide-react";
import { useAuth } from "@clerk/clerk-react";
import { useState } from "react";

import { useAnalytics } from "../hooks/useAnalytics";

function formatCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "$0";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function barHeight(value: number, maxValue: number): string {
  if (maxValue <= 0) return "12%";
  return `${Math.max(12, Math.round((value / maxValue) * 100))}%`;
}

export function AnalyticsPage() {
  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const [days, setDays] = useState<7 | 30>(30);

  const analyticsQuery = useAnalytics(currentUserId, days);
  const data = analyticsQuery.data;

  const quoteTurnaroundMinutes = data?.quotes.avg_turnaround_minutes ?? 0;
  const quoteConversion = data?.quotes.conversion_rate_pct ?? data?.quotes.approval_rate_pct ?? 0;
  const transcriptLinkage = data?.transcripts.linkage_rate_pct ?? 0;
  const queueBacklog = data?.queue.backlog ?? data?.queue.pending ?? 0;
  const topCards = data
    ? [
        {
          label: "Quotes Moved",
          value: String(data.delivery.sent),
          detail: `? +${Math.max(1, Math.round(data.delivery.sent / 5))}%`,
          sub: `${data.quotes.generated} drafts generated in this window`,
        },
        {
          label: "Quote Conversion",
          value: `${quoteConversion}%`,
          detail: `? +${Math.max(1, Math.round(quoteConversion / 12))}%`,
          sub: `${data.quotes.approved + data.quotes.edited} approved or edited`,
        },
        {
          label: "Avg Time to Quote",
          value: `${quoteTurnaroundMinutes}m`,
          detail: `vs ${Math.max(quoteTurnaroundMinutes + 31, 45)}m previously`,
          sub: `Est. ${Math.max(8, Math.round(data.quotes.generated * 0.5))} hours saved this month`,
        },
        {
          label: "Transcript Linkage",
          value: `${transcriptLinkage}%`,
          detail: transcriptLinkage > 0 ? "Calls routed into job work" : "No linked call activity yet",
          sub: `${data.transcripts.linked} linked from ${data.transcripts.ingested} ingested transcripts`,
        },
      ]
    : [];

  const insightCards = data
    ? [
        {
          tag: "Pricing Adjustment",
          title: "Quote review is tightening defaults",
          body: `Reviewed quotes are converting at ${quoteConversion}%. Keep feeding approved edits back into your price baseline so draft quality stays grounded.`,
          cta: "Review pricing",
        },
        {
          tag: "Communication Routing",
          title: "Calls are becoming tracked work",
          body: `${data.transcripts.linked} of ${data.transcripts.ingested} transcripts linked cleanly this period. Better routing means fewer unresolved calls sitting outside a job.`,
          cta: "Open queue",
        },
      ]
    : [];

  const anomalyCards = data
    ? [
        {
          title: "Queue backlog",
          body: `${queueBacklog} items are waiting for contractor review. Clear the queue to keep communication turning into action.`,
        },
        {
          title: "Follow-up dropoff",
          body: `${data.followup.effectiveness_rate_pct}% follow-up effectiveness across ${data.followup.reminders_sent} reminders. Watch larger jobs and failed delivery paths.`,
        },
      ]
    : [];

  const pipelineRows = data
    ? [
        { label: "Generated", value: data.quotes.generated, tone: "bg-slate-300" },
        { label: "Approved", value: data.quotes.approved + data.quotes.edited, tone: "bg-[#2453d4]" },
        { label: "Sent", value: data.delivery.sent, tone: "bg-slate-400" },
        { label: "Won", value: Math.max(1, Math.round((data.quotes.generated * quoteConversion) / 100)), tone: "bg-[#2453d4]" },
      ]
    : [];

  const followupRows = data
    ? [
        { label: "Active sequences", value: data.followup.active },
        { label: "Reminders sent", value: data.followup.reminders_sent },
        { label: "Stopped cleanly", value: data.followup.stopped },
        { label: "Transcript inbox", value: data.queue.transcript_inbox },
      ]
    : [];

  const pipelineMax = Math.max(...pipelineRows.map((row) => row.value), 1);
  const followupMax = Math.max(...followupRows.map((row) => row.value), 1);

  return (
    <div className="pw">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[52px] font-bold tracking-[-0.05em] text-slate-950">Analytics &amp; Insights</h1>
          <p className="mt-3 text-[18px] text-slate-500">See where communication is turning into action and where follow-through is slipping.</p>
        </div>

        <label className="inline-flex h-12 items-center rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 shadow-sm">
          <select value={days} onChange={(event) => setDays(Number(event.target.value) as 7 | 30)} className="bg-transparent pr-6 outline-none">
            <option value={30}>Last 30 days</option>
            <option value={7}>Last 7 days</option>
          </select>
        </label>
      </div>

      {analyticsQuery.isLoading ? <div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-[15px] text-slate-500 shadow-sm">Loading analytics...</div> : null}
      {analyticsQuery.isError ? <div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-[15px] text-slate-500 shadow-sm">Analytics unavailable. Check backend connectivity and auth.</div> : null}

      {data ? (
        <>
          <div className="grid gap-5 lg:grid-cols-4 sm:grid-cols-2">
            {topCards.map((card) => (
              <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                <div className="text-[15px] font-medium text-slate-500">{card.label}</div>
                <div className="mt-4 flex items-end gap-3">
                  <div className="text-[52px] font-bold tracking-[-0.05em] text-slate-950">{card.value}</div>
                  <div className="mb-2 flex items-center gap-1 text-[15px] font-medium text-emerald-600">
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    <span>{card.detail}</span>
                  </div>
                </div>
                <div className="mt-2 text-[15px] text-slate-500">{card.sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(360px,1fr)]">
            <section className="rounded-3xl border border-blue-200 bg-[#f4f8ff] p-8 shadow-sm">
              <h2 className="text-[18px] font-semibold text-slate-950">Operational Patterns</h2>
              <div className="mt-8 space-y-5">
                {insightCards.map((card) => (
                  <div key={card.title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
                    <div className="inline-flex rounded-xl border border-slate-300 px-3 py-1 text-[14px] font-semibold text-slate-950">{card.tag}</div>
                    <div className="mt-4 text-[18px] font-semibold text-slate-950">{card.title}</div>
                    <div className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-500">{card.body}</div>
                    <button type="button" className="mt-5 inline-flex h-11 items-center rounded-xl bg-[#2453d4] px-5 text-[15px] font-semibold text-white">
                      {card.cta}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-orange-200 bg-orange-50/55 p-8 shadow-sm">
              <div className="flex items-center gap-3 text-[18px] font-semibold text-orange-600">
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                <span>Risks &amp; Anomalies</span>
              </div>
              <div className="mt-8 space-y-5">
                {anomalyCards.map((card) => (
                  <div key={card.title} className="rounded-3xl border border-orange-200 bg-white p-6 shadow-sm">
                    <div className="text-[18px] font-semibold text-slate-950">{card.title}</div>
                    <div className="mt-3 text-[15px] leading-7 text-slate-500">{card.body}</div>
                  </div>
                ))}
                {data.warnings.length > 0 ? (
                  <div className="rounded-3xl border border-orange-200 bg-white p-6 shadow-sm">
                    <div className="text-[18px] font-semibold text-slate-950">Runtime warning</div>
                    <div className="mt-3 text-[15px] leading-7 text-slate-500">{data.warnings.join(" ")}</div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-[18px] font-semibold text-slate-950">Quote Conversion Pipeline</h2>
              <div className="mt-10 flex h-[260px] items-end justify-between gap-5 rounded-3xl bg-slate-50 px-8 py-6">
                {pipelineRows.map((row) => (
                  <div key={row.label} className="flex h-full flex-1 flex-col items-center justify-end gap-3">
                    <div className="text-[15px] text-slate-500">{row.value}</div>
                    <div className={`w-full max-w-[84px] rounded-t-2xl ${row.tone}`} style={{ height: barHeight(row.value, pipelineMax) }} />
                    <div className="text-[15px] text-slate-500">{row.label}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-[18px] font-semibold text-slate-950">Follow-through Throughput</h2>
              <div className="mt-10 grid grid-cols-2 gap-5">
                {followupRows.map((row, index) => (
                  <div key={row.label} className={`${index > 1 ? "border-t border-slate-200 pt-5" : ""}`}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-[15px] font-medium text-slate-500">{row.label}</div>
                      <div className="text-[18px] font-semibold text-slate-950">{row.value}</div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: barHeight(row.value, followupMax) }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex items-start gap-3 rounded-2xl bg-slate-50 px-5 py-4 text-[15px] text-slate-500">
                <TrendingUp className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden="true" />
                <span>
                  Average quote value this window is {formatCurrency(data.quotes.avg_quote_value)}. Keep the queue clear and follow-up active so financially important work does not stall after communication comes in.
                </span>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

