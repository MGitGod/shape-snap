import { expect, test, type Page } from "@playwright/test";

interface NodeLite {
  id: string; kind: string; name: string;
  transform: { x: number; y: number; rotation: number };
  style: { fill: string | null; stroke: string | null };
  width?: number; height?: number; rx?: number; ry?: number;
  points?: Array<{ x: number; y: number }>;
}
interface Snap { nodes: NodeLite[]; selection: string[]; heldHandle: string | null; zoom: number; guides: number }

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const s = (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap.getState();
    return {
      nodes: s.history.present.nodes,
      selection: s.selection,
      heldHandle: s.heldHandle,
      zoom: s.view.zoom,
      guides: (s.history.present.guides ?? []).length,
    };
  });
}

async function start(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".app")).toHaveAttribute("data-ready", "true");
}

// world (unit) coordinates -> page coordinates, using the current view
async function at(page: Page, wx: number, wy: number): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas not found");
  const view = await page.evaluate(() =>
    (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap.getState().view);
  return { x: box.x + view.panX + wx * view.zoom, y: box.y + view.panY + wy * view.zoom };
}

async function clickAt(page: Page, wx: number, wy: number): Promise<void> {
  const p = await at(page, wx, wy);
  await page.mouse.click(p.x, p.y);
}

async function place(page: Page, key: string, wx: number, wy: number): Promise<void> {
  const p = await at(page, wx, wy);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press(key);
}

async function center(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const b = await page.locator(selector).boundingBox();
  if (!b) throw new Error(`${selector} not found`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function clickCenter(page: Page, selector: string): Promise<void> {
  const c = await center(page, selector);
  await page.mouse.click(c.x, c.y);
}

/** Screen boxes of every shape on the canvas, sorted left to right. */
async function shapeBoxes(page: Page): Promise<Array<{ left: number; right: number; top: number; bottom: number }>> {
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll("[data-node-id]")].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    }));
  return boxes.sort((a, b) => a.left - b.left);
}

function onGrid(v: number, size: number): boolean {
  const q = v / size;
  return Math.abs(q - Math.round(q)) < 1e-6;
}

