import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { fetchBriefing } from "../api/jobs";

type BriefingPanelProps = {
  gcId: string | null;
};

function lineColorClass(line: string): string {
  const normalized = line.trimStart().toUpperCase();
  if (normalized.startsWith("READY FOR")) {
    return "text-orange-600";
  }
  if (normalized.startsWith("ACTION")) {
    return "text-red-600";
  }
  if (normalized.startsWith("WATCH")) {
    return "text-amber-600";
  }
  if (normalized.startsWith("ON TRACK")) {
    return "text-emerald-600";
  }
  return "text-slate-500";
}

export function BriefingPanel({ gcId }: BriefingPanelProps) {
  const [isExpandedMobile, setIsExpandedMobile] = useState(false);

  const briefingQuery = useQuery({
    queryKey: ["briefing", gcId ?? "anonymous"],
    queryFn: () => fetchBriefing(),
    enabled: Boolean(gcId),
  });

  const briefingText = briefingQuery.data?.briefing ?? "";
  const lines = useMemo(() => briefingText.replace(/\r\n/g, "\n").split("\n"), [briefingText]);

  const generatedAt = briefingQuery.dataUpdatedAt
    ? new Date(briefingQuery.dataUpdatedAt).toLocaleString()
    : "Not generated";

  return (
    <section className="surface-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <button
          type="button"
          onClick={() => setIsExpandedMobile((value) => !value)}
          className="min-w-0 flex-1 text-left sm:cursor-default"
        >
          <p className="kicker">Morning briefing</p>
          <p className="mt-2 font-display text-[1.35rem] uppercase leading-none tracking-[0.04em] text-slate-950">
            Daily pulse
          </p>
          <p className="mt-2 text-xs text-slate-500">{generatedAt}</p>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void briefingQuery.refetch()}
            disabled={briefingQuery.isFetching || !gcId}
            className={clsx(
              "rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-700",
              "transition-colors hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            {briefingQuery.isFetching ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setIsExpandedMobile((value) => !value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500 sm:hidden"
          >
            {isExpandedMobile ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div
        className={clsx(
          "border-t border-slate-200 px-4 pb-4 pt-4 sm:px-5",
          isExpandedMobile ? "block" : "hidden",
          "sm:block"
        )}
      >
        {briefingQuery.isLoading ? (
          <p className="animate-pulse font-mono text-sm text-slate-500">Generating briefing...</p>
        ) : null}

        {!briefingQuery.isLoading && briefingQuery.isError ? (
          <p className="rounded-[1.2rem] border border-red-200 bg-red-50 px-3 py-3 font-mono text-sm text-red-600">
            Briefing unavailable. Check back after the next refresh.
          </p>
        ) : null}

        {!briefingQuery.isLoading && !briefingQuery.isError ? (
          <pre className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4 whitespace-pre-wrap font-mono text-sm leading-7 text-slate-700">
            {lines.map((line: string, index: number) => (
              <span key={`${index}-${line}`} className={lineColorClass(line)}>
                {line}
                {index < lines.length - 1 ? "\n" : ""}
              </span>
            ))}
          </pre>
        ) : null}
      </div>
    </section>
  );
}


