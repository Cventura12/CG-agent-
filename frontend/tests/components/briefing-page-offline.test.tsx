import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { BriefingPage } from "../../src/pages/BriefingPage";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "gc-test" }),
  useClerk: () => ({ signOut: vi.fn() }),
  UserButton: () => React.createElement("div", { "data-testid": "user-button" }),
}));

vi.mock("../../src/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => false,
}));

vi.mock("../../src/hooks/useQueue", () => ({
  useQueue: () => ({
    isLoading: false,
    data: {
      jobs: [{ job_id: "job-1", job_name: "Blocked Roof", drafts: [{ id: "d1" }] }],
    },
  }),
}));

vi.mock("../../src/hooks/useJobs", () => ({
  useJobs: () => ({
    isLoading: false,
    data: {
      jobs: [
        {
          id: "job-1",
          name: "Blocked Roof",
          type: "roofing",
          status: "active",
          health: "blocked",
          address: "1 Risk Lane",
          contract_value: 10000,
          contract_type: "fixed",
          est_completion: "2026-03-12",
          notes: "",
          last_updated: "2026-03-01T12:00:00Z",
          open_items: [
            {
              id: "o1",
              job_id: "job-1",
              type: "CO",
              description: "Owner approved added work that still needs pricing.",
              owner: "GC",
              status: "in-progress",
              action_stage: "approved",
              action_stage_label: "Office approved",
              action_stage_summary: "Office review is done. Next step is to send it out.",
              days_silent: 7,
              due_date: null,
              financial_exposure: true,
              change_related: true,
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
      ],
    },
  }),
}));

vi.mock("../../src/api/contractor", () => ({
  hasContractorApiCredentials: () => true,
  fetchContractorBriefing: async () => ({
    briefing: "ACTION - Call supplier\nON TRACK - Cleanup complete",
  }),
}));

describe("BriefingPage offline mode", () => {
  it("shows cached/offline status and the new briefing dashboard", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <BriefingPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Offline cache active/i)).toBeInTheDocument();
    expect(await screen.findByText("Morning Briefing")).toBeInTheDocument();
    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    expect(screen.getByText("Today's Follow-ups")).toBeInTheDocument();
    expect(screen.getAllByText("Office approved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Office review is done. Next step is to send it out.").length).toBeGreaterThan(0);
  });
});
