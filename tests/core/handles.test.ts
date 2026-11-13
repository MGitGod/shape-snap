import { describe, expect, it } from "vitest";
import { findHandleAt, getHandles, moveHandle, nextHandleId, nudgeHandle, toPath, polygonToPath } from "../../src/core/handles";
import type { EllipseNode, PathNode, PolygonNode, RectNode } from "../../src/core/types";

const style = { fill: "#fff", stroke: "#000", strokeWidth: 2, opacity: 1 };
function rect(rotation = 0): RectNode {
  return {
    id: "r1", name: "rect", visible: true, locked: false, role: "add",
    transform: { x: 100, y: 100, rotation }, style,
    kind: "rect", width: 80, height: 80, cornerRadius: 0,
  };
}
const ellipse: EllipseNode = {
  id: "e1", name: "ellipse", visible: true, locked: false, role: "add",
  transform: { x: 100, y: 100, rotation: 0 }, style, kind: "ellipse", rx: 40, ry: 40,
};
const polygon: PolygonNode = {
  id: "p1", name: "poly", visible: true, locked: true, role: "subtract",
  transform: { x: 100, y: 100, rotation: 0 }, style, kind: "polygon", sides: 4, width: 80, height: 80, starRatio: 1,
};

describe("getHandles", () => {
  it("rect has four edge handles then four corner handles", () => {
    const hs = getHandles(rect());
    expect(hs).toHaveLength(8);
    expect(hs.map((x) => x.id)).toEqual([
      "edge:0", "edge:1", "edge:2", "edge:3", "corner:0", "corner:1", "corner:2", "corner:3",
    ]);
    expect(hs[6]!.kind).toBe("corner");
    expect(hs[6]!.pos).toEqual({ x: 140, y: 140 });
    expect(hs[6]!.normal).toEqual({ x: 0, y: 0 });
    expect(hs[0]!.id).toBe("edge:0");
    expect(hs[0]!.pos.x).toBeCloseTo(100);
    expect(hs[0]!.pos.y).toBeCloseTo(60);
    expect(hs[0]!.normal.y).toBeCloseTo(-1);
    expect(hs[1]!.pos.x).toBeCloseTo(140);
    expect(hs[1]!.pos.y).toBeCloseTo(100);
    expect(hs[1]!.normal.x).toBeCloseTo(1);
  });
  it("rotated rect: edge:1 faces down", () => {
    const h = getHandles(rect(90))[1]!;
    expect(h.pos.x).toBeCloseTo(100);
    expect(h.pos.y).toBeCloseTo(140);
    expect(h.normal.x).toBeCloseTo(0);
    expect(h.normal.y).toBeCloseTo(1);
  });
  it("polygon edge:0 is the outward diagonal", () => {
    const h = getHandles(polygon)[1]!;
    expect(h.id).toBe("edge:0");
    expect(h.pos.x).toBeCloseTo(120);
    expect(h.pos.y).toBeCloseTo(80);
    expect(h.normal.x).toBeCloseTo(0.7071, 3);
    expect(h.normal.y).toBeCloseTo(-0.7071, 3);
  });
});

const triangle: PolygonNode = { ...polygon, sides: 3, locked: false };
const near = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x);
  expect(p.y).toBeCloseTo(y);
};

describe("polygon and corner handles", () => {
  it("triangle has vertex and edge handles in outline order", () => {
    const hs = getHandles(triangle);
    expect(hs.map((x) => x.id)).toEqual(["vertex:0", "edge:0", "vertex:1", "edge:1", "vertex:2", "edge:2"]);
    near(hs[0]!.pos, 100, 60);
    near(hs[2]!.pos, 140, 140);
    near(hs[3]!.pos, 100, 140);
    expect(hs[0]!.normal).toEqual({ x: 0, y: 0 });
  });
  it("moving a triangle vertex makes a path and moves only that point", () => {
    const n = moveHandle(triangle, "vertex:0", { x: 120, y: 40 }, 20) as PathNode;
    expect(n.kind).toBe("path");
    near(n.points[0]!, 20, -60);
    near(n.points[1]!, 40, 40);
    near(n.points[2]!, -40, 40);
  });
  it("moving a triangle edge snaps the displacement to the grid", () => {
    const n = moveHandle(triangle, "edge:1", { x: 107, y: 163 }, 20, 20) as PathNode;
    near(n.points[1]!, 40, 60);
    near(n.points[2]!, -40, 60);
    near(n.points[0]!, 0, -40);
  });
  it("rect corner:2 resizes and keeps the opposite corner", () => {
    const n = moveHandle(rect(), "corner:2", { x: 180, y: 160 }, 20) as RectNode;
    expect(n.kind).toBe("rect");
    expect(n.width).toBeCloseTo(120);
    expect(n.height).toBeCloseTo(100);
    near(n.transform, 120, 110);
    near({ x: n.transform.x - n.width / 2, y: n.transform.y - n.height / 2 }, 60, 60);
  });
  it("rect corner clamps to minSize past the opposite corner", () => {
    const n = moveHandle(rect(), "corner:2", { x: 40, y: 40 }, 20) as RectNode;
    expect(n.width).toBeCloseTo(20);
    expect(n.height).toBeCloseTo(20);
    near({ x: n.transform.x - n.width / 2, y: n.transform.y - n.height / 2 }, 60, 60);
  });
  it("rotated rect keeps the opposite corner in the world", () => {
    const r = rect(90);
    const o = getHandles(r).find((x) => x.id === "corner:0")!.pos;
    const n = moveHandle(r, "corner:2", { x: 170, y: 150 }, 20) as RectNode;
    const o2 = getHandles(n).find((x) => x.id === "corner:0")!.pos;
    near(o2, o.x, o.y);
  });
  it("ellipse corner:2 changes rx and ry", () => {
    const n = moveHandle(ellipse, "corner:2", { x: 180, y: 160 }, 20) as EllipseNode;
    expect(n.kind).toBe("ellipse");
    expect(n.rx).toBeCloseTo(60);
    expect(n.ry).toBeCloseTo(50);
    near(n.transform, 120, 110);
  });
  it("toPath: path gives null, ellipse gives eight smooth points, rect gives four", () => {
    expect(toPath(toPath(rect())!)).toBeNull();
    expect(toPath(ellipse)!.points).toHaveLength(8);
    expect(toPath(ellipse)!.smooth).toBe(true);
    expect(toPath(rect())!.points).toHaveLength(4);
  });
  it("nudging an edge with snap lands on the next grid line", () => {
    const r = { ...rect(), width: 86 };   // right edge at 143
    const n = nudgeHandle(r, "edge:1", { x: 1, y: 0 }, 20, 20, true) as RectNode;
    expect(n.transform.x + n.width / 2).toBeCloseTo(160);
  });
  it("nudging a vertex with snap lands on the grid", () => {
    const n = nudgeHandle(triangle, "vertex:0", { x: 1, y: 0 }, 20, 20, true) as PathNode;
    near(n.points[0]!, 20, -40);
  });
});

