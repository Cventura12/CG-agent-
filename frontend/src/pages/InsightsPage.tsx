import { useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

import { PageHeader } from "../components/PageHeader";
import { SurfaceCard } from "../components/SurfaceCard";
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
    return [...data.opportunities].sort(
      (a, b) => b.estimated_savings_amount - a.estimated_savings_amount
    );
  }, [data]);

  return (
    <main className="page-wrap">
      <div className="section-stack">
        <PageHeader
          eyebrow="Insights"
          title="Cross-job leverage"
          description="Find jobs with similar scope and place one supplier order to reduce cost, delivery churn, and coordination waste."
          actions={
            <div className="flex gap-2">
              {[7, 14, 30].map((window) => (
                <button
                  key={window}
                  type="button"
                  onClick={() => setHorizonDays(window as 7 | 14 | 30)}
                  className={`rounded-2xl px-3 py-2 font-mono text-[11px] uppercase tracking-wider ${
                    horizonDays === window
                      ? "border border-orange/50 bg-orange/10 text-orange"
                      : "border border-border bg-bg/55 text-muted hover:border-orange hover:text-orange"
                  }`}
                >
                  {window} day window
                </button>
              ))}
            </div>
          }
        />

        {insightsQuery.isLoading ? (
          <SurfaceCard eyebrow="Loading" title="Pulling insights">
            <p className="text-sm text-muted">Loading multi-job insights...</p>
          </SurfaceCard>
        ) : null}

        {insightsQuery.isError ? (
          <SurfaceCard eyebrow="Unavailable" title="Insights not available">
            <p className="text-sm text-red-200">Could not load insights. Check backend connectivity and auth.</p>
          </SurfaceCard>
        ) : null}

        {data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Jobs considered</p>
                <p className="mt-2 text-2xl font-semibold text-text">{data.summary.active_jobs_considered}</p>
              </article>
              <article className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Opportunities</p>
                <p className="mt-2 text-2xl font-semibold text-text">{data.summary.opportunities_found}</p>
              </article>
              <article className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Potential savings</p>
                <p className="mt-2 text-2xl font-semibold text-text">
                  {formatCurrency(data.summary.estimated_total_savings_amount)}
                </p>
              </article>
            </section>

            <section className="space-y-3">
              {sorted.length === 0 ? (
                <SurfaceCard eyebrow="No opportunities" title="Nothing grouped in this horizon">
                  <p className="text-sm text-muted">No grouped order opportunities found in this horizon.</p>
                </SurfaceCard>
              ) : (
                sorted.map((opportunity) => (
                  <article key={opportunity.group_key} className="surface-panel px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
                          {opportunity.job_type} / {opportunity.contract_type}
                        </p>
                        <h2 className="mt-1 text-lg font-semibold text-text">
                          {opportunity.job_count} jobs can share one order
                        </h2>
                        <p className="mt-1 text-sm text-muted">{opportunity.rationale}</p>
                      </div>
                      <div className="rounded-xl border border-green/40 bg-green/10 px-3 py-2 text-right">
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-green">Estimated savings</p>
                        <p className="mt-1 text-lg font-semibold text-text">
                          {formatCurrency(opportunity.estimated_savings_amount)}
                        </p>
                        <p className="text-xs text-muted">{opportunity.estimated_savings_pct}%</p>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-border bg-bg px-3 py-3">
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Jobs in group</p>
                        <ul className="mt-2 space-y-2 text-sm text-text/90">
                          {opportunity.jobs.map((job) => (
                            <li key={job.id}>
                              {job.name}{" "}
                              <span className="text-muted">
                                ({job.days_until_completion ?? "?"}d, {formatCurrency(job.contract_value)})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl border border-border bg-bg px-3 py-3">
                        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                          Suggested combined order
                        </p>
                        <ul className="mt-2 space-y-2 text-sm text-text/90">
                          {opportunity.suggested_materials.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                        <p className="mt-3 text-xs text-muted">
                          Confidence: {opportunity.confidence}. Recommended order window:{" "}
                          {opportunity.recommended_order_window_days} days.
                        </p>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
