import { expect, test, type Page } from "@playwright/test";

interface PathLite {
  id: string; kind: string; closed: boolean; smooth: boolean; tension: number;
  transform: { x: number; y: number };
  points: Array<{ x: number; y: number; corner: boolean }>;
}
interface Snap { nodes: PathLite[]; selection: string[]; heldHandle: string | null; notice: string | null; drawing: unknown }

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const s = (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap.getState();
    return {
      nodes: s.history.present.nodes, selection: s.selection, heldHandle: s.heldHandle,
      notice: s.notice, drawing: s.drawing,
    };
  });
}

async function start(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator(".app")).toHaveAttribute("data-ready", "true");
}

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

const ZIGZAG: Array<[number, number]> = [[-100, -60], [-40, 60], [20, -60], [80, 60], [140, -60]];

async function drawZigzag(page: Page, count = 5): Promise<void> {
  await page.keyboard.press("l");
  for (const [x, y] of ZIGZAG.slice(0, count)) await clickAt(page, x, y);
}

async function centreOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`${selector} not found`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const pathD = (page: Page) => page.locator("[data-node-id]").first().getAttribute("d");

test("draw a zigzag line, preview shows while drawing, Enter confirms", async ({ page }) => {
  await start(page);
  await page.keyboard.press("l");
  await expect(page.getByTestId("canvas")).toHaveCSS("cursor", "crosshair");
  for (const [x, y] of ZIGZAG) await clickAt(page, x, y);
  await expect(page.getByTestId("drawing-preview")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("drawing-preview")).toHaveCount(0);
  const s = await snap(page);
  expect(s.nodes).toHaveLength(1);
  const n = s.nodes[0]!;
  expect(n.kind).toBe("path");
  expect(n.closed).toBe(false);
  expect(n.points).toHaveLength(5);
  for (const p of n.points) {
    expect(Math.abs((p.x + n.transform.x) % 20)).toBe(0);
    expect(Math.abs((p.y + n.transform.y) % 20)).toBe(0);
  }
  const el = page.locator("[data-node-id]");
  await expect(el).toHaveCount(1);
  expect(await el.evaluate((e) => e.tagName.toLowerCase())).toBe("path");
  await expect(el).toHaveAttribute("fill", "none");
});

