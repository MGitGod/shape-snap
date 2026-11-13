import { expect, test } from "@playwright/test";

// The panel buttons must add a guide even though the pointer is over the panel
// (not the canvas) when they are clicked.
test("the guide buttons in the panel add guides without a canvas cursor", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector('.app[data-ready="true"]');

  const addH = page.locator('[data-guide-action="add-h"]');
  await addH.scrollIntoViewIfNeeded();
  await addH.click();
  await expect(page.locator("[data-guide-id]")).toHaveCount(1);

  const addV = page.locator('[data-guide-action="add-v"]');
  await addV.scrollIntoViewIfNeeded();
  await addV.click();
  await expect(page.locator("[data-guide-id]")).toHaveCount(2);
  await expect(page.locator("[data-guide-row]")).toHaveCount(2);
});
