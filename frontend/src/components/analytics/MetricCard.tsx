export interface MetricCardProps {
  label: string;
  value: string;
  tone?: "default" | "green" | "amber" | "red";
  delta?: string;
}

export function MetricCard({ label, value, tone = "default", delta }: MetricCardProps) {
  const toneClass = tone === "green" ? "text-[var(--green)]" : tone === "amber" ? "text-[var(--amber)]" : tone === "red" ? "text-[var(--red)]" : "text-[var(--t1)]";

  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-4">
      <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--t3)]">{label}</div>
      <div className={`font-mono text-[24px] ${toneClass}`}>{value}</div>
      {delta ? <div className="mt-2 text-[10px] text-[var(--t3)]">{delta}</div> : null}
    </article>
  );
}


