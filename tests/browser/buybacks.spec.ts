import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("buy-back acceptance, inspected receipt and default premium complete the inbound stock journey", async ({
  page,
  context,
}, info) => {
  await page.goto("/desk");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  await page.getByRole("button", { name: "Buy-backs", exact: true }).click();
  const reference = `Assay ${Date.now()}`;
  const itemName = `Assessed scrap ${reference}`;
  await page.getByLabel("Customer reference", { exact: true }).fill(reference);
  await page.getByLabel("Item description", { exact: true }).fill(itemName);
  await page
    .getByRole("button", { name: "Issue buy-back offer", exact: true })
    .click();
  const link = await page
    .getByRole("link", { name: "Open customer buy-back" })
    .getAttribute("href");
  const customer = await context.newPage();
  await customer.goto(link!);
  await customer.getByRole("button", { name: "Accept buy-back offer" }).click();
  await expect(
    customer.getByRole("heading", { name: "Offer accepted — inspection next" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Buy-backs", exact: true }).click();
  const record = page.locator(".buyback-record").filter({ hasText: reference });
  await record.getByRole("button", { name: "Inspect & receive" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("I verified the weight, purity and quantity match this offer.")
    .check();
  await dialog.getByLabel("Resale premium (%)").fill("5.5");
  await dialog
    .getByLabel("Outcome reason")
    .fill("Assay matches fictional counter assessment");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    customer.getByRole("heading", { name: "Your gold has been received" }),
  ).toBeVisible({ timeout: 15000 });
  await page.screenshot({
    path: info.outputPath("buyback-received.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Inventory", exact: true }).click();
  await page.getByLabel("Search inventory").fill(itemName);
  const row = page.getByRole("row").filter({ hasText: itemName }).last();
  await expect(row).toContainText("Default premium: 5.5%");
  await row.getByRole("button", { name: /Set premium for/ }).click();
  await dialog.getByLabel("Default premium (%)").fill("4.25");
  await dialog
    .getByLabel("Reason for premium change")
    .fill("Refining cost reviewed for this assessed lot");
  await dialog.getByRole("button", { name: "Save premium" }).click();
  await expect(dialog).not.toBeVisible();
  await row.getByRole("button", { name: "Quote lot" }).click();
  await expect(page.getByLabel("Dealer premium (%)")).toHaveValue("4.25");
});
test("mobile dealing ticket opens separately, retains drafts and restores keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/desk");
  await page.getByRole("button", { name: /Enter as owner/ }).click();
  const newQuote = page.getByRole("button", { name: "New quote", exact: true });
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await newQuote.click();
  const ticket = page.getByRole("dialog", { name: "Create a quotation" });
  await expect(ticket).toBeVisible();
  await ticket.getByLabel("Customer reference").fill("Draft retained");
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(ticket).not.toBeVisible();
  await expect(newQuote).toBeFocused();
  await newQuote.click();
  await expect(ticket.getByLabel("Customer reference")).toHaveValue(
    "Draft retained",
  );
  await ticket.getByRole("button", { name: "Close quotation ticket" }).click();
  await page.getByRole("button", { name: "Buy-backs", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
});
