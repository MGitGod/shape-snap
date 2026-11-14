import { describe, expect, it } from "vitest";
import { addNode, createDocument, createNode, getNode } from "../../src/core/model";
import { createPathFromPoints } from "../../src/core/model";
import { expandNode, sourceBounds, sourceLeaves } from "../../src/core/tree";
import type { Document, Point, SceneNode } from "../../src/core/types";
import {
  clickCanvas, cycleHandle, deleteSelection, duplicateSelection, groupSelection, mirrorSelection, nudge, repeatSelection,
  scaleSelection, setLeafStyle, setMirrorMode, setNodeProp, toggleRotateMode, toggleSmooth, ungroupSelection,
  undoAction, startLine,
} from "../../src/editor/actions";
import { createEditorState, currentDoc, primaryNode, type EditorState } from "../../src/editor/state";
import { findBinding, KEYMAP } from "../../src/input/keymap";
import { leafOf } from "../leaf";

const opts = { hitTolerance: 6, handleTolerance: 8 };

function stateWith(nodes: SceneNode[], selection: string[] = []): EditorState {
  let doc: Document = createDocument();
  for (const n of nodes) doc = addNode(doc, n);
  return { ...createEditorState(doc), selection };
}
const rect = (id: string, x: number, y: number): SceneNode => createNode(createDocument(), "rect", { x, y }, id);

function ids(node: SceneNode): string[] {
  const out = [node.id];
  if (node.kind === "group") node.children.forEach((c) => out.push(...ids(c)));
  if (node.kind === "repeat" || node.kind === "mirror") out.push(...ids(node.child));
  return out;
}

describe("group / ungroup", () => {
  it("groups two shapes and undo restores them", () => {
    let s = stateWith([rect("a", 100, 100), rect("b", 200, 100)], ["a", "b"]);
    s = { ...s, multiSelect: true };
    s = groupSelection(s);
    const doc = currentDoc(s);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]!.kind).toBe("group");
    expect(s.selection).toEqual([doc.nodes[0]!.id]);
    expect(s.multiSelect).toBe(false);
    s = undoAction(s);
    expect(currentDoc(s).nodes).toHaveLength(2);
  });

  it("asks for two shapes when fewer are selected", () => {
    const s = groupSelection(stateWith([rect("a", 100, 100)], ["a"]));
    expect(s.notice).toContain("2 個以上");
    expect(currentDoc(s).nodes).toHaveLength(1);
  });

  it("ungroups a group and selects its children", () => {
    let s = stateWith([rect("a", 100, 100), rect("b", 200, 100)], ["a", "b"]);
    s = ungroupSelection(groupSelection(s));
    expect(currentDoc(s).nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(s.selection).toEqual(["a", "b"]);
  });

  it("ungroups a repeat into its copies with a notice", () => {
    let s = repeatSelection(stateWith([rect("a", 100, 100)], ["a"]));
    s = setNodeProp(s, s.selection[0]!, { count: 3 } as Partial<SceneNode>, "k");
    s = ungroupSelection(s);
    expect(currentDoc(s).nodes).toHaveLength(3);
    expect(s.selection).toHaveLength(3);
    expect(s.notice).toContain("ばらしました");
  });

  it("explains when nothing selected is a container", () => {
    const s = ungroupSelection(stateWith([rect("a", 100, 100)], ["a"]));
    expect(s.notice).toContain("グループ・連続配置・対称");
  });
});

describe("repeat / mirror", () => {
  it("wraps one shape in a repeat with count 5", () => {
    const s = repeatSelection(stateWith([rect("a", 100, 100)], ["a"]));
    const n = currentDoc(s).nodes[0]!;
    expect(n.kind).toBe("repeat");
    if (n.kind === "repeat") expect(n.count).toBe(5);
    expect(s.selection).toEqual([n.id]);
    expect(s.heldHandle).toBeNull();
  });

  it("wraps two shapes through a group in one history step", () => {
    const s0 = stateWith([rect("a", 100, 100), rect("b", 200, 100)], ["a", "b"]);
    const s = repeatSelection(s0);
    const n = currentDoc(s).nodes[0]!;
    expect(n.kind === "repeat" && n.child.kind).toBe("group");
    expect(s.history.past.length).toBe(s0.history.past.length + 1);
  });

  it("asks to select first", () => {
    expect(repeatSelection(stateWith([rect("a", 100, 100)])).notice).toContain("選んでから");
  });

  it("mirror starts in mode h and the mode can change", () => {
    let s = mirrorSelection(stateWith([rect("a", 100, 100)], ["a"]));
    const n = primaryNode(s)!;
    expect(n.kind === "mirror" && n.mode).toBe("h");
    s = setMirrorMode(s, "rotate");
    const m = primaryNode(s)!;
    expect(m.kind === "mirror" && m.mode).toBe("rotate");
  });

  it("does nothing while drawing a line", () => {
    const s0 = startLine(stateWith([rect("a", 100, 100)], ["a"]));
    expect(repeatSelection(s0)).toBe(s0);
    expect(mirrorSelection(s0)).toBe(s0);
    expect(groupSelection(s0)).toBe(s0);
    expect(ungroupSelection(s0)).toBe(s0);
  });

  it("clamps and rounds count", () => {
    let s = repeatSelection(stateWith([rect("a", 100, 100)], ["a"]));
    const id = s.selection[0]!;
    s = setNodeProp(s, id, { count: 7.6 } as Partial<SceneNode>, "c");
    expect((getNode(currentDoc(s), id) as { count: number }).count).toBe(8);
    s = setNodeProp(s, id, { count: 999 } as Partial<SceneNode>, "c");
    expect((getNode(currentDoc(s), id) as { count: number }).count).toBe(50);
    s = setNodeProp(s, id, { count: 0 } as Partial<SceneNode>, "c");
    expect((getNode(currentDoc(s), id) as { count: number }).count).toBe(2);
  });
});

