import clsx from "clsx";
import { Link, useLocation } from "react-router-dom";

import { APP_NAV_ITEMS } from "../navigation";

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-bg/90 backdrop-blur-xl lg:hidden">
      <div className="no-scrollbar mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 py-2">
        {APP_NAV_ITEMS.map((item) => {
          const isActive = item.match(location.pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={clsx(
                "flex min-h-[4.2rem] min-w-[4.6rem] flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-[11px] font-medium transition",
                isActive
                  ? "border-orange/60 bg-orange/10 text-orange"
                  : "border-transparent text-muted hover:border-border hover:bg-surface/80 hover:text-text"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="font-mono uppercase tracking-[0.12em]">{item.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
