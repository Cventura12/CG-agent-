import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("App public landing page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("renders /product without Clerk configuration", async () => {
    vi.stubEnv("VITE_CLERK_KEY", "");
    vi.stubEnv("VITE_BYPASS_AUTH", "false");

    const { default: App } = await import("../../src/App");

    render(
      <MemoryRouter initialEntries={["/product"]}>
        <App />
      </MemoryRouter>
    );

    expect(
      await screen.findByText(
        /GC Agent turns contractor calls, notes, uploads, and job updates into quotes, queue actions, and follow-up/i
      )
    ).toBeInTheDocument();
    const ctas = screen.getAllByRole("link", { name: "Get your first quote draft" });
    expect(ctas.length).toBeGreaterThan(0);
    expect(ctas[0]).toHaveAttribute("href", "/onboarding");
  });
});
