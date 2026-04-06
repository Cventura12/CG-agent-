import {
  BarChart2,
  FileText,
  Home,
  LayoutGrid,
  List,
  Settings,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

type RailItem = {
  href: string;
  icon: typeof LayoutGrid;
  label: string;
};

const railItems: RailItem[] = [
  { href: "/", icon: LayoutGrid, label: "Today" },
  { href: "/queue", icon: List, label: "Queue" },
  { href: "/quote", icon: FileText, label: "Quotes" },
  { href: "/jobs", icon: Home, label: "Jobs" },
  { href: "/analytics", icon: BarChart2, label: "Analytics" },
];

export interface IconRailProps {
  initials: string;
}

export function IconRail({ initials }: IconRailProps) {
  const location = useLocation();

  return (
    <aside className="flex h-screen w-[52px] shrink-0 flex-col items-center gap-[2px] border-r border-[var(--line)] bg-[var(--bg)] py-3.5">
      <Link
        to="/"
        className="mb-[18px] flex h-[28px] w-[28px] items-center justify-center rounded-[7px] bg-[var(--accent)] text-white no-underline"
        aria-label="Arbor home"
      >
        <svg viewBox="0 0 24 24" className="h-[13px] w-[13px] fill-none stroke-current" strokeWidth="2.6">
          <path d="M12 18V6m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>

      {railItems.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/" ? location.pathname === "/" : location.pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            to={item.href}
            title={item.label}
            className={`relative flex h-[36px] w-[36px] items-center justify-center rounded-lg text-[var(--t3)] transition no-underline ${
              active
                ? "bg-[var(--bg-4)] text-[var(--t1)]"
                : "hover:bg-[var(--bg-3)] hover:text-[var(--t2)]"
            }`}
          >
            {active ? (
              <span className="absolute left-0 top-1/2 h-[16px] w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
            ) : null}
            <Icon className="h-[15px] w-[15px]" strokeWidth={1.9} />
          </Link>
        );
      })}

      <div className="flex-1" />

      <button
        type="button"
        className="relative mb-[6px] flex h-[36px] w-[36px] items-center justify-center rounded-lg text-[var(--t3)] transition hover:bg-[var(--bg-3)] hover:text-[var(--t2)]"
        aria-label="Settings"
      >
        <Settings className="h-[15px] w-[15px]" strokeWidth={1.9} />
      </button>

      <div className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-[var(--line-3)] bg-[var(--bg-4)] font-mono text-[9px] text-[var(--t2)]">
        {initials}
      </div>
    </aside>
  );
}


