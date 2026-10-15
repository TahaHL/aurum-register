import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const width of [1440, 1024, 390])
  test(`design spec layout at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1050 });
    await page.goto("/desk");
    await page.getByRole("button", { name: /Enter as owner/ }).click();
    for (const name of ["Prices", "Inventory", "Quotes", "Activity"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(name.toLowerCase() + "-" + width + ".png"),
        fullPage: true,
      });
    }
  });
test("all requested historical ranges remain separate from the live quoting price", async ({
  page,
}) => {
  const now = Date.now();
  const fetchedAt = new Date(now).toISOString();
  const points = [
    {
      id: "first",
      source: "frankfurter",
      pricePerOunceGBP: "1000",
      providerAt: "2016-01-06T00:00:00.000Z",
      fetchedAt,
    },
    {
      id: "last",
      source: "frankfurter",
      pricePerOunceGBP: "3000",
      providerAt: new Date(now - 86400000).toISOString(),
      fetchedAt,
    },
  ];
  await page.route("**/api/price/history?*", (route) =>
    route.fulfill({
      json: {
        points,
        source: "frankfurter",
        from: points[0].providerAt,
        to: fetchedAt,
        totalObservations: 2,
        gaps: [],
        metadata: {
          kind: "reference",
          availableFrom: "1999-01-06T00:00:00.000Z",
          fetchedAt,
        },
      },
    }),
  );
  await page.goto("/desk");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  for (const [name, range] of [
    ["All time", "all"],
    ["10 years", "10y"],
    ["5 years", "5y"],
    ["3 years", "3y"],
    ["2 years", "2y"],
    ["1 year", "1y"],
    ["6 months", "6m"],
    ["3 months", "3m"],
    ["7 days", "7d"],
    ["1 day", "1d"],
  ]) {
    const request = page.waitForRequest((r) =>
      r.url().includes("/api/price/history?range=" + range),
    );
    await page.getByRole("button", { name, exact: true }).click();
    await request;
    await expect(
      page.getByRole("img", { name: /Gold price in GBP/ }),
    ).toHaveAttribute("aria-label", /2 plotted observations/);
    await expect(page.locator(".market-price")).toContainText("£3,000.00");
  }
  await expect(page.locator(".chart-provenance")).toContainText("06 Jan 1999");
  await expect(
    page.getByLabel("Current gold price", { exact: true }),
  ).not.toContainText("£3,000.00");
});
