import { useMemo, useState } from "react";
import { useAuth, useClerk, UserButton } from "@clerk/clerk-react";

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
  const { signOut } = useClerk();
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
    <main className="min-h-screen bg-bg px-3 pb-6 pt-3 text-text sm:px-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">Multi-Job Insights</p>
              <h1 className="mt-1 text-xl font-semibold text-text">Combined material order opportunities</h1>
              <p className="mt-1 text-sm text-muted">
                Find jobs with similar scope and place one supplier order to reduce cost and delivery churn.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void signOut({ redirectUrl: "/onboarding" })}
                className="rounded-md border border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition hover:border-orange hover:text-orange"
              >
                Sign Out
              </button>
              <UserButton afterSignOutUrl="/onboarding" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {[7, 14, 30].map((window) => (
              <button
                key={window}
                type="button"
                onClick={() => setHorizonDays(window as 7 | 14 | 30)}
                className={`rounded-md px-3 py-2 font-mono text-[11px] uppercase tracking-wider ${
                  horizonDays === window
                    ? "border border-orange/50 bg-orange/10 text-orange"
                    : "border border-border text-muted hover:border-orange hover:text-orange"
                }`}
              >
                {window} day window
              </button>
            ))}
          </div>
        </header>

        {insightsQuery.isLoading ? (
          <section className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            Loading multi-job insights...
          </section>
        ) : null}

        {insightsQuery.isError ? (
          <section className="rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-200">
            Could not load insights. Check backend connectivity and auth.
          </section>
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
                <article className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
                  No grouped order opportunities found in this horizon.
                </article>
              ) : (
                sorted.map((opportunity) => (
                  <article key={opportunity.group_key} className="rounded-2xl border border-border bg-surface p-4">
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
