import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("owner edits percentage pricing without exposing implementation syntax", async ({ page }) => {
  await page.goto('/desk');
  await page.getByRole('button',{name:/Enter as owner/}).click();
  await expect(page.getByRole('heading',{name:'Market overview'})).toBeVisible();
  await page.goto('/admin');
  await page.getByRole('button',{name:'Profit & loss',exact:true}).waitFor();
  await page.getByRole('button',{name:'Products',exact:true}).click();
  await page.getByRole('button',{name:'Edit pricing'}).first().click();
  const premium=page.getByLabel('Premium (%)',{exact:true}).first();
  const original=await premium.inputValue();
  await premium.fill(String(Number(original)+0.01));
  const saved=page.waitForResponse(r=>r.url().includes('/api/admin/products/')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  expect((await saved).status()).toBe(200);
  await premium.fill(original);
  await page.getByRole('button',{name:'Save product',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('saved');
});
test("store browse, quantity pricing, checkout and owner cancellation", async ({
  page,
}) => {
  await page.goto("/store");
  await expect(
    page.getByRole("heading", { name: /Precious metals/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Discover gold coins" }).click();
  await expect(
    page.getByRole("heading", { name: "Gold coins", exact: true }),
  ).toBeVisible();
  await page.locator(".shop-card h3 a").first().click();
  await expect(page.getByText("Quantity pricing, before VAT")).toBeVisible();
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.waitForResponse(
    (r) => r.url().includes("/api/products/") && r.url().includes("qty=2"),
  );
  await page.getByRole("button", { name: "Add to demo basket" }).click();
  await expect(page.getByRole("status")).toContainText("added");
  await page.goto("/basket");
  await expect(page.getByText("2 pack(s)", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: /Continue to demo checkout/ }).click();
  await page.getByRole("button", { name: "Enter as demo customer" }).click();
  await page
    .getByRole("button", { name: "Lock current prices for 10 minutes" })
    .click();
  await page.getByRole("button", { name: "Place simulated order" }).click();
  await expect(
    page.getByRole("heading", { name: "Your demo order is placed." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View your orders" }).click();
  await expect(page.locator(".shop-order")).toHaveCount(1);
  const forbidden = await page.request.get("/api/admin/store");
  expect(forbidden.status()).toBe(401);
  await page.goto("/desk");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  await expect(
    page.getByRole("heading", { name: "Market overview" }),
  ).toBeVisible();
  await page.goto("/admin");
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel & restore stock" })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("updated");
  await page
    .getByRole("button", { name: "Profit & loss", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Realised trading result" }),
  ).toBeVisible();
});
test("store pages accessible at four widths; keyboard menu works", async ({
  page,
}) => {
  for (const route of ["/store", "/catalogue?category=silver-coins"]) {
    await page.goto(route);
    await expect(page.locator(".shop-card").first()).toBeVisible();
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const gold = page.locator(".shop-nav summary").filter({ hasText: "Gold" });
  await gold.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".shop-nav details").first()).toHaveAttribute(
    "open",
    "",
  );
});
test("every metal has genuine-reference ranges and deterministic demo history", async ({
  page,
}) => {
  for (const code of ["xau", "xag", "xpt", "xpd"]) {
    await page.goto("/prices/" + code);
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
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
  }
  const response = await page.request.get("/api/metals/XAG/history?range=1y");
  const data = await response.json();
  expect(data.metadata.kind).toBe("reference");
  expect(data.points.length).toBeGreaterThan(200);
  expect(data.metadata.warning).toContain("SIMULATED");
});

test("admin enforces staff field restrictions and owner CSV reconciliation", async ({
  page,
}) => {
  await page.goto("/desk");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  await expect(
    page.getByRole("heading", { name: "Market overview" }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("button", { name: "Profit & loss", exact: true }),
  ).toBeVisible();
  const report = await (
    await page.request.get("/api/admin/store?days=90")
  ).json();
  const csv = await (
    await page.request.get("/api/admin/pnl.csv?days=90")
  ).text();
  expect(csv).toContain(`revenuePence,${report.summary.revenuePence}`);
  expect(csv).toContain(`vatPence,${report.summary.vatPence}`);
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.goto("/desk");
  await page.getByRole("button", { name: /Sign out/ }).click();
  await page.getByRole("button", { name: /Enter as staff/ }).click();
  await expect(
    page.getByRole("heading", { name: "Market overview" }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Profit & loss", exact: true }),
  ).toHaveCount(0);
  const staff = await (await page.request.get("/api/admin/store")).json();
  const body = JSON.stringify(staff);
  for (const field of [
    "unit_cost_pence",
    "cogsPence",
    "grossProfitPence",
    "marginPercent",
    "costLots",
    "stockAtCostPence",
    "unrealisedPence",
  ])
    expect(body).not.toContain(field);
  expect((await page.request.get("/api/admin/pnl.csv")).status()).toBe(403);
});
