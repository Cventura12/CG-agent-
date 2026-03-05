import { expect, test } from "@playwright/test";

test("quote notes queue locally when offline", async ({ context, page }) => {
  test.skip(
    !process.env.E2E_CLERK_KEY,
    "Set E2E_CLERK_KEY to run frontend e2e flows with Clerk initialized."
  );

  await page.goto("/quote");
  await expect(page.getByRole("heading", { name: "Voice to quote" })).toBeVisible();

  await context.setOffline(true);
  await page.fill("#quote-notes", "replace 24 squares, two layers, customer needs quote today");
  await page.getByRole("button", { name: "Save Offline" }).click();

  await expect(
    page.getByText("Offline mode: notes saved locally and queued. They will sync when you reconnect.")
  ).toBeVisible();
  await expect(page.getByText("Offline | queued 1")).toBeVisible();
});

