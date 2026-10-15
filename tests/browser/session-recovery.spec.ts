import { test, expect } from "@playwright/test";
test("session automatically recovers once from a 429", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/auth/session", async (route) => {
    requests++;
    if (requests === 1)
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "1" },
        json: { message: "Rate limited" },
      });
    else await route.continue();
  });
  await page.goto("/desk");
  await expect(
    page.getByText("Too many requests. Retrying in 1 seconds."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to Hadj Lakehal Metals" }),
  ).toBeVisible();
  expect(requests).toBe(2);
});
test("a second 429 stops automatic retries and offers manual retry", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/auth/session", async (route) => {
    requests++;
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "1" },
      json: { message: "Rate limited" },
    });
  });
  await page.goto("/desk");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(2);
});
