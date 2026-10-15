import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("public four-metal charts are independent, accessible, and preserve gold ranges", async ({
  page,
}) => {
  await page.goto("/prices/xag");
  await expect(
    page.getByRole("heading", { name: "Silver price", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Silver price in GBP/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Precious metal spot prices" })
      .getByRole("link"),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "All time", exact: true }).click();
  await expect(
    page.getByText(/Longer ranges use daily reference prices/),
  ).toBeVisible();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("navigation", { name: "Metal charts" })
    .getByRole("link", { name: "Gold", exact: true })
    .click();
  for (const name of [
    "Live",
    "1 day",
    "7 days",
    "1 month",
    "3 months",
    "6 months",
    "1 year",
    "2 years",
    "3 years",
    "5 years",
    "10 years",
    "All time",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Metal charts" })
    .getByRole("link", { name: "Platinum", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: /Platinum price in GBP/ }),
  ).toBeVisible();
});

test("one market stream and no ticker history polling", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.clock.install();
  await page.goto("/prices/xag");
  await expect(
    page.getByRole("img", { name: /Silver price in GBP/ }),
  ).toBeVisible();
  expect(
    requests.filter((url) => url.includes("/api/price/stream")),
  ).toHaveLength(1);
  // One initial 1d request belongs to the chart. Switch to Live to distinguish chart polling from ticker polling.
  expect(
    requests.filter(
      (url) => url.includes("/api/metals/") && url.includes("range=1d"),
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Live", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  requests.length = 0;
  await page.clock.runFor(60000);
  expect(
    requests.filter((url) =>
      /\/api\/metals\/.*history\?range=(1d|all)/.test(url),
    ),
  ).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Refresh", exact: true }),
  ).toHaveCount(0);
  requests.length = 0;
  await page.goto("/desk");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  await expect(
    page.getByRole("heading", { name: "Market overview" }),
  ).toBeVisible();
  expect(
    requests.filter((url) => url.includes("/api/price/stream")),
  ).toHaveLength(1);
});
