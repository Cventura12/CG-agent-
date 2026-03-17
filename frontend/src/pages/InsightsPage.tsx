import { useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { ArrowRight, Layers3, Radar, Sparkles, TrendingUp } from "lucide-react";

import { useMultiJobInsights } from "../hooks/useMultiJobInsights";

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

function confidenceTone(confidence: string): string {
  if (confidence === "high") return "gc-chip success";
  if (confidence === "medium") return "gc-chip warn";
  return "gc-chip soft";
}

export function InsightsPage() {
  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const [horizonDays, setHorizonDays] = useState<7 | 14 | 30>(14);

  const insightsQuery = useMultiJobInsights(currentUserId, horizonDays);
  const data = insightsQuery.data;

  const sorted = useMemo(() => {
    if (!data) {
      return [];
    }
    return [...data.opportunities].sort((a, b) => b.estimated_savings_amount - a.estimated_savings_amount);
  }, [data]);

  return (
    <div className="pw gc-page">
      <section className="gc-page-header gc-fade-up rounded-[34px] px-6 py-7 sm:px-8 sm:py-8">
        <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[52rem]">
            <div className="gc-overline">Cross-job intelligence</div>
            <h1 className="gc-page-title mt-3">Insights</h1>
            <p className="gc-page-copy mt-4 max-w-[44rem]">
              Look across active work for repeat buying opportunities, shared material windows, and leverage the office can use across multiple jobs.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="gc-micro-pill">{sorted.length} signals detected</span>
              <span className="gc-micro-pill">{horizonDays}-day planning horizon</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((window) => {
              const active = horizonDays === window;
              return (
                <button
                  key={window}
                  type="button"
                  onClick={() => setHorizonDays(window as 7 | 14 | 30)}
                  className={`inline-flex h-10 items-center rounded-xl border px-4 text-[12px] font-semibold transition ${
                    active
                      ? "border-[#5f81ff]/20 bg-[linear-gradient(135deg,#5f81ff,#2f5dff)] text-white shadow-[0_16px_30px_rgba(49,95,255,0.24)]"
                      : "border-white/12 bg-white/[0.05] text-white hover:bg-white/[0.1]"
                  }`}
                >
                  {window} days
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {insightsQuery.isLoading ? (
        <div className="mt-5 rounded-[30px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(245,248,255,0.82))] px-8 py-10 text-[15px] text-[var(--gc-ink-soft)] shadow-[var(--gc-shadow)]">
          Loading multi-job insights...
        </div>
      ) : null}
      {insightsQuery.isError ? (
        <div className="mt-5 rounded-[30px] border border-[var(--gc-line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(245,248,255,0.82))] px-8 py-10 text-[15px] text-[var(--gc-ink-soft)] shadow-[var(--gc-shadow)]">
          Insights unavailable. Check backend connectivity and auth.
        </div>
      ) : null}

      {data ? (
        <>
          <section className="gc-kpi-grid gc-four mt-5">
            <article className="gc-kpi-card neutral gc-fade-up gc-delay-1">
              <div className="gc-kpi-label">Jobs considered</div>
              <div className="gc-kpi-value">{data.summary.active_jobs_considered}</div>
              <div className="gc-kpi-hint">{data.summary.opportunities_found} opportunities found</div>
            </article>
            <article className="gc-kpi-card ok gc-fade-up gc-delay-2">
              <div className="gc-kpi-label">Potential savings</div>
              <div className="gc-kpi-value">{formatCurrency(data.summary.estimated_total_savings_amount)}</div>
              <div className="gc-kpi-hint ok">Grouped order leverage in this window</div>
            </article>
            <article className="gc-kpi-card neutral gc-fade-up gc-delay-3">
              <div className="gc-kpi-label">Planning horizon</div>
              <div className="gc-kpi-value">{horizonDays}d</div>
              <div className="gc-kpi-hint">Active forward-looking coordination window</div>
            </article>
            <article className="gc-kpi-card warn gc-fade-up gc-delay-4">
              <div className="gc-kpi-label">Grouped orders</div>
              <div className="gc-kpi-value">{sorted.length}</div>
              <div className="gc-kpi-hint warn">Signals worth acting on with suppliers</div>
            </article>
          </section>

          <section className="gc-stack-grid mt-5">
            <div className="space-y-5">
              {sorted.length === 0 ? (
                <div className="gc-stack-card gc-fade-up gc-delay-2">
                  <div className="gc-stack-header">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                        <Radar className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="gc-stack-title">No grouped order opportunities</div>
                        <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">Nothing is clustering tightly enough in this horizon yet.</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                sorted.map((opportunity, index) => (
                  <article key={opportunity.group_key} className={`gc-stack-card gc-fade-up gc-delay-${Math.min((index % 4) + 1, 4)}`}>
                    <div className="gc-stack-header">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                          <Layers3 className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="gc-stack-title">{opportunity.job_count} jobs can share one order</div>
                          <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">{opportunity.rationale}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={confidenceTone(opportunity.confidence)}>{opportunity.confidence}</span>
                        <span className="gc-chip info">{formatCurrency(opportunity.estimated_savings_amount)}</span>
                      </div>
                    </div>

                    <div className="grid gap-5 px-6 py-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                      <div className="rounded-[24px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.68)] p-5">
                        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Jobs in group</div>
                        <div className="mt-4 space-y-3">
                          {opportunity.jobs.map((job) => (
                            <div key={job.id} className="rounded-[18px] border border-[var(--gc-line)] bg-white/78 px-4 py-4">
                              <div className="text-[16px] font-semibold text-[var(--gc-ink)]">{job.name}</div>
                              <div className="mt-2 font-mono text-[11px] text-[var(--gc-ink-muted)]">
                                {job.id} · {job.days_until_completion ?? "?"} days · {formatCurrency(job.contract_value)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[var(--gc-line)] bg-[rgba(255,255,255,0.68)] p-5">
                        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--gc-ink-muted)]">Suggested combined order</div>
                        <div className="mt-4 space-y-3">
                          {opportunity.suggested_materials.map((item) => (
                            <div key={item} className="rounded-[18px] border border-[var(--gc-line)] bg-white/78 px-4 py-4">
                              <div className="text-[16px] font-semibold text-[var(--gc-ink)]">{item}</div>
                              <div className="mt-2 font-mono text-[11px] text-[var(--gc-ink-muted)]">
                                Order window · {opportunity.recommended_order_window_days} days
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--gc-line)] px-6 py-5">
                      <div className="flex flex-wrap gap-2">
                        <span className="gc-chip soft">{opportunity.job_type}</span>
                        <span className="gc-chip soft">{opportunity.contract_type}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-[22px] font-semibold tracking-[-0.04em] text-[var(--gc-ink)]">
                          {formatCurrency(opportunity.estimated_savings_amount)}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[var(--gc-ink-muted)]">
                          {opportunity.estimated_savings_pct}% est. savings
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            <aside className="space-y-5">
              <section className="gc-side-panel gc-fade-up gc-delay-3">
                <div className="gc-side-body">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(29,155,102,0.12)] text-[#147a4f]">
                      <TrendingUp className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="gc-stack-title">Operator actions</div>
                      <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">Move from insight to workflow.</div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    <Link to="/jobs" className="inline-flex h-10 w-full items-center justify-between rounded-xl border border-[var(--gc-line)] bg-white/72 px-4 text-[12px] font-semibold text-[var(--gc-ink)] no-underline transition hover:border-[var(--gc-line-strong)] hover:bg-white">
                      <span>Open jobs board</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <Link to="/quote" className="inline-flex h-10 w-full items-center justify-between rounded-xl border border-[var(--gc-line)] bg-white/72 px-4 text-[12px] font-semibold text-[var(--gc-ink)] no-underline transition hover:border-[var(--gc-line-strong)] hover:bg-white">
                      <span>Create new quote</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </section>

              <section className="gc-side-panel gc-fade-up gc-delay-4">
                <div className="gc-side-body">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(49,95,255,0.1)] text-[#214be0]">
                      <Sparkles className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="gc-stack-title">What this page is for</div>
                      <div className="mt-1 text-[13px] text-[var(--gc-ink-soft)]">Use these signals to act across jobs, not just admire patterns.</div>
                    </div>
                  </div>
                  <p className="mt-5 text-[14px] leading-7 text-[var(--gc-ink-soft)]">
                    Insights are strongest when they point to a real purchasing or planning move. If a pattern does not change an order, a quote, or a field decision, it should not dominate this screen.
                  </p>
                </div>
              </section>
            </aside>
          </section>
        </>
      ) : null}
    </div>
  );
}
