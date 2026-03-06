import { Link, useLocation } from "react-router-dom";

import { APP_NAV_ITEMS } from "../navigation";

export function BottomNav({ queueCount = 0 }: { queueCount?: number }) {
  const location = useLocation();
  const mobileItems = APP_NAV_ITEMS.filter((item) => item.href !== "/insights");

  return (
    <nav className="mnav lg:hidden">
      <div className="mni">
        {mobileItems.map((item) => {
          const isActive = item.match(location.pathname);
          const badge = item.href === "/queue" && queueCount > 0 ? queueCount : item.badge;
          return (
            <Link key={item.href} to={item.href} className={`mnb ${isActive ? "active" : ""}`}>
              {badge ? <div className="mnbadge">{badge}</div> : null}
              <span className="mnico">{item.ico}</span>
              <span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
