import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { FileText, Upload } from "lucide-react";

import { useAppStore } from "../../store/appStore";
import { Button } from "../ui/Button";
import { IconRail } from "./IconRail";
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
  const user = useAppStore((state) => state.user);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const approveAllQueueItems = useAppStore((state) => state.approveAllQueueItems);
  const { title, subtitle } = routeMeta(location.pathname);

  useEffect(() => {
    setActiveView(location.pathname);
  }, [location.pathname, setActiveView]);

  const actions = (() => {
    if (location.pathname.startsWith("/queue")) {
      return (
        <Button variant="ghost" onClick={() => approveAllQueueItems()}>
          Mark all reviewed
        </Button>
      );
    }

    if (location.pathname.startsWith("/quotes")) {
      return (
        <Button variant="accent" leftIcon={<FileText className="h-[14px] w-[14px]" strokeWidth={2} />} onClick={() => navigate("/quotes")}>New quote</Button>
      );
    }

    if (location.pathname.startsWith("/jobs")) {
      return <Button variant="accent" onClick={() => navigate("/jobs")}>New job</Button>;
    }

    if (location.pathname.startsWith("/analytics")) {
      return null;
    }

    return (
      <>
        <Button variant="ghost" leftIcon={<Upload className="h-[14px] w-[14px]" strokeWidth={2} />} onClick={() => navigate("/queue")}>Import transcript</Button>
        <Button variant="accent" leftIcon={<FileText className="h-[14px] w-[14px]" strokeWidth={2} />} onClick={() => navigate("/quotes")}>New quote</Button>
      </>
    );
  })();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      <IconRail initials={user?.initials ?? "GC"} />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar title={title} subtitle={subtitle} actions={actions} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
