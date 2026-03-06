import { useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";

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
  if (confidence === "high") return "tg";
  if (confidence === "medium") return "ta";
  return "tr";
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
    <div className="pw">
      <div className="ph">
        <div className="eyebrow">Intelligence Layer</div>
        <div className="ptitle">Insights</div>
        <div className="psub">Cross-job pattern analysis · {sorted.length} signals detected</div>
      </div>

      <div className="tabrow">
        {[7, 14, 30].map((window) => (
          <span key={window} className={`tabt ${horizonDays === window ? "active" : ""}`} onClick={() => setHorizonDays(window as 7 | 14 | 30)}>
            {window} day window
          </span>
        ))}
      </div>

      {insightsQuery.isLoading ? <div className="panel"><div className="pb">Loading multi-job insights...</div></div> : null}
      {insightsQuery.isError ? <div className="panel"><div className="pb">Insights unavailable. Check backend connectivity and auth.</div></div> : null}

      {data ? (
        <>
          <div className="sstrip c2 ani" style={{ marginBottom: 14 }}>
            {[
              { k: "Jobs Considered", v: String(data.summary.active_jobs_considered), delta: `${data.summary.opportunities_found} opportunities`, dir: "flat" },
              { k: "Potential Savings", v: formatCurrency(data.summary.estimated_total_savings_amount), delta: `${horizonDays} day planning window`, dir: data.summary.estimated_total_savings_amount > 0 ? "up" : "flat" },
            ].map((stat) => (
              <div className="scell" key={stat.k}>
                <div className="sk">{stat.k}</div>
                <div className="sv">{stat.v}</div>
                <div className={`sd ${stat.dir}`}>{stat.delta}</div>
              </div>
            ))}
          </div>

          <div className="vs">
            {sorted.length === 0 ? (
              <div className="panel"><div className="pb">No grouped order opportunities found in this horizon.</div></div>
            ) : (
              sorted.map((opportunity, index) => (
                <div className={`panel ani a${index % 4}`} key={opportunity.group_key}>
                  <div className="ph2 hs">
                    <span style={{ fontSize: 15 }}>{opportunity.estimated_savings_amount > 0 ? "?" : "•"}</span>
                    <span className={`tag ${confidenceTone(opportunity.confidence)}`}>{opportunity.confidence}</span>
                    <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 600, color: "var(--cream)", letterSpacing: "0.5px", marginLeft: 4 }}>
                      {opportunity.job_count} jobs can share one order
                    </span>
                  </div>
                  <div className="pb">
                    <div style={{ fontSize: 12, color: "var(--steel)", lineHeight: 1.6, marginBottom: 10 }}>{opportunity.rationale}</div>
                    <div className="g2">
                      <div>
                        <div className="lbl" style={{ marginBottom: 6 }}>Jobs in group</div>
                        <div className="vs">
                          {opportunity.jobs.map((job) => (
                            <div key={job.id} className="drow" style={{ cursor: "default" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, color: "var(--cream)" }}>{job.name}</div>
                                <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", marginTop: 2, letterSpacing: "0.5px" }}>
                                  {job.id} · {job.days_until_completion ?? "?"} DAYS · {formatCurrency(job.contract_value)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="lbl" style={{ marginBottom: 6 }}>Suggested combined order</div>
                        <div className="vs">
                          {opportunity.suggested_materials.map((item) => (
                            <div key={item} className="drow" style={{ cursor: "default" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, color: "var(--cream)" }}>{item}</div>
                                <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", marginTop: 2, letterSpacing: "0.5px" }}>
                                  ORDER WINDOW · {opportunity.recommended_order_window_days} DAYS
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="sp" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
                      <div className="hs" style={{ gap: 6, flexWrap: "wrap" }}>
                        <span className="tag tb">{opportunity.job_type}</span>
                        <span className="tag ts">{opportunity.contract_type}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, color: "var(--amber-hot)" }}>
                          {formatCurrency(opportunity.estimated_savings_amount)}
                        </div>
                        <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", letterSpacing: "0.5px" }}>
                          {opportunity.estimated_savings_pct}% EST. SAVINGS
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="panel" style={{ marginTop: 14 }}>
            <div className="ph2"><span className="ptl">Operator Actions</span></div>
            <div className="pb">
              <div className="hs" style={{ flexWrap: "wrap" }}>
                <Link to="/jobs" className="btn bw sm">View jobs ?</Link>
                <Link to="/quote" className="btn bw sm">New quote ?</Link>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

