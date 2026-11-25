import { expect, test, type Page } from "@playwright/test";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

async function start(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator(".app")).toHaveAttribute("data-ready", "true");
}

test("selecting a closed shape logs no errors", async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await page.mouse.move(600, 400);
  await page.keyboard.press("r");
  await expect(page.locator("polygon[data-outline]")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("selecting an open line logs no errors", async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await page.mouse.move(500, 400);
  await page.keyboard.press("l");
  await page.mouse.click(500, 400);
  await page.mouse.click(600, 300);
  await page.mouse.click(700, 400);
  await page.keyboard.press("Enter");
  await expect(page.locator("polyline[data-outline]")).toHaveCount(1);
  expect(errors).toEqual([]);
});
