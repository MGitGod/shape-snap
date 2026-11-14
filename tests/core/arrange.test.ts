import { describe, expect, it } from "vitest";
import {
  alignNodes, averageGap, distributeNodes, scaleNode, scaleStepFactor, toggleFillNone,
} from "../../src/core/arrange";
import { nodeBounds, snapPointToDoc } from "../../src/core/geometry";
import { addGuide, addNode, clearGuides, createDocument, createNode, getNode, removeGuide } from "../../src/core/model";
import type { Document, PathNode, RectNode, SceneNode } from "../../src/core/types";
import { validateDocument } from "../../src/core/validate";
import { leafOf } from "../leaf";

function rect(id: string, x: number, y: number, w = 40, h = 40): RectNode {
  return { ...(createNode(createDocument(), "rect", { x, y }, id) as RectNode), width: w, height: h };
}
function docOf(...nodes: SceneNode[]): Document {
  let d = createDocument();
  for (const n of nodes) d = addNode(d, n);
  return d;
}
const b = (d: Document, id: string) => nodeBounds(getNode(d, id)!);

describe("alignNodes", () => {
  it("left aligns minX", () => {
    const d = alignNodes(docOf(rect("a", 20, 0), rect("b", 100, 0, 60), rect("c", 200, 0)), ["a", "b", "c"], "left");
    expect(b(d, "a").minX).toBe(0);
    expect(b(d, "b").minX).toBe(0);
    expect(b(d, "c").minX).toBe(0);
  });
  it("vcenter aligns vertical centers", () => {
    const d = alignNodes(docOf(rect("a", 0, 0, 40, 40), rect("b", 0, 100, 40, 80)), ["a", "b"], "vcenter");
    const ca = (b(d, "a").minY + b(d, "a").maxY) / 2;
    const cb = (b(d, "b").minY + b(d, "b").maxY) / 2;
    expect(ca).toBe(cb);
    expect(ca).toBe(60);
  });
  it("does not move locked nodes but uses them as reference", () => {
    const a = { ...rect("a", 0, 0), locked: true };
    const d = alignNodes(docOf(a, rect("b", 100, 0)), ["a", "b"], "right");
    expect(leafOf(getNode(d, "a")).transform.x).toBe(0);
    expect(b(d, "b").maxX).toBe(120);
  });
  it("returns the same document for fewer than 2", () => {
    const d = docOf(rect("a", 0, 0));
    expect(alignNodes(d, ["a"], "left")).toBe(d);
  });
});

describe("distributeNodes", () => {
  const d0 = docOf(rect("a", 20, 0), rect("b", 90, 0), rect("c", 220, 0)); // minX 0, 70, 200
  it("uses a fixed gap", () => {
    const d = distributeNodes(d0, ["a", "b", "c"], "x", 20);
    expect([b(d, "a").minX, b(d, "b").minX, b(d, "c").minX]).toEqual([0, 60, 120]);
  });
  it("uses the average gap when null", () => {
    const d = distributeNodes(d0, ["a", "b", "c"], "x", null);
    expect([b(d, "a").minX, b(d, "b").minX, b(d, "c").minX]).toEqual([0, 100, 200]);
  });
  it("averageGap", () => {
    expect(averageGap(d0, ["a", "b", "c"], "x")).toBe(60);
    expect(averageGap(d0, ["a"], "x")).toBeNull();
  });
});

describe("scaleNode", () => {
  it("scales a rect around its center", () => {
    const n = scaleNode(rect("a", 10, 20, 80, 40), 1.5) as RectNode;
    expect([n.width, n.height]).toEqual([120, 60]);
    expect([n.transform.x, n.transform.y]).toEqual([10, 20]);
  });
  it("scales path points", () => {
    const p = {
      ...rect("p", 0, 0), kind: "path", closed: true, smooth: false, tension: 0.5,
      points: [{ x: 10, y: -4, corner: true }, { x: -6, y: 8, corner: true }],
    } as unknown as PathNode;
    const n = scaleNode(p, 1.5) as PathNode;
    expect(n.points.map((q) => [q.x, q.y])).toEqual([[15, -6], [-9, 12]]);
  });
  it("scaleStepFactor", () => {
    expect(scaleStepFactor(rect("a", 0, 0, 80, 40), 1, 20)).toBe(1.25);
    expect(scaleStepFactor(rect("a", 0, 0, 20, 20), -1, 20)).toBe(1);
  });
});

describe("toggleFillNone", () => {
  it("moves the fill to the stroke and back", () => {
    const none = toggleFillNone(rect("a", 0, 0));
    expect(leafOf(none).style.fill).toBeNull();
    expect(leafOf(none).style.stroke).toBe("#1d2330");
    expect(leafOf(none).style.strokeWidth).toBeGreaterThanOrEqual(2);
    expect(leafOf(toggleFillNone(none)).style.fill).toBe("#1d2330");
  });
});

describe("guides", () => {
  it("does not add a duplicate", () => {
    const d = addGuide(createDocument(), "v", 47, "g1");
    expect(addGuide(d, "v", 47, "g2")).toBe(d);
    expect(addGuide(d, "h", 47, "g2").guides).toHaveLength(2);
    expect(removeGuide(d, "g1").guides).toEqual([]);
    expect(clearGuides(addGuide(d, "h", 5, "g3")).guides).toEqual([]);
  });
  it("snapPointToDoc prefers a nearby guide", () => {
    const d = addGuide(createDocument(), "v", 47, "g1");
    expect(snapPointToDoc({ x: 44, y: 33 }, d)).toEqual({ x: 47, y: 40 });
    expect(snapPointToDoc({ x: 72, y: 33 }, d)).toEqual({ x: 80, y: 40 });
    const off = { ...d, grid: { ...d.grid, snap: false } };
    expect(snapPointToDoc({ x: 44, y: 33 }, off)).toEqual({ x: 47, y: 33 });
  });
  it("validateDocument accepts no guides and rejects bad ones", () => {
    expect(validateDocument(createDocument()).ok).toBe(true);
    expect(validateDocument({ ...createDocument(), guides: [{ id: "a", axis: "v", pos: 3 }] }).ok).toBe(true);
    expect(validateDocument({ ...createDocument(), guides: [{ axis: "z" }] }).ok).toBe(false);
  });
});
