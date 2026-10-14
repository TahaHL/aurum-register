import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
for (const width of [390, 768, 1440])
  test(`dealer workspace is accessible at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Sign in to Aurum Register" }),
    ).toBeVisible();
    const loginScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(loginScan.violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`sign-in-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: /Enter as owner/ }).click();
    await expect(
      page.getByRole("heading", { name: "Market overview" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New quote", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`desk-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Inventory", exact: true }).click();
    await page.getByLabel("Search inventory").fill("18 carat");
    // Search matches lot name or SKU, not the description: use the name itself.
    await page.getByLabel("Search inventory").fill("Sovereign");
    await expect(
      page.getByRole("cell", { name: /^Gold Sovereign/ }),
    ).toBeVisible();
  });
test("issue a quote, accept the customer link and observe reserved stock", async ({
  page,
  context,
}, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  await page.getByRole("button", { name: "New quote", exact: true }).click();
  await page.getByLabel("Customer reference").fill("BROWSER-" + Date.now());
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Issue quote", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Quoted total")).toBeVisible();
  const [customer] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "Open customer quote" }).click(),
  ]);
  await customer.waitForLoadState();
  await customer
    .getByRole("button", { name: "Accept & reserve stock" })
    .click();
  await expect(customer.getByText("Your stock is reserved")).toBeVisible();
  await customer.screenshot({
    path: info.outputPath("customer-reserved.png"),
    fullPage: true,
  });
  const scan = await new AxeBuilder({ page: customer })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: "Quotes", exact: true }).click();
  await expect(
    page.getByText("Reserved", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("Stock reserved", { exact: true }).first(),
  ).toBeVisible();
});

test("receive a lot, correct its quantity and verify staff permissions", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page
    .getByRole("button", { name: "Receive stock", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const sku = "DEMO-" + Date.now();
  const lotName = "12.345g demonstration jewellery " + Date.now();
  await dialog.getByLabel("SKU", { exact: true }).fill(sku);
  await dialog.getByLabel("Lot name", { exact: true }).fill(lotName);
  await dialog.getByLabel(/Weight per unit/).fill("12.345");
  await dialog.getByLabel(/Purity/).fill("75.01");
  await dialog.getByLabel("Units received", { exact: true }).fill("3");
  await dialog
    .getByLabel(/Receipt note/)
    .fill("Fictional sample receipt for browser verification");
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath("receive-stock.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Receive lot", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("Search inventory").fill(sku);
  const row = page.getByRole("row").filter({ hasText: sku });
  await expect(row).toContainText("12.345g");
  await expect(row).toContainText("75.01% pure");
  await row
    .getByRole("button", { name: `Correct stock for ${lotName}` })
    .click();
  await dialog
    .getByRole("combobox", { name: "Correction", exact: true })
    .selectOption("remove");
  await dialog.getByLabel("Units", { exact: true }).fill("1");
  await dialog
    .getByLabel(/Reason for correction/)
    .fill(`Fictional damaged sample removed at stocktake ${sku}`);
  await dialog
    .getByRole("button", { name: "Save stock correction", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(row.getByRole("cell", { name: "2", exact: true })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("Stock corrected", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(`Fictional damaged sample removed at stocktake ${sku}`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("button", { name: /Enter as staff/ }).click();
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Receive stock", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Correct stock for/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Only the owner can correct existing stock."),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Market overview" }),
  ).toBeVisible();
});
