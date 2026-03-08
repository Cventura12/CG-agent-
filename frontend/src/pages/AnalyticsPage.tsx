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

export function AnalyticsPage() {
  const { userId } = useAuth();
  const currentUserId = userId ?? null;
  const [days, setDays] = useState<7 | 30>(30);

  const analyticsQuery = useAnalytics(currentUserId, days);
  const data = analyticsQuery.data;

  const quoteTurnaroundMinutes = data?.quotes.avg_turnaround_minutes ?? 0;
  const quoteConversion = data?.quotes.conversion_rate_pct ?? data?.quotes.approval_rate_pct ?? 0;
  const followupEffectiveness = data?.followup.effectiveness_rate_pct ?? 0;
  const queueBacklog = data?.queue.backlog ?? data?.queue.pending ?? 0;
  const transcriptBacklog = data?.queue.transcript_inbox ?? 0;
  const transcriptLinkage = data?.transcripts.linkage_rate_pct ?? 0;

  return (
    <div className="pw">
      <div className="ph">
        <div className="eyebrow">System Performance</div>
        <div className="ptitle">Analytics</div>
        <div className="psub">Last {days} days · Contractor operations</div>
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
              {
                k: "Quote Turnaround",
                v: `${quoteTurnaroundMinutes}m`,
                delta: `${data.quotes.generated} quotes generated`,
                dir: quoteTurnaroundMinutes > 0 && quoteTurnaroundMinutes <= 60 ? "up" : "flat",
              },
              {
                k: "Quote Conversion",
                v: `${quoteConversion}%`,
                delta: `${data.quotes.approved + data.quotes.edited} approved or edited`,
                dir: quoteConversion >= 60 ? "up" : "flat",
              },
              {
                k: "Follow-up",
                v: `${followupEffectiveness}%`,
                delta: `${data.followup.active} active sequences`,
                dir: followupEffectiveness >= 50 ? "up" : "flat",
              },
              {
                k: "Queue Backlog",
                v: String(queueBacklog),
                delta: `${transcriptBacklog} transcript inbox`,
                dir: queueBacklog > 10 ? "dn" : "flat",
              },
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
              <div className="ph2"><span className="ptl">Queue Pressure</span></div>
              <div className="pb vs" style={{ gap: 12 }}>
                {[
                  { label: "Job-backed drafts", value: queueBacklog, pct: Math.min(100, queueBacklog * 10), color: "var(--amber-hot)" },
                  { label: "Transcript inbox", value: transcriptBacklog, pct: Math.min(100, transcriptBacklog * 20), color: "var(--blue-hi)" },
                  { label: "Owner updates", value: data.queue.by_type["owner-update"] ?? 0, pct: Math.min(100, (data.queue.by_type["owner-update"] ?? 0) * 20), color: "var(--green-hi)" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="sp" style={{ marginBottom: 5 }}>
                      <span style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "1px", textTransform: "uppercase" }}>{row.label}</span>
                      <span style={{ fontFamily: "'Syne Mono', monospace", fontSize: 10, color: row.color }}>{row.value}</span>
                    </div>
                    <div className="pt"><div className="pf" style={{ width: `${row.pct}%`, background: row.color }} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="ph2"><span className="ptl">Transcript Intake</span></div>
              <div className="pb vs" style={{ gap: 12 }}>
                {[
                  { label: "Ingested", value: data.transcripts.ingested, pct: 100, color: "var(--amber-hot)" },
                  { label: "Linked", value: data.transcripts.linked, pct: transcriptLinkage, color: "var(--green-hi)" },
                  {
                    label: "Estimate requests",
                    value: data.transcripts.estimate_requests,
                    pct: data.transcripts.ingested > 0 ? Math.round((data.transcripts.estimate_requests / data.transcripts.ingested) * 100) : 0,
                    color: "var(--blue-hi)",
                  },
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
            <div className="ph2"><span className="ptl">Operational Signals</span></div>
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
                  <td>Quote conversion</td>
                  <td>{quoteConversion}%</td>
                  <td>{data.quotes.approved + data.quotes.edited} approved or edited</td>
                  <td>{quoteConversion >= 60 ? "Healthy" : "Watch"}</td>
                </tr>
                <tr>
                  <td>Quote delivery failed</td>
                  <td>{data.delivery.failed}</td>
                  <td>{data.delivery.sent} deliveries sent</td>
                  <td>{data.delivery.failed > 0 ? "Risk" : "Clear"}</td>
                </tr>
                <tr>
                  <td>Follow-up effectiveness</td>
                  <td>{followupEffectiveness}%</td>
                  <td>{data.followup.reminders_sent} reminders sent</td>
                  <td>{followupEffectiveness >= 50 ? "Healthy" : "Watch"}</td>
                </tr>
                <tr>
                  <td>Transcript linkage</td>
                  <td>{transcriptLinkage}%</td>
                  <td>{data.transcripts.unlinked} still need routing</td>
                  <td>{transcriptLinkage >= 70 ? "Healthy" : "Watch"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="panel ani a3">
            <div className="ph2 sp"><span className="ptl">Runtime Health</span><span className="tag tb">{data.runtime.trace_rows} TRACES</span></div>
            <div className="pb">
              <div className="pt" style={{ height: 7, marginBottom: 10 }}><div className="pf" style={{ width: `${Math.max(4, 100 - Math.min(100, data.runtime.trace_error_rate_pct * 10))}%`, background: "var(--blue-hi)" }} /></div>
              <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", lineHeight: 1.9, letterSpacing: "0.5px" }}>
                TRACE ROWS SHOW WORKFLOW HEALTH UNDER LOAD<br />
                QUEUE PRESSURE SHOWS WHERE CONTRACTOR REVIEW IS BACKING UP<br />
                TRANSCRIPT LINKAGE SHOWS HOW OFTEN CALLS TURN INTO ACTIONABLE WORK<br />
                AVERAGE QUOTE VALUE THIS WINDOW: {formatCurrency(data.quotes.avg_quote_value)}
              </div>
            </div>
          </div>

          {data.warnings.length > 0 ? (
            <div className="alert awarn" style={{ marginTop: 14 }}>
              <span>!</span>
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
