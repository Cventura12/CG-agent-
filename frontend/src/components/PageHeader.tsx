import clsx from "clsx";
import type { ReactNode } from "react";

type HeaderStat = {
  label: string;
  value: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  stats = [],
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  stats?: HeaderStat[];
  className?: string;
}) {
  return (
    <section className={clsx("surface-panel page-hero px-5 py-5 sm:px-6 sm:py-6", className)}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="kicker">{eyebrow}</p>
          <h1 className="mt-3 font-display text-[2rem] uppercase leading-none tracking-[0.06em] text-text sm:text-[2.5rem]">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted sm:text-[15px]">{description}</p>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
      </div>

      {stats.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className={clsx(
                "rounded-[1.4rem] border px-4 py-4",
                stat.tone === "success"
                  ? "border-green/45 bg-green/10"
                  : stat.tone === "warning"
                    ? "border-yellow/50 bg-yellow/10"
                    : stat.tone === "danger"
                      ? "border-red-400/45 bg-red-400/10"
                      : "border-border bg-bg/55"
              )}
            >
              <p className="data-label">{stat.label}</p>
              <div className="mt-2 text-xl font-semibold tracking-tight text-text">{stat.value}</div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
