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
    <section className={clsx("surface-panel page-hero", className)}>
      <div className="surface-card-header">
        <div className="min-w-0">
          <p className="kicker">{eyebrow}</p>
          <h1 className="panel-title mt-3 text-[2rem] sm:text-[2.35rem]">
            {title}
          </h1>
          <p className="panel-subtitle">{description}</p>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
      </div>

      {stats.length > 0 ? (
        <div className="stat-strip sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.label}
              className={clsx(
                "stat-cell",
                stat.tone === "success"
                  ? "text-emerald-600"
                  : stat.tone === "warning"
                    ? "text-amber-600"
                    : stat.tone === "danger"
                      ? "text-red-600"
                      : "text-slate-900"
              )}
            >
              <p className="data-label">{stat.label}</p>
              <div className="stat-value">{stat.value}</div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
