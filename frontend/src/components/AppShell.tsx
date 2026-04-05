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

  const coreLoopItems = useMemo(
    () => APP_NAV_ITEMS.filter((item) => ["/", "/quote", "/queue", "/jobs"].includes(item.href)),
    []
  );
  const reportingItems = useMemo(
    () => APP_NAV_ITEMS.filter((item) => item.href === "/analytics" || item.href === "/insights"),
    []
  );

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
  const activeSignal = queueCount > 0 ? `Agent surfaced ${queueCount} review item${queueCount === 1 ? "" : "s"}` : "Agent is watching quietly";

  return (
    <div className="min-h-screen bg-transparent text-slate-950">
      <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(49,95,255,0.12),transparent_18rem),radial-gradient(circle_at_top_right,rgba(232,98,42,0.08),transparent_16rem)]">
        <aside className="hidden shrink-0 border-r border-white/8 bg-[linear-gradient(180deg,#04070d_0%,#07101a_45%,#0b131d_100%)] text-white shadow-[22px_0_70px_rgba(2,6,16,0.32)] lg:flex">
          <div className="flex w-[68px] flex-col items-center border-r border-white/8 px-3 py-4">
            <Link
              to="/"
              className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-[linear-gradient(135deg,#ff8b4b,#e8622a)] text-white shadow-[0_12px_26px_rgba(232,98,42,0.26)] no-underline"
            >
              <Workflow className="h-4.5 w-4.5" aria-hidden="true" />
            </Link>
            <div className="mt-5 flex flex-1 flex-col items-center gap-2">
              {coreLoopItems.map((item) => {
                const isActive = item.match(location.pathname);
                const badge = item.href === "/queue" && queueCount > 0 ? queueCount : null;

                return (
                  <Link
                    key={`rail-${item.href}`}
                    to={item.href}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-[14px] border no-underline transition ${
                      isActive
                        ? "border-white/12 bg-[linear-gradient(135deg,rgba(232,98,42,0.24),rgba(232,98,42,0.08))] text-white shadow-[0_12px_22px_rgba(10,18,30,0.22)]"
                        : "border-transparent bg-transparent text-white/44 hover:border-white/8 hover:bg-white/[0.04] hover:text-white/82"
                    }`}
                    title={item.label}
                  >
                    {navIcon(item.href)}
                    {badge ? (
                      <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full border border-[#f6a27c]/30 bg-[#e8622a]/20 px-1.5 py-[1px] text-center font-mono text-[9px] text-[#ffc3a5]">
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-auto flex h-11 w-11 items-center justify-center rounded-[14px] border border-transparent text-white/42 transition hover:border-white/8 hover:bg-white/[0.04] hover:text-white/82"
            >
              <Settings className="h-[17px] w-[17px]" aria-hidden="true" />
            </button>
          </div>

          <div className="flex w-[228px] flex-col">
            <div className="border-b border-white/8 px-4 py-4">
              <Link to="/" className="flex items-center gap-3 no-underline">
                <div>
                  <div className="text-[16px] font-semibold tracking-[-0.05em] text-white">Arbor Agent</div>
                  <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/32">
                    Field runtime
                  </div>
                </div>
              </Link>

              <div className="mt-4 rounded-[16px] border border-white/8 bg-black/20 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-center justify-between gap-3 text-[10px] font-medium uppercase tracking-[0.16em] text-white/32">
                  <span>Agent monitor</span>
                  <span className="flex items-center gap-1.5 text-[#94f1b9]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#53e08f] shadow-[0_0_0_4px_rgba(83,224,143,0.12)]" />
                    Live
                  </span>
                </div>
                <div className="mt-3 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="gc-scan-bar h-[3px] w-[38%] rounded-full bg-[linear-gradient(90deg,rgba(232,98,42,0.2),#e8622a,rgba(232,98,42,0.2))]" />
                </div>
                <div className="mt-3 font-mono text-[11px] leading-6 text-white/60">
                  <div>&gt; {activeSignal}</div>
                  <div>&gt; tracking queue, quotes, and follow-through</div>
                </div>
              </div>
            </div>

            <div className="px-4 pt-4">
              <div className="rounded-[14px] border border-white/8 bg-white/[0.03] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Search jobs, quotes, calls"
                    className="h-9 w-full rounded-[12px] border border-transparent bg-transparent pl-10 pr-3 text-[13px] text-white/84 outline-none placeholder:text-white/22 focus:border-white/8 focus:bg-white/[0.03]"
                  />
                </div>
              </div>
            </div>

            <nav className="flex-1 px-4 py-5">
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="px-2 text-[10px] font-medium uppercase tracking-[0.2em] text-white/24">
                    Core loop
                  </div>
                  <div className="space-y-1">
                    {coreLoopItems.map((item) => {
                      const isActive = item.match(location.pathname);
                      const badge = item.href === "/queue" && queueCount > 0 ? queueCount : item.badge;

                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          className={`group relative block overflow-hidden rounded-[14px] border px-3 py-2 no-underline transition ${
                            isActive
                              ? "border-white/10 bg-[linear-gradient(135deg,rgba(232,98,42,0.22),rgba(232,98,42,0.05))] shadow-[0_14px_34px_rgba(3,7,18,0.24)]"
                              : "border-transparent hover:border-white/6 hover:bg-white/[0.035]"
                          }`}
                        >
                          {isActive ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[linear-gradient(180deg,#ffb28e,#e8622a)]" /> : null}
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className={`text-[13px] font-semibold ${isActive ? "text-white" : "text-white/72"}`}>
                                {item.label}
                              </div>
                              <div className="mt-0.5 text-[11px] text-white/28">{item.shortLabel}</div>
                            </div>
                            {badge ? (
                              <span className="rounded-full border border-[#f6a27c]/22 bg-[#e8622a]/16 px-2 py-1 font-mono text-[10px] text-[#ffc3a5]">
                                {badge}
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="px-2 text-[10px] font-medium uppercase tracking-[0.2em] text-white/24">
                    Reporting
                  </div>
                  <div className="space-y-1">
                    {reportingItems.map((item) => {
                      const isActive = item.match(location.pathname);
                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          className={`group relative block overflow-hidden rounded-[14px] border px-3 py-2 no-underline transition ${
                            isActive
                              ? "border-white/10 bg-[linear-gradient(135deg,rgba(232,98,42,0.22),rgba(232,98,42,0.05))] shadow-[0_14px_34px_rgba(3,7,18,0.24)]"
                              : "border-transparent hover:border-white/6 hover:bg-white/[0.035]"
                          }`}
                        >
                          <div className={`text-[13px] font-semibold ${isActive ? "text-white" : "text-white/58"}`}>
                            {item.label}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </nav>

            <div className="mt-auto border-t border-white/8 px-4 py-4">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-3 text-left transition hover:bg-white/[0.07]"
                onClick={() => {
                  if (!bypassAuth) {
                    void signOut({ redirectUrl: "/onboarding" });
                  }
                }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#ff9158,#e8622a)] text-[13px] font-bold text-white shadow-[0_12px_28px_rgba(232,98,42,0.24)]">
                  {operatorInitials}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-white">{operatorName}</div>
                  <div className="mt-0.5 truncate text-[12px] text-white/40">{operatorCompany}</div>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-white/24" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-[54px] items-center justify-between border-b border-white/8 bg-[linear-gradient(180deg,rgba(4,8,15,0.96),rgba(7,12,21,0.84))] px-4 backdrop-blur-[20px] sm:px-6 lg:px-8">
            <div className="hidden items-center gap-3 md:flex">
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/30">Arbor runtime</div>
                <div className="h-[3px] w-20 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="gc-scan-bar h-full w-[42%] rounded-full bg-[linear-gradient(90deg,rgba(232,98,42,0.2),#e8622a,rgba(232,98,42,0.2))]" />
                </div>
                <div className="text-[13px] font-semibold tracking-[-0.02em] text-white">{activeSection}</div>
                <div className="text-[11px] text-white/44">{activeSignal}</div>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2.5">
              <Link
                to="/queue"
                className="inline-flex h-8.5 items-center gap-2 rounded-[11px] border border-white/10 bg-white/[0.035] px-3 text-[12px] font-semibold text-white/82 no-underline transition hover:border-white/18 hover:bg-white/[0.07]"
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                <span>Queue</span>
              </Link>
              <Link
                to="/quote"
                className="inline-flex h-8.5 items-center gap-2 rounded-[11px] border border-[#ff9e6f]/20 bg-[linear-gradient(135deg,#ff9158,#e8622a)] px-3.5 text-[12px] font-semibold text-white no-underline shadow-[0_16px_34px_rgba(232,98,42,0.24)] transition hover:brightness-105"
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>New quote</span>
              </Link>
              <button
                type="button"
                className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-[11px] border border-white/10 bg-white/[0.035] text-white/72 transition hover:border-white/18 hover:bg-white/[0.07] hover:text-white"
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
