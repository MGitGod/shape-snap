import { describe, expect, it } from "vitest";
import { alignNodes } from "../../src/core/arrange";
import { hitTest, nodeBounds, worldOutline } from "../../src/core/geometry";
import { getHandles, moveHandle } from "../../src/core/handles";
import {
  addNode, createDocument, createNode, duplicateNodes, groupNodes, ungroupNode, wrapMirror, wrapRepeat,
} from "../../src/core/model";
import {
  editableLeaf, expandNode, flattenNode, nodeCenter, reflectLeaf, rotateNodeAbout, scaleNodeAbout,
  sourceBounds, translateNode,
} from "../../src/core/tree";
import type {
  Document, GroupNode, LeafNode, MirrorNode, PathNode, RepeatNode, SceneNode,
} from "../../src/core/types";
import { validateDocument } from "../../src/core/validate";
import { documentToSvg } from "../../src/render/svg";
import { propDefsFor } from "../../src/ui/propDefs";
import { leafOf } from "../leaf";

const base = { name: "n", visible: true, locked: false, role: "add" as const };
function rect(id: string, x: number, y: number, size = 80): LeafNode {
  return {
    ...base, id, kind: "rect", width: size, height: size, cornerRadius: 0,
    transform: { x, y, rotation: 0 }, style: { fill: "#000000", stroke: null, strokeWidth: 2, opacity: 1 },
  };
}
function repeat(child: SceneNode, p: Partial<RepeatNode> = {}): RepeatNode {
  return { ...base, id: "r", kind: "repeat", child, count: 3, dx: 100, dy: 0, scaleStep: 1, rotateStep: 0, ...p };
}
function mirror(child: SceneNode, p: Partial<MirrorNode> = {}): MirrorNode {
  return { ...base, id: "m", kind: "mirror", child, mode: "h", count: 4, axisX: 100, axisY: 0, ...p };
}
function group(id: string, children: SceneNode[]): GroupNode {
  return { ...base, id, kind: "group", children };
}
function docOf(...nodes: SceneNode[]): Document {
  return { ...createDocument(), nodes };
}
const xs = (ls: LeafNode[]) => ls.map((l) => l.transform.x);
const widthOf = (n: SceneNode) => (n as { width: number }).width;

describe("expandNode", () => {
  it("a leaf expands to itself", () => {
    expect(expandNode(rect("a", 0, 0))).toHaveLength(1);
  });
  it("repeat places copies with stable ids", () => {
    const l = expandNode(repeat(rect("a", 0, 0)));
    expect(xs(l)).toEqual([0, 100, 200]);
    expect(l.map((n) => n.id)).toEqual(["a", "a#1", "a#2"]);
    expect(expandNode(repeat(rect("a", 0, 0))).map((n) => n.id)).toEqual(["a", "a#1", "a#2"]);
  });
  it("scaleStep scales shapes about the source center", () => {
    const l = expandNode(repeat(rect("a", 0, 0), { scaleStep: 0.5 }));
    expect(l.map(widthOf)).toEqual([80, 40, 20]);
    expect(xs(l)).toEqual([0, 100, 200]);
  });
  it("rotateStep adds rotation", () => {
    const l = expandNode(repeat(rect("a", 0, 0), { rotateStep: 30 }));
    expect(l.map((n) => n.transform.rotation)).toEqual([0, 30, 60]);
  });
  it("dy moves copies down", () => {
    const l = expandNode(repeat(rect("a", 0, 0), { dy: 50 }));
    expect(l.map((n) => n.transform.y)).toEqual([0, 50, 100]);
  });
  it("a repeated group scales its members together", () => {
    const g = group("g", [rect("a", 0, 0, 20), rect("b", 100, 0, 20)]);
    const l = expandNode(repeat(g, { count: 2, scaleStep: 2, dx: 0 }));
    expect(l).toHaveLength(4);
    expect(Math.abs(l[3]!.transform.x - l[2]!.transform.x)).toBeCloseTo(200);
  });
  it("mirror h and both", () => {
    expect(xs(expandNode(mirror(rect("a", 0, 0))))).toEqual([0, 200]);
    const l = expandNode(mirror(rect("a", 0, 0), { mode: "both", axisY: 100 }));
    expect(l.map((n) => [n.transform.x, n.transform.y])).toEqual([[0, 0], [200, 0], [0, 200], [200, 200]]);
    expect(new Set(l.map((n) => n.id)).size).toBe(4);
  });
  it("mirror rotate", () => {
    const l = expandNode(mirror(rect("a", 100, 0), { mode: "rotate", count: 4, axisX: 0, axisY: 0 }));
    const c = l.map((n) => [Math.round(n.transform.x) + 0, Math.round(n.transform.y) + 0]);
    expect(c).toEqual([[100, 0], [0, 100], [-100, 0], [0, -100]]);
    expect(l.map((n) => n.transform.rotation)).toEqual([0, 90, 180, 270]);
  });
  it("nests: mirror of repeat gives 6 with unique ids", () => {
    const l = expandNode(mirror(repeat(rect("a", 0, 0))));
    expect(l).toHaveLength(6);
    expect(new Set(l.map((n) => n.id)).size).toBe(6);
  });
});

