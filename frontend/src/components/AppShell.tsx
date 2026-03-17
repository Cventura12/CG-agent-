import { useClerk, useUser } from "@clerk/clerk-react";
import {
  Bell,
  BriefcaseBusiness,
  ChartColumnBig,
  ClipboardList,
  FileText,
  LayoutGrid,
  Search,
  Settings,
  Sparkles,
  Workflow,
  ChevronRight,
  Activity,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { useQueue } from "../hooks/useQueue";
import { APP_NAV_ITEMS } from "../navigation";
import { BottomNav } from "./BottomNav";

const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true";

function initialsFromName(value: string): string {
  const tokens = value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (tokens.length === 0) {
    return "GC";
  }

  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}

function navIcon(href: string) {
  const className = "h-[17px] w-[17px]";

  switch (href) {
    case "/":
      return <LayoutGrid className={className} aria-hidden="true" />;
    case "/quote":
      return <FileText className={className} aria-hidden="true" />;
    case "/jobs":
      return <BriefcaseBusiness className={className} aria-hidden="true" />;
    case "/queue":
      return <ClipboardList className={className} aria-hidden="true" />;
    case "/analytics":
      return <ChartColumnBig className={className} aria-hidden="true" />;
    case "/insights":
      return <Sparkles className={className} aria-hidden="true" />;
    default:
      return <LayoutGrid className={className} aria-hidden="true" />;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const queueQuery = useQueue(user?.id ?? null);
  const [searchValue, setSearchValue] = useState("");

  const groupedNav = useMemo(() => {
    return [
      { label: "Workflow", section: "Operations" as const },
      { label: "Reporting", section: "Field" as const },
    ].map(({ label, section }) => ({
      label,
      items: APP_NAV_ITEMS.filter((item) => item.section === section),
    }));
  }, []);

  const queueCount =
    (queueQuery.data?.jobs ?? []).reduce((sum, group) => sum + group.drafts.length, 0) +
    (queueQuery.data?.inbox?.transcripts.length ?? 0);
  const operatorName = bypassAuth
    ? "John Doe"
    : user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "Signed-in operator";
  const operatorCompany = bypassAuth ? "Acme Builders" : "Owner / GC";
  const operatorInitials = initialsFromName(operatorName);
  const activeSection = useMemo(() => {
    const item = APP_NAV_ITEMS.find((entry) => entry.match(location.pathname));
    return item?.label ?? "Today";
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-transparent text-slate-950">
      <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(49,95,255,0.14),transparent_22rem),radial-gradient(circle_at_top_right,rgba(255,140,47,0.1),transparent_20rem)]">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/8 bg-[linear-gradient(180deg,#060b15_0%,#0a1120_38%,#0e1628_100%)] text-white shadow-[28px_0_90px_rgba(2,6,16,0.34)] lg:flex">
          <div className="border-b border-white/8 px-5 py-5">
            <Link to="/" className="flex items-center gap-3 no-underline">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-[linear-gradient(135deg,#6c89ff,#2f5dff)] shadow-[0_14px_36px_rgba(49,95,255,0.38)]">
                <Workflow className="h-5 w-5 text-white" aria-hidden="true" />
              </div>
              <div>
                <div className="text-[17px] font-semibold tracking-[-0.05em] text-white">GC Agent</div>
                <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white/38">
                  Field to office runtime
                </div>
              </div>
            </Link>
            <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-white/56">
              <Activity className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
              <span>{queueCount > 0 ? `${queueCount} items need review` : "Runtime is quiet"}</span>
            </div>
          </div>

          <div className="px-4 pt-4">
            <div className="rounded-[18px] border border-white/8 bg-white/[0.03] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" aria-hidden="true" />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Find jobs, quotes, calls"
                  className="h-10 w-full rounded-[14px] border border-transparent bg-transparent pl-10 pr-3 text-[13px] text-white/84 outline-none placeholder:text-white/24 focus:border-white/8 focus:bg-white/[0.03]"
                />
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-5">
            <div className="space-y-5">
              {groupedNav.map((group) => (
                <div key={group.label} className="space-y-2">
                  <div className="px-2 text-[10px] font-medium uppercase tracking-[0.2em] text-white/28">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = item.match(location.pathname);
                      const badge = item.href === "/queue" && queueCount > 0 ? queueCount : item.badge;

                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          className={`group relative block overflow-hidden rounded-[16px] border px-3 py-2.5 no-underline transition ${
                            isActive
                              ? "border-white/10 bg-[linear-gradient(135deg,rgba(49,95,255,0.22),rgba(49,95,255,0.04))] shadow-[0_14px_34px_rgba(3,7,18,0.24)]"
                              : "border-transparent hover:border-white/6 hover:bg-white/[0.035]"
                          }`}
                        >
                          {isActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[linear-gradient(180deg,#8bb2ff,#2f5dff)]" /> : null}
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex h-9 w-9 items-center justify-center rounded-[12px] border ${
                                isActive
                                  ? "border-white/12 bg-[linear-gradient(135deg,rgba(95,129,255,0.32),rgba(47,93,255,0.14))] text-white"
                                  : "border-white/6 bg-white/[0.025] text-white/50 group-hover:text-white/80"
                              }`}
                            >
                              {navIcon(item.href)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className={`text-[13px] font-semibold ${isActive ? "text-white" : "text-white/72"}`}>
                                {item.label}
                              </div>
                              <div className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-white/32">{item.description}</div>
                            </div>
                            {badge ? (
                              <span className="rounded-full border border-orange-300/18 bg-orange-400/12 px-2 py-1 font-mono text-[10px] text-orange-200">
                                {badge}
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="mt-auto border-t border-white/8 px-4 py-4">
            <button
              type="button"
              className="mb-3 flex w-full items-center gap-3 rounded-[16px] border border-transparent px-3 py-2.5 text-left text-[13px] font-medium text-white/60 transition hover:border-white/8 hover:bg-white/[0.04] hover:text-white"
            >
              <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>Settings</span>
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-3 text-left transition hover:bg-white/[0.07]"
              onClick={() => {
                if (!bypassAuth) {
                  void signOut({ redirectUrl: "/onboarding" });
                }
              }}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#5f81ff,#2f5dff)] text-[13px] font-bold text-white shadow-[0_12px_28px_rgba(49,95,255,0.28)]">
                {operatorInitials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-white">{operatorName}</div>
                <div className="mt-0.5 truncate text-[12px] text-white/44">{operatorCompany}</div>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-white/28" aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b border-white/8 bg-[rgba(4,8,15,0.78)] px-4 backdrop-blur-[18px] sm:px-6 lg:px-8">
            <div className="hidden items-center gap-3 md:flex">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/34">Operator surface</div>
                <div className="mt-1 text-[15px] font-semibold tracking-[-0.03em] text-white">{activeSection}</div>
              </div>
              <span className="gc-hero-status">Watching queue and follow-through</span>
              <span className="gc-micro-pill">{queueCount > 0 ? `${queueCount} items waiting` : "Queue clear"}</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Link
                to="/queue"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[12px] font-semibold text-white/82 no-underline transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                <span>Open Queue</span>
              </Link>
              <Link
                to="/quote"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#5f81ff]/20 bg-[linear-gradient(135deg,#5f81ff,#2f5dff)] px-3.5 text-[12px] font-semibold text-white no-underline shadow-[0_16px_34px_rgba(49,95,255,0.28)] transition hover:brightness-105"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>New Quote</span>
              </Link>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/72 transition hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
        </div>
      </div>

      {!bypassAuth ? <BottomNav queueCount={queueCount} /> : null}
    </div>
  );
}
