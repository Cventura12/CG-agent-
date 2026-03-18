import { BarChart2, FileText, Home, LayoutGrid, List, Settings } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Tooltip } from "../ui/Tooltip";

type RailItem = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
};

const railItems: RailItem[] = [
  { href: "/today", label: "Today", icon: LayoutGrid },
  { href: "/queue", label: "Queue", icon: List },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/jobs", label: "Jobs", icon: Home },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
];

export interface IconRailProps {
  initials: string;
}

export function IconRail({ initials }: IconRailProps) {
  const location = useLocation();

  return (
    <aside className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 border-r border-[var(--line)] bg-[var(--bg)] py-3.5">
      <Tooltip label="GC Agent">
        <Link
          to="/today"
          className="mb-[18px] flex h-[28px] w-[28px] items-center justify-center rounded-[7px] bg-[var(--accent)] text-white no-underline"
          aria-label="GC Agent"
        >
          <svg viewBox="0 0 24 24" className="h-[13px] w-[13px] fill-none stroke-current" strokeWidth="2.6">
            <path d="M12 18V6m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </Tooltip>

      {railItems.map((item) => {
        const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <Tooltip key={item.href} label={item.label}>
            <Link
              to={item.href}
              className={`relative flex h-[36px] w-[36px] items-center justify-center rounded-lg no-underline transition ${
                active
                  ? "bg-[var(--bg-4)] text-[var(--t1)]"
                  : "text-[var(--t3)] hover:bg-[var(--bg-3)] hover:text-[var(--t2)]"
              }`}
            >
              {active ? (
                <span className="absolute left-0 top-1/2 h-[16px] w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
              ) : null}
              <Icon className="h-[15px] w-[15px]" strokeWidth={1.9} />
            </Link>
          </Tooltip>
        );
      })}

      <div className="flex-1" />

      <Tooltip label="Settings">
        <button
          type="button"
          className="mb-1 flex h-[36px] w-[36px] items-center justify-center rounded-lg text-[var(--t3)] transition hover:bg-[var(--bg-3)] hover:text-[var(--t2)]"
        >
          <Settings className="h-[15px] w-[15px]" strokeWidth={1.9} />
        </button>
      </Tooltip>

      <div className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-[var(--line-3)] bg-[var(--bg-4)] font-mono text-[9px] text-[var(--t2)]">
        {initials}
      </div>
    </aside>
  );
}
