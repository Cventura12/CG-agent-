import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuotePage } from "../../src/pages/QuotePage";

const { submitQuoteUploadMock } = vi.hoisted(() => ({
  submitQuoteUploadMock: vi.fn(async () => ({
    quote_id: "quote-upload-1",
    trace_id: "trace-upload-1",
    quote_draft: {
      company_name: "GC Agent",
      customer_name: "Taylor",
      project_address: "14 Oak Lane",
      scope_of_work: "Use uploaded scope and typed notes.",
      total_price: 14250,
      exclusions: [],
    },
    rendered_quote: "Rendered upload quote",
    assumptions: [],
    clarification_questions: [],
    cold_start: { active: false, primary_trade: "general_construction" },
    estimate_confidence: {
      level: "high",
      score: 88,
      extraction_confidence: "high",
      missing_fields: [],
      missing_prices: [],
      reasons: ["Uploaded scope and notes were available."],
    },
    active_job_id: "job-upload-1",
    errors: [],
    source_files: [
      {
        storage_ref: "supabase://quote-intake/quotes/gc-demo/source.pdf",
        bucket: "quote-intake",
        path: "quotes/gc-demo/source.pdf",
        filename: "source.pdf",
        content_type: "application/pdf",
        size_bytes: 4,
      },
    ],
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
  submitQuoteUpload: submitQuoteUploadMock,
  fetchQuotePdf: vi.fn(),
  fetchQuoteXlsx: vi.fn(),
  fetchQuoteDelivery: async () => ({
    quote_id: "quote-upload-1",
    trace_id: "trace-upload-1",
    deliveries: [],
  }),
  fetchQuoteFollowup: async () => ({
    quote_id: "quote-upload-1",
    trace_id: "trace-upload-1",
    followup: null,
  }),
  approveQuote: vi.fn(),
  editQuote: vi.fn(),
  discardQuote: vi.fn(),
  sendQuoteToClient: vi.fn(),
  stopQuoteFollowup: vi.fn(),
}));

describe("QuotePage upload intake", () => {
  beforeEach(() => {
    submitQuoteUploadMock.mockClear();
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

  it("submits typed notes and an uploaded PDF together", async () => {
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

    fireEvent.change(screen.getByLabelText("Transcript / field notes"), {
      target: { value: "Please use the uploaded insurance scope." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Add input" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add PDF" }));

    expect(screen.getByText("PDF attachment")).toBeInTheDocument();

    const fileInput = document.querySelector(
      'input[type="file"][accept=".pdf,application/pdf"]'
    ) as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3, 4])], "source.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "Generate quote" }));

    await waitFor(() => expect(submitQuoteUploadMock).toHaveBeenCalledTimes(1));
    expect(submitQuoteUploadMock).toHaveBeenCalledWith(
      "Please use the uploaded insurance scope.",
      expect.objectContaining({
        name: "source.pdf",
        type: "application/pdf",
      }),
      {
        transcriptId: "",
        jobId: "",
      }
    );
    expect(await screen.findByText("Quote Draft")).toBeInTheDocument();
    expect(screen.getByText("14 Oak Lane")).toBeInTheDocument();
  });
});
