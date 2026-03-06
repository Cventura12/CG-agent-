import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

import { fetchContractorBriefing, hasContractorApiCredentials } from "../api/contractor";
import { useJobs } from "../hooks/useJobs";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useQueue } from "../hooks/useQueue";
import type { BriefingPayload, Job, QueueJobGroup } from "../types";
import { loadCachedJson, saveCachedJson } from "../utils/offlineCache";

const BRIEFING_CACHE_KEY = "gc-agent:cache:public-briefing:v1";

function formatToday(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function urgencyFromLine(line: string): { label: string; tone: string } {
  const normalized = line.trimStart().toUpperCase();
  if (normalized.startsWith("ACTION")) return { label: "HIGH", tone: "ta" };
  if (normalized.startsWith("WATCH")) return { label: "RISK", tone: "tr" };
  return { label: "NORMAL", tone: "ts" };
}

function cleanBriefingLine(line: string): string {
  return line.replace(/^(ACTION|WATCH|READY FOR)\s*[-:]*\s*/i, "").trim();
}

function healthTone(health: Job["health"]): "good" | "warn" | "risk" {
  if (health === "blocked") return "risk";
  if (health === "at-risk") return "warn";
  return "good";
}

function queueSummary(group: QueueJobGroup): string {
  if (group.drafts.length === 0) return "AWAITING DRAFT DETAILS";
  const latest = group.drafts[0];
  const draftLabel = (latest?.type || latest?.title || "draft").replace(/-/g, " ");
  return `${draftLabel.toUpperCase()} · ${group.drafts.length} QUEUED`;
}

export function BriefingPage() {
  const { userId } = useAuth();
  const isOnline = useOnlineStatus();
  const currentUserId = userId ?? null;

  const queueQuery = useQueue(currentUserId);
  const jobsQuery = useJobs(currentUserId);
  const initialBriefing = loadCachedJson<BriefingPayload>(BRIEFING_CACHE_KEY) ?? undefined;
  const briefingQuery = useQuery({
    queryKey: ["public-briefing"],
    queryFn: async () => {
      const payload = await fetchContractorBriefing();
      saveCachedJson(BRIEFING_CACHE_KEY, payload);
      return payload;
    },
    enabled: hasContractorApiCredentials(),
    retry: (failureCount) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return false;
      return failureCount < 2;
    },
    staleTime: 30000,
    initialData: initialBriefing,
  });

  const jobs = jobsQuery.data?.jobs ?? [];
  const queueGroups = queueQuery.data?.jobs ?? [];

  const briefingLines = useMemo(() => {
    const raw = briefingQuery.data?.briefing ?? "";
    return raw.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  }, [briefingQuery.data]);

  const actionLines = useMemo(() => {
    const lines = briefingLines.filter((line) => {
      const normalized = line.toUpperCase();
      return normalized.startsWith("ACTION") || normalized.startsWith("WATCH") || normalized.startsWith("READY FOR");
    });

    if (lines.length > 0) {
      return lines.slice(0, 4).map((line, index) => ({ id: `${index}-${line}`, line }));
    }

    if (queueGroups.length > 0) {
      return queueGroups.slice(0, 3).map((group, index) => ({
        id: `${index}-${group.job_id}`,
        line: `READY FOR - ${group.job_name} has ${group.drafts.length} queued draft${group.drafts.length === 1 ? "" : "s"}`,
      }));
    }

    return [];
  }, [briefingLines, queueGroups]);

  const secondaryLines = useMemo(() => {
    const actionLineSet = new Set(actionLines.map((item) => item.line));
    return briefingLines.filter((line) => !actionLineSet.has(line));
  }, [actionLines, briefingLines]);

  const blockedJobs = jobs.filter((job) => job.health === "blocked").length;
  const atRiskJobs = jobs.filter((job) => job.health === "at-risk").length;
  const staleOpenItems = jobs.reduce((count, job) => count + job.open_items.filter((item) => item.days_silent >= 5).length, 0);
  const activeValue = jobs.reduce((sum, job) => sum + Number(job.contract_value || 0), 0);
  const queueCount = queueGroups.reduce((sum, group) => sum + group.drafts.length, 0);
  const healthJobs = jobs.slice(0, 4);
  const urgentJobs = jobs.filter((job) => job.health !== "on-track" || job.open_items.length > 0).slice(0, 4);

  return (
    <div className="pw">
      <div className="ph">
        <div className="ph-row">
          <div>
            <div className="eyebrow">System Briefing · {formatToday()}</div>
            <div className="ptitle">Morning readout</div>
            <div className="psub">{jobs.length} open jobs · {queueCount} drafts in queue · {isOnline ? "System nominal" : "Offline cache active"}</div>
          </div>
          <Link to="/quote" className="cta him">＋ NEW QUOTE</Link>
        </div>
      </div>

      <div className="sstrip c4 ani" style={{ marginBottom: 14 }}>
        {[
          { k: "Open Jobs", v: String(jobs.length), delta: `${Math.max(jobs.length - 6, 0)} added this week`, dir: "flat" },
          { k: "Queue", v: String(queueCount), delta: queueCount > 0 ? "needs review" : "clear", dir: queueCount > 0 ? "flat" : "up" },
          { k: "At Risk", v: String(blockedJobs + atRiskJobs), delta: staleOpenItems > 0 ? "follow-up overdue" : "monitoring only", dir: blockedJobs + atRiskJobs > 0 || staleOpenItems > 0 ? "dn" : "flat" },
          { k: "Active Value", v: formatCurrency(activeValue), delta: isOnline ? "live from jobs" : "cached totals", dir: activeValue > 0 ? "up" : "flat" },
        ].map((stat) => (
          <div className="scell" key={stat.k}>
            <div className="sk">{stat.k}</div>
            <div className="sv">{stat.v}</div>
            <div className={`sd ${stat.dir}`}>{stat.delta}</div>
          </div>
        ))}
      </div>

      {!hasContractorApiCredentials() ? (
        <div className="alert awarn" style={{ marginBottom: 14 }}>
          <span>⚠</span>
          <div>Set <strong>VITE_BETA_API_KEY</strong> and <strong>VITE_BETA_CONTRACTOR_ID</strong> to pull the live contractor briefing endpoint.</div>
        </div>
      ) : null}

      <div className="g2 ani a1" style={{ gap: 14 }}>
        <div className="panel">
          <div className="ph2"><span className="ptl">Action required</span><span className="tag ta" style={{ marginLeft: "auto" }}>{actionLines.length} items</span></div>
          {briefingQuery.isLoading ? <div className="pb">Loading live briefing...</div> : null}
          {!briefingQuery.isLoading && actionLines.length === 0 ? <div className="pb">No action items are stacked right now.</div> : null}
          {!briefingQuery.isLoading && actionLines.map((item, index) => {
            const urgency = urgencyFromLine(item.line);
            const relatedJob = urgentJobs[index] ?? jobs[index] ?? null;
            return (
              <div className="drow" key={item.id}>
                <span style={{ fontSize: 17, flexShrink: 0 }}>{urgency.label === "HIGH" ? "📋" : urgency.label === "RISK" ? "📤" : "⚡"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--cream)" }}>{cleanBriefingLine(item.line)}</div>
                  <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", marginTop: 2, letterSpacing: "0.5px" }}>
                    {relatedJob ? `${relatedJob.id} · ${relatedJob.type} · ${formatCurrency(relatedJob.contract_value)}` : "BRIEFING SIGNAL"}
                  </div>
                </div>
                <span className={`tag ${urgency.tone}`}>{urgency.label}</span>
              </div>
            );
          })}
        </div>

        <div className="vs" style={{ gap: 14 }}>
          <div className="panel">
            <div className="ph2"><span className="ptl">Draft Queue</span><span className="tag ta" style={{ marginLeft: "auto" }}>{queueCount}</span></div>
            {queueGroups.length === 0 ? <div className="pb">No queued drafts waiting right now.</div> : queueGroups.slice(0, 3).map((group) => (
              <div className="drow" key={group.job_id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--cream)" }}>{group.job_name}</div>
                  <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", marginTop: 2, letterSpacing: "0.5px" }}>{queueSummary(group)}</div>
                </div>
                <span className="cnum chi">{Math.max(78, 88 - group.drafts.length)}%</span>
              </div>
            ))}
            <div className="pb" style={{ paddingTop: 10, paddingBottom: 10 }}>
              <Link to="/queue" className="btn bw" style={{ width: "100%", justifyContent: "center", fontFamily: "'Syne Mono', monospace", fontSize: 8, letterSpacing: "1.5px", textTransform: "uppercase" }}>Review Queue →</Link>
            </div>
          </div>

          <div className="panel">
            <div className="ph2"><span className="ptl">Job health</span></div>
            {(healthJobs.length > 0 ? healthJobs : urgentJobs).map((job) => (
              <Link key={job.id} to={`/jobs/${job.id}`} className="drow">
                <span className={`hdot ${healthTone(job.health)}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--cream)" }}>{job.name}</div>
                  <div style={{ fontFamily: "'Syne Mono', monospace", fontSize: 8, color: "var(--fog)", marginTop: 1, letterSpacing: "0.5px" }}>{job.contract_type} · {job.status}</div>
                </div>
                <span className="tag tb td">active</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="alert ainfo ani a2" style={{ marginTop: 14, fontSize: 12 }}>
        <span style={{ flexShrink: 0, fontSize: 13 }}>◈</span>
        <div>
          <strong style={{ fontFamily: "'Syne Mono', monospace", fontSize: 9, letterSpacing: "1px" }}>ESTIMATING MEMORY — ACTIVE</strong>
          <div style={{ marginTop: 3, color: "var(--steel)" }}>This workspace is reading jobs, drafts, and the contractor briefing endpoint in the same terminal surface.</div>
        </div>
      </div>

      <div className="panel ani a2" style={{ marginTop: 14 }}>
        <div className="ph2"><span className="ptl">FYI</span><button type="button" onClick={() => void briefingQuery.refetch()} disabled={!hasContractorApiCredentials() || briefingQuery.isFetching} className="btn bw sm">{briefingQuery.isFetching ? "Refreshing..." : "Refresh"}</button></div>
        <div className="pb">
          {secondaryLines.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--steel)" }}>No additional briefing notes.</div>
          ) : (
            <div className="vs">
              {secondaryLines.map((line) => (
                <div key={line} style={{ border: "1px solid var(--wire)", padding: "10px 12px", fontSize: 12, color: "var(--cream)", lineHeight: 1.6 }}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
