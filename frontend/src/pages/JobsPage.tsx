import { useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";

import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Awaiting first update";
  return parsed.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function healthTone(health: "on-track" | "at-risk" | "blocked"): "good" | "warn" | "risk" {
  if (health === "blocked") return "risk";
  if (health === "at-risk") return "warn";
  return "good";
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "complete") return "tg";
  if (normalized === "on-hold") return "ta";
  return "tb";
}

export function JobsPage() {
  const { userId } = useAuth();
  const isOnline = useOnlineStatus();
  const jobsQuery = useJobs(userId ?? null);
  const jobs = jobsQuery.data?.jobs ?? [];
  const [tab, setTab] = useState<"active" | "complete" | "all">("active");

  const filtered = useMemo(() => {
    if (tab === "all") return jobs;
    if (tab === "complete") return jobs.filter((job) => job.status === "complete");
    return jobs.filter((job) => job.status !== "complete");
  }, [jobs, tab]);

  const riskCount = jobs.filter((job) => job.health !== "on-track").length;

  return (
    <div className="pw">
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="eyebrow">Field Operations</div>
            <div className="ptitle">Jobs</div>
            <div className="psub">{jobs.length} total · {jobs.filter((job) => job.status !== "complete").length} active</div>
          </div>
          <div className="hs" style={{ gap: 8 }}>
            <span className={`tag ${isOnline ? "tg" : "ta"}`}>{isOnline ? "Live" : "Offline"}</span>
            <Link to="/quote" className="cta him">＋ NEW QUOTE</Link>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="ph2"><span className="ptl">Risk radar</span></div>
        <div className="pb">
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", color: "var(--cream)", marginBottom: 6 }}>Where jobs are drifting</div>
          <div className="psub" style={{ marginTop: 0 }}>{riskCount} jobs need closer attention right now.</div>
        </div>
      </div>

      <div className="tabrow">
        {[{ id: "active", label: "active" }, { id: "complete", label: "complete" }, { id: "all", label: "all" }].map((entry) => (
          <span key={entry.id} className={`tabt ${tab === entry.id ? "active" : ""}`} onClick={() => setTab(entry.id as typeof tab)}>{entry.label}</span>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="ph2"><span className="ptl">Operational list</span></div>
      </div>

      {jobsQuery.isLoading ? <div className="panel"><div className="pb">Loading jobs...</div></div> : null}
      {!jobsQuery.isLoading && filtered.length === 0 ? <div className="panel"><div className="pb">No jobs found in this filter.</div></div> : null}

      <div className="vs">
        {filtered.map((job, index) => (
          <Link key={job.id} to={`/jobs/${job.id}`} className={`panel ani a${index % 4}`} style={{ cursor: "pointer", textDecoration: "none" }}>
            <div className="pb">
              <div className="sp">
                <div className="hs" style={{ gap: 9 }}>
                  <span className={`hdot ${healthTone(job.health)}`} />
                  <div>
                    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 600, color: "var(--cream)", letterSpacing: "0.5px" }}>{job.name}</div>
                    <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", marginTop: 2, letterSpacing: "0.8px" }}>{job.id} · {job.type.toUpperCase()} · {job.contract_type.toUpperCase()}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 17, fontWeight: 600, color: "var(--cream)" }}>{formatCurrency(job.contract_value)}</div>
                  <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", marginTop: 2 }}>{formatTimestamp(job.last_updated)}</div>
                </div>
              </div>
              <div className="hs" style={{ marginTop: 9, gap: 5 }}>
                <span className={`tag ${statusTone(job.status)} td`}>{job.status}</span>
                <span className="tag ts">{job.open_items.length} OPEN ITEMS</span>
                {job.health !== "on-track" ? <span className={`tag ${job.health === "blocked" ? "tr" : "ta"}`}>⚠ {job.health === "blocked" ? "BLOCKED" : "AT RISK"}</span> : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