describe("reflectLeaf", () => {
  it("flips rotation of a rect", () => {
    const r = rect("a", 0, 0);
    expect(reflectLeaf({ ...r, transform: { x: 0, y: 0, rotation: 30 } }, "x", 0).transform.rotation).toBe(330);
  });
  it("flipping a triangle vertically points it down", () => {
    const tri = createNode(createDocument(), "polygon", { x: 0, y: 0 }, "t");
    const f = reflectLeaf(tri, "y", 0);
    expect(f.transform.rotation).toBe(180);
    const out = worldOutline(f);
    const bottom = out.reduce((a, b) => (b.y > a.y ? b : a));
    expect(bottom.x).toBeCloseTo(0);
  });
  it("flips path points horizontally", () => {
    const p: PathNode = {
      ...base, id: "p", kind: "path", closed: true, smooth: false, tension: 0.5,
      transform: { x: 0, y: 0, rotation: 0 }, style: rect("a", 0, 0).style,
      points: [{ x: -10, y: 0, corner: false }, { x: 30, y: 0, corner: false }, { x: 0, y: 20, corner: false }],
    };
    const f = reflectLeaf(p, "x", 0) as PathNode;
    expect(f.points.map((q) => [q.x, q.y])).toEqual([[10, 0], [-30, 0], [0, 20]]);
  });
});

describe("tree transforms", () => {
  it("translateNode moves mirror axis too", () => {
    const m = translateNode(mirror(rect("a", 0, 0)), 20, 0) as MirrorNode;
    expect(leafOf(m.child).transform.x).toBe(20);
    expect(m.axisX).toBe(120);
  });
  it("scaleNodeAbout scales child and dx", () => {
    const r = scaleNodeAbout(repeat(rect("a", 0, 0)), { x: -40, y: -40 }, 2) as RepeatNode;
    expect(widthOf(r.child)).toBe(160);
    expect(r.dx).toBe(200);
  });
  it("rotateNodeAbout rotates the offset", () => {
    const r = rotateNodeAbout(repeat(rect("a", 0, 0)), { x: 0, y: 0 }, 90) as RepeatNode;
    expect(r.dx).toBeCloseTo(0);
    expect(r.dy).toBeCloseTo(100);
  });
  it("bounds: source versus all copies", () => {
    const r = repeat(rect("a", 0, 0));
    expect(sourceBounds(r)).toEqual(nodeBounds(r.child));
    expect(nodeBounds(r).maxX).toBe(240);
    expect(nodeCenter(r)).toEqual({ x: 0, y: 0 });
  });
  it("hitTest finds the second copy", () => {
    expect(hitTest(repeat(rect("a", 0, 0)), { x: 100, y: 0 }, 2)).toBe(true);
    expect(hitTest(repeat(rect("a", 0, 0)), { x: 50, y: 0 }, 2)).toBe(false);
  });
});

describe("handles on containers", () => {
  it("repeat has 8, mirror has 9 ending in the axis, group none", () => {
    expect(getHandles(repeat(rect("a", 0, 0)))).toHaveLength(8);
    const h = getHandles(mirror(rect("a", 0, 0)));
    expect(h).toHaveLength(9);
    expect(h[8]!.id).toBe("axis:0");
    expect(getHandles(group("g", [rect("a", 0, 0)]))).toEqual([]);
  });
  it("moveHandle edits the child; axis handle moves the axis", () => {
    const r = moveHandle(repeat(rect("a", 0, 0)), "edge:1", { x: 60, y: 0 }, 20) as RepeatNode;
    expect(r.kind).toBe("repeat");
    expect(widthOf(r.child)).toBe(100);
    const m = moveHandle(mirror(rect("a", 0, 0)), "axis:0", { x: 140, y: 60 }, 20) as MirrorNode;
    expect([m.axisX, m.axisY]).toEqual([140, 60]);
  });
  it("editableLeaf of a group is null", () => {
    expect(editableLeaf(group("g", [rect("a", 0, 0)]))).toBeNull();
  });
});

