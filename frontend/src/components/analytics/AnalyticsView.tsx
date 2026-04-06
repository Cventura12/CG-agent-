import { useMemo, useState } from "react";

import { formatCompactCurrency, formatCurrency, formatHoursMinutes, formatMonoTime } from "../../lib/formatters";
import { useAppStore } from "../../store/appStore";
import type { AnalyticsPeriod, InputSource, JobActivity, QueueItem } from "../../types";
import { MetricCard } from "./MetricCard";
import { ConversionChart } from "./ConversionChart";
import { SourceBreakdown } from "./SourceBreakdown";

const periodOrder = ["7d", "30d", "90d", "All time"];

const emptyPeriod: AnalyticsPeriod = {
  label: "30d",
  quotesCreated: 0,
  quotesAccepted: 0,
  totalValueQuoted: 0,
  totalValueWon: 0,
  avgResponseTimeHours: 0,
  topInputSource: "CALL",
  conversionRate: 0,
};

function toneForConversion(value: number): "green" | "amber" | "red" {
  if (value > 60) return "green";
  if (value >= 30) return "amber";
  return "red";
}

function buildChartData(period: AnalyticsPeriod) {
  const createdChunks = [0.15, 0.24, 0.28, 0.33];
  const acceptedChunks = [0.08, 0.18, 0.26, 0.48];

  return ["W1", "W2", "W3", "W4"].map((label, index) => ({
    label,
    created: Math.max(1, Math.round(period.quotesCreated * (createdChunks[index] ?? 0.25))),
    accepted: Math.round(period.quotesAccepted * (acceptedChunks[index] ?? 0.25)),
  }));
}

function buildSourceBreakdown(queueItems: QueueItem[]): Array<{ source: InputSource; percent: number }> {
  const totals = queueItems.reduce<Record<InputSource, number>>((acc, item) => {
    acc[item.source] = (acc[item.source] ?? 0) + 1;
    return acc;
  }, { CALL: 0, SMS: 0, UPLOAD: 0, EMAIL: 0, WHATSAPP: 0 });
  const overall = Math.max(1, Object.values(totals).reduce((sum, value) => sum + value, 0));

  return (Object.keys(totals) as InputSource[]).map((source) => ({
    source,
    percent: Math.round((totals[source] / overall) * 100),
  }));
}

function calculateFoundMoney(queueItems: QueueItem[]): number {
  return queueItems
    .filter((item) => item.status === "approved")
    .flatMap((item) => item.extractedActions)
    .filter((action) => action.approved && (action.type === "change_order" || action.type === "quote_item"))
    .reduce((sum, action) => sum + (action.estimatedValue ?? 0), 0);
}

function mergeActivity(jobs: ReturnType<typeof useAppStore.getState>["jobs"]): JobActivity[] {
  return [...jobs.flatMap((job) => job.activityLog)].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );
}

function AnalyticsViewContent({ periods, queueItems, jobs }: { periods: AnalyticsPeriod[]; queueItems: QueueItem[]; jobs: ReturnType<typeof useAppStore.getState>["jobs"] }) {
  const [selected, setSelected] = useState("30d");
  const activePeriod = periods.find((period) => period.label === selected) ?? periods[0] ?? emptyPeriod;
  const chartData = useMemo(() => buildChartData(activePeriod), [activePeriod]);
  const sourceData = useMemo(() => buildSourceBreakdown(queueItems), [queueItems]);
  const recentActivity = useMemo(() => mergeActivity(jobs).slice(0, 10), [jobs]);
  const foundMoney = useMemo(() => calculateFoundMoney(queueItems), [queueItems]);

  return (
    <div className="scrollbar-none h-full overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
      <div className="mb-4 flex flex-wrap gap-2">
        {periodOrder.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => setSelected(label)}
            className={`rounded-[5px] border px-2.5 py-1 font-mono text-[11px] transition ${
              selected === label
                ? "border-[var(--acl)] bg-[var(--acl-2)] text-[var(--accent-2)]"
                : "border-[var(--line-2)] bg-transparent text-[var(--t3)] hover:border-[var(--line-3)] hover:text-[var(--t2)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-[10px] sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Total quoted" value={formatCompactCurrency(activePeriod.totalValueQuoted)} />
        <MetricCard label="Total won" value={formatCompactCurrency(activePeriod.totalValueWon)} tone="green" />
        <MetricCard label="Found money" value={formatCompactCurrency(foundMoney)} tone="green" />
        <MetricCard label="Conversion rate" value={`${activePeriod.conversionRate}%`} tone={toneForConversion(activePeriod.conversionRate)} />
        <MetricCard label="Avg response time" value={formatHoursMinutes(activePeriod.avgResponseTimeHours)} />
        <MetricCard label="Quotes sent" value={String(activePeriod.quotesCreated)} />
        <MetricCard label="Follow-up rate" value={`${Math.max(activePeriod.conversionRate + 18, 32)}%`} tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div>
          <ConversionChart data={chartData} />
        </div>
        <div>
          <SourceBreakdown data={sourceData} />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.7px] text-[var(--t3)]">Recent activity</div>
        <div className="space-y-0">
          {recentActivity.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-3 border-b border-[var(--line)] py-3 last:border-b-0">
              <div>
                <div className="text-[13px] text-[var(--t1)]">{entry.description}</div>
                <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">{formatMonoTime(entry.timestamp)}</div>
              </div>
              {typeof entry.value === "number" ? (
                <div className="font-mono text-[11px] text-[var(--green)]">{formatCurrency(entry.value)}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsView() {
  const periods = useAppStore((state) => state.analytics);
  const queueItems = useAppStore((state) => state.queueItems);
  const jobs = useAppStore((state) => state.jobs);
  return <AnalyticsViewContent periods={periods} queueItems={queueItems} jobs={jobs} />;
}

export function AnalyticsViewDemo() {
  const state = useAppStore.getState();
  return <AnalyticsViewContent periods={state.analytics} queueItems={state.queueItems} jobs={state.jobs} />;
}



