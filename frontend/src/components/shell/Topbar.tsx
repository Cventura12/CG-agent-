import type { ComponentProps, ReactNode } from "react";

import { Button } from "../ui/Button";

export interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--bg)] px-5">
      <div className="min-w-0">
        <div className="text-[14px] font-medium tracking-[-0.2px] text-[var(--t1)]">{title}</div>
        {subtitle ? <div className="mt-[2px] text-[12px] text-[var(--t2)]">{subtitle}</div> : null}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </header>
  );
}

export function TopbarGhostAction(props: ComponentProps<typeof Button>) {
  return <Button variant="ghost" {...props} />;
}

export function TopbarAccentAction(props: ComponentProps<typeof Button>) {
  return <Button variant="accent" {...props} />;
}
