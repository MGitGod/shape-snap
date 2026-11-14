import { expect, test, type Page } from "@playwright/test";

type Api = { getState: () => any; combine: () => any };

async function start(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator(".app")).toHaveAttribute("data-ready", "true");
}

async function nodes(page: Page): Promise<Array<Record<string, any>>> {
  return page.evaluate(() => (window as unknown as { __shapeSnap: Api }).__shapeSnap.getState().history.present.nodes);
}

async function combined(page: Page): Promise<{ ok: boolean; items: Array<{ area: number; d: string; kind: string }> }> {
  return page.evaluate(() => (window as unknown as { __shapeSnap: Api }).__shapeSnap.combine());
}

async function at(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas not found");
  const view = await page.evaluate(() => (window as unknown as { __shapeSnap: Api }).__shapeSnap.getState().view);
  return { x: box.x + view.panX + wx * view.zoom, y: box.y + view.panY + wy * view.zoom };
}

async function place(page: Page, key: string, wx: number, wy: number): Promise<void> {
  const p = await at(page, wx, wy);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press(key);
}

async function readStream(stream: AsyncIterable<Uint8Array> | null): Promise<Uint8Array> {
  if (!stream) throw new Error("no download stream");
  const parts: Uint8Array[] = [];
  for await (const c of stream) parts.push(c);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

/** A rect at the origin with a circle centred on its right edge, the circle selected and set to subtract. */
async function rectMinusCircle(page: Page): Promise<void> {
  await place(page, "r", 0, 0);
  await place(page, "c", 40, 0);
  await page.keyboard.press("t");
}

async function downloadFrom(page: Page): Promise<Uint8Array> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "書き出す" }).click(),
  ]);
  return readStream((await download.createReadStream()) as unknown as AsyncIterable<Uint8Array> | null);
}

async function openExport(page: Page, format: "SVG" | "PNG"): Promise<void> {
  await page.getByRole("button", { name: "書き出し", exact: true }).click();
  await page.getByRole("radio", { name: format, exact: true }).check();
}

test("t makes the circle a subtract shape, shown hatched and badged in the list", async ({ page }) => {
  await start(page);
  await rectMinusCircle(page);
  const ns = await nodes(page);
  expect(ns.map((n) => n.role)).toEqual(["add", "subtract"]);
  await expect(page.locator('[data-role="subtract"]')).toHaveCount(1);
  await expect(page.locator("[data-role-badge]")).toHaveCount(1);
  await expect(page.locator("[data-role-badge]")).toHaveText("抜く");
  await expect(page.locator('[data-op="role"]')).toContainText("足すにする");
  await page.keyboard.press("z");
  expect((await nodes(page)).map((n) => n.role)).toEqual(["add", "add"]);
});

test("3 shows the merged outline, 3 again goes back", async ({ page }) => {
  await start(page);
  await rectMinusCircle(page);
  await page.keyboard.press("3");
  await expect(page.locator('[data-testid="combined"] path')).toHaveCount(1);
  await expect(page.getByTestId("combine-badge")).toBeVisible();
  await expect(page.locator("[data-node-id]")).toHaveCount(0);
  const r = await combined(page);
  expect(r.ok).toBe(true);
  const expected = 80 * 80 - (Math.PI * 40 * 40) / 2;
  const total = r.items.reduce((n, it) => n + it.area, 0);
  expect(Math.abs(total - expected) / expected).toBeLessThan(0.01);
  await page.keyboard.press("3");
  await expect(page.getByTestId("combined")).toHaveCount(0);
  await expect(page.getByTestId("combine-badge")).toHaveCount(0);
  await expect(page.locator("[data-node-id]")).toHaveCount(2);
});

test("the original shapes stay editable while the merged view is on", async ({ page }) => {
  await start(page);
  await rectMinusCircle(page);
  await page.keyboard.press("3");
  const before = await page.locator('[data-testid="combined"] path').getAttribute("d");
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => page.locator('[data-testid="combined"] path').getAttribute("d")).not.toBe(before);
});

test("same-colour rects merge into one path until a colour differs", async ({ page }) => {
  await start(page);
  await place(page, "r", -100, -100);
  await place(page, "r", -60, -100);
  await page.keyboard.press("3");
  await expect(page.locator('[data-testid="combined"] path')).toHaveCount(1);
  await page.keyboard.press("3");
  await page.locator('[data-color-field="fill"] [data-color="#e5484d"]').click();
  await page.keyboard.press("3");
  await expect(page.locator('[data-testid="combined"] path')).toHaveCount(2);
});

test("export merges subtract shapes by default and can leave them out", async ({ page }) => {
  await start(page);
  await rectMinusCircle(page);
  await openExport(page, "SVG");
  await expect(page.getByTestId("export-combine")).toBeChecked();
  const svg = new TextDecoder().decode(await downloadFrom(page));
  expect(svg).toContain("<path");
  expect(svg).not.toContain("<ellipse");

  await openExport(page, "SVG");
  await page.getByTestId("export-combine").uncheck();
  await expect(page.getByText("抜く図形は書き出されません")).toBeVisible();
  const plain = new TextDecoder().decode(await downloadFrom(page));
  expect(plain).toContain("<rect");
  expect(plain).not.toContain("<ellipse");
});

test("PNG export with the merged outline produces a PNG", async ({ page }) => {
  await start(page);
  await rectMinusCircle(page);
  await openExport(page, "PNG");
  await expect(page.getByTestId("export-combine")).toBeChecked();
  const bytes = await downloadFrom(page);
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
});

test("a repeat with a subtract circle merges without error", async ({ page }) => {
  await start(page);
  await place(page, "r", -100, 0);
  await page.keyboard.press("a");
  await place(page, "c", -60, 0);
  await page.keyboard.press("t");
  await page.keyboard.press("3");
  const r = await combined(page);
  expect(r.ok).toBe(true);
  expect(r.items.length).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("combined")).toBeVisible();
  await expect(page.locator(".banner")).toHaveCount(0);
});

test("toolbar stays within two rows and every button is 40px or taller", async ({ page }) => {
  await start(page);
  const header = await page.locator("header.toolbar").boundingBox();
  expect(header?.height ?? 999).toBeLessThanOrEqual(120);
  for (const name of ["足す・抜く", "結合を表示"]) {
    const box = await page.locator('[role="toolbar"] button', { hasText: name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  }
  for (const b of await page.locator("header.toolbar button").all()) {
    expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
  }
  await place(page, "r", 0, 0);
  for (const label of ["手前へ", "奥へ", "消す"]) {
    const inBar = page.locator("header.toolbar button", { hasText: label });
    const inPanel = page.locator('[data-testid="shape-ops"] button', { hasText: label });
    expect((await inBar.count()) + (await inPanel.count()), label).toBeGreaterThan(0);
  }
});

test("screenshots of the plain and merged views", async ({ page }) => {
  const dir = ".superpowers/sdd/2026-11-14-stage-4-combine/screens";
  await start(page);
  await place(page, "r", -40, 0);
  await place(page, "r", 40, 0);
  await place(page, "c", 0, 0);
  await page.keyboard.press("t");
  await page.screenshot({ path: `${dir}/roles.png` });
  await page.keyboard.press("3");
  await page.screenshot({ path: `${dir}/combined.png` });
});
