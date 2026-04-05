import {
  BriefcaseBusiness,
  ChartColumnBig,
  ClipboardList,
  FileText,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { APP_NAV_ITEMS } from "../navigation";

function navIcon(href: string) {
  const className = "h-4 w-4";

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

export function BottomNav({ queueCount = 0 }: { queueCount?: number }) {
  const location = useLocation();
  const mobileItems = APP_NAV_ITEMS.filter((item) => item.href !== "/insights");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[rgba(8,12,23,0.92)] px-2 py-2 backdrop-blur-[18px] lg:hidden">
      <div className="grid grid-cols-5 gap-1">
        {mobileItems.map((item) => {
          const isActive = item.match(location.pathname);
          const badge = item.href === "/queue" && queueCount > 0 ? queueCount : item.badge;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`relative flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold no-underline transition ${
                isActive
                  ? "bg-white/[0.08] text-white"
                  : "text-white/44 hover:bg-white/[0.04] hover:text-white/82"
              }`}
            >
              {badge ? (
                <span className="absolute right-3 top-2 rounded-full border border-orange-300/18 bg-orange-400/12 px-1.5 py-0.5 font-mono text-[10px] text-orange-200">
                  {badge}
                </span>
              ) : null}
              {navIcon(item.href)}
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
