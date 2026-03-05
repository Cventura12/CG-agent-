import { useMemo, useState } from "react";
import { UserButton, useAuth, useClerk } from "@clerk/clerk-react";

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

export function AnalyticsPage() {
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const currentUserId = userId ?? null;
  const [days, setDays] = useState<7 | 30>(30);

  const analyticsQuery = useAnalytics(currentUserId, days);
  const data = analyticsQuery.data;

  const flowEntries = useMemo(() => {
    if (!data) {
      return [];
    }
    return Object.entries(data.runtime.flow_breakdown).sort((a, b) => b[1] - a[1]);
  }, [data]);

  return (
    <main className="min-h-screen bg-bg px-3 pb-6 pt-3 text-text sm:px-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="rounded-2xl border border-border bg-surface/95 p-4 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">Usage Analytics</p>
              <h1 className="mt-1 text-xl font-semibold text-text">What contractors actually use</h1>
              <p className="mt-1 text-sm text-muted">Track quote conversion, delivery performance, and runtime health.</p>
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
            <button
              type="button"
              onClick={() => setDays(7)}
              className={`rounded-md px-3 py-2 font-mono text-[11px] uppercase tracking-wider ${
                days === 7
                  ? "border border-orange/50 bg-orange/10 text-orange"
                  : "border border-border text-muted hover:border-orange hover:text-orange"
              }`}
            >
              Last 7 days
            </button>
            <button
              type="button"
              onClick={() => setDays(30)}
              className={`rounded-md px-3 py-2 font-mono text-[11px] uppercase tracking-wider ${
                days === 30
                  ? "border border-orange/50 bg-orange/10 text-orange"
                  : "border border-border text-muted hover:border-orange hover:text-orange"
              }`}
            >
              Last 30 days
            </button>
          </div>
        </header>

        {analyticsQuery.isLoading ? (
          <section className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
            Loading analytics...
          </section>
        ) : null}

        {analyticsQuery.isError ? (
          <section className="rounded-2xl border border-red-400/40 bg-red-400/10 p-4 text-sm text-red-200">
            Could not load analytics. Check backend connectivity and auth.
          </section>
        ) : null}

        {data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <article className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Quotes generated</p>
                <p className="mt-2 text-2xl font-semibold text-text">{data.quotes.generated}</p>
              </article>
              <article className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Approval rate</p>
                <p className="mt-2 text-2xl font-semibold text-text">{data.quotes.approval_rate_pct}%</p>
                <p className="mt-1 text-xs text-muted">
                  {data.quotes.approved + data.quotes.edited} approved/edit, {data.quotes.discarded} discarded
                </p>
              </article>
              <article className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Avg quote value</p>
                <p className="mt-2 text-2xl font-semibold text-text">{formatCurrency(data.quotes.avg_quote_value)}</p>
              </article>
              <article className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Memory updates</p>
                <p className="mt-2 text-2xl font-semibold text-text">{data.quotes.memory_updates}</p>
              </article>
            </section>

            <section className="grid gap-3 lg:grid-cols-2">
              <article className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Client delivery</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-bg px-3 py-3">
                    <p className="text-xs text-muted">Sent</p>
                    <p className="mt-1 text-lg font-semibold text-text">{data.delivery.sent}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg px-3 py-3">
                    <p className="text-xs text-muted">Failed</p>
                    <p className="mt-1 text-lg font-semibold text-text">{data.delivery.failed}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {Object.entries(data.delivery.channel_breakdown).map(([channel, count]) => (
                    <div key={channel} className="flex items-center justify-between rounded-xl border border-border bg-bg px-3 py-2">
                      <span className="text-sm text-text uppercase">{channel}</span>
                      <span className="font-mono text-xs text-muted">{count}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Update loop</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-bg px-3 py-3">
                    <p className="text-xs text-muted">Updates ingested</p>
                    <p className="mt-1 text-lg font-semibold text-text">{data.updates.ingested}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg px-3 py-3">
                    <p className="text-xs text-muted">Drafts suggested</p>
                    <p className="mt-1 text-lg font-semibold text-text">{data.updates.drafts_suggested}</p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-bg px-3 py-3">
                    <p className="text-xs text-muted">Queue pending</p>
                    <p className="mt-1 text-lg font-semibold text-text">{data.queue.pending}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-bg px-3 py-3">
                    <p className="text-xs text-muted">Queue edited</p>
                    <p className="mt-1 text-lg font-semibold text-text">{data.queue.edited}</p>
                  </div>
                </div>
              </article>
            </section>

            <section className="rounded-2xl border border-border bg-surface p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Runtime health</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-bg px-3 py-3">
                  <p className="text-xs text-muted">Trace rows</p>
                  <p className="mt-1 text-lg font-semibold text-text">{data.runtime.trace_rows}</p>
                </div>
                <div className="rounded-xl border border-border bg-bg px-3 py-3">
                  <p className="text-xs text-muted">Error rate</p>
                  <p className="mt-1 text-lg font-semibold text-text">{data.runtime.trace_error_rate_pct}%</p>
                </div>
                <div className="rounded-xl border border-border bg-bg px-3 py-3">
                  <p className="text-xs text-muted">Avg node latency</p>
                  <p className="mt-1 text-lg font-semibold text-text">{data.runtime.avg_node_latency_ms} ms</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {flowEntries.map(([flow, count]) => (
                  <div key={flow} className="flex items-center justify-between rounded-xl border border-border bg-bg px-3 py-2">
                    <span className="text-sm text-text uppercase">{flow}</span>
                    <span className="font-mono text-xs text-muted">{count}</span>
                  </div>
                ))}
              </div>
            </section>

            {data.warnings.length > 0 ? (
              <section className="rounded-2xl border border-yellow/50 bg-yellow/10 p-4 text-sm text-yellow">
                <p className="font-medium text-text">Partial analytics</p>
                <p className="mt-1">
                  Some tables are missing or unavailable. Apply latest migrations to unlock full metrics.
                </p>
                <ul className="mt-2 space-y-1">
                  {data.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
