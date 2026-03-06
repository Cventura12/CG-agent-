import { useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";

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

  const peakFlow = Math.max(...flowEntries.map(([, count]) => count), 1);

  return (
    <div className="pw">
      <div className="ph">
        <div className="eyebrow">System Performance</div>
        <div className="ptitle">Analytics</div>
        <div className="psub">Last {days} days · All trades</div>
      </div>

      <div className="tabrow">
        {[7, 30].map((window) => (
          <span key={window} className={`tabt ${days === window ? "active" : ""}`} onClick={() => setDays(window as 7 | 30)}>
            Last {window} days
          </span>
        ))}
      </div>

      {analyticsQuery.isLoading ? <div className="panel"><div className="pb">Loading analytics...</div></div> : null}
      {analyticsQuery.isError ? <div className="panel"><div className="pb">Analytics unavailable. Check backend connectivity and auth.</div></div> : null}

      {data ? (
        <>
          <div className="sstrip c4 ani" style={{ marginBottom: 14 }}>
            {[
              { k: "Quotes Sent", v: String(data.quotes.generated), delta: `${data.quotes.approval_rate_pct}% approval rate`, dir: data.quotes.approval_rate_pct >= 60 ? "up" : "flat" },
              { k: "Approval Rate", v: `${data.quotes.approval_rate_pct}%`, delta: `${data.quotes.approved + data.quotes.edited} approved/edit`, dir: data.quotes.approval_rate_pct >= 60 ? "up" : "flat" },
              { k: "Avg Quote", v: formatCurrency(data.quotes.avg_quote_value), delta: `${data.quotes.memory_updates} memory updates`, dir: data.quotes.memory_updates > 0 ? "up" : "flat" },
              { k: "Runtime", v: `${data.runtime.avg_node_latency_ms}ms`, delta: `${data.runtime.trace_error_rate_pct}% error rate`, dir: data.runtime.trace_error_rate_pct > 5 ? "dn" : "up" },
            ].map((stat) => (
              <div className="scell" key={stat.k}>
                <div className="sk">{stat.k}</div>
                <div className="sv">{stat.v}</div>
                <div className={`sd ${stat.dir}`}>{stat.delta}</div>
              </div>
            ))}
          </div>

          <div className="g2 ani a1" style={{ gap: 14, marginBottom: 14 }}>
            <div className="panel">
              <div className="ph2"><span className="ptl">Weekly Activity</span></div>
              <div className="pb">
                <div className="bchart">
                  {flowEntries.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--steel)" }}>No runtime flow data yet.</div>
                  ) : (
                    flowEntries.map(([flow, count], index) => (
                      <div
                        key={flow}
                        className={`bbar ${index === 0 ? "peak" : ""}`}
                        style={{ height: `${Math.max(18, Math.round((count / peakFlow) * 100))}%` }}
                        title={`${flow}: ${count}`}
                      />
                    ))
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", marginTop: 6, letterSpacing: "0.5px" }}>
                  {flowEntries.slice(0, 7).map(([flow]) => <span key={flow}>{flow.slice(0, 1).toUpperCase()}</span>)}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="ph2"><span className="ptl">Queue Outcomes</span></div>
              <div className="pb vs" style={{ gap: 12 }}>
                {[
                  { label: "Approved", value: data.queue.approved, pct: data.queue.pending + data.queue.approved + data.queue.edited + data.queue.discarded > 0 ? Math.round((data.queue.approved / Math.max(1, data.queue.pending + data.queue.approved + data.queue.edited + data.queue.discarded)) * 100) : 0, color: "var(--green-hi)" },
                  { label: "Edited", value: data.queue.edited, pct: data.queue.pending + data.queue.approved + data.queue.edited + data.queue.discarded > 0 ? Math.round((data.queue.edited / Math.max(1, data.queue.pending + data.queue.approved + data.queue.edited + data.queue.discarded)) * 100) : 0, color: "var(--amber-hot)" },
                  { label: "Discarded", value: data.queue.discarded, pct: data.queue.pending + data.queue.approved + data.queue.edited + data.queue.discarded > 0 ? Math.round((data.queue.discarded / Math.max(1, data.queue.pending + data.queue.approved + data.queue.edited + data.queue.discarded)) * 100) : 0, color: "var(--red-hi)" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="sp" style={{ marginBottom: 5 }}>
                      <span style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "1px", textTransform: "uppercase" }}>{row.label}</span>
                      <span style={{ fontFamily: "'Syne Mono', monospace", fontSize: 10, color: row.color }}>{row.value} <span style={{ color: "var(--fog)", fontSize: 8 }}>({row.pct}%)</span></span>
                    </div>
                    <div className="pt"><div className="pf" style={{ width: `${row.pct}%`, background: row.color }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel ani a2" style={{ marginBottom: 14 }}>
            <div className="ph2"><span className="ptl">Delivery + Runtime</span></div>
            <table className="lit" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Signal</th>
                  <th>Count</th>
                  <th>Detail</th>
                  <th style={{ textAlign: "right" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Quote delivery sent</td>
                  <td>{data.delivery.sent}</td>
                  <td>{Object.keys(data.delivery.channel_breakdown).length} channels</td>
                  <td>{data.delivery.failed === 0 ? "Stable" : "Watch"}</td>
                </tr>
                <tr>
                  <td>Quote delivery failed</td>
                  <td>{data.delivery.failed}</td>
                  <td>Retry on provider failure</td>
                  <td>{data.delivery.failed > 0 ? "Risk" : "Clear"}</td>
                </tr>
                <tr>
                  <td>Updates ingested</td>
                  <td>{data.updates.ingested}</td>
                  <td>{data.updates.drafts_suggested} drafts suggested</td>
                  <td>{data.updates.ingested > 0 ? "Live" : "Idle"}</td>
                </tr>
                <tr>
                  <td>Trace rows</td>
                  <td>{data.runtime.trace_rows}</td>
                  <td>{data.runtime.trace_errors} errors</td>
                  <td>{data.runtime.trace_error_rate_pct > 5 ? "Watch" : "Healthy"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="panel ani a3">
            <div className="ph2 sp"><span className="ptl">Estimating Memory</span><span className="tag tb">{data.quotes.memory_updates} UPDATES</span></div>
            <div className="pb">
              <div className="pt" style={{ height: 7, marginBottom: 10 }}><div className="pf" style={{ width: `${Math.min(100, data.quotes.approval_rate_pct)}%`, background: "var(--blue-hi)" }} /></div>
              <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", lineHeight: 1.9, letterSpacing: "0.5px" }}>
                MEMORY UPDATES TRACK APPROVED + EDITED QUOTES<br />
                QUEUE OUTCOMES SHOW WHETHER DRAFTS ARE ACTUALLY USABLE<br />
                TRACE ROWS EXPOSE RUNTIME HEALTH UNDER LOAD
              </div>
            </div>
          </div>

          {data.warnings.length > 0 ? (
            <div className="alert awarn" style={{ marginTop: 14 }}>
              <span>?</span>
              <div>
                <strong style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "1px" }}>PARTIAL ANALYTICS</strong>
                <div style={{ marginTop: 3 }}>{data.warnings.join(" ")}</div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

