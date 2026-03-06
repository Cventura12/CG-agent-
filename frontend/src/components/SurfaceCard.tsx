import clsx from "clsx";
import type { ReactNode } from "react";

export function SurfaceCard({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("surface-panel px-4 py-4 sm:px-5 sm:py-5", className)}>
      {eyebrow || title || actions || description ? (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {eyebrow ? <p className="kicker">{eyebrow}</p> : null}
            {title ? (
              <h2 className="mt-2 font-display text-[1.45rem] uppercase leading-none tracking-[0.06em] text-text">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}

      {children}
    </section>
  );
}
