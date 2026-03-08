import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuotePage } from "../../src/pages/QuotePage";

const { submitQuoteMock, fetchTranscriptQuotePrefillMock } = vi.hoisted(() => ({
  submitQuoteMock: vi.fn(async () => ({
    quote_id: "quote-transcript-1",
    trace_id: "trace-quote-transcript-1",
    quote_draft: {
      company_name: "GC Agent",
      customer_name: "Taylor Brooks",
      project_address: "101 Main St",
      scope_of_work: "Prepare an exterior paint estimate.",
      total_price: 9800,
      exclusions: [],
    },
    rendered_quote: "Rendered transcript quote",
    assumptions: [],
    clarification_questions: ["Confirm exact square footage"],
    cold_start: { active: false, primary_trade: "general_construction" },
    estimate_confidence: {
      level: "medium",
      score: 74,
      extraction_confidence: "medium",
      missing_fields: ["Exact square footage"],
      missing_prices: [],
      reasons: ["Transcript had scope but still needs one confirmation."],
      missing_information: ["Exact square footage"],
      evidence_signals: ["Transcript summary captured scope items."],
      review_required: true,
      send_blocked: true,
      blocking_reasons: ["Confirm missing information before sending."],
    },
    active_job_id: "job-9",
    review_required: true,
    send_blocked: true,
    blocking_reasons: ["Confirm missing information before sending."],
    missing_information: ["Exact square footage"],
    evidence_signals: ["Transcript summary captured scope items."],
    errors: [],
  })),
  fetchTranscriptQuotePrefillMock: vi.fn(async () => ({
    transcript_id: "ct-1",
    trace_id: "trace-transcript-1",
    classification: "estimate_request",
    confidence: 87,
    summary: "Caller wants a first-pass exterior paint estimate.",
    urgency: "high",
    caller_name: "Taylor Brooks",
    caller_phone: "+14235550101",
    linked_job_id: "job-9",
    linked_quote_id: "",
    customer_name: "Taylor Brooks",
    job_type: "Exterior Painting",
    scope_items: ["Prime siding", "Paint trim", "Power wash front elevation"],
    customer_questions: ["Can you include better-grade paint?"],
    insurance_involved: false,
    missing_information: ["Exact square footage", "Color selection"],
    recommended_actions: ["Create quote draft", "Confirm material grade"],
    scheduling_notes: ["Needs number before Friday"],
    estimate_related: true,
    quote_input:
      "Call transcript estimate request\nSummary: Caller wants a first-pass exterior paint estimate.\nScope items:\n- Prime siding\n- Paint trim\nUse this transcript as field notes.",
  })),
}));

vi.mock("@clerk/clerk-react", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  UserButton: () => React.createElement("div", { "data-testid": "user-button" }),
}));

vi.mock("../../src/api/transcripts", () => ({
  fetchTranscriptQuotePrefill: fetchTranscriptQuotePrefillMock,
}));

vi.mock("../../src/api/quote", () => ({
  hasBetaApiCredentials: () => true,
  getBetaContractorId: () => "gc-demo",
  submitQuote: submitQuoteMock,
  submitQuoteUpload: vi.fn(),
  fetchQuotePdf: vi.fn(),
  fetchQuoteXlsx: vi.fn(),
  fetchQuoteDelivery: async () => ({
    quote_id: "quote-transcript-1",
    trace_id: "trace-quote-transcript-1",
    deliveries: [],
  }),
  fetchQuoteFollowup: async () => ({
    quote_id: "quote-transcript-1",
    trace_id: "trace-quote-transcript-1",
    followup: null,
  }),
  approveQuote: vi.fn(),
  editQuote: vi.fn(),
  discardQuote: vi.fn(),
  sendQuoteToClient: vi.fn(),
  stopQuoteFollowup: vi.fn(),
}));

describe("QuotePage transcript prefill", () => {
  beforeEach(() => {
    submitQuoteMock.mockClear();
    fetchTranscriptQuotePrefillMock.mockClear();
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

  it("loads transcript estimate context into the existing quote workspace", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/quote?transcript_id=ct-1"]}>
          <QuotePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Call Transcript Context")).toBeInTheDocument();
    expect(screen.getByText("Caller wants a first-pass exterior paint estimate.")).toBeInTheDocument();
    expect(screen.getAllByText("Exact square footage").length).toBeGreaterThan(0);
    expect(screen.getByText("Prime siding")).toBeInTheDocument();

    const notesField = screen.getByLabelText("Transcript / field notes") as HTMLTextAreaElement;
    expect(notesField.value).toContain("Call transcript estimate request");
    expect(notesField.value).toContain("Prime siding");

    fireEvent.click(screen.getByRole("button", { name: "GENERATE QUOTE →" }));

    await waitFor(() => expect(submitQuoteMock).toHaveBeenCalledTimes(1));
    expect(submitQuoteMock).toHaveBeenCalledWith(
      expect.stringContaining("Call transcript estimate request"),
      {
        transcriptId: "ct-1",
        jobId: "job-9",
      }
    );
    expect(await screen.findByText("Quote Draft")).toBeInTheDocument();
  });
});
