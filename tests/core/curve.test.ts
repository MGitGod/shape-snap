import { describe, it, expect } from "vitest";
import { pathData, pathSegments, samplePath } from "../../src/core/curve";
import { getHandles, toPath } from "../../src/core/handles";
import { nodeBounds, hitTest } from "../../src/core/geometry";
import {
  addNode, createDocument, createPathFromPoints, insertPathPoint, nextName, removePathPoint, setPathCorner,
} from "../../src/core/model";
import { validateDocument } from "../../src/core/validate";
import { nodeToSvg } from "../../src/render/svg";
import { propDefsFor } from "../../src/ui/propDefs";
import type { EllipseNode, PathNode, PathPoint, RectNode } from "../../src/core/types";

const pts = (...xy: Array<[number, number]>): PathPoint[] => xy.map(([x, y]) => ({ x, y, corner: false }));
const line3 = pts([0, 0], [60, 0], [120, 0]);
const style = { fill: null, stroke: "#000000", strokeWidth: 4, opacity: 1 };
const mkPath = (points: PathPoint[], over: Partial<PathNode> = {}): PathNode => ({
  id: "p", name: "線 1", visible: true, locked: false, role: "add",
  transform: { x: 0, y: 0, rotation: 0 }, style,
  kind: "path", points, closed: false, smooth: false, tension: 0.5, ...over,
});

describe("pathSegments", () => {
  it("straight open line: two segments with c1 = p0 and c2 = p1", () => {
    const segs = pathSegments(line3, false, false, 0.5);
    expect(segs).toHaveLength(2);
    for (const s of segs) {
      expect(s.c1).toEqual(s.p0);
      expect(s.c2).toEqual(s.p1);
    }
  });
  it("closed three points give three segments; one point gives none", () => {
    expect(pathSegments(pts([0, 0], [10, 0], [0, 10]), true, false, 0.5)).toHaveLength(3);
    expect(pathSegments(pts([0, 0]), false, true, 0.5)).toEqual([]);
  });
  it("smooth with tension 0.5 uses the Catmull-Rom handles", () => {
    const [s0] = pathSegments(line3, false, true, 0.5);
    expect(s0!.c1.x).toBeCloseTo(10);
    expect(s0!.c1.y).toBeCloseTo(0);
    expect(s0!.c2.x).toBeCloseTo(40);
  });
  it("a corner point keeps its handles on the point", () => {
    const p = line3.map((q, i) => (i === 1 ? { ...q, corner: true } : q));
    const segs = pathSegments(p, false, true, 0.5);
    expect(segs[0]!.c2).toEqual({ x: 60, y: 0 });
    expect(segs[1]!.c1).toEqual({ x: 60, y: 0 });
  });
});

describe("samplePath", () => {
  it("passes through every point", () => {
    const p = pts([0, 0], [50, 30], [100, -10], [150, 20]);
    const out = samplePath(p, false, true, 0.5);
    for (const q of p) {
      expect(out.some((o) => Math.abs(o.x - q.x) < 1e-6 && Math.abs(o.y - q.y) < 1e-6)).toBe(true);
    }
  });
  it("a zigzag becomes a wave without overshooting", () => {
    const p = pts([0, 40], [40, 0], [80, 40], [120, 0], [160, 40]);
    const out = samplePath(p, false, true, 0.5);
    expect(out.every((o) => o.y >= -10 && o.y <= 50)).toBe(true);
    const near = out.reduce((b, o) => (Math.abs(o.x - 20) < Math.abs(b.x - 20) ? o : b));
    expect(Math.abs(near.y - 20)).toBeGreaterThan(0.5);
  });
  it("straight (smooth false) returns the same coordinates as the points", () => {
    expect(samplePath(line3, false, false, 0.5)).toEqual([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 120, y: 0 }]);
  });
  it("tension 0 stays on the straight lines", () => {
    const p = pts([0, 0], [50, 30], [100, 0]);
    for (const o of samplePath(p, false, true, 0)) {
      const y = o.x <= 50 ? (o.x * 30) / 50 : ((100 - o.x) * 30) / 50;
      expect(o.y).toBeCloseTo(y);
    }
  });
});

describe("pathData", () => {
  it("open straight line", () => {
    expect(pathData(line3, false, false, 0.5)).toBe("M 0 0 L 60 0 L 120 0");
  });
  it("closed ends with Z", () => {
    expect(pathData(pts([0, 0], [10, 0], [0, 10]), true, false, 0.5).endsWith("Z")).toBe(true);
  });
  it("smooth uses C", () => {
    expect(pathData(pts([0, 0], [50, 30], [100, 0]), false, true, 0.5)).toContain("C");
  });
});

describe("nodeToSvg for paths", () => {
  it("open line is a round-capped path with no fill", () => {
    const s = nodeToSvg(mkPath(line3));
    expect(s.tag).toBe("path");
    expect(s.attrs.fill).toBe("none");
    expect(s.attrs["stroke-linecap"]).toBe("round");
    expect(s.attrs["stroke-linejoin"]).toBe("round");
  });
  it("closed straight path stays a polygon, closed curve is a path", () => {
    const p = pts([0, 0], [10, 0], [0, 10]);
    expect(nodeToSvg(mkPath(p, { closed: true })).tag).toBe("polygon");
    expect(nodeToSvg(mkPath(p, { closed: true, smooth: true })).tag).toBe("path");
  });
});

