import clsx from "clsx";
import { FileAudio2, ListChecks, MessageSquareText, BriefcaseBusiness } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

type NavItem = {
  label: string;
  href: string;
  icon: typeof MessageSquareText;
  match: (pathname: string) => boolean;
};

const navItems: NavItem[] = [
  {
    label: "Briefing",
    href: "/",
    icon: MessageSquareText,
    match: (pathname) => pathname === "/",
  },
  {
    label: "New Quote",
    href: "/quote",
    icon: FileAudio2,
    match: (pathname) => pathname.startsWith("/quote"),
  },
  {
    label: "Queue",
    href: "/queue",
    icon: ListChecks,
    match: (pathname) => pathname.startsWith("/queue"),
  },
  {
    label: "Jobs",
    href: "/jobs",
    icon: BriefcaseBusiness,
    match: (pathname) => pathname.startsWith("/jobs"),
  },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md">
      <div className="mx-auto grid max-w-4xl grid-cols-4">
        {navItems.map((item) => {
          const isActive = item.match(location.pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={clsx(
                "flex min-h-16 flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors",
                isActive ? "text-orange" : "text-muted hover:text-text"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="font-mono uppercase tracking-[0.14em]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
