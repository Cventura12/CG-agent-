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
              type: "decision",
              description: "Permit approval",
              owner: "GC",
              status: "open",
              days_silent: 7,
              due_date: null,
            },
          ],
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
  it("shows cached/offline status and risk radar", async () => {
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

    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(await screen.findByText("Risk radar")).toBeInTheDocument();
    expect(screen.getByText("Needs action")).toBeInTheDocument();
  });
});
