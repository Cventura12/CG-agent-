import {
  BarChart2,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  ListTodo,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Badge } from "../ui/Badge";
import type { AgentStatus, Job, QueueItem } from "../../types/today";

type WorkspaceItem = {
  label: string;
  href: string;
  icon: typeof CalendarDays;
};

const workspaceItems: WorkspaceItem[] = [
  { label: "Today", href: "/", icon: CalendarDays },
  { label: "Queue", href: "/queue", icon: ListTodo },
  { label: "Quotes", href: "/quote", icon: FileText },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
];

const insightItems: WorkspaceItem[] = [
  { label: "Analytics", href: "/analytics", icon: BarChart2 },
  { label: "Job history", href: "/insights", icon: History },
];

function formatRelativeShort(value?: string): string {
  if (!value) return "waiting";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "waiting";

  const deltaMs = Date.now() - parsed.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < hour) {
    return `${Math.max(1, Math.floor(deltaMs / minute))}m`;
  }
  if (deltaMs < day) {
    return `${Math.max(1, Math.floor(deltaMs / hour))}h`;
  }
  return `${Math.max(1, Math.floor(deltaMs / day))}d`;
}

function recentJobTone(status: Job["status"]): string {
  if (status === "active") return "bg-[var(--green)]";
  if (status === "quoted") return "bg-[var(--t3)]";
  return "bg-[var(--amber)]";
}

export interface SidebarProps {
  agentStatus: AgentStatus;
  queueItems: QueueItem[];
  recentJobs: Job[];
}

export function Sidebar({ agentStatus, queueItems, recentJobs }: SidebarProps) {
  const location = useLocation();
  const urgentQueue = queueItems.some((item) => item.urgent);

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-2)]">
      <div className="border-b border-[var(--line)] px-4 py-[14px]">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--t3)]">Agent</div>
        <div className="mt-[10px] rounded-lg border border-[var(--acl)] bg-[var(--acl-2)] px-2.5 py-2">
          <div className="flex items-start gap-2">
            <span
              className={`mt-[4px] h-[6px] w-[6px] rounded-full ${agentStatus.active ? "bg-[var(--accent)] animate-pulse-slow" : "bg-[var(--t3)]"}`}
            />
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[var(--t1)]">
                Arbor Agent · {agentStatus.active ? "Active" : "Offline"}
              </div>
              <div className="mt-[3px] font-mono text-[10px] text-[var(--t3)]">
                Monitoring · {queueItems.length} open items
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-2 py-[12px]">
        <div className="mb-[6px] px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--t3)]">
          Workspace
        </div>
        <div className="space-y-[2px]">
          {workspaceItems.map((item) => {
            const active = item.href === "/" ? location.pathname === "/" : location.pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-[9px] rounded-[7px] px-2 py-[7px] text-[12.5px] no-underline transition ${
                  active
                    ? "bg-[var(--bg-4)] font-medium text-[var(--t1)]"
                    : "text-[var(--t2)] hover:bg-[var(--bg-3)] hover:text-[var(--t1)]"
                }`}
              >
                <Icon className={`h-[14px] w-[14px] ${active ? "opacity-100" : "opacity-60"}`} strokeWidth={1.9} />
                <span>{item.label}</span>
                {item.href === "/queue" && queueItems.length > 0 ? (
                  <Badge tone={urgentQueue ? "accent" : "warn"} className="ml-auto px-[5px] py-[2px] text-[9px] normal-case tracking-normal">
                    {queueItems.length}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="mb-[6px] mt-5 px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--t3)]">
          Insights
        </div>
        <div className="space-y-[2px]">
          {insightItems.map((item) => {
            const active = location.pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-[9px] rounded-[7px] px-2 py-[7px] text-[12.5px] no-underline transition ${
                  active
                    ? "bg-[var(--bg-4)] font-medium text-[var(--t1)]"
                    : "text-[var(--t2)] hover:bg-[var(--bg-3)] hover:text-[var(--t1)]"
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
        <div className="today-scrollbar-hidden min-h-0 flex-1 overflow-y-auto border-t border-[var(--line)] px-2 py-[12px]">
          <div className="mb-[8px] px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--t3)]">
            Recent jobs
          </div>
          <div className="space-y-[2px]">
            {recentJobs.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="flex items-center gap-[8px] rounded-md border-b border-[var(--line)] px-2 py-2 text-inherit no-underline transition last:border-b-0 hover:bg-[var(--bg-3)]"
              >
                <span className={`h-[6px] w-[6px] shrink-0 rounded-full ${recentJobTone(job.status)}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11.5px] text-[var(--t1)]">{job.name}</div>
                  <div className="mt-[2px] flex items-center gap-[5px] font-mono text-[10px] text-[var(--t3)]">
                    <Clock3 className="h-[10px] w-[10px]" strokeWidth={2.1} />
                    <span>{formatRelativeShort(job.lastActivity)}</span>
                  </div>
                </div>
                {job.status === "active" ? (
                  <CheckCircle2 className="h-[12px] w-[12px] text-[var(--green)]" strokeWidth={2.1} />
                ) : null}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}


