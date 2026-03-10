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

export function BottomNav({ queueCount = 0 }: { queueCount?: number }) {
  const location = useLocation();
  const mobileItems = APP_NAV_ITEMS.filter((item) => item.href !== "/insights");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
      <div className="grid grid-cols-5 gap-1 px-2 py-2">
        {mobileItems.map((item) => {
          const isActive = item.match(location.pathname);
          const badge = item.href === "/queue" && queueCount > 0 ? queueCount : item.badge;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`relative flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold no-underline transition ${
                isActive ? "bg-blue-50 text-[#2453d4]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {badge ? <span className="absolute right-3 top-2 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">{badge}</span> : null}
              {navIcon(item.href)}
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

