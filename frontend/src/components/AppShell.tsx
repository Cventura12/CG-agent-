import { UserButton, useAuth, useClerk } from "@clerk/clerk-react";
import clsx from "clsx";
import { ArrowUpRight, BellRing, Wifi, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { APP_NAV_ITEMS, navItemForPath } from "../navigation";
import { BottomNav } from "./BottomNav";

const bypassAuth = import.meta.env.VITE_BYPASS_AUTH === "true";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const { signOut } = useClerk();
  const { userId } = useAuth();
  const activeItem = navItemForPath(location.pathname);

  return (
    <div className="app-shell-bg min-h-screen text-text">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-5rem] h-72 w-72 rounded-full bg-orange/10 blur-3xl" />
        <div className="absolute right-[-5rem] top-24 h-80 w-80 rounded-full bg-steel/10 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/4 h-96 w-96 rounded-full bg-green/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:44px_44px]" />
      </div>

      <div className="relative flex min-h-screen">
        <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-80 lg:flex-col lg:border-r lg:border-border/80 lg:bg-surface/70 lg:px-6 lg:pb-8 lg:pt-6 lg:backdrop-blur-xl">
          <div className="surface-panel px-5 py-5">
            <p className="kicker">GC Agent</p>
            <h1 className="mt-3 font-display text-3xl uppercase tracking-[0.08em] text-text">
              Construction Ops
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Quotes, briefings, queue decisions, follow-up, and job history in one operating surface.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/quote" className="action-button-primary">
                Start quote
              </Link>
              <Link to="/queue" className="action-button-secondary">
                Open queue
              </Link>
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {APP_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.match(location.pathname);

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={clsx(
                    "group block rounded-[1.35rem] border px-4 py-4 transition",
                    isActive
                      ? "border-orange/60 bg-orange/12 shadow-[0_14px_30px_rgba(217,119,43,0.14)]"
                      : "border-border/70 bg-surface/45 hover:border-orange/35 hover:bg-surface/75"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={clsx(
                        "flex h-11 w-11 items-center justify-center rounded-2xl border transition",
                        isActive
                          ? "border-orange/60 bg-orange/15 text-orange"
                          : "border-border/70 bg-bg/70 text-muted group-hover:text-text"
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-lg uppercase tracking-[0.08em] text-text">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-muted">{item.description}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto grid gap-3 pt-6">
            <div className="surface-panel-subtle px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="data-label">Runtime</p>
                  <p className="mt-1 text-sm text-text">
                    {isOnline ? "Connected to live data" : "Offline cache mode"}
                  </p>
                </div>
                <span
                  className={clsx(
                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl border",
                    isOnline
                      ? "border-green/50 bg-green/12 text-green"
                      : "border-yellow/60 bg-yellow/12 text-yellow"
                  )}
                >
                  {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                </span>
              </div>
            </div>

            <div className="surface-panel-subtle px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="data-label">Current user</p>
                  <p className="mt-1 text-sm text-text">{userId ? "Signed in" : "Bypass mode"}</p>
                </div>
                <BellRing className="h-4 w-4 text-orange" />
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 lg:pl-80">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-bg/72 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-3 py-3 sm:px-4 lg:px-8">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-full border border-orange/35 bg-orange/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-orange lg:hidden">
                    GC Agent
                  </span>
                  <span
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
                      isOnline
                        ? "border-green/45 bg-green/10 text-green"
                        : "border-yellow/55 bg-yellow/10 text-yellow"
                    )}
                  >
                    {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {isOnline ? "Live" : "Cached"}
                  </span>
                </div>
                <p className="mt-2 font-display text-lg uppercase tracking-[0.08em] text-text">
                  {activeItem?.label ?? "GC Agent"}
                </p>
                <p className="max-w-2xl text-sm text-muted">
                  {activeItem?.description ?? "Construction operations for field capture and office execution."}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Link to="/quote" className="hidden min-h-11 items-center gap-2 rounded-2xl border border-border bg-surface/80 px-4 py-2 text-sm text-text transition hover:border-orange hover:text-orange sm:inline-flex">
                  <span>New quote</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                {!bypassAuth ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void signOut({ redirectUrl: "/onboarding" })}
                      className="hidden min-h-11 rounded-2xl border border-border bg-surface/80 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted transition hover:border-orange hover:text-orange sm:inline-flex"
                    >
                      Sign out
                    </button>
                    <UserButton afterSignOutUrl="/onboarding" />
                  </>
                ) : (
                  <span className="inline-flex rounded-full border border-yellow/55 bg-yellow/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-yellow">
                    Demo mode
                  </span>
                )}
              </div>
            </div>
          </header>

          <div className="pb-24 lg:pb-10">{children}</div>
          {!bypassAuth ? <BottomNav /> : null}
        </div>
      </div>
    </div>
  );
}
