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
          open_items: [{ id: "o1", days_silent: 8 }],
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
        },
      ],
    },
  }),
}));

describe("JobsPage risk view", () => {
  it("shows offline mode and risk radar summary", () => {
    render(
      <MemoryRouter>
        <JobsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Offline (cached jobs)")).toBeInTheDocument();
    expect(screen.getByText("Risk Radar")).toBeInTheDocument();
    expect(screen.getByText("Blocked Jobs")).toBeInTheDocument();
    expect(screen.getByText("Action Required")).toBeInTheDocument();
  });
});

