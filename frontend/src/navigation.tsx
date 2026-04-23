export type AppNavItem = {
  section: "Operations" | "Field";
  label: string;
  shortLabel: string;
  href: string;
  ico: string;
  badge?: number | null;
  description: string;
  match: (pathname: string) => boolean;
};

export const APP_NAV_ITEMS: AppNavItem[] = [
  {
    section: "Operations",
    label: "Briefing",
    shortLabel: "Home",
    href: "/",
    ico: "â¬¡",
    badge: null,
    description: "Morning briefing and live action readout.",
    match: (pathname) => pathname === "/",
  },
  {
    section: "Operations",
    label: "New Quote",
    shortLabel: "Quote",
    href: "/quote",
    ico: "ï¼",
    badge: null,
    description: "Capture, review, send, and follow up.",
    match: (pathname) => pathname.startsWith("/quote"),
  },
  {
    section: "Operations",
    label: "Queue",
    shortLabel: "Queue",
    href: "/queue",
    ico: "â¡",
    badge: null,
    description: "Drafts awaiting contractor review.",
    match: (pathname) => pathname.startsWith("/queue"),
  },
  {
    section: "Field",
    label: "Jobs",
    shortLabel: "Jobs",
    href: "/jobs",
    ico: "â«",
    badge: null,
    description: "Operational records and job history.",
    match: (pathname) => pathname.startsWith("/jobs"),
  },
  {
    section: "Field",
    label: "Analytics",
    shortLabel: "Stats",
    href: "/analytics",
    ico: "â",
    badge: null,
    description: "Runtime, delivery, and outcome metrics.",
    match: (pathname) => pathname.startsWith("/analytics"),
  },
  {
    section: "Field",
    label: "Insights",
    shortLabel: "Insights",
    href: "/insights",
    ico: "â",
    badge: null,
    description: "Cross-job leverage and pattern detection.",
    match: (pathname) => pathname.startsWith("/insights"),
  },
];

export function navItemForPath(pathname: string): AppNavItem | null {
  return APP_NAV_ITEMS.find((item) => item.match(pathname)) ?? null;
}

