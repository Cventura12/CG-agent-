import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { JobDetailPage } from "../../src/pages/JobDetailPage";

const jobApiMocks = vi.hoisted(() => ({
  createOpenItemDraftAction: vi.fn(async () => ({
    draft: {
      id: "draft-co-1",
      job_id: "job-1",
      job_name: "Miller Job",
      type: "CO",
      title: "Draft change order for Miller Job",
      content: "Draft body",
      why: "Generated from an unresolved change item that is putting money at risk.",
      status: "queued",
      created_at: "2026-03-05T10:00:00+00:00",
      trace_id: "open-item-action:open-co-1",
      transcript: null,
    },
    open_item: {
      id: "open-co-1",
      job_id: "job-1",
      type: "CO",
      description: "Owner approved additional work that still needs pricing.",
      owner: "PM",
      status: "in-progress",
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
}));

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "gc-test" }),
}));

vi.mock("../../src/api/jobs", () => ({
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
          status: "open",
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

describe("JobDetailPage unresolved items", () => {
  it("surfaces unresolved financially important items and drafts follow-through from the card", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jobApiMocks.createOpenItemDraftAction.mockClear();
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/jobs/job-1"]}>
          <Routes>
            <Route path="/jobs/:jobId" element={<JobDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Unresolved changes & approvals")).toBeInTheDocument();
    expect(screen.getByText("Owner approved additional work that still needs pricing.")).toBeInTheDocument();
    expect(screen.getByText("Money at risk")).toBeInTheDocument();
    expect(screen.getByText("Financial exposure")).toBeInTheDocument();
    expect(screen.getByText("4 days silent")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Draft change order" }));
    expect(jobApiMocks.createOpenItemDraftAction).toHaveBeenCalledWith("job-1", "open-co-1");
    expect(await screen.findByText("Draft change order for Miller Job is ready in the review queue.")).toBeInTheDocument();
  });
});
