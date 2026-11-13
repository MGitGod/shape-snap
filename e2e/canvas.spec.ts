import { expect, test, type Page } from "@playwright/test";

interface Snapshot {
  nodes: Array<{ kind: string; transform: { x: number; y: number }; width?: number; height?: number }>;
  selection: string[];
  heldHandle: string | null;
  zoom: number;
  notice: string | null;
}

async function snap(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const s = (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap.getState();
    return {
      nodes: s.history.present.nodes,
      selection: s.selection,
      heldHandle: s.heldHandle,
      zoom: s.view.zoom,
      notice: s.notice,
    };
  });
}

async function canvasCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId("canvas").boundingBox();
  if (!box) throw new Error("canvas not found");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("place, move, nudge, handle, undo and view with clicks and single keys", async ({ page }) => {
  await page.goto("/");
  const c = await canvasCenter(page);

  // place a rect at the cursor
  await page.mouse.move(c.x, c.y);
  await page.keyboard.press("r");
  let s = await snap(page);
  expect(s.nodes).toHaveLength(1);
  expect(s.nodes[0]?.kind).toBe("rect");
  expect(s.selection).toHaveLength(1);
  await expect(page.locator("[data-node-id]")).toHaveCount(1);

  // click an empty point: the centre moves to the snapped point (grid 20)
  await page.mouse.click(c.x + 203, c.y + 97);
  s = await snap(page);
  expect(s.nodes[0]?.transform).toMatchObject({ x: 200, y: 100 });

  // arrows move by one grid step each
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  s = await snap(page);
  expect(s.nodes[0]?.transform.x).toBe(260);

  // hold the first handle, nudge it, release
  await page.keyboard.press("w");
  s = await snap(page);
  expect(s.heldHandle).toBe("edge:0");
  await page.keyboard.press("ArrowUp");
  s = await snap(page);
  expect(s.nodes[0]?.height).toBe(100);
  await page.keyboard.press("Escape");
  s = await snap(page);
  expect(s.heldHandle).toBeNull();
  expect(s.selection).toHaveLength(1);

  // grab edge:1 by clicking its centre, then click 40px to the right
  const handle = page.locator('[data-handle-id="edge:1"]');
  const hb = await handle.boundingBox();
  if (!hb) throw new Error("handle not found");
  const hx = hb.x + hb.width / 2;
  const hy = hb.y + hb.height / 2;
  await page.mouse.click(hx, hy);
  s = await snap(page);
  expect(s.heldHandle).toBe("edge:1");
  const widthBefore = s.nodes[0]?.width ?? 0;
  await page.mouse.click(hx + 40, hy);
  s = await snap(page);
  expect(s.nodes[0]?.width ?? 0).toBeGreaterThan(widthBefore);

  // two right clicks: release the handle, then clear the selection
  await page.mouse.click(c.x, c.y + 150, { button: "right" });
  await page.mouse.click(c.x, c.y + 150, { button: "right" });
  s = await snap(page);
  expect(s.heldHandle).toBeNull();
  expect(s.selection).toEqual([]);

  // undo until empty, then redo once
  for (let i = 0; i < 10; i++) await page.keyboard.press("z");
  s = await snap(page);
  expect(s.nodes).toHaveLength(0);
  await page.keyboard.press("y");
  s = await snap(page);
  expect(s.nodes).toHaveLength(1);

  // other shapes
  await page.mouse.move(c.x - 200, c.y - 100);
  await page.keyboard.press("c");
  await page.keyboard.press("p");
  s = await snap(page);
  expect(s.nodes.map((n) => n.kind)).toEqual(["rect", "ellipse", "polygon"]);

  // wheel zoom
  const before = s.zoom;
  await page.mouse.move(c.x, c.y);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await snap(page)).zoom).not.toBe(before);
});

test("the key hints change with the selection", async ({ page }) => {
  await page.goto("/");
  const hints = page.locator("footer.hints");
  await expect(hints).toContainText("今使えるキー");
  await expect(hints).toContainText("四角");
  const c = await canvasCenter(page);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.press("r");
  await expect(hints).toContainText("つかむ");
  await expect(hints).not.toContainText("多角形");
});
