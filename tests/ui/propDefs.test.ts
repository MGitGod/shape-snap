import { describe, expect, it } from "vitest";
import { createDocument, createNode } from "../../src/core/model";
import type { GridSettings, SceneNode } from "../../src/core/types";
import { clampToDef, hexToHsl, hslToHex, propDefsFor } from "../../src/ui/propDefs";

const grid: GridSettings = { size: 20, visible: true, snap: true };
const doc = createDocument();
const rect = createNode(doc, "rect", { x: 100, y: 60 });
const ellipse = createNode(doc, "ellipse", { x: 0, y: 0 });
const polygon = createNode(doc, "polygon", { x: 0, y: 0 });

const keys = (n: SceneNode) => propDefsFor(n, grid).map((d) => d.key);
const def = (n: SceneNode, key: string) => {
  const d = propDefsFor(n, grid).find((x) => x.key === key);
  if (!d) throw new Error("no def " + key);
  return d;
};

describe("propDefsFor", () => {
  it("lists rect props in order", () => {
    expect(keys(rect)).toEqual(["x", "y", "width", "height", "cornerRadius", "rotation", "strokeWidth", "opacity"]);
  });
  it("lists ellipse and polygon props", () => {
    expect(keys(ellipse)).toEqual(["x", "y", "rx", "ry", "rotation", "strokeWidth", "opacity"]);
    expect(keys(polygon)).toEqual(["x", "y", "sides", "radius", "starRatio", "rotation", "strokeWidth", "opacity"]);
  });
  it("uses the grid for ranges and steps", () => {
    const x = def(rect, "x");
    expect([x.min, x.max, x.step]).toEqual([-2000, 2000, 20]);
    const w = def(rect, "width");
    expect([w.min, w.max, w.step]).toEqual([20, 2000, 20]);
    const rx = def(ellipse, "rx");
    expect([rx.min, rx.max, rx.step]).toEqual([10, 1000, 10]);
  });
  it("limits corner radius by the smaller side", () => {
    if (rect.kind !== "rect") throw new Error("rect");
    expect(def(rect, "cornerRadius").max).toBe(Math.min(rect.width, rect.height) / 2);
  });
  it("set does not mutate the node", () => {
    const before = JSON.stringify(rect);
    def(rect, "width").set(rect, 120);
    def(rect, "x").set(rect, 40);
    def(rect, "opacity").set(rect, 0.5);
    expect(JSON.stringify(rect)).toBe(before);
  });
  it("set returns flat and nested patches", () => {
    expect(def(rect, "width").set(rect, 120)).toEqual({ width: 120 });
    const px = def(rect, "x").set(rect, 40);
    expect(px).toEqual({ transform: { ...rect.transform, x: 40 } });
    if (!("transform" in px) || !px.transform) throw new Error("transform");
    expect(px.transform.y).toBe(rect.transform.y);
    expect(px.transform.rotation).toBe(rect.transform.rotation);
    expect(def(rect, "strokeWidth").set(rect, 5)).toEqual({ style: { ...rect.style, strokeWidth: 5 } });
  });
  it("get reads values", () => {
    expect(def(rect, "x").get(rect)).toBe(rect.transform.x);
    expect(def(rect, "opacity").get(rect)).toBe(rect.style.opacity);
  });
});

describe("clampToDef", () => {
  it("clamps into range", () => {
    const w = def(rect, "width");
    expect(clampToDef(w, 5)).toBe(20);
    expect(clampToDef(w, 99999)).toBe(2000);
    expect(clampToDef(w, 200)).toBe(200);
  });
});

describe("color conversion", () => {
  it("round-trips within 2 per channel", () => {
    const src = "#2f6fde";
    const out = hslToHex(...(Object.values(hexToHsl(src)) as [number, number, number]));
    for (let i = 1; i < 7; i += 2) {
      expect(Math.abs(parseInt(src.slice(i, i + 2), 16) - parseInt(out.slice(i, i + 2), 16))).toBeLessThanOrEqual(2);
    }
  });
  it("white is l 100", () => {
    expect(hexToHsl("#ffffff")).toMatchObject({ s: 0, l: 100 });
  });
  it("black is l 0 and pure red is hue 0", () => {
    expect(hexToHsl("#000000").l).toBe(0);
    expect(hexToHsl("#ff0000")).toEqual({ h: 0, s: 100, l: 50 });
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
  });
});