test("a triangle's corners all sit on grid points", async ({ page }) => {
  await start(page);
  await place(page, "p", -100, -100);
  const s = await snap(page);
  const node = s.nodes[0];
  expect(node?.kind).toBe("polygon");
  const raw = await page.locator("[data-node-id] > polygon").getAttribute("points");
  const pts = (raw ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
  expect(pts).toHaveLength(3);
  for (const [x, y] of pts) {
    expect(onGrid((node?.transform.x ?? 0) + (x ?? 0), 20)).toBe(true);
    expect(onGrid((node?.transform.y ?? 0) + (y ?? 0), 20)).toBe(true);
  }
});

test("a vertex is grabbed and moved to the clicked grid point", async ({ page }) => {
  await start(page);
  await place(page, "p", -100, -100);
  await clickCenter(page, '[data-handle-id="vertex:0"]');
  expect((await snap(page)).heldHandle).toBe("vertex:0");
  await clickAt(page, 103, 62);
  const s = await snap(page);
  const node = s.nodes[0];
  expect(node?.kind).toBe("path");
  const p = node?.points?.[0];
  expect((node?.transform.x ?? 0) + (p?.x ?? NaN)).toBeCloseTo(100, 3);
  expect((node?.transform.y ?? 0) + (p?.y ?? NaN)).toBeCloseTo(60, 3);
});

test("a corner handle resizes a rect and stays a rect", async ({ page }) => {
  await start(page);
  await place(page, "r", 0, 0);
  const before = (await snap(page)).nodes[0];
  await clickCenter(page, '[data-handle-id="corner:2"]');
  expect((await snap(page)).heldHandle).toBe("corner:2");
  await clickAt(page, 100, 120);
  const after = (await snap(page)).nodes[0];
  expect(after?.kind).toBe("rect");
  expect(after?.width).not.toBe(before?.width);
  expect(after?.height).not.toBe(before?.height);
});

test("a circle has eight handles", async ({ page }) => {
  await start(page);
  await place(page, "c", 0, 0);
  await expect(page.locator("[data-handle-id]")).toHaveCount(8);
});

test("V enters rotate mode, arrows turn, Esc leaves it and arrows move again", async ({ page }) => {
  await start(page);
  await place(page, "r", 0, 0);
  await page.keyboard.press("v");
  await expect(page.getByTestId("rotate-mark")).toHaveCount(1);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  let s = await snap(page);
  expect(s.nodes[0]?.transform.rotation).toBe(30);
  await expect(page.getByTestId("rotate-mark")).toContainText("30°");
  const x = s.nodes[0]?.transform.x ?? 0;
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowRight");
  s = await snap(page);
  expect(s.nodes[0]?.transform.rotation).toBe(30);
  expect(s.nodes[0]?.transform.x).toBeGreaterThan(x);
});

test(". enlarges, , shrinks", async ({ page }) => {
  await start(page);
  await place(page, "r", 0, 0);
  const w0 = (await snap(page)).nodes[0]?.width ?? 0;
  await page.keyboard.press(".");
  await page.keyboard.press(".");
  const w1 = (await snap(page)).nodes[0]?.width ?? 0;
  expect(w1).toBeGreaterThan(w0);
  await page.keyboard.press(",");
  const w2 = (await snap(page)).nodes[0]?.width ?? 0;
  expect(w2).toBeLessThan(w1);
});

test("N removes the fill, keeps a stroke and the shape stays visible", async ({ page }) => {
  await start(page);
  await place(page, "r", 0, 0);
  await page.keyboard.press("n");
  const node = (await snap(page)).nodes[0];
  expect(node?.style.fill).toBeNull();
  expect(node?.style.stroke).not.toBeNull();
  const stroke = await page.locator("[data-node-id] > *").first().getAttribute("stroke");
  expect(stroke).not.toBeNull();
  expect(stroke).not.toBe("none");
});

test("the なし swatch is first in the fill colours and acts like N", async ({ page }) => {
  await start(page);
  await place(page, "r", 0, 0);
  const first = page.locator('[data-color-field="fill"] .swatches > *').first();
  await expect(first).toHaveAttribute("data-color", "none");
  await first.click();
  const node = (await snap(page)).nodes[0];
  expect(node?.style.fill).toBeNull();
  expect(node?.style.stroke).not.toBeNull();
});

test("align, distribute and the gap field work on three shapes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await place(page, "r", -240, -100);
  await place(page, "c", 0, 0);
  await place(page, "p", 200, 60);
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await clickAt(page, -240, -100);
  await clickAt(page, 0, 0);
  await clickAt(page, 200, 60);
  expect((await snap(page)).selection).toHaveLength(3);
  await expect(page.getByTestId("arrange-panel")).toBeVisible();

  await page.locator('[data-align="top"]').click();
  let boxes = await shapeBoxes(page);
  expect(boxes).toHaveLength(3);
  expect(Math.abs((boxes[0]?.top ?? 0) - (boxes[1]?.top ?? 99))).toBeLessThan(0.5);
  expect(Math.abs((boxes[1]?.top ?? 0) - (boxes[2]?.top ?? 99))).toBeLessThan(0.5);

  await page.getByRole("button", { name: "横に等間隔" }).click();
  boxes = await shapeBoxes(page);
  const gap1 = (boxes[1]?.left ?? 0) - (boxes[0]?.right ?? 0);
  const gap2 = (boxes[2]?.left ?? 0) - (boxes[1]?.right ?? 0);
  expect(Math.abs(gap1 - gap2)).toBeLessThan(0.5);

  const zoom = (await snap(page)).zoom;
  const field = page.locator('[data-prop="gap-x"] input[type="number"]');
  await field.click();
  await page.keyboard.type("40");
  await expect.poll(async () => {
    const b = await shapeBoxes(page);
    return Math.round((((b[1]?.left ?? 0) - (b[0]?.right ?? 0)) / zoom) * 100) / 100;
  }).toBe(40);
  boxes = await shapeBoxes(page);
  expect(Math.abs((boxes[2]?.left ?? 0) - (boxes[1]?.right ?? 0) - 40 * zoom)).toBeLessThan(0.5);
});

