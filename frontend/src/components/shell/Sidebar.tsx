import clsx from "clsx";
import { BarChart2, BriefcaseBusiness, FileText, History, LayoutGrid, ListTodo } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { formatTimeAgo } from "../../lib/formatters";
import { useAppStore } from "../../store/appStore";
import { ArborLogo } from "../brand/ArborLogo";
import { Badge } from "../ui/Badge";
import { SectionLabel } from "../ui/SectionLabel";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutGrid;
};

const workspaceItems: NavItem[] = [
  { label: "Today", href: "/today", icon: LayoutGrid },
  { label: "Queue", href: "/queue", icon: ListTodo },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
];

const insightItems: NavItem[] = [
  { label: "Analytics", href: "/analytics", icon: BarChart2 },
  { label: "Job history", href: "/jobs", icon: History },
];

function jobDot(status: string): string {
  if (status === "active" || status === "in_progress") return "bg-[var(--green)]";
  if (status === "stalled") return "bg-[var(--amber)]";
  return "bg-[var(--t3)]";
}

export interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({ className, onNavigate }: SidebarProps = {}) {
  const location = useLocation();
  const user = useAppStore((state) => state.user);
  const agentStatus = useAppStore((state) => state.agentStatus);
  const queueItems = useAppStore((state) => state.queueItems);
  const jobs = useAppStore((state) => state.jobs);
  const recentJobs = [...jobs]
    .sort((left, right) => new Date(right.lastActivityAt ?? right.createdAt).getTime() - new Date(left.lastActivityAt ?? left.createdAt).getTime())
    .slice(0, 6);
  const queueCount = queueItems.filter((item) => item.status === "pending" || item.status === "manual_review").length;
  const urgentCount = queueItems.filter((item) => (item.status === "pending" || item.status === "manual_review") && item.urgent).length;
  const manualReviewCount = queueItems.filter((item) => item.status === "manual_review").length;

  return (
    <aside className={clsx("flex w-[220px] shrink-0 flex-col overflow-hidden border-r border-[var(--line)] bg-[var(--bg-2)]", className)}>
      <div className="border-b border-[var(--line)] px-4 py-3.5">
        <ArborLogo compact className="mb-3" />
        <SectionLabel>Agent</SectionLabel>
        <div className="mt-2 rounded-lg border border-[var(--acl)] bg-[var(--acl-2)] px-2.5 py-2">
          <div className="flex items-start gap-2">
            <span className={`mt-[4px] h-[6px] w-[6px] rounded-full ${agentStatus.active ? "bg-[var(--accent)] anim-pulse" : "bg-[var(--t3)]"}`} />
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[var(--t1)]">Arbor Agent · {agentStatus.active ? "Active" : "Offline"}</div>
              <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">Monitoring · {agentStatus.openItems} open items</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-2 py-2.5">
        <SectionLabel>Workspace</SectionLabel>
        <div className="space-y-0.5">
          {workspaceItems.map((item) => {
            const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-2 rounded-[7px] px-2 py-[7px] text-[12.5px] transition no-underline ${
                  active ? "bg-[var(--bg-4)] font-medium text-[var(--t1)]" : "text-[var(--t2)] hover:bg-[var(--bg-3)] hover:text-[var(--t1)]"
                }`}
              >
                <Icon className={`h-[14px] w-[14px] ${active ? "opacity-100" : "opacity-60"}`} strokeWidth={1.9} />
                <span>{item.label}</span>
                {item.href === "/queue" && queueCount > 0 ? (
                  <Badge color={manualReviewCount > 0 ? "accent" : urgentCount > 0 ? "amber" : "muted"} label={String(queueCount)} className="ml-auto" />
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="pt-3">
          <SectionLabel>Insights</SectionLabel>
          <div className="space-y-0.5">
            {insightItems.map((item) => {
              const active = item.href === "/jobs" ? location.pathname.startsWith("/jobs") : location.pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2 rounded-[7px] px-2 py-[7px] text-[12.5px] transition no-underline ${
                    active ? "bg-[var(--bg-4)] font-medium text-[var(--t1)]" : "text-[var(--t2)] hover:bg-[var(--bg-3)] hover:text-[var(--t1)]"
                  }`}
                >
                  <Icon className={`h-[14px] w-[14px] ${active ? "opacity-100" : "opacity-60"}`} strokeWidth={1.9} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {recentJobs.length > 0 ? (
          <div className="mt-3 min-h-0 overflow-hidden">
            <SectionLabel>Recent jobs</SectionLabel>
            <div className="scrollbar-none max-h-[calc(100vh-420px)] overflow-y-auto">
              {recentJobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  onClick={onNavigate}
                  className="flex items-start gap-2 border-b border-[var(--line)] px-2 py-2 text-inherit no-underline transition hover:bg-[var(--bg-3)]"
                >
                  <span className={`mt-[5px] h-[6px] w-[6px] shrink-0 rounded-full ${jobDot(job.status)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11.5px] text-[var(--t1)]">{job.name}</div>
                    <div className="mt-1 font-mono text-[10px] text-[var(--t3)]">
                      {job.status.replace("_", " ")} · {formatTimeAgo(job.lastActivityAt ?? job.createdAt)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-[var(--line)] px-4 py-3">
        <div className="text-[12px] font-medium text-[var(--t1)]">{user?.name ?? "Arbor Agent"}</div>
        <div className="mt-1 text-[11px] text-[var(--t3)]">{user?.companyName ?? "Arbor"}</div>
      </div>
    </aside>
  );
}


