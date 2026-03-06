import clsx from "clsx";
import { Link, useLocation } from "react-router-dom";

import { APP_NAV_ITEMS } from "../navigation";

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="mobile-nav-shell fixed inset-x-0 bottom-0 z-40 lg:hidden">
      <div className="no-scrollbar mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 py-2">
        {APP_NAV_ITEMS.map((item) => {
          const isActive = item.match(location.pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={clsx(
                "mobile-nav-item",
                isActive ? "mobile-nav-item-active" : "border-transparent text-muted hover:border-border/80 hover:bg-surface/70 hover:text-text"
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
