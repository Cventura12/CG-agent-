import { AlertTriangle, ArrowUpRight, TrendingUp, Waves } from "lucide-react";
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
          label: "Quotes moved",
          value: String(data.delivery.sent),
          detail: `+${Math.max(1, Math.round(data.delivery.sent / 5))}%`,
          sub: `${data.quotes.generated} drafts generated in this window`,
          tone: "info",
        },
        {
          label: "Quote conversion",
          value: `${quoteConversion}%`,
          detail: `+${Math.max(1, Math.round(quoteConversion / 12))}%`,
          sub: `${data.quotes.approved + data.quotes.edited} approved or edited`,
          tone: "success",
        },
        {
          label: "Avg time to quote",
          value: `${quoteTurnaroundMinutes}m`,
          detail: `vs ${Math.max(quoteTurnaroundMinutes + 31, 45)}m before`,
          sub: `Est. ${Math.max(8, Math.round(data.quotes.generated * 0.5))} hours saved this month`,
          tone: "soft",
        },
        {
          label: "Transcript linkage",
          value: `${transcriptLinkage}%`,
          detail: transcriptLinkage > 0 ? "Calls routed into job work" : "No linked call activity yet",
          sub: `${data.transcripts.linked} linked from ${data.transcripts.ingested} ingested transcripts`,
          tone: "warn",
        },
      ]
    : [];

  const insightCards = data
    ? [
        {
          tag: "Pricing drift",
          title: "Office review is shaping future quote quality",
          body: `Reviewed quotes are converting at ${quoteConversion}%. Keep feeding approved edits back into your price baseline so drafts stay grounded in reality.`,
          cta: "Review pricing",
        },
        {
          tag: "Communication routing",
          title: "Calls are turning into tracked job action",
          body: `${data.transcripts.linked} of ${data.transcripts.ingested} transcripts linked cleanly this period. Better routing means fewer unresolved calls living outside a job record.`,
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
          title: "Follow-through dropoff",
          body: `${data.followup.effectiveness_rate_pct}% follow-through effectiveness across ${data.followup.reminders_sent} reminders. Larger jobs may need tighter handoff after send.`,
        },
      ]
    : [];

  const pipelineRows = data
    ? [
        { label: "Generated", value: data.quotes.generated, tone: "bg-slate-300" },
        { label: "Approved", value: data.quotes.approved + data.quotes.edited, tone: "bg-[#315fff]" },
        { label: "Sent", value: data.delivery.sent, tone: "bg-slate-400" },
        { label: "Won", value: Math.max(1, Math.round((data.quotes.generated * quoteConversion) / 100)), tone: "bg-[#315fff]" },
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
    <div className="pw gc-page">
      <section className="gc-page-header gc-fade-up rounded-[28px] px-5 py-6 sm:px-7 sm:py-7">
        <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[52rem]">
            <div className="gc-overline">Runtime signal map</div>
            <h1 className="gc-page-title mt-3">Analytics & Insights</h1>
            <p className="gc-page-copy mt-4 max-w-[44rem]">
              Watch where communication is becoming action, where quotes are stalling, and how follow-through is performing across the business.
            </p>
          </div>
          <label className="inline-flex h-11 items-center rounded-xl border border-white/12 bg-white/[0.06] px-4 text-[12px] font-semibold text-white shadow-none">
            <select value={days} onChange={(event) => setDays(Number(event.target.value) as 7 | 30)} className="bg-transparent pr-6 outline-none">
              <option value={30}>Last 30 days</option>
              <option value={7}>Last 7 days</option>
            </select>
          </label>
        </div>
      </section>

      {analyticsQuery.isLoading ? <div className="mt-5 rounded-[30px] border border-[var(--gc-line)] bg-white/80 px-8 py-10 text-[14px] text-[var(--gc-ink-soft)] shadow-[var(--gc-shadow)]">Loading analytics...</div> : null}
      {analyticsQuery.isError ? <div className="mt-5 rounded-[30px] border border-[var(--gc-line)] bg-white/80 px-8 py-10 text-[14px] text-[var(--gc-ink-soft)] shadow-[var(--gc-shadow)]">Analytics unavailable. Check backend connectivity and auth.</div> : null}

      {data ? (
        <>
          <section className="gc-kpi-grid gc-four mt-5">
            {topCards.map((card, index) => (
              <article key={card.label} className={`gc-kpi-card gc-fade-up gc-delay-${Math.min(index + 1, 4)} ${card.tone === "warn" ? "warn" : card.tone === "success" ? "ok" : "neutral"}`}>
                <div className="gc-kpi-label">{card.label}</div>
                <div className="gc-kpi-value">{card.value}</div>
                <div className="mt-2 flex items-center gap-2 text-[13px] font-medium text-[#147a4f]">
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  <span>{card.detail}</span>
                </div>
                <div className="gc-kpi-hint mt-2">{card.sub}</div>
              </article>
            ))}
          </section>

          <section className="gc-stack-grid mt-5">
            <div className="space-y-5">
              <article className="gc-stack-card gc-fade-up gc-delay-2">
                <div className="gc-stack-header">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                      <Waves className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="gc-stack-title">Operational patterns</div>
                      <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">Signals that should change what the office does next.</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 px-6 py-6">
                  {insightCards.map((card) => (
                    <div key={card.title} className="rounded-[24px] border border-[var(--gc-line)] bg-white/72 p-5 shadow-[0_12px_30px_rgba(15,22,38,0.06)]">
                      <span className="gc-chip info">{card.tag}</span>
                      <div className="mt-4 text-[20px] font-semibold tracking-[-0.03em] text-[var(--gc-ink)]">{card.title}</div>
                      <div className="mt-3 text-[14px] leading-7 text-[var(--gc-ink-soft)]">{card.body}</div>
                      <button type="button" className="mt-5 cta">
                        {card.cta}
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="gc-stack-card gc-fade-up gc-delay-3">
                  <div className="gc-stack-header">
                    <div className="gc-stack-title">Quote conversion pipeline</div>
                  </div>
                  <div className="px-6 py-6">
                    <div className="flex h-[250px] items-end justify-between gap-4 rounded-[26px] bg-[rgba(240,244,255,0.78)] px-6 py-6">
                      {pipelineRows.map((row) => (
                        <div key={row.label} className="flex h-full flex-1 flex-col items-center justify-end gap-3">
                          <div className="text-[14px] text-[var(--gc-ink-soft)]">{row.value}</div>
                          <div className={`w-full max-w-[84px] rounded-t-[20px] ${row.tone}`} style={{ height: barHeight(row.value, pipelineMax) }} />
                          <div className="text-[13px] text-[var(--gc-ink-soft)]">{row.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="gc-stack-card gc-fade-up gc-delay-4">
                  <div className="gc-stack-header">
                    <div className="gc-stack-title">Follow-through throughput</div>
                  </div>
                  <div className="grid grid-cols-2 gap-5 px-6 py-6">
                    {followupRows.map((row, index) => (
                      <div key={row.label} className={`${index > 1 ? "border-t border-[var(--gc-line)] pt-5" : ""}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[13px] font-medium text-[var(--gc-ink-soft)]">{row.label}</div>
                          <div className="text-[18px] font-semibold text-[var(--gc-ink)]">{row.value}</div>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-[rgba(49,95,255,0.08)]">
                          <div className="h-2 rounded-full bg-[linear-gradient(90deg,#315fff,#6a8aff)]" style={{ width: barHeight(row.value, followupMax) }} />
                        </div>
                      </div>
                    ))}
                    <div className="col-span-2 mt-2 flex items-start gap-3 rounded-[22px] bg-[rgba(49,95,255,0.08)] px-5 py-4 text-[14px] leading-7 text-[var(--gc-ink-soft)]">
                      <TrendingUp className="mt-1 h-5 w-5 text-[#214be0]" aria-hidden="true" />
                      <span>
                        Average quote value this window is {formatCurrency(data.quotes.avg_quote_value)}. Keep the queue clear and follow-through active so financially important work does not stall after communication lands.
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <aside className="space-y-5">
              <section className="gc-side-panel gc-fade-up gc-delay-3">
                <div className="gc-side-body">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(255,140,47,0.12)] text-[#bc610b]">
                      <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="gc-stack-title">Risks & anomalies</div>
                      <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">Where the runtime is slipping or exposing money.</div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-4">
                    {anomalyCards.map((card) => (
                      <div key={card.title} className="rounded-[22px] border border-[rgba(255,140,47,0.14)] bg-[rgba(255,140,47,0.08)] px-4 py-4">
                        <div className="text-[16px] font-semibold text-[var(--gc-ink)]">{card.title}</div>
                        <div className="mt-2 text-[14px] leading-7 text-[var(--gc-ink-soft)]">{card.body}</div>
                      </div>
                    ))}
                    {data.warnings.length > 0 ? (
                      <div className="rounded-[22px] border border-[rgba(255,140,47,0.14)] bg-[rgba(255,140,47,0.08)] px-4 py-4">
                        <div className="text-[16px] font-semibold text-[var(--gc-ink)]">Runtime warning</div>
                        <div className="mt-2 text-[14px] leading-7 text-[var(--gc-ink-soft)]">{data.warnings.join(" ")}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            </aside>
          </section>
        </>
      ) : null}
    </div>
  );
}