test("right click removes a point and Escape cancels", async ({ page }) => {
  await start(page);
  await drawZigzag(page, 3);
  const pts = () => page.evaluate(() =>
    (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap.getState().drawing.points.length);
  expect(await pts()).toBe(3);
  const p = await at(page, 300, 150);
  await page.mouse.click(p.x, p.y, { button: "right" });
  expect(await pts()).toBe(2);
  await page.keyboard.press("Escape");
  const s = await snap(page);
  expect(s.nodes).toHaveLength(0);
  expect(s.drawing).toBeNull();
});

test("clicking the first point after three closes the shape", async ({ page }) => {
  await start(page);
  await page.keyboard.press("l");
  await clickAt(page, -100, -60);
  await clickAt(page, 0, 60);
  await clickAt(page, 100, -60);
  await expect(page.getByTestId("drawing-close")).toHaveCount(1);
  await clickAt(page, -100, -60);
  const s = await snap(page);
  expect(s.nodes).toHaveLength(1);
  expect(s.nodes[0]?.closed).toBe(true);
});

test("S toggles smooth and the tension slider changes the curve", async ({ page }) => {
  await start(page);
  await drawZigzag(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("s");
  expect((await snap(page)).nodes[0]?.smooth).toBe(true);
  expect(await pathD(page)).toContain("C");
  const d1 = await pathD(page);
  const field = page.locator('[data-prop="tension"] input[type="number"]');
  await field.click();
  await page.keyboard.type("0.9");
  await page.keyboard.press("Enter");
  const s = await snap(page);
  expect(s.nodes[0]?.tension).toBe(0.9);
  expect(await pathD(page)).not.toBe(d1);
});

test("S twice returns to straight segments", async ({ page }) => {
  await start(page);
  await drawZigzag(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("s");
  await page.keyboard.press("s");
  expect((await snap(page)).nodes[0]?.smooth).toBe(false);
  expect(await pathD(page)).not.toContain("C");
});

test("move a curve point with a handle, then make it a corner with /", async ({ page }) => {
  await start(page);
  await drawZigzag(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("s");
  const dBefore = await pathD(page);
  const h = await centreOf(page, '[data-handle-id="vertex:1"]');
  await page.mouse.click(h.x, h.y);
  expect((await snap(page)).heldHandle).toBe("vertex:1");
  const before = (await snap(page)).nodes[0]!.points[1]!;
  await clickAt(page, -40, 120);
  const after = (await snap(page)).nodes[0]!.points[1]!;
  expect(after.y).toBeGreaterThan(before.y);
  expect(await pathD(page)).not.toBe(dBefore);
  await page.keyboard.press("/");
  expect((await snap(page)).nodes[0]?.points[1]?.corner).toBe(true);
  await expect(page.locator('[data-handle-shape="diamond"]')).toHaveCount(1);
});

test("add a point with Enter on an edge handle and remove one with Delete", async ({ page }) => {
  await start(page);
  await drawZigzag(page);
  await page.keyboard.press("Enter");
  const e = await centreOf(page, '[data-handle-id="edge:0"]');
  await page.mouse.click(e.x, e.y);
  await page.keyboard.press("Enter");
  expect((await snap(page)).nodes[0]?.points).toHaveLength(6);
  await page.keyboard.press("Escape");
  const v = await centreOf(page, '[data-handle-id="vertex:2"]');
  await page.mouse.click(v.x, v.y);
  expect((await snap(page)).heldHandle).toBe("vertex:2");
  await page.keyboard.press("Delete");
  const s = await snap(page);
  expect(s.nodes).toHaveLength(1);
  expect(s.nodes[0]?.points).toHaveLength(5);
});

test("path buttons call the same actions", async ({ page }) => {
  await start(page);
  await drawZigzag(page);
  await page.keyboard.press("Enter");
  const closed = page.locator('[data-path-action="closed"]');
  await closed.click();
  expect((await snap(page)).nodes[0]?.closed).toBe(true);
  await closed.click();
  expect((await snap(page)).nodes[0]?.closed).toBe(false);
  await page.locator('[data-path-action="smooth"]').click();
  expect((await snap(page)).nodes[0]?.smooth).toBe(true);
  const e = await centreOf(page, '[data-handle-id="vertex:1"]');
  await page.mouse.click(e.x, e.y);
  await page.locator('[data-path-action="corner"]').click();
  expect((await snap(page)).nodes[0]?.points[1]?.corner).toBe(true);
  await page.locator('[data-path-action="delete-point"]').click();
  expect((await snap(page)).nodes[0]?.points).toHaveLength(4);
});

test("a circle becomes a smooth path with 8 points via J", async ({ page }) => {
  await start(page);
  const p = await at(page, 0, 0);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press("c");
  await page.keyboard.press("j");
  const n = (await snap(page)).nodes[0]!;
  expect(n.kind).toBe("path");
  expect(n.points).toHaveLength(8);
  expect(n.smooth).toBe(true);
});

test("an exported line has a path element with stroke-linecap", async ({ page }) => {
  await start(page);
  await drawZigzag(page);
  await page.keyboard.press("Enter");
  const svg = await page.evaluate(() =>
    (window as unknown as { __shapeSnap: { getSvg: (o: unknown) => string } }).__shapeSnap
      .getSvg({ area: "content", margin: 20, background: null }));
  expect(svg).toContain("<path");
  expect(svg).toContain("stroke-linecap");
});

test("toolbar is two rows or fewer at 1280px and the new buttons are tall enough", async ({ page }) => {
  await start(page);
  const box = await page.locator("header.toolbar").boundingBox();
  expect(box?.height ?? 999).toBeLessThanOrEqual(120);
  for (const sel of ['[data-action="line"]', '[data-action="smooth"]']) {
    const b = await page.locator(sel).boundingBox();
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(40);
  }
  await drawZigzag(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("s");
  const h = await centreOf(page, '[data-handle-id="vertex:1"]');
  await page.mouse.click(h.x, h.y);
  const buttons = await page.locator("[data-path-action]").all();
  expect(buttons.length).toBeGreaterThanOrEqual(4);
  for (const b of buttons) {
    const bb = await b.boundingBox();
    expect(bb?.height ?? 0).toBeGreaterThanOrEqual(40);
  }
});

test("screenshots: drawing, wave and dark", async ({ page }) => {
  const dir = ".superpowers/sdd/2026-11-14-stage-2-lines-and-curves/screens";
  await page.emulateMedia({ colorScheme: "light" });
  await start(page);
  await drawZigzag(page, 4);
  const c = await at(page, 120, 0);
  await page.mouse.move(c.x, c.y);
  await page.screenshot({ path: `${dir}/drawing.png` });
  await clickAt(page, 140, -60);
  await page.keyboard.press("Enter");
  await page.keyboard.press("s");
  await page.screenshot({ path: `${dir}/wave.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${dir}/dark.png` });
});
