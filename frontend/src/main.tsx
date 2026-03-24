import { Component, StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles/globals.css";

function BootScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-8 text-[var(--t1)]">
      <div className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--bg-2)] p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">Arbor</p>
        <h1 className="mt-2 text-lg font-medium text-[var(--t1)]">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--t2)]">{detail}</p>
      </div>
    </main>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown frontend error",
    };
  }

  override render() {
    if (this.state.hasError) {
      return <BootScreen title="Frontend error" detail={`Arbor hit a browser error: ${this.state.message}`} />;
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
