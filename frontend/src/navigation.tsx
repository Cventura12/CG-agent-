import type { LucideIcon } from "lucide-react";
import {
  AudioWaveform,
  BarChart3,
  Blocks,
  BriefcaseBusiness,
  ClipboardList,
  House,
} from "lucide-react";

export type AppNavItem = {
  section: "Operations" | "Field";
  label: string;
  shortLabel: string;
  href: string;
  icon: LucideIcon;
  description: string;
  match: (pathname: string) => boolean;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    section: "Operations",
    label: "Command Center",
    shortLabel: "Home",
    href: "/",
    icon: House,
    description: "Morning briefing, risk summary, and today's work stack.",
    match: (pathname) => pathname === "/",
  },
  {
    section: "Operations",
    label: "New Quote",
    shortLabel: "Quote",
    href: "/quote",
    icon: AudioWaveform,
    description: "Capture field notes, upload files, review, send, and follow up.",
    match: (pathname) => pathname.startsWith("/quote"),
  },
  {
    section: "Operations",
    label: "Queue",
    shortLabel: "Queue",
    href: "/queue",
    icon: ClipboardList,
    description: "Fast approvals, edits, and draft triage across active jobs.",
    match: (pathname) => pathname.startsWith("/queue"),
  },
  {
    section: "Field",
    label: "Jobs",
    shortLabel: "Jobs",
    href: "/jobs",
    icon: BriefcaseBusiness,
    description: "Operational records, open items, and job history.",
    match: (pathname) => pathname.startsWith("/jobs"),
  },
  {
    section: "Field",
    label: "Analytics",
    shortLabel: "Metrics",
    href: "/analytics",
    icon: BarChart3,
    description: "Usage, delivery, queue performance, and runtime health.",
    match: (pathname) => pathname.startsWith("/analytics"),
  },
  {
    section: "Field",
    label: "Insights",
    shortLabel: "Insights",
    href: "/insights",
    icon: Blocks,
    description: "Cross-job patterns and grouped order opportunities.",
    match: (pathname) => pathname.startsWith("/insights"),
  },
];

export function navItemForPath(pathname: string): AppNavItem | null {
  return APP_NAV_ITEMS.find((item) => item.match(pathname)) ?? null;
}