test("guides are added with - and I, removed from the list, and undo brings one back", async ({ page }) => {
  await start(page);
  await expect(page.getByText("ガイドはありません")).toBeVisible();
  const p = await at(page, 100, 60);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press("-");
  await expect(page.locator("[data-guide-id]")).toHaveCount(1);
  const q = await at(page, 160, 100);
  await page.mouse.move(q.x, q.y);
  await page.keyboard.press("i");
  await expect(page.locator("[data-guide-id]")).toHaveCount(2);
  await expect(page.locator("[data-guide-row]")).toHaveCount(2);
  await page.locator("[data-guide-row] button").first().click();
  await expect(page.locator("[data-guide-id]")).toHaveCount(1);
  await page.keyboard.press("z");
  await expect(page.locator("[data-guide-id]")).toHaveCount(2);
  expect((await snap(page)).guides).toBe(2);
});

test("a number typed into a field applies without Enter", async ({ page }) => {
  await start(page);
  await place(page, "r", 0, 0);
  await page.locator('[data-prop="width"] input[type="number"]').click();
  await page.keyboard.type("200");
  await expect.poll(async () => (await snap(page)).nodes[0]?.width).toBe(200);
  await expect(page.locator('[data-prop="width"] input[type="number"]')).toHaveValue("200");
});

test("the grid is drawn with lines", async ({ page }) => {
  await start(page);
  expect(await page.locator("pattern line, pattern path").count()).toBeGreaterThan(0);
  expect(await page.locator("pattern circle").count()).toBe(0);
});

test("the cursor position text follows the pointer", async ({ page }) => {
  await start(page);
  await expect(page.getByTestId("cursor-pos")).toHaveCount(0);
  const a = await at(page, 0, 0);
  await page.mouse.move(a.x, a.y);
  await expect(page.getByTestId("cursor-pos")).toBeVisible();
  const t1 = await page.getByTestId("cursor-pos").innerText();
  const b = await at(page, 200, 100);
  await page.mouse.move(b.x, b.y);
  await expect.poll(async () => page.getByTestId("cursor-pos").innerText()).not.toBe(t1);
  expect(await page.getByTestId("cursor-pos").innerText()).toMatch(/^x -?[\d.]+\s+y -?[\d.]+$/);
});

test("every added button is 40px or taller", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await place(page, "r", -200, -100);
  await place(page, "c", 0, 0);
  await place(page, "p", 200, 60);
  const p = await at(page, 100, 60);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press("-");
  await page.keyboard.press("i");
  await page.keyboard.press("m");
  await clickAt(page, -200, -100);
  await clickAt(page, 0, 0);
  const selector = [
    "[data-op]", "[data-align]", "[data-distribute]", "[data-guide-action]",
    ".guide-row button", "[data-anchor]", '[data-color="none"]',
    '[data-action="scale-down"]', '[data-action="scale-up"]', '[data-action="rotate-mode"]',
  ].join(", ");
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    const els = document.querySelectorAll<HTMLElement>(sel);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.height < 40) out.push(`${el.tagName} ${(el.textContent ?? "").trim()} h=${r.height}`);
    }
    return { out, count: els.length };
  }, selector);
  expect(small.count).toBeGreaterThan(15);
  expect(small.out).toEqual([]);
});

const SHOTS = ".superpowers/sdd/2026-11-14-stage-1-5-feedback/screens";

async function sceneWithRect(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await place(page, "p", -200, -80);
  await place(page, "c", 0, -20);
  await place(page, "r", 200, 40);
  const h = await at(page, 120, 120);
  await page.mouse.move(h.x, h.y);
  await page.keyboard.press("-");
  const v = await at(page, -120, 120);
  await page.mouse.move(v.x, v.y);
  await page.keyboard.press("i");
  await page.mouse.move(h.x + 40, h.y + 60);
}

for (const scheme of ["light", "dark"] as const) {
  test(`screenshot: ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await sceneWithRect(page);
    expect((await snap(page)).guides).toBe(2);
    await page.screenshot({ path: `${SHOTS}/${scheme}-1280.png` });
  });
}

test("screenshot: three shapes selected", async ({ page }) => {
  await sceneWithRect(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await clickAt(page, -200, -80);
  await clickAt(page, 0, -20);
  await clickAt(page, 200, 40);
  expect((await snap(page)).selection).toHaveLength(3);
  await page.screenshot({ path: `${SHOTS}/multi-1280.png` });
});
