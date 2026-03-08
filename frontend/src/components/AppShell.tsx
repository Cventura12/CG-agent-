import { useClerk, useUser } from "@clerk/clerk-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { useQueue } from "../hooks/useQueue";
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

  const pad = (num: number) => String(num).padStart(2, "0");
  return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
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
  const { signOut } = useClerk();
  const { user } = useUser();
  const isOnline = useOnlineStatus();
  const queueQuery = useQueue(user?.id ?? null);
  const clockLabel = useClockLabel();
  const activeItem = navItemForPath(location.pathname);

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
    ? "Demo Operator"
    : user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "Signed-in operator";
  const operatorRole = bypassAuth ? "Bypass mode" : "Owner / GC";
  const operatorInitials = initialsFromName(operatorName);
  const crumb = activeItem?.label ?? "Briefing";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-hex">GC</div>
          <div>
            <div className="brand-name">
              GC <em>Agent</em>
            </div>
            <div className="brand-sub">INTELLIGENT OPS SYSTEM</div>
          </div>
        </div>

        <div className="sys-bar">
          <div className="sys-dot" />
          <span className="sys-lbl">{isOnline ? "System Nominal" : "Cached Operation"}</span>
        </div>

        {groupedNav.map((group) => (
          <div className="nav-sec" key={group.section}>
            <div className="nav-sec-lbl">{group.section}</div>
            {group.items.map((item) => {
              const isActive = item.match(location.pathname);
              const badge = item.href === "/queue" && queueCount > 0 ? queueCount : item.badge;
              return (
                <Link key={item.href} to={item.href} className={`nav-item ${isActive ? "active" : ""}`}>
                  <span className="nav-ico">{item.ico}</span>
                  <span>{item.label}</span>
                  {badge ? <span className="nav-badge">{badge}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}

        <button
          type="button"
          className="sb-foot"
          onClick={() => {
            if (!bypassAuth) {
              void signOut({ redirectUrl: "/onboarding" });
            }
          }}
        >
          <div className="ava">{operatorInitials}</div>
          <div>
            <div className="ava-n">{operatorName}</div>
            <div className="ava-r">{operatorRole}</div>
          </div>
        </button>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="topbar">
          <span className="tb-crumb">
            GC AGENT / <span>{crumb}</span>
          </span>
          <div className="tb-right">
            <span className="tb-tag">{isOnline ? "MEM 74%" : "MEM CACHED"}</span>
            <div style={{ width: 1, height: 13, background: "var(--wire2)" }} />
            <span className="tb-time">{clockLabel}</span>
          </div>
        </div>

        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>{children}</main>
      </div>

      {!bypassAuth ? <BottomNav queueCount={queueCount} /> : null}
    </div>
  );
}