describe("model operations", () => {
  const three = () => docOf(rect("a", 0, 0), rect("b", 100, 0), rect("c", 200, 0));
  it("groupNodes puts the group at the frontmost member", () => {
    const { doc, id } = groupNodes(three(), ["a", "c"], "g");
    expect(id).toBe("g");
    expect(doc.nodes.map((n) => n.id)).toEqual(["b", "g"]);
    expect((doc.nodes[1] as GroupNode).children.map((n) => n.id)).toEqual(["a", "c"]);
    expect(groupNodes(three(), ["a"]).id).toBeNull();
  });
  it("ungroupNode restores children; repeat flattens to unique leaves", () => {
    const g = groupNodes(three(), ["a", "c"], "g").doc;
    expect(ungroupNode(g, "g").doc.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    const w = wrapRepeat(docOf(rect("a", 0, 0)), "a", "r").doc;
    let n = 0;
    const { doc, ids } = ungroupNode(w, "r", () => `x${n++}`);
    expect(doc.nodes).toHaveLength(5);
    expect(ids).toEqual(["x0", "x1", "x2", "x3", "x4"]);
    expect(new Set(doc.nodes.map((q) => q.id)).size).toBe(5);
    expect(flattenNode(w.nodes[0]!, () => "z")).toHaveLength(5);
  });
  it("wrapRepeat defaults", () => {
    const r = wrapRepeat(docOf(rect("a", 0, 0)), "a", "r").doc.nodes[0] as RepeatNode;
    expect([r.count, r.dx, r.dy, r.scaleStep, r.rotateStep]).toEqual([5, 100, 0, 1, 0]);
    expect(r.name).toBe("連続配置 1");
  });
  it("wrapMirror defaults", () => {
    const m = wrapMirror(docOf(rect("a", 0, 0)), "a", "m").doc.nodes[0] as MirrorNode;
    expect([m.mode, m.count, m.axisX, m.axisY]).toEqual(["h", 6, 60, 0]);
  });
  it("duplicateNodes gives a container fresh ids all the way down", () => {
    const d = addNode(createDocument(), repeat(rect("a", 0, 0)));
    let n = 0;
    const { doc, newIds } = duplicateNodes(d, ["r"], 20, 20, () => `n${n++}`);
    const copy = doc.nodes[1] as RepeatNode;
    expect(newIds[0]).toBe(copy.id);
    expect(copy.id).not.toBe("r");
    expect(copy.child.id).not.toBe("a");
    expect(leafOf(copy.child).transform.x).toBe(20);
  });
  it("alignNodes uses source bounds", () => {
    const d = alignNodes(docOf(repeat(rect("a", 50, 0)), rect("b", 0, 0)), ["r", "b"], "left");
    expect(sourceBounds(d.nodes[0]!).minX).toBe(sourceBounds(d.nodes[1]!).minX);
  });
});

describe("validateDocument with containers", () => {
  it("accepts a valid document", () => {
    expect(validateDocument(docOf(group("g", [repeat(rect("a", 0, 0))]))).ok).toBe(true);
  });
  it("rejects count 1, duplicate ids and empty groups", () => {
    const bad = validateDocument(docOf(repeat(rect("a", 0, 0), { count: 1 })));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.join()).toContain("count");
    expect(validateDocument(docOf(rect("a", 0, 0), repeat(rect("a", 5, 0)))).ok).toBe(false);
    expect(validateDocument(docOf(group("g", []))).ok).toBe(false);
  });
});

describe("render and props", () => {
  it("documentToSvg expands a repeat", () => {
    const svg = documentToSvg(docOf(repeat(rect("a", 0, 0))), { area: "content", margin: 0, background: null });
    expect(svg.match(/<rect/g)).toHaveLength(3);
  });
  it("propDefsFor repeat", () => {
    const r = repeat(rect("a", 0, 0));
    const defs = propDefsFor(r, createDocument().grid);
    expect(defs.slice(0, 5).map((d) => d.key)).toEqual(["count", "dx", "dy", "scaleStep", "rotateStep"]);
    expect(defs.some((d) => d.key === "x" || d.key === "y")).toBe(false);
    const w = defs.find((d) => d.key === "width")!;
    const next = { ...r, ...w.set(r, 120) } as RepeatNode;
    expect(widthOf(next.child)).toBe(120);
    expect(w.get(next)).toBe(120);
  });
});
