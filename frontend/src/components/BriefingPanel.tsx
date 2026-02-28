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
    return "text-orange";
  }
  if (normalized.startsWith("ACTION")) {
    return "text-red-400";
  }
  if (normalized.startsWith("WATCH")) {
    return "text-yellow";
  }
  if (normalized.startsWith("ON TRACK")) {
    return "text-green";
  }
  return "text-muted";
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
    <section className="rounded-md border border-border bg-surface/80">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setIsExpandedMobile((value) => !value)}
          className="min-w-0 flex-1 text-left sm:cursor-default"
        >
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">MORNING BRIEFING</p>
          <p className="mt-1 text-xs text-muted">{generatedAt}</p>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void briefingQuery.refetch()}
            disabled={briefingQuery.isFetching || !gcId}
            className={clsx(
              "rounded-sm border border-border px-3 py-1 font-mono text-xs uppercase tracking-wider text-text",
              "transition-colors hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            {briefingQuery.isFetching ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setIsExpandedMobile((value) => !value)}
            className="rounded-sm border border-border px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-muted sm:hidden"
          >
            {isExpandedMobile ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div
        className={clsx(
          "border-t border-border px-4 pb-4 pt-3",
          isExpandedMobile ? "block" : "hidden",
          "sm:block"
        )}
      >
        {briefingQuery.isLoading ? (
          <p className="animate-pulse font-mono text-sm text-muted">Generating briefing...</p>
        ) : null}

        {!briefingQuery.isLoading && briefingQuery.isError ? (
          <p className="font-mono text-sm text-muted">Briefing unavailable - check back later</p>
        ) : null}

        {!briefingQuery.isLoading && !briefingQuery.isError ? (
          <pre className="whitespace-pre-wrap font-mono text-sm leading-6">
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
