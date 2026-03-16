import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { JobDetailPage } from "../../src/pages/JobDetailPage";

const jobApiMocks = vi.hoisted(() => ({
  advanceOpenItemLifecycle: vi.fn(async () => ({
    open_item: {
      id: "open-co-1",
      job_id: "job-1",
      type: "CO",
      description: "Owner approved additional work that still needs pricing.",
      owner: "PM",
      status: "in-progress",
      action_stage: "sent",
      action_stage_label: "Sent",
      action_stage_summary: "Sent out and waiting on the customer.",
      days_silent: 4,
      due_date: null,
      financial_exposure: true,
      change_related: true,
      followthrough_related: false,
      stalled: true,
      kind_label: "Money at risk",
      action_trace_id: "open-item-action:open-co-1",
      action_draft_type: "CO",
      action_label: "Draft change order",
    },
  })),
  createOpenItemDraftAction: vi.fn(),
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "gc-test" }),
}));

vi.mock("../../src/api/jobs", () => ({
  advanceOpenItemLifecycle: jobApiMocks.advanceOpenItemLifecycle,
  createOpenItemDraftAction: jobApiMocks.createOpenItemDraftAction,
  fetchJobDetail: async () => ({
    job: {
      id: "job-1",
      name: "Miller Job",
      type: "Roofing",
      status: "active",
      health: "at-risk",
      address: "101 Main St",
      contract_value: 90000,
      contract_type: "Lump Sum",
      est_completion: "2026-12-01",
      notes: "",
      last_updated: "2026-03-05T10:00:00+00:00",
      open_items: [
        {
          id: "open-co-1",
          job_id: "job-1",
          type: "CO",
          description: "Owner approved additional work that still needs pricing.",
          owner: "PM",
          status: "in-progress",
          action_stage: "approved",
          action_stage_label: "Office approved",
          action_stage_summary: "Office review is done. Next step is to send it out.",
          days_silent: 4,
          due_date: null,
          financial_exposure: true,
          change_related: true,
          followthrough_related: false,
          stalled: true,
          kind_label: "Money at risk",
          action_trace_id: "open-item-action:open-co-1",
          action_draft_type: "CO",
          action_label: "Draft change order",
        },
      ],
      operational_summary: {
        open_item_count: 1,
        financial_exposure_count: 1,
        unresolved_change_count: 1,
        approval_count: 0,
        followthrough_count: 0,
        stalled_count: 1,
      },
    },
    recent_updates: [],
    call_history: [],
    audit_timeline: [],
    followup_state: null,
  }),
}));

vi.mock("../../src/api/queue", () => ({
  approveDraft: vi.fn(),
  editDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock("../../src/api/transcripts", () => ({
  logTranscriptAsUpdate: vi.fn(),
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

describe("JobDetailPage open-item lifecycle", () => {
  it("shows post-approval lifecycle controls for unresolved change work", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const user = userEvent.setup();
    jobApiMocks.advanceOpenItemLifecycle.mockClear();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/jobs/job-1"]}>
          <Routes>
            <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Office approved")).toBeInTheDocument();
    expect(screen.getByText("Office review is done. Next step is to send it out.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Mark sent" }));

    expect(jobApiMocks.advanceOpenItemLifecycle).toHaveBeenCalledWith("job-1", "open-co-1", "sent");
    expect(await screen.findByText("Money at risk marked sent and is now waiting on the customer.")).toBeInTheDocument();
  });
});
