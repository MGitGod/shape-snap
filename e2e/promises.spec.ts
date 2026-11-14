import { expect, test, type Page } from "@playwright/test";

interface NodeLite {
  id: string; kind: string; name: string;
  transform: { x: number; y: number };
  style: { fill: string | null };
  width?: number; height?: number; rx?: number; ry?: number;
}
interface Snap { nodes: NodeLite[]; selection: string[]; heldHandle: string | null; notice: string | null }

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const s = (window as unknown as { __shapeSnap: { getState: () => any } }).__shapeSnap.getState();
    return { nodes: s.history.present.nodes, selection: s.selection, heldHandle: s.heldHandle, notice: s.notice };
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

async function readStream(stream: AsyncIterable<Uint8Array> | null): Promise<Uint8Array> {
  if (!stream) throw new Error("no download stream");
  const parts: Uint8Array[] = [];
  for await (const c of stream) parts.push(c);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

function byName(s: Snap, name: string): NodeLite {
  const n = s.nodes.find((x) => x.name === name);
  if (!n) throw new Error(`no shape named ${name}`);
  return n;
}

test("stage 1 walkthrough with clicks and single keys only", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);

  // 1-2. place a rect, a circle and a triangle, then move each to its own point
  await place(page, "r", -200, -100);
  await clickAt(page, -200, 100);
  await place(page, "c", 0, -100);
  await clickAt(page, 0, 100);
  await place(page, "p", 200, -100);
  await clickAt(page, 200, 100);
  let s = await snap(page);
  expect(s.nodes.map((n) => n.kind)).toEqual(["rect", "ellipse", "polygon"]);
  expect(s.nodes.map((n) => n.transform)).toMatchObject([
    { x: -200, y: 100 }, { x: 0, y: 100 }, { x: 200, y: 100 },
  ]);

  // 3. widen the rect: click it, grab its right-edge handle, click 40 units further right
  await clickAt(page, -200, 100);
  expect((await snap(page)).selection).toEqual([byName(s, "四角 1").id]);
  await clickAt(page, -160, 100);
  expect((await snap(page)).heldHandle).toBe("edge:1");
  await clickAt(page, -120, 100);
  s = await snap(page);
  expect(byName(s, "四角 1").width).toBe(120);
  expect(byName(s, "四角 1").height).toBe(80);
  await page.keyboard.press("Escape");
  expect((await snap(page)).heldHandle).toBeNull();

  // 4. shrink the circle's top edge with an arrow: it becomes an ellipse
  await clickAt(page, 0, 100);
  await page.keyboard.press("w");
  expect((await snap(page)).heldHandle).toBe("edge:0");
  await page.keyboard.press("ArrowDown");
  s = await snap(page);
  expect(byName(s, "円 1").rx).toBe(40);
  expect(byName(s, "円 1").ry).toBe(30);
  await page.keyboard.press("Escape");

  // 5. move a triangle edge: it turns into a free shape and the notice appears
  await clickAt(page, 200, 100);
  await page.keyboard.press("w");
  await page.keyboard.press("ArrowRight");
  s = await snap(page);
  expect(s.nodes.find((n) => n.name === "多角形 1" && n.kind === "polygon")).toBeUndefined();
  const free = s.nodes.find((n) => n.kind === "path");
  expect(free).toBeDefined();
  expect(s.notice).toContain("自由な形");
  await expect(page.locator("footer.hints")).toContainText("自由な形");
  await page.keyboard.press("Escape");

  // 6. change the circle's colour
  await clickAt(page, 0, 100);
  await page.locator('[data-color-field="fill"] [data-color="#e5484d"]').click();
  s = await snap(page);
  expect(byName(s, "円 1").style.fill).toBe("#e5484d");
  await page.keyboard.press("Escape");

  // 7. two overlapping shapes: the same click point switches between them
  await place(page, "r", -100, -150);
  await place(page, "c", -80, -150);
  s = await snap(page);
  const rect2 = byName(s, "四角 2");
  const ell2 = byName(s, "円 2");
  await page.keyboard.press("Escape");
  await clickAt(page, -90, -150);
  expect((await snap(page)).selection).toEqual([ell2.id]);
  await clickAt(page, -90, -150);
  expect((await snap(page)).selection).toEqual([rect2.id]);
  await clickAt(page, -90, -150);
  expect((await snap(page)).selection).toEqual([ell2.id]);
  await page.keyboard.press("Escape");

  // 8. multi-select two shapes and move them together with an arrow
  const before = await snap(page);
  await page.keyboard.press("m");
  await clickAt(page, 0, 100);
  await clickAt(page, 200, 100);
  s = await snap(page);
  expect(s.selection).toHaveLength(2);
  await page.keyboard.press("ArrowLeft");
  s = await snap(page);
  expect(byName(s, "円 1").transform.x).toBe(byName(before, "円 1").transform.x - 20);
  expect(s.nodes.find((n) => n.kind === "path")?.transform.x).toBe((free?.transform.x ?? 0) - 20);
  expect(byName(s, "四角 1").transform.x).toBe(byName(before, "四角 1").transform.x);
  await page.keyboard.press("Escape");

  // 9. duplicate, delete one, undo the delete
  await clickAt(page, -200, 100);
  const count = (await snap(page)).nodes.length;
  await page.keyboard.press("d");
  expect((await snap(page)).nodes).toHaveLength(count + 1);
  await page.keyboard.press("Delete");
  expect((await snap(page)).nodes).toHaveLength(count);
  await page.keyboard.press("z");
  s = await snap(page);
  expect(s.nodes).toHaveLength(count + 1);

  // 9b. draw a line and turn it into a curve
  await page.keyboard.press("l");
  await clickAt(page, -200, 200);
  await clickAt(page, -100, 260);
  await clickAt(page, 0, 200);
  await page.keyboard.press("Enter");
  await page.keyboard.press("s");
  s = await snap(page);
  expect(s.nodes).toHaveLength(count + 2);
  expect(s.nodes[s.nodes.length - 1]?.kind).toBe("path");

  // 10. export SVG: the element count matches the number of shapes on screen
  await page.getByRole("button", { name: "書き出し", exact: true }).click();
  await page.getByRole("radio", { name: "SVG", exact: true }).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "書き出す" }).click(),
  ]);
  const bytes = await readStream((await download.createReadStream()) as unknown as AsyncIterable<Uint8Array> | null);
  const svg = new TextDecoder().decode(bytes);
  const elements = svg.match(/<(?:rect|ellipse|polygon|path)\b/g) ?? [];
  await expect(page.locator("[data-node-id]")).toHaveCount(s.nodes.length);
  expect(elements).toHaveLength(s.nodes.length);
  expect(elements).toHaveLength(count + 2);
  await page.keyboard.press("Escape");

  // 11. repeat the front shape and change the count from the panel
  const frontId = s.nodes[s.nodes.length - 1]!.id;
  await page.locator(`[data-list-id="${frontId}"] .row-name`).click();
  await page.keyboard.press("a");
  expect((await snap(page)).nodes[s.nodes.length - 1]?.kind).toBe("repeat");
  await expect(page.locator("[data-node-id]")).toHaveCount(s.nodes.length);
  await page.locator('[data-prop="count"] input[type="number"]').fill("3");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-node-id] > :is(rect, ellipse, polygon, path)")).toHaveCount(s.nodes.length + 2);

  // 12. make a circle a subtract shape and export everything merged into outlines
  const circleId = byName(s, "円 2").id;
  await page.locator(`[data-list-id="${circleId}"] .row-name`).click();
  await page.keyboard.press("t");
  expect((await snap(page)).nodes.find((n) => n.id === circleId)).toMatchObject({ role: "subtract" });
  await page.getByRole("button", { name: "書き出し", exact: true }).click();
  await page.getByRole("radio", { name: "SVG", exact: true }).check();
  await expect(page.getByTestId("export-combine")).toBeChecked();
  const [merged] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "書き出す" }).click(),
  ]);
  const mergedSvg = new TextDecoder().decode(
    await readStream((await merged.createReadStream()) as unknown as AsyncIterable<Uint8Array> | null));
  expect(mergedSvg).toContain("<path");
  expect(mergedSvg).not.toContain("<ellipse");

  // 13. change one key, work with the new key, then put everything back
  await page.keyboard.press("Escape");
  await page.locator('[data-action="keys"]').click();
  await page.locator('[data-key-action="place-polygon"]').click();
  await page.keyboard.press("'");
  await page.getByRole("button", { name: "閉じる" }).click();
  const polygons = (await snap(page)).nodes.filter((n) => n.kind === "polygon").length;
  await place(page, "'", 0, 150);
  expect((await snap(page)).nodes.filter((n) => n.kind === "polygon").length).toBe(polygons + 1);
  await page.locator('[data-action="keys"]').click();
  await page.getByRole("button", { name: "全部を初めに戻す" }).click();
  await page.getByRole("button", { name: "戻す", exact: true }).click();
  await expect(page.locator('[data-key-action="place-polygon"] kbd')).toHaveText("P");
  await page.getByRole("button", { name: "閉じる" }).click();
});

