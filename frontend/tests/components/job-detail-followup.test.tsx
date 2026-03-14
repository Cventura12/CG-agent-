import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { JobDetailPage } from "../../src/pages/JobDetailPage";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "gc-test" }),
}));

vi.mock("../../src/api/jobs", () => ({
  fetchJobDetail: async () => ({
    job: {
      id: "job-1",
      name: "Miller Job",
      type: "Roofing",
      status: "active",
      health: "on-track",
      address: "101 Main St",
      contract_value: 90000,
      contract_type: "Lump Sum",
      est_completion: "2026-12-01",
      notes: "",
      last_updated: "2026-03-05T10:00:00+00:00",
      open_items: [],
    },
    recent_updates: [],
    call_history: [],
    audit_timeline: [],
    followup_state: {
      open_item_id: "followup-1",
      quote_id: "quote-1",
      job_id: "job-1",
      status: "stopped",
      next_due_at: null,
      reminder_count: 2,
      last_reminder_at: "2026-03-05T12:00:00+00:00",
      stopped_at: "2026-03-06T12:00:00+00:00",
      stop_reason: "max_reminders_reached",
      channel: "email",
    },
  }),
}));

vi.mock("../../src/api/queue", () => ({
  approveDraft: vi.fn(),
  editDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock("../../src/hooks/useQueue", () => ({
  useQueue: () => ({
    isLoading: false,
    data: {
      jobs: [],
      inbox: { transcripts: [] },
    },
    dataUpdatedAt: 0,
  }),
}));

describe("JobDetailPage follow-up state", () => {
  it("shows the latest contractor-facing follow-up summary", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/jobs/job-1"]}>
          <Routes>
            <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Customer follow-through")).toBeInTheDocument();
    expect(screen.getByText("Automatic follow-through is paused for this quote.")).toBeInTheDocument();
    expect(screen.getByText("Two follow-through reminders have already been sent.")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });
});
