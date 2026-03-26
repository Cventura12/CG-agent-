import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuotePage } from "../../src/pages/QuotePage";

const { fetchQuoteXlsxMock } = vi.hoisted(() => ({
  fetchQuoteXlsxMock: vi.fn(async () => new Blob(["xlsx"], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
  fetchQuoteXlsx: fetchQuoteXlsxMock,
  fetchQuoteDelivery: async () => ({
    quote_id: "quote-export-1",
    trace_id: "trace-export-1",
    deliveries: [],
  }),
  fetchQuoteFollowup: async () => ({
    quote_id: "quote-export-1",
    trace_id: "trace-export-1",
    followup: null,
  }),
  approveQuote: vi.fn(),
  editQuote: vi.fn(),
  discardQuote: vi.fn(),
  sendQuoteToClient: vi.fn(),
  stopQuoteFollowup: vi.fn(),
}));

describe("QuotePage spreadsheet export", () => {
  beforeEach(() => {
    fetchQuoteXlsxMock.mockClear();
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

    window.localStorage.setItem(
      "gc-agent:quote:active:v1",
      JSON.stringify({
        quote_id: "quote-export-1",
        trace_id: "trace-export-1",
        quote_draft: {
          company_name: "Arbor Agent",
          customer_name: "Taylor Brooks",
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

    Object.defineProperty(window.URL, "createObjectURL", {
      value: vi.fn(() => "blob:quote-export"),
      configurable: true,
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
    });
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("shows the export action and downloads XLSX from the existing quote workflow", async () => {
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

    fireEvent.click(await screen.findByRole("button", { name: "Export XLSX" }));

    await waitFor(() => expect(fetchQuoteXlsxMock).toHaveBeenCalledWith("quote-export-1"));
    expect(await screen.findByText("Quote spreadsheet exported for Excel or CSV workflow handoff.")).toBeInTheDocument();
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });
});