for (const size of [{ width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
  test(`layout holds at ${size.width}x${size.height}: no page scroll, targets are 40px or taller`, async ({ page }) => {
    await page.setViewportSize(size);
    await start(page);
    await place(page, "r", -150, -50);
    await place(page, "c", 50, 50);
    await place(page, "p", 200, -50);

    const checkTargets = async (label: string): Promise<void> => {
      const small = await page.evaluate(() => {
        const out: string[] = [];
        const nodes = document.querySelectorAll<HTMLElement>(
          'button, [role="option"], [role="radio"], .work-row, label.check-row',
        );
        for (const el of nodes) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.height < 40) {
            out.push(`${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? "").trim().slice(0, 20)}" h=${r.height}`);
          }
        }
        return out;
      });
      expect(small, `${label}: targets under 40px`).toEqual([]);
    };
    const checkScroll = async (label: string): Promise<void> => {
      const d = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight,
        bw: document.body.scrollWidth, bh: document.body.scrollHeight,
      }));
      expect(d.sw, `${label} scrollWidth`).toBeLessThanOrEqual(d.cw);
      expect(d.sh, `${label} scrollHeight`).toBeLessThanOrEqual(d.ch);
      expect(d.bw, `${label} body scrollWidth`).toBeLessThanOrEqual(d.cw);
      expect(d.bh, `${label} body scrollHeight`).toBeLessThanOrEqual(d.ch);
    };

    await checkScroll("main");
    await checkTargets("main");

    // the toolbar buttons themselves
    const tools = page.locator('[role="toolbar"] button');
    expect(await tools.count()).toBeGreaterThan(10);
    for (const b of await tools.all()) {
      const box = await b.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    }
    const rows = page.locator('[role="option"]');
    expect(await rows.count()).toBe(3);
    for (const r of await rows.all()) {
      const box = await r.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    }

    // dialogs
    await page.getByRole("button", { name: "作品", exact: true }).click();
    await checkTargets("works menu");
    await checkScroll("works menu");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "書き出し", exact: true }).click();
    await checkTargets("export dialog");
    await checkScroll("export dialog");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-modal]")).toHaveCount(0);
  });
}

