import { UserButton, useClerk, useUser } from "@clerk/clerk-react";
import clsx from "clsx";
import { ArrowUpRight, BellRing, Wifi, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { APP_NAV_ITEMS, navItemForPath } from "../navigation";
import { BottomNav } from "./BottomNav";

const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true";

function useClockLabel(): string {
  const [value, setValue] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setValue(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

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

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const { signOut } = useClerk();
  const { user } = useUser();
  const activeItem = navItemForPath(location.pathname);
  const clockLabel = useClockLabel();

  const groupedNav = useMemo(() => {
    return ["Operations", "Field"].map((section) => ({
      section,
      items: APP_NAV_ITEMS.filter((item) => item.section === section),
    }));
  }, []);

  const operatorName = bypassAuth
    ? "Demo Operator"
    : user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "Signed-in operator";
  const operatorRole = bypassAuth ? "Bypass mode" : "Owner / GC";
  const operatorInitials = initialsFromName(operatorName);

  const statusTone = isOnline
    ? "border-green/40 bg-green/10 text-green"
    : "border-yellow/50 bg-yellow/10 text-yellow";

  return (
    <div className="app-shell-bg min-h-screen text-text">
      <div className="relative flex min-h-screen">
        <aside className="terminal-sidebar hidden lg:flex lg:w-[248px] lg:flex-col">
          <div className="terminal-brand">
            <div className="terminal-brand-mark">GC</div>
            <div className="min-w-0">
              <div className="terminal-brand-title">
                GC <span>Agent</span>
              </div>
              <p className="terminal-brand-sub">Intelligent Ops System</p>
            </div>
          </div>

          <div className="terminal-system-row">
            <span className="terminal-pulse" aria-hidden="true" />
            <span className="terminal-system-label">{isOnline ? "System nominal" : "Cached operation"}</span>
          </div>

          <div className="px-3 pt-3">
            <div className="surface-panel-subtle px-3 py-3">
              <p className="data-label">Mission</p>
              <p className="mt-2 text-sm leading-6 text-text">
                Quotes, follow-up, queue, and job signal in one operating surface.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/quote" className="action-button-primary">
                  Start quote
                </Link>
                <Link to="/queue" className="action-button-secondary">
                  Open queue
                </Link>
              </div>
            </div>
          </div>

          <nav className="mt-4 flex-1 px-3 pb-4">
            {groupedNav.map((group) => (
              <div key={group.section} className="terminal-nav-group">
                <p className="terminal-nav-label">{group.section}</p>
                <div className="space-y-1.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.match(location.pathname);

                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={clsx("terminal-nav-item", isActive && "terminal-nav-item-active")}
                      >
                        <div className="terminal-nav-icon-wrap">
                          <Icon className="terminal-nav-icon" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="terminal-nav-title">{item.label}</p>
                          <p className="terminal-nav-copy">{item.description}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-border/80 px-3 py-3">
            <div className="surface-panel-subtle px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="terminal-avatar">{operatorInitials}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{operatorName}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                    {operatorRole}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                <div className="terminal-readout-row">
                  <span>Runtime</span>
                  <span className={clsx("terminal-mini-chip", statusTone)}>{isOnline ? "Live" : "Cached"}</span>
                </div>
                <div className="terminal-readout-row">
                  <span>Memory</span>
                  <span className="terminal-mini-chip border-steel/40 bg-steel/10 text-steel">Learning active</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 lg:pl-[248px]">
          <header className="terminal-topbar sticky top-0 z-30">
            <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-3 px-3 py-2.5 sm:px-4 lg:px-6">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted">
                  GC Agent / <span className="text-orange">{activeItem?.label ?? "Operations"}</span>
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <span className={clsx("terminal-status-chip", statusTone)}>
                  {isOnline ? <Wifi className="h-3 w-3" aria-hidden="true" /> : <WifiOff className="h-3 w-3" aria-hidden="true" />}
                  {isOnline ? "System nominal" : "Offline cache"}
                </span>
                <span className="terminal-status-chip border-border/80 bg-surface/70 text-steel">
                  <BellRing className="h-3 w-3" aria-hidden="true" />
                  Live ops
                </span>
                <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted sm:inline-flex">
                  {clockLabel}
                </span>
                <Link to="/quote" className="action-button-secondary hidden sm:inline-flex">
                  New quote <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {!bypassAuth ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void signOut({ redirectUrl: "/onboarding" })}
                      className="action-button-secondary hidden sm:inline-flex"
                    >
                      Sign out
                    </button>
                    <UserButton afterSignOutUrl="/onboarding" />
                  </>
                ) : (
                  <span className="terminal-status-chip border-yellow/50 bg-yellow/10 text-yellow">Demo mode</span>
                )}
              </div>
            </div>
          </header>

          <div className="pb-24 lg:pb-8">{children}</div>
          {!bypassAuth ? <BottomNav /> : null}
        </div>
      </div>
    </div>
  );
}


