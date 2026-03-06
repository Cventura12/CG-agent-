import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { QuotePage } from "../../src/pages/QuotePage";

const { stopQuoteFollowupMock } = vi.hoisted(() => ({
  stopQuoteFollowupMock: vi.fn(async () => ({
    quote_id: "quote-1",
    trace_id: "trace-1",
    stopped: true,
    reason: "manual_stop",
    followup: {
      open_item_id: "followup-1",
      quote_id: "quote-1",
      job_id: "job-1",
      status: "stopped",
      next_due_at: null,
      reminder_count: 1,
      last_reminder_at: "2026-03-05T12:00:00+00:00",
      stopped_at: "2026-03-05T16:00:00+00:00",
      stop_reason: "manual_stop",
      channel: "sms",
    },
  })),
}));

vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  UserButton: () => React.createElement("div", { "data-testid": "user-button" }),
}));

vi.mock("../../src/api/quote", () => ({
  hasBetaApiCredentials: () => true,
  getBetaContractorId: () => "gc-demo",
  submitQuote: vi.fn(),
  submitQuoteUpload: vi.fn(),
  fetchQuotePdf: vi.fn(),
  fetchQuoteDelivery: async () => ({
    quote_id: "quote-1",
    trace_id: "trace-1",
    deliveries: [],
  }),
  fetchQuoteFollowup: async () => ({
    quote_id: "quote-1",
    trace_id: "trace-1",
    followup: {
      open_item_id: "followup-1",
      quote_id: "quote-1",
      job_id: "job-1",
      status: "scheduled",
      next_due_at: "2026-03-06T14:00:00+00:00",
      reminder_count: 1,
      last_reminder_at: "2026-03-05T12:00:00+00:00",
      stopped_at: null,
      stop_reason: null,
      channel: "sms",
    },
  }),
  approveQuote: vi.fn(),
  editQuote: vi.fn(),
  discardQuote: vi.fn(),
  sendQuoteToClient: vi.fn(),
  stopQuoteFollowup: stopQuoteFollowupMock,
}));

describe("QuotePage follow-up card", () => {
  beforeEach(() => {
    stopQuoteFollowupMock.mockClear();
    const store = new Map<string, string>();
    const localStorageMock = {
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
    };
    Object.defineProperty(window, "localStorage", {
      value: localStorageMock,
      configurable: true,
    });

    window.localStorage.setItem(
      "gc-agent:quote:active:v1",
      JSON.stringify({
        quote_id: "quote-1",
        trace_id: "trace-1",
        quote_draft: {
          company_name: "GC Agent",
          customer_name: "Taylor",
          project_address: "14 Oak Lane",
          scope_of_work: "Replace roof shingles and underlayment.",
          total_price: 14350,
          exclusions: [],
        },
        rendered_quote: "Rendered quote preview",
        assumptions: [],
        clarification_questions: [],
        cold_start: { active: false, primary_trade: "general_construction" },
        estimate_confidence: {
          level: "high",
          score: 88,
          extraction_confidence: "high",
          missing_fields: [],
          missing_prices: [],
          reasons: ["Key scope and pricing inputs were available."],
        },
        active_job_id: "job-1",
        errors: [],
      })
    );
  });

  it("shows stopped follow-up state after the contractor pauses it", async () => {
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

    expect(await screen.findByText("Scheduled")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop follow-up" }));

    expect(await screen.findByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("Automatic follow-up has been paused for this quote.")).toBeInTheDocument();
    expect(screen.getByText("You paused automatic follow-up for this quote.")).toBeInTheDocument();
    expect(stopQuoteFollowupMock).toHaveBeenCalledTimes(1);
  });
});
