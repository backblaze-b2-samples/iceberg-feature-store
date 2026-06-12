import { test, expect } from "@playwright/test";

test.describe("Ingest flow", () => {
  test("should expose the raw-file ingest card", async ({ page }) => {
    await page.goto("/ingest");
    await expect(page).toHaveURL(/ingest/);
    // Raw-file ingest is now wired into the UI (not API-only).
    await expect(page.getByText("Ingest a raw file")).toBeVisible();
    await expect(page.getByRole("button", { name: /ingest file/i })).toBeVisible();
  });
});

test.describe("Time-travel query flow", () => {
  test("should offer an as-of timestamp option in the resolve-at select", async ({
    page,
  }) => {
    await page.goto("/query");
    await expect(page).toHaveURL(/query/);
    // The scope selector now covers as-of timestamp, not just current/snapshot.
    await page.getByRole("combobox").first().click();
    await expect(
      page.getByRole("option", { name: /as-of timestamp/i }),
    ).toBeVisible();
  });
});
