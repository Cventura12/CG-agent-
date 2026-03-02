import { Component, StrictMode, Suspense, lazy } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import "./styles.css";

const App = lazy(() => import("./App"));

function BootScreen({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <main className="min-h-screen bg-bg px-3 py-6 text-text sm:px-4">
      <div className="mx-auto max-w-md rounded-lg border border-border bg-surface p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-orange">GC Agent</p>
        <h1 className="mt-2 text-lg font-semibold text-text">{title}</h1>
        <p className="mt-2 text-sm text-muted">{detail}</p>
      </div>
    </main>
  );
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: "",
    };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown frontend error",
    };
  }

  override componentDidCatch(error: unknown) {
    console.error("GC Agent frontend crashed", error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <BootScreen
          title="Frontend error"
          detail={`GC Agent hit a browser error: ${this.state.message}`}
        />
      );
    }

    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppErrorBoundary>
          <Suspense
            fallback={
              <BootScreen
                title="Loading app"
                detail="GC Agent is loading the frontend bundle."
              />
            }
          >
            <App />
          </Suspense>
        </AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