describe("toPath", () => {
  it("ellipse becomes eight smooth points with a similar bounding box", () => {
    const e: EllipseNode = {
      id: "e", name: "円 1", visible: true, locked: false, role: "add",
      transform: { x: 0, y: 0, rotation: 0 }, style, kind: "ellipse", rx: 40, ry: 20,
    };
    const p = toPath(e)!;
    expect(p.points).toHaveLength(8);
    expect(p.points[0]).toEqual({ x: 40, y: 0, corner: false });
    expect(p.points[2]!.x).toBeCloseTo(0);
    expect(p.points[2]!.y).toBeCloseTo(20);
    expect(p.smooth).toBe(true);
    expect(p.closed).toBe(true);
    expect(p.tension).toBe(0.5);
    const a = nodeBounds(e);
    const b = nodeBounds(p);
    for (const k of ["minX", "minY", "maxX", "maxY"] as const) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(2);
  });
  it("rect points are never corners", () => {
    const r: RectNode = {
      id: "r", name: "四角 1", visible: true, locked: false, role: "add",
      transform: { x: 0, y: 0, rotation: 0 }, style, kind: "rect", width: 80, height: 40, cornerRadius: 0,
    };
    expect(toPath(r)!.points.every((q) => !q.corner)).toBe(true);
  });
});

describe("model: path editing", () => {
  it("createPathFromPoints makes an open line", () => {
    const n = createPathFromPoints(createDocument(), [{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 0 }], false, "x");
    expect(n.transform).toMatchObject({ x: 40, y: 20 });
    expect(n.points[0]).toEqual({ x: -40, y: -20, corner: false });
    expect(n.style.fill).toBeNull();
    expect(n.style.stroke).not.toBeNull();
    expect(n.style.strokeWidth).toBe(4);
    expect(n.name).toBe("線 1");
    expect(n.smooth).toBe(false);
  });
  it("createPathFromPoints makes a closed shape", () => {
    const n = createPathFromPoints(createDocument(), [{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 0 }], true);
    expect(n.name).toBe("自由な形 1");
    expect(n.style.fill).not.toBeNull();
    expect(n.style.stroke).toBeNull();
  });
  it("names count per base word", () => {
    const doc = addNode(createDocument(), createPathFromPoints(createDocument(), [{ x: 0, y: 0 }, { x: 20, y: 0 }], false));
    expect(nextName(doc, "path", "線")).toBe("線 2");
    expect(nextName(doc, "path")).toBe("自由な形 1");
  });
  it("insertPathPoint adds after the edge", () => {
    const n = mkPath(pts([0, 0], [10, 0], [10, 10], [0, 10]), { closed: true });
    const m = insertPathPoint(n, 1, { x: 12, y: 5 });
    expect(m.points).toHaveLength(5);
    expect(m.points[2]).toEqual({ x: 12, y: 5, corner: false });
    expect(n.points).toHaveLength(4);
  });
  it("insertPathPoint converts world to local for a rotated path", () => {
    const n = mkPath(pts([0, 0], [10, 0]), { transform: { x: 100, y: 100, rotation: 90 } });
    const m = insertPathPoint(n, 0, { x: 100, y: 105 });
    expect(m.points[1]!.x).toBeCloseTo(5);
    expect(m.points[1]!.y).toBeCloseTo(0);
  });
  it("removePathPoint refuses to go below the minimum", () => {
    const open2 = mkPath(pts([0, 0], [10, 0]));
    expect(removePathPoint(open2, 0)).toBe(open2);
    const closed3 = mkPath(pts([0, 0], [10, 0], [0, 10]), { closed: true });
    expect(removePathPoint(closed3, 0)).toBe(closed3);
    expect(removePathPoint(mkPath(line3), 1).points).toHaveLength(2);
  });
  it("setPathCorner flips one point", () => {
    const m = setPathCorner(mkPath(line3), 1, true);
    expect(m.points.map((p) => p.corner)).toEqual([false, true, false]);
  });
});

describe("handles for lines and curves", () => {
  it("open straight line has no edge between last and first", () => {
    expect(getHandles(mkPath(line3)).map((h) => h.id)).toEqual(["vertex:0", "edge:0", "vertex:1", "edge:1", "vertex:2"]);
  });
  it("smooth path has vertex handles only", () => {
    const hs = getHandles(mkPath(line3, { smooth: true }));
    expect(hs).toHaveLength(3);
    expect(hs.every((h) => h.kind === "vertex")).toBe(true);
  });
});

describe("hitTest for open lines", () => {
  const tri = mkPath(pts([0, 0], [100, 0], [100, 100]));
  it("hits on the line, misses inside the open shape", () => {
    expect(hitTest(tri, { x: 50, y: 0 }, 4)).toBe(true);
    expect(hitTest(tri, { x: 60, y: 40 }, 4)).toBe(false);
  });
  it("hits inside when it has a fill", () => {
    const filled = { ...tri, style: { ...style, fill: "#ff0000" } };
    expect(hitTest(filled, { x: 80, y: 40 }, 4)).toBe(true);
  });
});

describe("validateDocument for straight paths", () => {
  it("clears corner flags when smooth is false", () => {
    const doc = addNode(createDocument(), mkPath([{ x: 0, y: 0, corner: true }, { x: 10, y: 0, corner: true }]));
    const r = validateDocument(JSON.parse(JSON.stringify(doc)));
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.doc.nodes[0] as PathNode).points.every((p) => !p.corner)).toBe(true);
  });
});

describe("propDefs for paths", () => {
  const grid = { size: 20, visible: true, snap: true };
  it("tension appears only when smooth", () => {
    expect(propDefsFor(mkPath(line3, { smooth: true }), grid).some((d) => d.key === "tension")).toBe(true);
    expect(propDefsFor(mkPath(line3), grid).some((d) => d.key === "tension")).toBe(false);
  });
  it("open line stroke width starts at 1", () => {
    const d = propDefsFor(mkPath(line3), grid).find((x) => x.key === "strokeWidth")!;
    expect(d.min).toBe(1);
  });
});
