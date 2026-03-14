import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { JobsPage } from "../../src/pages/JobsPage";

vi.mock("@clerk/clerk-react", () => ({
  useAuth: () => ({ userId: "gc-test" }),
  useClerk: () => ({ signOut: vi.fn() }),
  UserButton: () => React.createElement("div", { "data-testid": "user-button" }),
}));

vi.mock("../../src/hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => false,
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
              days_silent: 8,
              type: "CO",
              description: "Owner approved added work that still needs pricing.",
              owner: "PM",
              status: "open",
              due_date: null,
              financial_exposure: true,
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
        {
          id: "job-2",
          name: "Stable Roof",
          type: "roofing",
          status: "active",
          health: "on-track",
          address: "2 Calm Lane",
          contract_value: 9000,
          contract_type: "fixed",
          est_completion: "2026-03-16",
          notes: "",
          last_updated: "2026-03-02T12:00:00Z",
          open_items: [],
          operational_summary: {
            open_item_count: 0,
            financial_exposure_count: 0,
            unresolved_change_count: 0,
            approval_count: 0,
            followthrough_count: 0,
            stalled_count: 0,
          },
        },
      ],
    },
  }),
}));

describe("JobsPage risk view", () => {
  it("renders the jobs list with agent notes and actions", () => {
    render(
      <MemoryRouter>
        <JobsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Jobs")).toBeInTheDocument();
    expect(screen.getByText("Manage all your active and past projects.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search jobs...")).toBeInTheDocument();
    expect(screen.getByText("Blocked Roof")).toBeInTheDocument();
    expect(screen.getByText("Money At Risk")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New Job" })).toHaveAttribute("href", "/quote");
  });
});
