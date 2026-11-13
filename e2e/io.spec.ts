import { expect, test, type Page } from "@playwright/test";

interface NodeLite { kind: string; transform: { x: number; y: number }; width?: number; height?: number }

async function nodes(page: Page): Promise<NodeLite[]> {
  return page.evaluate(() => {
    const s = (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap.getState();
    return s.history.present.nodes;
  });
}

async function start(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".app")).toHaveAttribute("data-ready", "true");
}

async function placeRect(page: Page, dx = 0, dy = 0): Promise<void> {
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas not found");
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  await page.keyboard.press("r");
}

async function readStream(stream: AsyncIterable<Uint8Array> | null): Promise<Uint8Array> {
  if (!stream) throw new Error("no download stream");
  const parts: Uint8Array[] = [];
  for await (const c of stream) parts.push(c);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function exportAs(page: Page, format: string): Promise<{ path: string; bytes: Uint8Array }> {
  await page.getByRole("button", { name: "書き出し", exact: true }).click();
  await page.getByRole("radio", { name: format, exact: true }).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "書き出す" }).click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error("no download path");
  const bytes = await readStream((await download.createReadStream()) as unknown as AsyncIterable<Uint8Array> | null);
  return { path, bytes };
}

test("autosave keeps the shape after a reload", async ({ page }) => {
  await start(page);
  await placeRect(page);
  expect(await nodes(page)).toHaveLength(1);
  await page.waitForTimeout(1000);
  await start(page);
  await expect.poll(async () => (await nodes(page)).length).toBe(1);
});

test("SVG export has the shape plus margin on both sides", async ({ page }) => {
  await start(page);
  await placeRect(page);
  const [n] = await nodes(page);
  const { bytes } = await exportAs(page, "SVG");
  const text = new TextDecoder().decode(bytes);
  expect(text).toContain("<svg");
  expect(text).toContain("<rect");
  const m = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(text);
  expect(m).not.toBeNull();
  expect(Number(m?.[3])).toBe((n?.width ?? 0) + 40);
  expect(Number(m?.[4])).toBe((n?.height ?? 0) + 40);
});

test("PNG export starts with the PNG signature", async ({ page }) => {
  await start(page);
  await placeRect(page);
  const { bytes } = await exportAs(page, "PNG");
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test("work file round trip into a new work", async ({ page }) => {
  await start(page);
  await placeRect(page, -100, 0);
  await placeRect(page, 100, 60);
  const before = await nodes(page);
  expect(before).toHaveLength(2);
  const { path } = await exportAs(page, "作業ファイル");
  await page.getByRole("button", { name: "作品", exact: true }).click();
  await page.getByRole("button", { name: "新しい作品" }).click();
  await expect.poll(async () => (await nodes(page)).length).toBe(0);
  await page.locator('[data-modal="works"] input[type="file"]').setInputFiles(path);
  await expect(page.locator("[data-modal]")).toHaveCount(0);
  const after = await nodes(page);
  expect(after.map((x) => x.transform)).toEqual(before.map((x) => x.transform));
  expect(after.map((x) => x.kind)).toEqual(before.map((x) => x.kind));
});

test("a broken file shows errors and keeps the current work", async ({ page }) => {
  await start(page);
  await placeRect(page);
  await page.getByRole("button", { name: "作品", exact: true }).click();
  await page.locator('[data-modal="works"] input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: (globalThis as unknown as { Buffer: { from(s: string): never } }).Buffer.from('{"version": 9}'),
  });
  await expect(page.getByText("作業ファイルを読み込めませんでした")).toBeVisible();
  await expect(page.locator('[data-modal="works"] .modal-error li').first()).toBeVisible();
  expect(await nodes(page)).toHaveLength(1);
});

test("new work is empty and the old work comes back when opened", async ({ page }) => {
  await start(page);
  await placeRect(page);
  await page.getByRole("button", { name: "作品", exact: true }).click();
  await page.getByRole("button", { name: "新しい作品" }).click();
  await expect.poll(async () => (await nodes(page)).length).toBe(0);
  await expect(page.locator(".work-row")).toHaveCount(2);
  await page.locator(".work-row", { hasText: "名前のない作品 1" }).getByRole("button", { name: "開く" }).click();
  await expect(page.locator("[data-modal]")).toHaveCount(0);
  expect(await nodes(page)).toHaveLength(1);
});

test("a work can be deleted after confirming inside the menu", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "作品", exact: true }).click();
  await page.getByRole("button", { name: "新しい作品" }).click();
  await expect(page.locator(".work-row")).toHaveCount(2);
  await page.locator(".work-row", { hasText: "名前のない作品 1" }).getByRole("button", { name: "消す" }).click();
  await expect(page.getByText("この作品を消します。元に戻せません。")).toBeVisible();
  await page.locator(".work-row .btn.danger").click();
  await expect(page.locator(".work-row")).toHaveCount(1);
});

test("export is disabled without shapes, and Escape closes the dialog", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "書き出し", exact: true }).click();
  await expect(page.getByRole("button", { name: "書き出す" })).toBeDisabled();
  await expect(page.getByText("図形がありません")).toBeVisible();
  await page.keyboard.press("r");
  expect(await nodes(page)).toHaveLength(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-modal]")).toHaveCount(0);
});
