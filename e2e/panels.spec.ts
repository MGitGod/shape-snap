import { expect, test, type Page } from "@playwright/test";

interface Snap {
  nodes: Array<{
    id: string; name: string; kind: string; visible: boolean; locked: boolean;
    transform: { x: number; y: number; rotation: number };
    style: { fill: string | null; stroke: string | null };
    width?: number;
  }>;
  selection: string[];
  focusArea: string;
  grid: { size: number };
}

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const s = (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap.getState();
    return {
      nodes: s.history.present.nodes,
      selection: s.selection,
      focusArea: s.focusArea,
      grid: s.history.present.grid,
    };
  });
}

const widthField = (page: Page) => page.locator('[data-prop="width"] input[type="number"]');

async function typeInto(page: Page, text: string): Promise<void> {
  await widthField(page).click();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

test("toolbar places a rect and the list shows it", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="place-rect"]').click();
  expect((await snap(page)).nodes).toHaveLength(1);
  await expect(page.locator('[role="option"]').filter({ hasText: "四角 1" })).toHaveCount(1);
});

test("number field, wheel, and key navigation in the props panel", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="place-rect"]').click();

  await typeInto(page, "200");
  expect((await snap(page)).nodes[0]?.width).toBe(200);

  await typeInto(page, "abc");
  expect((await snap(page)).nodes[0]?.width).toBe(200);
  await expect(widthField(page)).toHaveValue("200");

  const g = (await snap(page)).grid.size;
  const row = page.locator('[data-prop="width"]');
  const box = await row.boundingBox();
  if (!box) throw new Error("row not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await snap(page)).nodes[0]?.width).toBe(200 + g);

  // Tab x2 -> props; ArrowDown x2 selects "width"; ArrowRight adds one step
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  expect((await snap(page)).focusArea).toBe("props");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  expect((await snap(page)).nodes[0]?.width).toBe(200 + g * 2);
  await page.keyboard.press("Tab");
  expect((await snap(page)).focusArea).toBe("canvas");
});

test("list keys, colours, visibility and lock", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="place-rect"]').click();
  await page.locator('[data-action="place-ellipse"]').click();
  let s = await snap(page);
  expect(s.nodes).toHaveLength(2);
  const [back, front] = s.nodes;
  expect(s.selection).toEqual([front?.id]);

  // Tab once -> list; ArrowDown moves to the shape behind
  await page.keyboard.press("Tab");
  expect((await snap(page)).focusArea).toBe("list");
  await page.keyboard.press("ArrowDown");
  s = await snap(page);
  expect(s.selection).toEqual([back?.id]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  // colours
  await page.locator('[data-color-field="fill"] [data-color="#e5484d"]').click();
  s = await snap(page);
  expect(s.nodes.find((n) => n.id === back?.id)?.style.fill).toBe("#e5484d");
  await page.locator('[data-color-field="fill"] [data-color="none"]').click();
  s = await snap(page);
  expect(s.nodes.find((n) => n.id === back?.id)?.style.fill).toBeNull();

  // hide the rect from the list
  const rectRow = page.locator(`[data-list-id="${back?.id}"]`);
  await rectRow.locator('[data-row-action="visible"]').click();
  s = await snap(page);
  expect(s.nodes.find((n) => n.id === back?.id)?.visible).toBe(false);
  await expect(page.locator(`[data-node-id="${back?.id}"]`)).toHaveCount(0);
  await rectRow.locator('[data-row-action="visible"]').click();
  await expect(page.locator(`[data-node-id="${back?.id}"]`)).toHaveCount(1);

  // lock the ellipse, deselect, click it on the canvas: not selected
  const ellRow = page.locator(`[data-list-id="${front?.id}"]`);
  await ellRow.locator('[data-row-action="lock"]').click();
  await page.keyboard.press("Escape");
  expect((await snap(page)).selection).toEqual([]);
  const target = page.locator(`[data-node-id="${front?.id}"]`);
  const tb = await target.boundingBox();
  if (!tb) throw new Error("shape not found");
  await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
  s = await snap(page);
  expect(s.nodes.find((n) => n.id === front?.id)?.locked).toBe(true);
  expect(s.selection).not.toContain(front?.id);
});

test("grid size does not resize shapes and the 1 key halves it", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="place-rect"]').click();
  const before = (await snap(page)).nodes[0]?.width;
  const field = page.locator('[data-prop="grid-size"] input[type="number"]');
  await field.click();
  await page.keyboard.type("40");
  await page.keyboard.press("Enter");
  let s = await snap(page);
  expect(s.grid.size).toBe(40);
  expect(s.nodes[0]?.width).toBe(before);
  await page.keyboard.press("1");
  s = await snap(page);
  expect(s.grid.size).toBe(20);
});

test("three slider changes undo together with one z", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-action="place-rect"]').click();
  const start = (await snap(page)).nodes[0]?.width;
  const row = page.locator('[data-prop="width"]');
  const box = await row.boundingBox();
  if (!box) throw new Error("row not found");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await snap(page)).nodes[0]?.width).not.toBe(start);
  await page.keyboard.press("z");
  expect((await snap(page)).nodes[0]?.width).toBe(start);
});
