import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { OnboardingPage } from "../../src/pages/OnboardingPage";

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({
    user: {
      fullName: "Marcus Webb",
      firstName: "Marcus",
      primaryEmailAddress: { emailAddress: "marcus@example.com" },
      primaryPhoneNumber: { phoneNumber: "+15551234567" },
    },
  }),
  SignIn: () => React.createElement("div", { "data-testid": "sign-in" }),
}));

vi.mock("../../src/api/auth", () => ({
  fetchOnboardingProfile: async () => ({
    registered: false,
    onboarding_complete: false,
    phone_number: "",
    company_name: "",
    labor_rate_per_square: 92,
    default_markup_pct: 25,
    tear_off_per_square: 58,
    laminated_shingles_per_square: 142,
    synthetic_underlayment_per_square: 20,
    primary_trade: "general_construction",
    service_area: "",
    recommended_defaults: {
      labor_rate_per_square: 92,
      default_markup_pct: 25,
      tear_off_per_square: 58,
      laminated_shingles_per_square: 142,
      synthetic_underlayment_per_square: 20,
    },
    preferred_supplier: "",
    preferred_shingle_brand: "",
    notes: "",
    missing_fields: ["phone_number", "company_name"],
  }),
  registerGc: vi.fn(),
  saveOnboardingProfile: vi.fn(),
}));

describe("OnboardingPage terminal flow", () => {
  it("moves from company setup to pricing baseline in the real multi-step flow", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <OnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByRole("heading", { name: "Company setup" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Company name"), {
      target: { value: "Webb Construction LLC" },
    });
    fireEvent.change(screen.getByLabelText("Primary contact"), {
      target: { value: "+15551234567" },
    });
    fireEvent.change(screen.getByLabelText("Service area"), {
      target: { value: "Chattanooga, TN metro" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Continue ?" }));
    expect(await screen.findByRole("heading", { name: "Trades" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Roofing/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue ?" }));

    expect(await screen.findByRole("heading", { name: "Pricing baseline" })).toBeInTheDocument();
    expect(screen.getByLabelText("Avg hourly labor")).toBeInTheDocument();
    expect(screen.getByLabelText("Primary supplier")).toBeInTheDocument();
  });
});
