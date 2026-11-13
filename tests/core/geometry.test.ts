import { describe, it, expect } from "vitest";
import {
  snapValue, snapPoint, toWorld, toLocal, rotateVector, localOutline, worldOutline,
  nodeBounds, nodesBounds, anchorPoint, pointInPolygon, distanceToPolygonEdge,
  hitTest, hitStack,
} from "../../src/core/geometry";
import type {
  Document, EllipseNode, PathNode, PolygonNode, RectNode, SceneNode,
} from "../../src/core/types";

const base = (id: string, x = 100, y = 100, rotation = 0) => ({
  id, name: id, visible: true, locked: false, role: "add" as const,
  transform: { x, y, rotation },
  style: { fill: "#000000", stroke: null, strokeWidth: 2, opacity: 1 },
});
const rect = (id = "r", rotation = 0, w = 80, h = 80): RectNode =>
  ({ ...base(id, 100, 100, rotation), kind: "rect", width: w, height: h, cornerRadius: 0 });
const ellipse = (): EllipseNode => ({ ...base("e"), kind: "ellipse", rx: 40, ry: 20 });
const polygon = (sides: number, starRatio = 1): PolygonNode =>
  ({ ...base("p"), kind: "polygon", sides, width: 80, height: 80, starRatio });
const path = (closed: boolean): PathNode => ({
  ...base("pa"), kind: "path", closed, smooth: false, tension: 0.5,
  points: [
    { x: -40, y: 0, corner: true },
    { x: 40, y: 0, corner: true },
  ],
});
const docOf = (nodes: SceneNode[]): Document =>
  ({ version: 1, grid: { size: 20, visible: true, snap: true }, nodes });

describe("snapping", () => {
  it("snapValue rounds to the grid", () => {
    expect(snapValue(23, 20)).toBe(20);
    expect(snapValue(31, 20)).toBe(40);
  });
  it("snapPoint snaps only when enabled", () => {
    expect(snapPoint({ x: 23, y: 38 }, { size: 20, visible: true, snap: true })).toEqual({ x: 20, y: 40 });
    expect(snapPoint({ x: 23, y: 38 }, { size: 20, visible: true, snap: false })).toEqual({ x: 23, y: 38 });
  });
});

describe("transforms", () => {
  it("rotateVector rotates clockwise (y down)", () => {
    const r = rotateVector({ x: 1, y: 0 }, 90);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });
  it("toWorld rotates then translates", () => {
    const w = toWorld(rect("r", 90), { x: 10, y: 0 });
    expect(w.x).toBeCloseTo(100);
    expect(w.y).toBeCloseTo(110);
  });
  it("toLocal is the inverse of toWorld", () => {
    const n = rect("r", 90);
    const l = toLocal(n, { x: 100, y: 110 });
    expect(l.x).toBeCloseTo(10);
    expect(l.y).toBeCloseTo(0);
    const back = toLocal(n, toWorld(n, { x: 7, y: -3 }));
    expect(back.x).toBeCloseTo(7);
    expect(back.y).toBeCloseTo(-3);
  });
});

describe("outlines and bounds", () => {
  it("rect outline has the four corners", () => {
    expect(localOutline(rect())).toEqual([
      { x: -40, y: -40 }, { x: 40, y: -40 }, { x: 40, y: 40 }, { x: -40, y: 40 },
    ]);
  });
  it("ellipse outline is a 64-gon starting at (rx, 0)", () => {
    const o = localOutline(ellipse());
    expect(o).toHaveLength(64);
    expect(o[0]!.x).toBeCloseTo(40);
    expect(o[0]!.y).toBeCloseTo(0);
    expect(o[16]!.x).toBeCloseTo(0);
    expect(o[16]!.y).toBeCloseTo(20);
  });
  it("triangle's first vertex points up", () => {
    const o = worldOutline(polygon(3));
    expect(o).toHaveLength(3);
    expect(o[0]!.x).toBeCloseTo(100);
    expect(o[0]!.y).toBeCloseTo(60);
  });
  it("star has 2 * sides points, inner ones scaled", () => {
    const o = localOutline(polygon(5, 0.5));
    expect(o).toHaveLength(10);
    const xs = o.map((p) => p.x);
    const ys = o.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-40);
    expect(Math.max(...xs)).toBeCloseTo(40);
    expect(Math.min(...ys)).toBeCloseTo(-40);
    expect(Math.max(...ys)).toBeCloseTo(40);
  });
  it("polygon outline fills its width and height box exactly", () => {
    const tri = worldOutline(polygon(3));
    expect(tri[0]!.x).toBeCloseTo(100); expect(tri[0]!.y).toBeCloseTo(60);
    expect(tri[1]!.x).toBeCloseTo(140); expect(tri[1]!.y).toBeCloseTo(140);
    expect(tri[2]!.x).toBeCloseTo(60); expect(tri[2]!.y).toBeCloseTo(140);
    const sq = localOutline(polygon(4));
    expect(sq).toEqual([{ x: 0, y: -40 }, { x: 40, y: 0 }, { x: 0, y: 40 }, { x: -40, y: 0 }]);
    const wide = { ...polygon(4), width: 120, height: 40 };
    expect(localOutline(wide)).toEqual([{ x: 0, y: -20 }, { x: 60, y: 0 }, { x: 0, y: 20 }, { x: -60, y: 0 }]);
  });
  it("path outline is its points", () => {
    expect(localOutline(path(false))).toEqual([{ x: -40, y: 0 }, { x: 40, y: 0 }]);
  });
  it("nodeBounds of an unrotated rect", () => {
    expect(nodeBounds(rect())).toEqual({ minX: 60, minY: 60, maxX: 140, maxY: 140 });
  });
  it("nodeBounds of a rect rotated 45", () => {
    const b = nodeBounds(rect("r", 45));
    expect(b.minX).toBeCloseTo(100 - 56.5685, 3);
    expect(b.maxX).toBeCloseTo(100 + 56.5685, 3);
    expect(b.minY).toBeCloseTo(100 - 56.5685, 3);
  });
  it("nodesBounds unions, and is null for empty", () => {
    expect(nodesBounds([])).toBeNull();
    const moved: RectNode = { ...rect("m"), transform: { x: 200, y: 100, rotation: 0 } };
    expect(nodesBounds([rect(), moved])).toEqual({ minX: 60, minY: 60, maxX: 240, maxY: 140 });
  });
  it("anchorPoint", () => {
    const n = rect();
    expect(anchorPoint(n, "tl")).toEqual({ x: 60, y: 60 });
    expect(anchorPoint(n, "tr")).toEqual({ x: 140, y: 60 });
    expect(anchorPoint(n, "bl")).toEqual({ x: 60, y: 140 });
    expect(anchorPoint(n, "br")).toEqual({ x: 140, y: 140 });
    expect(anchorPoint(n, "center")).toEqual({ x: 100, y: 100 });
  });
});

