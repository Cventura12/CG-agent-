import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuotePage } from "../../src/pages/QuotePage";

vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  UserButton: () => React.createElement("div", { "data-testid": "user-button" }),
}));

vi.mock("../../src/api/transcripts", () => ({
  fetchTranscriptQuotePrefill: vi.fn(),
}));

vi.mock("../../src/api/quote", () => ({
  hasBetaApiCredentials: () => true,
  getBetaContractorId: () => "gc-demo",
  submitQuote: vi.fn(),
  submitQuoteUpload: vi.fn(),
  fetchQuotePdf: vi.fn(),
  fetchQuoteXlsx: vi.fn(),
  fetchQuoteDelivery: async () => ({
    quote_id: "quote-1",
    trace_id: "trace-1",
    deliveries: [],
  }),
  fetchQuoteFollowup: async () => ({
    quote_id: "quote-1",
    trace_id: "trace-1",
    followup: null,
  }),
  approveQuote: vi.fn(),
  editQuote: vi.fn(),
  discardQuote: vi.fn(),
  sendQuoteToClient: vi.fn(),
  stopQuoteFollowup: vi.fn(),
}));

describe("QuotePage input menu", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
      },
      configurable: true,
    });
  });

  it("opens the + menu, closes on click-away, and activates the voice slot inline", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <QuotePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Add input" }));
    expect(screen.getByRole("menuitem", { name: "Add files or photos" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Voice memo" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Add PDF" })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menuitem", { name: "Voice memo" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add input" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Voice memo" }));

    expect(screen.getByText("Voice memo")).toBeInTheDocument();
    expect(screen.getByText("Hold to record")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss voice memo" })).toBeInTheDocument();
  });
});