describe("existing actions on containers", () => {
  const repeated = () => repeatSelection(stateWith([rect("a", 100, 100)], ["a"]));

  it("nudge moves the child, not dx, and snaps the source bounds", () => {
    const s0 = repeated();
    const before = primaryNode(s0)!;
    const s = nudge(s0, 1, 0);
    const n = primaryNode(s)!;
    if (before.kind !== "repeat" || n.kind !== "repeat") throw new Error("repeat expected");
    expect(n.dx).toBe(before.dx);
    expect(leafOf(n.child).transform.x).toBeGreaterThan(leafOf(before.child).transform.x);
    expect(sourceBounds(n).minX % 20).toBe(0);
  });

  it("scaleSelection scales child and dx by the same factor", () => {
    const s0 = repeated();
    const before = primaryNode(s0)!;
    const s = scaleSelection(s0, 1);
    const n = primaryNode(s)!;
    if (before.kind !== "repeat" || n.kind !== "repeat") throw new Error("repeat expected");
    const f = leafOf(n.child) as { width: number };
    const g = leafOf(before.child) as { width: number };
    expect(f.width / g.width).toBeCloseTo(n.dx / before.dx, 9);
    expect(f.width).toBeGreaterThan(g.width);
  });

  it("rotate mode turns the (dx, dy) vector by 15 degrees", () => {
    let s = toggleRotateMode(repeated());
    const before = primaryNode(s)!;
    s = nudge(s, 1, 0);
    const n = primaryNode(s)!;
    if (before.kind !== "repeat" || n.kind !== "repeat") throw new Error("repeat expected");
    const a = (Math.atan2(n.dy, n.dx) - Math.atan2(before.dy, before.dx)) * 180 / Math.PI;
    expect(a).toBeCloseTo(15, 6);
    expect(Math.hypot(n.dx, n.dy)).toBeCloseTo(Math.hypot(before.dx, before.dy), 6);
  });

  it("handles of a repeat edit its child and keep the kind", () => {
    let s = cycleHandle(repeated());
    expect(s.heldHandle).toBe("edge:0");
    const before = primaryNode(s)!;
    s = nudge(s, 0, -1);
    const n = primaryNode(s)!;
    if (before.kind !== "repeat" || n.kind !== "repeat") throw new Error("repeat expected");
    expect(n.kind).toBe("repeat");
    expect((leafOf(n.child) as { height: number }).height).toBeGreaterThan((leafOf(before.child) as { height: number }).height);
  });

  it("clicking with the axis handle held moves the axis", () => {
    let s = mirrorSelection(stateWith([rect("a", 100, 100)], ["a"]));
    const m = primaryNode(s)!;
    if (m.kind !== "mirror") throw new Error("mirror expected");
    s = clickCanvas(s, { x: m.axisX, y: m.axisY }, "left", opts);
    expect(s.heldHandle).toBe("axis:0");
    const target: Point = { x: 303, y: 197 };
    s = clickCanvas(s, target, "left", opts);
    const n = primaryNode(s)!;
    if (n.kind !== "mirror") throw new Error("mirror expected");
    expect(n.axisX).toBe(300);
    expect(n.axisY).toBe(200);
  });

  it("setLeafStyle reaches every source leaf of repeat(group)", () => {
    let s = stateWith([rect("a", 100, 100), rect("b", 200, 100)], ["a", "b"]);
    s = repeatSelection(s);
    const id = s.selection[0]!;
    s = setLeafStyle(s, id, { fill: "#ff0000" }, "fill");
    const leaves = sourceLeaves(getNode(currentDoc(s), id)!);
    expect(leaves).toHaveLength(2);
    expect(leaves.map((l) => l.style.fill)).toEqual(["#ff0000", "#ff0000"]);
    expect(expandNode(getNode(currentDoc(s), id)!).every((l) => l.style.fill === "#ff0000")).toBe(true);
  });

  it("toggleSmooth on a group is refused with a notice", () => {
    const g = groupSelection(stateWith([rect("a", 100, 100), rect("b", 200, 100)], ["a", "b"]));
    const s = toggleSmooth(g);
    expect(s.notice).toContain("解いてから");
    expect(currentDoc(s)).toBe(currentDoc(g));
  });

  it("toggleSmooth reaches the path inside a repeat", () => {
    const doc0 = createDocument();
    const path = createPathFromPoints(doc0, [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }], false, "p");
    let s = stateWith([path], ["p"]);
    s = repeatSelection(s);
    s = toggleSmooth(s);
    const n = primaryNode(s)!;
    if (n.kind !== "repeat") throw new Error("repeat expected");
    expect(n.child.kind === "path" && n.child.smooth).toBe(true);
  });

  it("duplicate keeps ids unique inside the tree", () => {
    let s = stateWith([rect("a", 100, 100), rect("b", 200, 100)], ["a", "b"]);
    s = duplicateSelection(repeatSelection(s));
    expect(currentDoc(s).nodes).toHaveLength(2);
    const all = currentDoc(s).nodes.flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
  });

  it("deleteSelection removes a repeat", () => {
    const s = deleteSelection(repeated());
    expect(currentDoc(s).nodes).toHaveLength(0);
  });
});

describe("keymap", () => {
  it("binds g u a x", () => {
    expect(findBinding("g")?.action).toBe("group");
    expect(findBinding("u")?.action).toBe("ungroup");
    expect(findBinding("a")?.action).toBe("repeat");
    expect(findBinding("x")?.action).toBe("mirror");
    const keys = KEYMAP.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
