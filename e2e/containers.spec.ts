import { expect, test, type Page } from "@playwright/test";

interface Leaf { id: string; kind: string; width?: number; transform: { x: number; y: number }; style: { fill: string | null } }
interface Snap {
  nodes: Array<Record<string, any>>;
  selection: string[];
  heldHandle: string | null;
}

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const s = (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap.getState();
    return { nodes: s.history.present.nodes, selection: s.selection, heldHandle: s.heldHandle };
  });
}

async function leaves(page: Page, id: string): Promise<Leaf[]> {
  return page.evaluate(
    (nid) => (window as unknown as { __shapeSnap: { expand: (i: string) => unknown } }).__shapeSnap.expand(nid),
    id,
  ) as Promise<Leaf[]>;
}

async function start(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
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

async function place(page: Page, key: string, wx: number, wy: number): Promise<void> {
  const p = await at(page, wx, wy);
  await page.mouse.move(p.x, p.y);
  await page.keyboard.press(key);
}

async function clickAt(page: Page, wx: number, wy: number): Promise<void> {
  const p = await at(page, wx, wy);
  await page.mouse.click(p.x, p.y);
}

async function setProp(page: Page, key: string, value: string): Promise<void> {
  const input = page.locator(`[data-prop="${key}"] input[type="number"]`);
  await input.fill(value);
  await page.keyboard.press("Enter");
}

async function centreOf(page: Page, sel: string): Promise<{ x: number; y: number }> {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`not found: ${sel}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const leafCount = (page: Page) => page.locator("[data-node-id] > :is(rect, ellipse, polygon, path)");

async function readStream(stream: AsyncIterable<Uint8Array> | null): Promise<Uint8Array> {
  if (!stream) throw new Error("no download stream");
  const parts: Uint8Array[] = [];
  for await (const c of stream) parts.push(c);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
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

const SHOTS = ".superpowers/sdd/2026-11-14-stage-3-repeat-mirror-group/screens";

test("repeat: count, scale step, spacing, move, handle, break apart and undo", async ({ page }) => {
  await start(page);
  await place(page, "r", -200, 0);
  await page.keyboard.press("a");
  let s = await snap(page);
  expect(s.nodes).toHaveLength(1);
  expect(s.nodes[0]?.kind).toBe("repeat");
  const id = s.nodes[0]!.id as string;
  await expect(leafCount(page)).toHaveCount(5);

  await setProp(page, "count", "3");
  await expect(leafCount(page)).toHaveCount(3);

  await setProp(page, "scaleStep", "0.8");
  const ls = await leaves(page, id);
  const widths = ls.map((l) => l.width ?? 0);
  expect(widths[1]!).toBeLessThan(widths[0]!);
  expect(widths[2]!).toBeLessThan(widths[1]!);

  const gap = async () => {
    const l = await leaves(page, id);
    return l[1]!.transform.x - l[0]!.transform.x;
  };
  const gapBefore = await gap();
  await setProp(page, "dx", "140");
  expect(await gap()).not.toBe(gapBefore);

  // arrow keys move every copy together (focus goes back to the canvas first)
  await page.locator("[data-list-id] .row-name").first().click();
  const xs0 = (await leaves(page, id)).map((l) => l.transform.x);
  await clickAt(page, -200, 0);
  await page.keyboard.press("ArrowRight");
  const xs1 = (await leaves(page, id)).map((l) => l.transform.x);
  const d0 = xs1[0]! - xs0[0]!;
  expect(d0).not.toBe(0);
  xs1.forEach((x, i) => expect(x - xs0[i]!).toBeCloseTo(d0, 5));

  // grab the source shape's edge handle and click: every copy gets wider
  const w0 = (await leaves(page, id)).map((l) => l.width ?? 0);
  const h = await centreOf(page, '[data-handle-id="edge:1"]');
  await page.mouse.click(h.x, h.y);
  await page.mouse.click(h.x + 40, h.y);
  const w1 = (await leaves(page, id)).map((l) => l.width ?? 0);
  w1.forEach((w, i) => expect(w).toBeGreaterThan(w0[i]!));

  // break apart: three independent shapes, all selected; undo restores the repeat
  await page.keyboard.press("u");
  s = await snap(page);
  expect(s.nodes).toHaveLength(3);
  expect(s.selection).toHaveLength(3);
  expect(s.nodes.every((n) => n.kind === "rect")).toBe(true);
  await page.keyboard.press("z");
  s = await snap(page);
  expect(s.nodes).toHaveLength(1);
  expect(s.nodes[0]?.kind).toBe("repeat");
});

test("mirror: modes, count and the axis handle", async ({ page }) => {
  await start(page);
  await place(page, "p", -140, -20);
  await page.keyboard.press("x");
  let s = await snap(page);
  expect(s.nodes[0]?.kind).toBe("mirror");
  const id = s.nodes[0]!.id as string;
  await expect(leafCount(page)).toHaveCount(2);

  await page.locator('[data-mirror-mode="rotate"]').click();
  await expect(leafCount(page)).toHaveCount(6);
  await expect(page.locator('[data-mirror-mode="rotate"]')).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${SHOTS}/mirror.png` });
  await setProp(page, "count", "8");
  await expect(leafCount(page)).toHaveCount(8);

  const box = await page.locator('[data-handle-id="axis:0"]').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(17);
  const before = (await leaves(page, id)).map((l) => `${l.transform.x},${l.transform.y}`);
  const axis0 = { x: s.nodes[0]!.axisX as number, y: s.nodes[0]!.axisY as number };
  const h = await centreOf(page, '[data-handle-id="axis:0"]');
  await page.mouse.click(h.x, h.y);
  await page.mouse.click(h.x + 80, h.y + 60);
  s = await snap(page);
  const m = s.nodes[0]!;
  expect(m.axisX !== axis0.x || m.axisY !== axis0.y).toBe(true);
  const after = (await leaves(page, id)).map((l) => `${l.transform.x},${l.transform.y}`);
  expect(after).not.toEqual(before);
});

