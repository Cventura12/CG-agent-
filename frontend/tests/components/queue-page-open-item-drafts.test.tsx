import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { QueuePage } from "../../src/pages/QueuePage";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "gc-test" }),
}));

vi.mock("../../src/api/queue", () => ({
  approveAll: vi.fn(),
  approveDraft: vi.fn(),
  editDraft: vi.fn(),
  discardDraft: vi.fn(),
}));

vi.mock("../../src/api/transcripts", () => ({
  linkTranscriptToJob: vi.fn(),
  markTranscriptReviewed: vi.fn(),
  discardTranscript: vi.fn(),
  logTranscriptAsUpdate: vi.fn(),
}));

vi.mock("../../src/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => true,
}));

vi.mock("../../src/hooks/useJobs", () => ({
  useJobs: () => ({
    data: {
      jobs: [
        {
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
          last_updated: "2026-03-06T10:00:00+00:00",
          open_items: [
            {
              id: "open-co-1",
              job_id: "job-1",
              type: "CO",
              description: "Owner approved additional work that still needs pricing.",
              owner: "PM",
              status: "in-progress",
              action_stage: "drafted",
              action_stage_label: "Drafted",
              action_stage_summary: "Draft is waiting on office review.",
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
        },
      ],
    },
    isLoading: false,
  }),
}));

vi.mock("../../src/hooks/useQueue", () => ({
  useQueue: () => ({
    isLoading: false,
    isError: false,
    data: {
      jobs: [
        {
          job_id: "job-1",
          job_name: "Miller Job",
          drafts: [
            {
              id: "draft-co-1",
              job_id: "job-1",
              job_name: "Miller Job",
              type: "CO",
              title: "Draft change order for Miller Job",
              content: "Draft body",
              why: "Generated from an unresolved change item that is putting money at risk.",
              status: "queued",
              created_at: "2026-03-06T10:00:00+00:00",
              trace_id: "open-item-action:open-co-1",
              transcript: null,
            },
          ],
        },
      ],
      inbox: { transcripts: [] },
    },
  }),
}));

describe("QueuePage open-item action drafts", () => {
  it("surfaces change-order follow-through drafts clearly", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <QueuePage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Change order draft")).toBeInTheDocument();
    expect(screen.getByText("Money at risk")).toBeInTheDocument();
    expect(screen.getByText("Drafted")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Owner approved additional work that still needs pricing."));

    expect((await screen.findAllByText("Draft is waiting on office review.")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Approve for send" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to open" })).toBeInTheDocument();
  });
});
