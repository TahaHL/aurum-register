import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const action of ["sold", "released"] as const) {
  test(`owner records ${action}; customer updates without reloading`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize({
      width: action === "sold" ? 1440 : 390,
      height: 1000,
    });
    await page.goto("/desk");
    await page.getByRole("button", { name: /Enter as owner/ }).click();
    const reference = `Outcome ${action} ${Date.now()}`;
    await page.getByRole("button", { name: "New quote", exact: true }).click();
    await page.getByLabel("Customer reference").fill(reference);
    await page
      .getByRole("button", { name: "Issue quote", exact: true })
      .click();
    const link = await page
      .getByRole("link", { name: "Open customer quote" })
      .getAttribute("href");
    const customer = await context.newPage();
    await customer.goto(link!);
    await expect(
      customer.getByText("Taha Hadj Lakehal", { exact: true }),
    ).toBeVisible();
    await customer
      .getByRole("button", { name: "Accept & reserve stock" })
      .click();
    await expect(
      customer.getByText("Your stock is reserved", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Quotes", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: reference });
    await row
      .getByRole("button", {
        name: action === "sold" ? "Mark sold" : "Release now",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel(action === "sold" ? "Reason for sale" : "Reason for release")
      .fill("Fictional outcome confirmed at the desk");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`${action}-confirmation.png`),
      fullPage: true,
    });
    await dialog
      .getByRole("button", {
        name: action === "sold" ? "Confirm sale" : "Confirm release",
        exact: true,
      })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      row.getByText(action === "sold" ? "Sold" : "Released", { exact: true }),
    ).toBeVisible();
    await expect(
      customer.getByText(
        action === "sold"
          ? "Your sale has been completed"
          : "This reservation has been released",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 15000 });
    expect(
      (
        await new AxeBuilder({ page: customer })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await customer.screenshot({
      path: info.outputPath(`customer-${action}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(
      page
        .getByText(
          action === "sold" ? "Sale completed" : "Reservation released",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
  });
}