test("group: move together, break apart, repeat the group, colour, export and reload", async ({ page }) => {
  await start(page);
  await place(page, "r", -200, -100);
  await place(page, "c", 100, 100);
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await clickAt(page, -200, -100);
  await clickAt(page, 100, 100);
  await page.keyboard.press("g");
  let s = await snap(page);
  expect(s.nodes).toHaveLength(1);
  expect(s.nodes[0]?.kind).toBe("group");
  const gid = s.nodes[0]!.id as string;
  const before = (await leaves(page, gid)).map((l) => l.transform.x);
  await page.keyboard.press("ArrowRight");
  const after = (await leaves(page, gid)).map((l) => l.transform.x);
  expect(after).toHaveLength(2);
  after.forEach((x, i) => expect(x).toBeGreaterThan(before[i]!));
  await expect(page.locator("[data-list-id]").first()).toContainText("2 個");

  await page.keyboard.press("u");
  s = await snap(page);
  expect(s.nodes).toHaveLength(2);
  await page.keyboard.press("z");
  s = await snap(page);
  expect(s.nodes[0]?.kind).toBe("group");

  // repeat the group: 2 leaves x 5 (select it again first: undo drops the selection)
  await page.locator("[data-list-id] .row-name").first().click();
  await page.keyboard.press("a");
  expect((await snap(page)).nodes[0]?.kind).toBe("repeat");
  await expect(leafCount(page)).toHaveCount(10);

  // a colour swatch restyles every leaf, copies included
  await page.locator('[data-color-field="fill"] [data-color="#e5484d"]').click();
  const fills = await leafCount(page).evaluateAll((els) => els.map((e) => e.getAttribute("fill")));
  expect(fills).toHaveLength(10);
  expect(fills.every((f) => f === "#e5484d")).toBe(true);

  // SVG export has the 10 leaves
  const svg = new TextDecoder().decode((await exportAs(page, "SVG")).bytes);
  expect((svg.match(/<(?:rect|ellipse)\b/g) ?? []).length).toBe(10);

  // work file round trip keeps the container
  const { path } = await exportAs(page, "作業ファイル");
  await page.getByRole("button", { name: "作品", exact: true }).click();
  await page.getByRole("button", { name: "新しい作品" }).click();
  await expect.poll(async () => (await snap(page)).nodes.length).toBe(0);
  await page.locator('[data-modal="works"] input[type="file"]').setInputFiles(path);
  await expect(page.locator("[data-modal]")).toHaveCount(0);
  s = await snap(page);
  expect(s.nodes).toHaveLength(1);
  expect(s.nodes[0]?.kind).toBe("repeat");
  expect(s.nodes[0]?.count).toBe(5);
  expect(s.nodes[0]?.child.kind).toBe("group");
});

test("repeat SVG export has one rect per copy", async ({ page }) => {
  await start(page);
  await place(page, "r", -200, 0);
  await page.keyboard.press("a");
  const svg = new TextDecoder().decode((await exportAs(page, "SVG")).bytes);
  expect((svg.match(/<rect\b/g) ?? []).length).toBe(5);
});

test("screenshot: repeat", async ({ page }) => {
  await start(page);
  await place(page, "r", -300, -60);
  await page.keyboard.press("a");
  await setProp(page, "scaleStep", "0.85");
  await setProp(page, "dx", "120");
  await page.screenshot({ path: `${SHOTS}/repeat.png` });
});

test("toolbar stays within 120px at 1280px and the new buttons are 40px tall", async ({ page }) => {
  await start(page);
  const box = await page.locator("header.toolbar").boundingBox();
  expect(box?.height ?? 999).toBeLessThanOrEqual(120);
  for (const a of ["repeat", "mirror", "group", "ungroup"]) {
    const b = await page.locator(`[data-action="${a}"]`).boundingBox();
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(40);
  }
});