function channels(css: string): number[] {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) throw new Error(`cannot parse ${css}`);
  return (m[1] ?? "").split(/[ ,/]+/).filter(Boolean).slice(0, 3).map(Number);
}
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = (v ?? 0) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
function contrast(a: string, b: string): number {
  const la = luminance(channels(a));
  const lb = luminance(channels(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme} scheme: text and background differ and stay readable`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: scheme });
    await start(page);
    const colours = await page.evaluate(() => {
      const pick = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { color: cs.color, bg: cs.backgroundColor };
      };
      return { body: pick("body"), btn: pick(".btn"), panel: pick(".panel") };
    });
    expect(colours.body).not.toBeNull();
    expect(colours.body?.color).not.toBe(colours.body?.bg);
    expect(contrast(colours.body?.color ?? "", colours.body?.bg ?? "")).toBeGreaterThanOrEqual(4.5);
    for (const key of ["btn", "panel"] as const) {
      const c = colours[key];
      if (c && !c.bg.includes("0)") && c.bg !== "transparent") {
        expect(c.color).not.toBe(c.bg);
        expect(contrast(c.color, c.bg), key).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
}

test("screenshots in light and dark with a few shapes", async ({ page }) => {
  const dir = ".superpowers/sdd/2026-11-13-stage-1-foundation/screens";
  const shoot = async (scheme: "light" | "dark", size: { width: number; height: number }, file: string) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ colorScheme: scheme });
    await start(page);
    // autosave restores the shapes on later loads in the same browser context
    if ((await snap(page)).nodes.length === 0) {
      await place(page, "r", -150, -50);
      await place(page, "c", 50, 50);
      await place(page, "p", 200, -50);
    }
    await page.keyboard.press("Escape");
    await clickAt(page, 50, 50);
    await page.keyboard.press("w");
    await page.screenshot({ path: `${dir}/${file}` });
  };
  await shoot("light", { width: 1280, height: 800 }, "light-1280.png");
  await shoot("dark", { width: 1280, height: 800 }, "dark-1280.png");
  await shoot("light", { width: 1024, height: 768 }, "light-1024.png");
});
