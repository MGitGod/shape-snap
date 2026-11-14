import { expect, test, type Page } from "@playwright/test";

async function kinds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap
      .getState().history.present.nodes.map((n: { kind: string }) => n.kind));
}

async function start(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".app")).toHaveAttribute("data-ready", "true");
}

async function overCanvas(page: Page): Promise<void> {
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function openKeys(page: Page): Promise<void> {
  await page.locator('[data-action="keys"]').click();
  await expect(page.locator('[data-modal="keys"]')).toBeVisible();
}

async function closeKeys(page: Page): Promise<void> {
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.locator("[data-modal]")).toHaveCount(0);
}

async function assign(page: Page, action: string, key: string): Promise<void> {
  await page.locator(`[data-key-action="${action}"]`).click();
  await page.keyboard.press(key);
}

test("a changed key places the shape, shows on every label, and survives a reload", async ({ page }) => {
  await start(page);
  await openKeys(page);
  await assign(page, "place-rect", ";");
  await expect(page.locator('[data-key-action="place-rect"] kbd')).toHaveText(";");
  await closeKeys(page);
  await expect(page.getByText("；・C・P で図形".replace("；", ";"))).toBeVisible();

  await overCanvas(page);
  await page.keyboard.press("r");
  expect(await kinds(page)).toEqual([]);
  await page.keyboard.press(";");
  expect(await kinds(page)).toEqual(["rect"]);

  await page.keyboard.press("Escape");
  await expect(page.locator('.tools [data-action="place-rect"] kbd')).toHaveText(";");
  await expect(page.locator(".key-hints kbd", { hasText: ";" })).toHaveCount(1);
  await expect(page.locator(".key-hints kbd", { hasText: /^R$/ })).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-ready", "true");
  await expect(page.locator('.tools [data-action="place-rect"] kbd')).toHaveText(";");
  await overCanvas(page);
  const before = (await kinds(page)).length;
  await page.keyboard.press(";");
  expect((await kinds(page)).length).toBe(before + 1);

  // the panel buttons show the live key too
  await openKeys(page);
  await assign(page, "guide-h", "9");
  await assign(page, "fill-none", "8");
  await closeKeys(page);
  await expect(page.locator('[data-op="fill-none"] kbd')).toHaveText("8");
  await expect(page.locator('[data-guide-action="add-h"] kbd')).toHaveText("9");
});

test("a key already in use is swapped with its owner", async ({ page }) => {
  await start(page);
  await openKeys(page);
  await assign(page, "place-rect", "c");
  await expect(page.getByText("「円」と入れ替えました")).toBeVisible();
  await expect(page.locator('[data-key-action="place-ellipse"] kbd')).toHaveText("R");
  await closeKeys(page);
  await overCanvas(page);
  await page.keyboard.press("c");
  await page.keyboard.press("r");
  expect(await kinds(page)).toEqual(["rect", "ellipse"]);
});

test("unusable keys are refused and Escape only ends the waiting", async ({ page }) => {
  await start(page);
  await openKeys(page);
  await page.locator('[data-key-action="place-rect"]').click();
  await expect(page.getByText("新しいキーを押してください（Esc でやめる）")).toBeVisible();
  await page.keyboard.press("F1");
  await expect(page.getByText("このキーは使えません")).toBeVisible();
  await expect(page.locator("[data-key-wait]")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("このキーは使えません")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-key-wait]")).toHaveCount(0);
  await expect(page.locator('[data-modal="keys"]')).toBeVisible();
  await expect(page.locator('[data-key-action="place-rect"] kbd')).toHaveText("R");
  // moving the waiting to another row
  await page.locator('[data-key-action="place-rect"]').click();
  await page.locator('[data-key-action="line"]').click();
  await expect(page.locator("[data-key-wait]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-modal]")).toHaveCount(0);
});

test("reset one key, reset all keys, and fixed rows have no button", async ({ page }) => {
  await start(page);
  await openKeys(page);
  await assign(page, "place-rect", ";");
  await assign(page, "place-ellipse", "'");
  await expect(page.locator('[data-key-reset="place-rect"]')).toBeVisible();
  await page.locator('[data-key-reset="place-rect"]').click();
  await expect(page.locator('[data-key-action="place-rect"] kbd')).toHaveText("R");
  await expect(page.locator('[data-key-reset="place-rect"]')).toHaveCount(0);

  await page.getByRole("button", { name: "全部を初めに戻す" }).click();
  await expect(page.getByText("全部のキーを初めに戻します")).toBeVisible();
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.locator('[data-key-action="place-ellipse"] kbd')).toHaveText("'");
  await page.getByRole("button", { name: "全部を初めに戻す" }).click();
  await page.getByRole("button", { name: "戻す", exact: true }).click();
  await expect(page.locator('[data-key-action="place-ellipse"] kbd')).toHaveText("C");
  await expect(page.locator("[data-key-reset]")).toHaveCount(0);

  const esc = page.locator('[data-key-row="escape"]');
  await expect(esc).toContainText("固定");
  await expect(esc.locator("button")).toHaveCount(0);
  await expect(page.locator('[data-key-action="escape"]')).toHaveCount(0);
  await closeKeys(page);
});

test("the dialog buttons are 40px or taller and the toolbar stays short", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  const header = await page.locator("header.toolbar").boundingBox();
  expect(header?.height ?? 999).toBeLessThanOrEqual(120);
  await openKeys(page);
  await assign(page, "place-rect", ";");
  const heights = await page.locator('[data-modal="keys"] button').evaluateAll(
    (els) => els.map((e) => e.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(20);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(40);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await page.screenshot({ path: ".superpowers/sdd/2026-11-14-stage-5-desktop/screens/keys.png" });
  await page.locator('[data-key-reset="place-rect"]').click();
  await closeKeys(page);
});
