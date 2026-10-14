import { test, expect } from "@playwright/test";

test("retains recorded history on provider failure and does not connect across a data gap", async ({
  page,
}) => {
  const now = Date.now();
  const points = [3000, 3010].map((price, index) => ({
    id: String(index),
    source: "fixture",
    pricePerOunceGBP: String(price),
    providerAt: new Date(now - (index ? 60000 : 300000)).toISOString(),
    fetchedAt: new Date(now).toISOString(),
  }));
  const unavailable = {
    snapshot: null,
    stale: true,
    error: "Provider unavailable",
    maxAgeSeconds: 120,
  };
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, price: unavailable } });
  });
  await page.route("**/api/price/stream", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: "event: price\ndata: " + JSON.stringify(unavailable) + "\n\n",
    }),
  );
  await page.route("**/api/price/history?*", (route) =>
    route.fulfill({
      json: {
        points,
        source: "fixture",
        from: new Date(now - 3600000).toISOString(),
        to: new Date(now).toISOString(),
        totalObservations: 2,
        gaps: [{ from: points[0].providerAt, to: points[1].providerAt }],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  await expect(
    page.getByRole("img", { name: /Gold price in GBP/ }),
  ).toHaveAttribute("aria-label", /2 plotted observations.*High £3,010.00/);
  const segments = page.locator('.chart-plot path[fill="none"]');
  await expect(segments).toHaveCount(2);
  for (const segment of await segments.all())
    expect(await segment.getAttribute("d")).not.toContain("L");
  await expect(page.getByText("Price delayed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fresh price required", exact: true }),
  ).toBeDisabled();
});

test("chart displays recorded data, converts units, supports keyboard inspection and requests its selected range", async ({
  page,
}) => {
  const now = Date.now();
  const points = [3110.34768, 6220.69536, 4665.52152].map((price, index) => ({
    id: String(index),
    source: "fixture",
    pricePerOunceGBP: String(price),
    providerAt: new Date(now - (4 - index) * 60000).toISOString(),
    fetchedAt: new Date(now).toISOString(),
  }));
  await page.route("**/api/price/history?*", (route) =>
    route.fulfill({
      json: {
        points,
        source: "fixture",
        from: new Date(now - 3600000).toISOString(),
        to: new Date(now).toISOString(),
        totalObservations: 3,
        gaps: [],
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  const chart = page.getByRole("region", { name: "Gold price", exact: true });
  await expect(chart.getByRole("img")).toHaveAttribute(
    "aria-label",
    /High £6,220.70/,
  );
  await page.getByLabel("Chart weight unit").selectOption("g");
  await expect(chart.getByRole("img")).toHaveAttribute(
    "aria-label",
    /GBP per g.*High £200.00/,
  );
  await page.getByRole("group", { name: /Gold price chart/ }).press("Home");
  await expect(page.locator(".chart-tooltip")).toContainText("£100.00");
  await page.getByRole("button", { name: "View data", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Chart observations" }),
  ).toContainText("£100.00");
  const rangeRequest = page.waitForRequest((request) =>
    request.url().includes("/api/price/history?range=7d"),
  );
  await page.getByRole("button", { name: "7 days", exact: true }).click();
  await rangeRequest;
  await expect(
    page.getByRole("button", { name: "7 days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".chart-provenance")).toContainText(
    "earlier history is not available",
  );
  await page.getByLabel("Chart weight unit").selectOption("kg");
  await expect(chart.getByRole("img")).toHaveAttribute(
    "aria-label",
    /High £200,000.00/,
  );
});