describe("moveHandle", () => {
  it("grows a rect to the right", () => {
    const n = moveHandle(rect(), "edge:1", { x: 180, y: 130 }, 20) as RectNode;
    expect(n.width).toBeCloseTo(120);
    expect(n.height).toBeCloseTo(80);
    expect(n.transform.x).toBeCloseTo(120);
    expect(n.transform.y).toBeCloseTo(100);
  });
  it("rotated rect grows along its own axis", () => {
    const n = moveHandle(rect(90), "edge:1", { x: 100, y: 180 }, 20) as RectNode;
    expect(n.width).toBeCloseTo(120);
    expect(n.transform.x).toBeCloseTo(100);
    expect(n.transform.y).toBeCloseTo(120);
  });
  it("clamps to minSize and keeps the opposite edge", () => {
    const n = moveHandle(rect(), "edge:1", { x: 40, y: 100 }, 20) as RectNode;
    expect(n.width).toBeCloseTo(20);
    expect(n.transform.x).toBeCloseTo(70);
  });
  it("ellipse rx grows", () => {
    const n = moveHandle(ellipse, "edge:1", { x: 180, y: 100 }, 20) as EllipseNode;
    expect(n.rx).toBeCloseTo(60);
    expect(n.ry).toBeCloseTo(40);
    expect(n.transform.x).toBeCloseTo(120);
  });
  it("polygon becomes a path with moved edge points", () => {
    const n = moveHandle(polygon, "edge:0", { x: 140, y: 60 }, 20) as PathNode;
    expect(n.kind).toBe("path");
    const exp = [[20, -60], [60, -20], [0, 40], [-40, 0]];
    n.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(exp[i]![0]!);
      expect(p.y).toBeCloseTo(exp[i]![1]!);
    });
    expect(n.transform).toEqual({ x: 100, y: 100, rotation: 0 });
    expect(n.id).toBe("p1");
    expect(n.name).toBe("poly");
  });
  it("unknown handle returns the same node", () => {
    const r = rect();
    expect(moveHandle(r, "edge:9", { x: 0, y: 0 }, 20)).toBe(r);
  });
  it("does not mutate its argument", () => {
    const r = rect();
    moveHandle(r, "edge:1", { x: 180, y: 100 }, 20);
    expect(r.width).toBe(80);
    expect(r.transform.x).toBe(100);
  });
});

describe("polygonToPath", () => {
  it("keeps identity fields and builds a closed straight path", () => {
    const p = polygonToPath(polygon)!;
    expect(p.kind).toBe("path");
    expect(p.closed).toBe(true);
    expect(p.smooth).toBe(false);
    expect(p.tension).toBe(0.5);
    expect(p.points).toHaveLength(4);
    expect(p.points.every((q) => !q.corner)).toBe(true);
    expect(p.locked).toBe(true);
    expect(p.role).toBe("subtract");
    expect(p.style).toEqual(style);
  });
});

describe("nextHandleId / findHandleAt", () => {
  it("cycles", () => {
    expect(nextHandleId(rect(), null)).toBe("edge:0");
    expect(nextHandleId(rect(), "edge:3")).toBe("corner:0");
    expect(nextHandleId(rect(), "corner:3")).toBe("edge:0");
    expect(nextHandleId(rect(), "edge:1")).toBe("edge:2");
  });
  it("returns null without handles", () => {
    const open: PathNode = { ...polygonToPath(polygon)!, points: [] };
    expect(nextHandleId(open, null)).toBeNull();
  });
  it("finds the nearest handle within tolerance", () => {
    expect(findHandleAt(rect(), { x: 138, y: 101 }, 5)?.id).toBe("edge:1");
    expect(findHandleAt(rect(), { x: 100, y: 100 }, 5)).toBeNull();
  });
});

describe("nudgeHandle", () => {
  it("perpendicular nudge changes nothing, along-normal grows", () => {
    const a = nudgeHandle(rect(), "edge:1", { x: 0, y: 1 }, 20, 20, false) as RectNode;
    expect(a.width).toBeCloseTo(80);
    const b = nudgeHandle(rect(), "edge:1", { x: 1, y: 0 }, 20, 20, false) as RectNode;
    expect(b.width).toBeCloseTo(100);
  });
});
