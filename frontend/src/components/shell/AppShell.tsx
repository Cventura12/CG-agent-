import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { FileText, Menu, Upload, X } from "lucide-react";

import { useQueueItems } from "../../hooks/useQueueItems";
import { useVoiceSessions } from "../../hooks/useVoiceSessions";
import { useAppStore } from "../../store/appStore";
import { Button } from "../ui/Button";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

function routeMeta(pathname: string): { title: string; subtitle?: string } {
  if (pathname.startsWith("/queue")) {
    return {
      title: "Queue",
      subtitle: "Approve extracted actions before anything goes out.",
    };
  }
  if (pathname.startsWith("/quotes")) {
    return {
      title: "Quotes",
      subtitle: "Drafts, sends, and customer response all in one lane.",
    };
  }
  if (pathname.startsWith("/jobs")) {
    return {
      title: "Jobs",
      subtitle: "Every active job, quote, follow-up, and note in one place.",
    };
  }
  if (pathname.startsWith("/analytics")) {
    return {
      title: "Analytics",
      subtitle: "What the agent is actually converting into revenue.",
    };
  }
  return {
    title: "Today",
    subtitle: "The agent is already watching the operation. Start with what needs a decision.",
  };
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const setActiveView = useAppStore((state) => state.setActiveView);
  const approveAllQueueItems = useAppStore((state) => state.approveAllQueueItems);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { title, subtitle } = routeMeta(location.pathname);

  useQueueItems();
  useVoiceSessions();

  useEffect(() => {
    setActiveView(location.pathname);
    setMobileNavOpen(false);
  }, [location.pathname, setActiveView]);

  const actions = (() => {
    if (location.pathname.startsWith("/queue")) {
      return (
        <Button variant="ghost" onClick={() => approveAllQueueItems()} className="whitespace-nowrap">
          Mark all reviewed
        </Button>
      );
    }

    if (location.pathname.startsWith("/quotes")) {
      return (
        <Button
          variant="accent"
          leftIcon={<FileText className="h-[14px] w-[14px]" strokeWidth={2} />}
          onClick={() => navigate({ pathname: location.pathname, search: "?compose=1" })}
          className="whitespace-nowrap"
        >
          New quote
        </Button>
      );
    }

    if (location.pathname.startsWith("/jobs")) {
      return (
        <Button variant="accent" onClick={() => navigate("/jobs")} className="whitespace-nowrap">
          New job
        </Button>
      );
    }

    if (location.pathname.startsWith("/analytics")) {
      return null;
    }

    return (
      <>
        <Button
          variant="ghost"
          leftIcon={<Upload className="h-[14px] w-[14px]" strokeWidth={2} />}
          onClick={() => navigate("/queue")}
          className="whitespace-nowrap"
        >
          Import transcript
        </Button>
        <Button
          variant="accent"
          leftIcon={<FileText className="h-[14px] w-[14px]" strokeWidth={2} />}
          onClick={() => navigate("/quotes?compose=1")}
          className="whitespace-nowrap"
        >
          New quote
        </Button>
      </>
    );
  })();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      <Sidebar className="hidden lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          subtitle={subtitle}
          actions={actions}
          leading={
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-md border border-[var(--line-2)] text-[var(--t2)] transition hover:bg-[var(--bg-3)] hover:text-[var(--t1)]"
              aria-label="Open navigation"
            >
              <Menu className="h-[16px] w-[16px]" strokeWidth={2} />
            </button>
          }
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button type="button" className="flex-1 bg-black/55" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
          <div className="flex w-[min(88vw,320px)] shrink-0 flex-col border-l border-[var(--line)] bg-[var(--bg-2)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
              <div>
                <div className="text-[13px] font-medium text-[var(--t1)]">GC Agent</div>
                <div className="mt-[2px] text-[11px] text-[var(--t3)]">Workspace</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-[32px] w-[32px] items-center justify-center rounded-md border border-[var(--line-2)] text-[var(--t2)] transition hover:bg-[var(--bg-3)] hover:text-[var(--t1)]"
                aria-label="Close navigation"
              >
                <X className="h-[16px] w-[16px]" strokeWidth={2} />
              </button>
            </div>
            <Sidebar className="h-full w-full border-r-0 border-l-0" onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