describe("polygon helpers", () => {
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  it("pointInPolygon", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false);
  });
  it("distanceToPolygonEdge, closed and open", () => {
    expect(distanceToPolygonEdge({ x: 5, y: 3 }, sq, true)).toBeCloseTo(3);
    expect(distanceToPolygonEdge({ x: 5, y: 15 }, sq, true)).toBeCloseTo(5);
    // open: closing edge (0,10)-(0,0) is not counted; nearest is the top edge
    expect(distanceToPolygonEdge({ x: 1, y: 5 }, sq, false)).toBeCloseTo(5);
    expect(distanceToPolygonEdge({ x: 1, y: 5 }, sq, true)).toBeCloseTo(1);
  });
});

describe("hitTest", () => {
  it("rect", () => {
    const n = rect();
    expect(hitTest(n, { x: 100, y: 100 }, 0)).toBe(true);
    expect(hitTest(n, { x: 150, y: 100 }, 0)).toBe(false);
    expect(hitTest(n, { x: 141, y: 100 }, 2)).toBe(true);
  });
  it("unfilled shape still hits inside", () => {
    const n: RectNode = { ...rect(), style: { ...rect().style, fill: null, stroke: "#000000" } };
    expect(hitTest(n, { x: 100, y: 100 }, 0)).toBe(true);
  });
  it("ellipse", () => {
    const n = ellipse();
    expect(hitTest(n, { x: 100, y: 119 }, 2)).toBe(true);
    expect(hitTest(n, { x: 100, y: 125 }, 2)).toBe(false);
    expect(hitTest(n, { x: 139, y: 100 }, 2)).toBe(true);
  });
  it("open path uses max(tolerance, strokeWidth / 2)", () => {
    const n = path(false);
    expect(hitTest(n, { x: 100, y: 103 }, 2)).toBe(false);
    expect(hitTest(n, { x: 100, y: 102 }, 2)).toBe(true);
    const thick: PathNode = { ...n, style: { ...n.style, strokeWidth: 10 } };
    expect(hitTest(thick, { x: 100, y: 104 }, 2)).toBe(true);
    expect(hitTest(thick, { x: 100, y: 106 }, 2)).toBe(false);
  });
});

describe("hitStack", () => {
  const a = rect("a"), b = rect("b"), c = rect("c");
  const p = { x: 100, y: 100 };
  it("returns front to back", () => {
    expect(hitStack(docOf([a, b, c]), p, 0)).toEqual(["c", "b", "a"]);
  });
  it("skips locked", () => {
    expect(hitStack(docOf([a, { ...b, locked: true }, c]), p, 0)).toEqual(["c", "a"]);
  });
  it("skips invisible", () => {
    expect(hitStack(docOf([a, b, { ...c, visible: false }]), p, 0)).toEqual(["b", "a"]);
  });
  it("respects only", () => {
    expect(hitStack(docOf([a, b, c]), p, 0, ["a"])).toEqual(["a"]);
  });
  it("misses return empty", () => {
    expect(hitStack(docOf([a, b, c]), { x: 500, y: 500 }, 0)).toEqual([]);
  });
});
