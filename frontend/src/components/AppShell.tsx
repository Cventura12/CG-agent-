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
  const className = "h-5 w-5";

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
    return ["Operations", "Field"].map((section) => ({
      section,
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

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[316px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
          <div className="border-b border-slate-200 px-7 py-6">
            <Link to="/" className="text-[26px] font-bold tracking-[-0.04em] text-[#2453d4] no-underline">
              GC Agent
            </Link>
          </div>

          <div className="px-4 pt-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search jobs, quotes..."
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-[15px] text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          <nav className="flex-1 px-4 py-6">
            <div className="space-y-1">
              {groupedNav.flatMap((group) => group.items).map((item) => {
                const isActive = item.match(location.pathname);
                const badge = item.href === "/queue" && queueCount > 0 ? queueCount : item.badge;

                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-semibold no-underline transition ${
                      isActive
                        ? "bg-[#2453d4] text-white shadow-[0_8px_18px_rgba(37,83,212,0.22)]"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span className={`${isActive ? "text-white" : "text-slate-500"}`}>{navIcon(item.href)}</span>
                    <span>{item.label}</span>
                    {badge ? (
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${isActive ? "bg-white/20 text-white" : "bg-orange-100 text-orange-600"}`}>
                        {badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="mt-auto border-t border-slate-200 px-4 py-5">
            <button
              type="button"
              className="mb-5 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Settings className="h-5 w-5 text-slate-500" aria-hidden="true" />
              <span>Settings</span>
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl text-left"
              onClick={() => {
                if (!bypassAuth) {
                  void signOut({ redirectUrl: "/onboarding" });
                }
              }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-[#2453d4]">
                {operatorInitials}
              </div>
              <div>
                <div className="text-[15px] font-semibold text-slate-900">{operatorName}</div>
                <div className="text-sm text-slate-500">{operatorCompany}</div>
              </div>
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-20 items-center justify-end border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <Link
                to="/quote"
                className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-slate-900 bg-white px-4 text-[14px] font-semibold text-slate-900 no-underline transition hover:bg-slate-50"
              >
                <FileText className="h-5 w-5" aria-hidden="true" />
                <span>Quick Quote</span>
              </Link>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-transparent bg-white text-slate-700 transition hover:border-slate-200 hover:bg-slate-50"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#f4f7fb]">{children}</main>
        </div>
      </div>

      {!bypassAuth ? <BottomNav queueCount={queueCount} /> : null}
    </div>
  );
}

