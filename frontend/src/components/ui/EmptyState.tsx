import type { LucideIcon } from "lucide-react";

import { Button } from "./Button";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-dashed border-[var(--line-3)]">
        <Icon className="h-[18px] w-[18px] text-[var(--t3)]" strokeWidth={1.9} />
      </div>
      <div className="text-[13px] font-medium text-[var(--t1)]">{title}</div>
      <div className="max-w-[200px] text-[12px] leading-relaxed text-[var(--t2)]">{description}</div>
      {action ? (
        <Button variant="ghost" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

