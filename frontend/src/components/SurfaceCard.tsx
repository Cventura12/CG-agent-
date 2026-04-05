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
    <section className={clsx("surface-panel", className)}>
      {eyebrow || title || actions || description ? (
        <div className="surface-card-header">
          <div className="min-w-0">
            {eyebrow ? <p className="kicker">{eyebrow}</p> : null}
            {title ? (
              <h2 className="panel-title mt-2 text-[1.35rem]">
                {title}
              </h2>
            ) : null}
            {description ? <p className="panel-subtitle">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}

      <div className="surface-card-body">{children}</div>
    </section>
  );
}
