import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "../ui/Button";

export interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  leading?: ReactNode;
}

export function Topbar({ title, subtitle, actions, leading }: TopbarProps) {
  return (
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--bg)] px-3 py-2 sm:px-5 sm:py-0">
      <div className="flex min-w-0 items-start gap-3">
        {leading ? <div className="flex shrink-0 items-center lg:hidden">{leading}</div> : null}
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium tracking-[-0.2px] text-[var(--t1)]">{title}</div>
          {subtitle ? <div className="mt-[2px] hidden text-[12px] text-[var(--t2)] sm:block">{subtitle}</div> : null}
        </div>
      </div>
      <div
        className={clsx(
          "scrollbar-none flex min-w-0 items-center justify-end gap-1.5 overflow-x-auto sm:gap-2",
          actions ? "max-w-[68vw] sm:max-w-none" : ""
        )}
      >
        {actions}
      </div>
    </header>
  );
}

export function TopbarGhostAction(props: ComponentProps<typeof Button>) {
  return <Button variant="ghost" {...props} />;
}

export function TopbarAccentAction(props: ComponentProps<typeof Button>) {
  return <Button variant="accent" {...props} />;
}

