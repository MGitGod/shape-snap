import { describe, expect, it } from "vitest";
import { nodeBounds } from "../../src/core/geometry";
import { addNode, createDocument, createNode, getNode } from "../../src/core/model";
import type { Document, Point, SceneNode } from "../../src/core/types";
import {
  clickCanvas, cycleFocus, cycleHandle, cycleSelection, deleteSelection, duplicateSelection, fitView,
  gridCoarser, gridFiner, moveToCursor, nudge, panBy, placeShape, redoAction, setAnchor, setCursor,
  convertToPath, addGuideAtCursor, escape, scaleSelection, toggleRotateMode, setNodeProp, toggleLocked, toggleMultiSelect, toggleSolo, undoAction, zoomAt, loadDocument, toggleRole, toggleCombineView,
} from "../../src/editor/actions";
import { createEditorState, currentDoc, primaryNode, type EditorState } from "../../src/editor/state";
import { leafOf } from "../leaf";

const opts = { hitTolerance: 6, handleTolerance: 8 };
const L = (s: EditorState, p: Point) => clickCanvas(s, p, "left", opts);
const R = (s: EditorState, p: Point) => clickCanvas(s, p, "right", opts);

function rect(id: string, x: number, y: number): SceneNode {
  return createNode(createDocument(), "rect", { x, y }, id);
}

function stateWith(nodes: SceneNode[], selection: string[] = []): EditorState {
  let doc: Document = createDocument();
  for (const n of nodes) doc = addNode(doc, n);
  return { ...createEditorState(doc), selection };
}

describe("placeShape", () => {
  it("places at the snapped cursor and selects it", () => {
    let s = setCursor(createEditorState(), { x: 53, y: 67 });
    s = placeShape(s, "rect", { x: 0, y: 0 });
    expect(currentDoc(s).nodes).toHaveLength(1);
    const n = currentDoc(s).nodes[0]!;
    expect(s.selection).toEqual([n.id]);
    expect(leafOf(n).transform).toMatchObject({ x: 60, y: 60 });
    expect(s.heldHandle).toBeNull();
  });

  it("uses the snapped fallback centre when there is no cursor", () => {
    const s = placeShape(createEditorState(), "ellipse", { x: 149, y: 31 });
    expect(leafOf(currentDoc(s).nodes[0]).transform).toMatchObject({ x: 140, y: 40 });
  });
});

describe("clickCanvas", () => {
  it("moves the selection so the centre lands on the snapped point", () => {
    const s = L(stateWith([rect("a", 100, 100)], ["a"]), { x: 203, y: 198 });
    expect(leafOf(getNode(currentDoc(s), "a")).transform).toMatchObject({ x: 200, y: 200 });
  });

  it("honours the anchor", () => {
    let s = setAnchor(stateWith([rect("a", 100, 100)], ["a"]), "tl");
    s = L(s, { x: 203, y: 198 });
    const b = nodeBounds(getNode(currentDoc(s), "a")!);
    expect(b.minX).toBe(200);
    expect(b.minY).toBe(200);
  });

  it("grabs a handle, moves it, then right click releases and clears", () => {
    let s = stateWith([rect("a", 100, 100)], ["a"]);
    s = L(s, { x: 141, y: 101 });
    expect(s.heldHandle).toBe("edge:1");
    expect(getNode(currentDoc(s), "a")).toMatchObject({ width: 80, transform: { x: 100, y: 100 } });
    s = L(s, { x: 183, y: 131 });
    expect(getNode(currentDoc(s), "a")).toMatchObject({ width: 120 });
    expect(s.heldHandle).toBe("edge:1");
    s = R(s, { x: 0, y: 0 });
    expect(s.heldHandle).toBeNull();
    expect(s.selection).toEqual(["a"]);
    s = R(s, { x: 0, y: 0 });
    expect(s.selection).toEqual([]);
  });

  it("cycles through overlapping shapes on repeated clicks", () => {
    let s = stateWith([rect("a", 100, 100), rect("b", 140, 100)]);
    const p = { x: 120, y: 100 };
    s = L(s, p);
    expect(s.selection).toEqual(["b"]);
    s = L(s, p);
    expect(s.selection).toEqual(["a"]);
    s = L(s, p);
    expect(s.selection).toEqual(["b"]);
    s = L(s, { x: 65, y: 100 });
    expect(s.selection).toEqual(["a"]);
  });

  it("adds and removes shapes in multi-select mode", () => {
    let s = toggleMultiSelect(stateWith([rect("a", 100, 100), rect("c", 300, 100)]));
    s = L(s, { x: 100, y: 100 });
    s = L(s, { x: 300, y: 100 });
    expect(s.selection).toEqual(["a", "c"]);
    s = L(s, { x: 300, y: 100 });
    expect(s.selection).toEqual(["a"]);
  });

  it("does nothing when empty space is clicked with no selection", () => {
    const s = stateWith([rect("a", 100, 100)]);
    expect(L(s, { x: 500, y: 500 })).toBe(s);
  });
});

describe("grid-true moves", () => {
  const withMinX = (id: string, minX: number, w = 60): SceneNode => {
    const n = rect(id, minX + w / 2, 100);
    return { ...n, width: w } as SceneNode;
  };
  it("nudge moves the bounding box to the next grid line", () => {
    let s = nudge(stateWith([withMinX("a", 63)], ["a"]), 1, 0);
    expect(nodeBounds(getNode(currentDoc(s), "a")!).minX).toBeCloseTo(80);
    s = nudge(s, 1, 0);
    expect(nodeBounds(getNode(currentDoc(s), "a")!).minX).toBeCloseTo(100);
    s = nudge(stateWith([withMinX("a", 63)], ["a"]), -1, 0);
    expect(nodeBounds(getNode(currentDoc(s), "a")!).minX).toBeCloseTo(60);
  });
  it("auto anchor click puts the top-left on grid lines", () => {
    const s = L(stateWith([withMinX("a", 70)], ["a"]), { x: 203, y: 198 });
    const b = nodeBounds(getNode(currentDoc(s), "a")!);
    expect(b.minX % 20).toBeCloseTo(0);
    expect(b.minY % 20).toBeCloseTo(0);
  });
  it("auto anchor click without snap just centres on the click", () => {
    let s = stateWith([rect("a", 100, 100)], ["a"]);
    s = { ...s, history: { ...s.history, present: { ...currentDoc(s), grid: { ...currentDoc(s).grid, snap: false } } } };
    s = L(s, { x: 203, y: 198 });
    expect(leafOf(getNode(currentDoc(s), "a")).transform).toMatchObject({ x: 203, y: 198 });
  });
  it("nudging a held edge lands on the next grid line", () => {
    const r = { ...rect("a", 100, 100), width: 86 } as SceneNode;   // right edge at 143
    let s = stateWith([r], ["a"]);
    s = { ...s, heldHandle: "edge:1" };
    s = nudge(s, 1, 0);
    const n = getNode(currentDoc(s), "a") as unknown as { width: number; transform: { x: number } };
    expect(n.transform.x + n.width / 2).toBeCloseTo(160);
  });
  it("convertToPath turns a rect into a path and undo restores it", () => {
    let s = convertToPath(stateWith([rect("a", 100, 100)], ["a"]));
    expect(getNode(currentDoc(s), "a")!.kind).toBe("path");
    expect(s.notice).toContain("自由な形に変えました");
    s = undoAction(s);
    expect(getNode(currentDoc(s), "a")!.kind).toBe("rect");
  });
  it("convertToPath turns an ellipse into a smooth eight-point path", () => {
    const e = createNode(createDocument(), "ellipse", { x: 100, y: 100 }, "e");
    const s = convertToPath(stateWith([e], ["e"]));
    const n = getNode(currentDoc(s), "e")!;
    expect(n.kind).toBe("path");
    expect(n.kind === "path" && n.points).toHaveLength(8);
  });
});

describe("nudge", () => {
  it("moves the selection by the grid size", () => {
    const s = nudge(stateWith([rect("a", 100, 100)], ["a"]), 1, 0);
    expect(leafOf(getNode(currentDoc(s), "a")).transform.x).toBe(120);
  });

  it("nudges the held handle", () => {
    let s = stateWith([rect("a", 100, 100)], ["a"]);
    s = L(s, { x: 140, y: 100 });
    s = nudge(s, 1, 0);
    expect(getNode(currentDoc(s), "a")).toMatchObject({ width: 100 });
  });

  it("pans when nothing is selected", () => {
    const s = nudge(createEditorState(), 1, 0);
    expect(s.view.panX).toBe(-40);
    expect(s.view.panY).toBe(0);
  });

  it("coalesces consecutive nudges into one undo step", () => {
    const s0 = stateWith([rect("a", 100, 100)], ["a"]);
    const s = nudge(nudge(s0, 1, 0), 1, 0);
    expect(s.history.past.length).toBe(s0.history.past.length + 1);
    expect(leafOf(getNode(currentDoc(s), "a")).transform.x).toBe(140);
    expect(leafOf(getNode(currentDoc(undoAction(s)), "a")).transform.x).toBe(100);
  });
});

describe("cycleSelection", () => {
  it("goes front to back and wraps", () => {
    let s = stateWith([rect("n1", 0, 0), rect("n2", 0, 0), rect("n3", 0, 0)]);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      s = cycleSelection(s, 1);
      seen.push(s.selection[0]!);
    }
    expect(seen).toEqual(["n3", "n2", "n1", "n3"]);
  });

  it("skips locked shapes", () => {
    let s = stateWith([rect("n1", 0, 0), { ...rect("n2", 0, 0), locked: true }, rect("n3", 0, 0)]);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      s = cycleSelection(s, 1);
      seen.push(s.selection[0]!);
    }
    expect(seen).toEqual(["n3", "n1", "n3"]);
  });

  it("goes to the back first with dir -1", () => {
    const s = cycleSelection(stateWith([rect("n1", 0, 0), rect("n3", 0, 0)]), -1);
    expect(s.selection).toEqual(["n1"]);
  });
});

describe("edit actions", () => {
  it("deleteSelection can be undone", () => {
    let s = deleteSelection(stateWith([rect("a", 100, 100)], ["a"]));
    expect(currentDoc(s).nodes).toHaveLength(0);
    expect(s.selection).toEqual([]);
    s = undoAction(s);
    expect(currentDoc(s).nodes).toHaveLength(1);
    s = redoAction(s);
    expect(currentDoc(s).nodes).toHaveLength(0);
  });

  it("does not delete locked shapes", () => {
    const s = stateWith([rect("a", 100, 100)], ["a"]);
    const locked = toggleLocked(s);
    expect(deleteSelection(locked)).toBe(locked);
  });

  it("undo drops ids that no longer exist from the selection", () => {
    let s = placeShape(createEditorState(), "rect", { x: 0, y: 0 });
    expect(s.selection).toHaveLength(1);
    s = undoAction(s);
    expect(s.selection).toEqual([]);
  });

  it("duplicateSelection offsets by the grid and selects the copy", () => {
    const s = duplicateSelection(stateWith([rect("a", 100, 100)], ["a"]));
    expect(currentDoc(s).nodes).toHaveLength(2);
    const copy = currentDoc(s).nodes[1]!;
    expect(s.selection).toEqual([copy.id]);
    expect(leafOf(copy).transform).toMatchObject({ x: 120, y: 120 });
  });

  it("solo limits hit testing to the selection and clears with it", () => {
    let s = toggleSolo(stateWith([rect("a", 100, 100), rect("b", 300, 100)], ["a"]));
    expect(s.solo).toBe(true);
    s = L(s, { x: 300, y: 100 });
    expect(s.selection).toEqual(["a"]);
    s = R(R(s, { x: 0, y: 0 }), { x: 0, y: 0 });
    expect(s.solo).toBe(false);
  });

  it("setNodeProp coalesces under the same key", () => {
    const s0 = stateWith([rect("a", 100, 100)], ["a"]);
    let s = setNodeProp(s0, "a", { name: "x" }, "name", 1000);
    s = setNodeProp(s, "a", { name: "xy" }, "name", 1100);
    expect(s.history.past.length).toBe(1);
    expect(getNode(currentDoc(s), "a")!.name).toBe("xy");
  });

  it("cycleHandle advances the held handle", () => {
    let s = stateWith([rect("a", 100, 100)], ["a"]);
    s = cycleHandle(s);
    expect(s.heldHandle).toBe("edge:0");
    s = cycleHandle(s);
    expect(s.heldHandle).toBe("edge:1");
  });
});

describe("grid", () => {
  it("never goes below GRID_MIN and keeps shape sizes", () => {
    let s = stateWith([rect("a", 100, 100)], ["a"]);
    for (let i = 0; i < 10; i++) s = gridFiner(s);
    expect(currentDoc(s).grid.size).toBe(5);
    expect(getNode(currentDoc(s), "a")).toMatchObject({ width: 80 });
  });

  it("gridCoarser doubles up to GRID_MAX", () => {
    let s = createEditorState();
    expect(currentDoc(gridCoarser(s)).grid.size).toBe(40);
    for (let i = 0; i < 10; i++) s = gridCoarser(s);
    expect(currentDoc(s).grid.size).toBe(160);
  });
});

describe("view", () => {
  it("zoomAt keeps the world point under the screen point", () => {
    let s = panBy(createEditorState(), 30, -20);
    const sp = { x: 100, y: 100 };
    const before = { x: (sp.x - s.view.panX) / s.view.zoom, y: (sp.y - s.view.panY) / s.view.zoom };
    s = zoomAt(s, sp, 2);
    expect(s.view.zoom).toBe(2);
    const after = { x: (sp.x - s.view.panX) / s.view.zoom, y: (sp.y - s.view.panY) / s.view.zoom };
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zoomAt clamps the zoom", () => {
    expect(zoomAt(createEditorState(), { x: 0, y: 0 }, 1000).view.zoom).toBe(16);
    expect(zoomAt(createEditorState(), { x: 0, y: 0 }, 0.00001).view.zoom).toBe(0.1);
  });

  it("fitView centres an empty document", () => {
    const s = fitView(createEditorState(), { width: 800, height: 600 });
    expect(s.view).toEqual({ zoom: 1, panX: 400, panY: 300 });
  });

  it("fitView fits the shapes with a 40px margin", () => {
    const s = fitView(stateWith([rect("a", 100, 100)]), { width: 800, height: 600 });
    // bounds 60..140 (80 wide); limited by height: (600 - 80) / 80 = 6.5
    expect(s.view.zoom).toBeCloseTo(6.5);
    expect(s.view.panX).toBeCloseTo(400 - 100 * 6.5);
    expect(s.view.panY).toBeCloseTo(300 - 100 * 6.5);
  });
});

describe("misc", () => {
  it("cycleFocus rotates canvas, list, props", () => {
    let s = createEditorState();
    s = cycleFocus(s);
    expect(s.focusArea).toBe("list");
    s = cycleFocus(s);
    expect(s.focusArea).toBe("props");
    s = cycleFocus(s);
    expect(s.focusArea).toBe("canvas");
  });

  it("loadDocument resets history and selection", () => {
    const s = loadDocument(stateWith([rect("a", 1, 1)], ["a"]), createDocument());
    expect(s.selection).toEqual([]);
    expect(s.history.past).toEqual([]);
    expect(currentDoc(s).nodes).toEqual([]);
  });

  it("moveToCursor moves the selection to the cursor", () => {
    let s = setCursor(stateWith([rect("a", 100, 100)], ["a"]), { x: 301, y: 199 });
    s = moveToCursor(s);
    expect(leafOf(getNode(currentDoc(s), "a")).transform).toMatchObject({ x: 300, y: 200 });
    expect(moveToCursor(createEditorState())).toEqual(createEditorState());
  });

  it("moving a polygon edge turns it into a path with a notice, and undo restores it", () => {
    const poly = createNode(createDocument(), "polygon", { x: 100, y: 100 }, "p");
    let s = stateWith([poly], ["p"]);
    s = cycleHandle(s);
    s = setCursor(s, { x: 220, y: 220 });
    s = moveToCursor(s);
    expect(primaryNode(s)!.kind).toBe("path");
    expect(s.notice).toContain("自由な形");
    s = undoAction(s);
    expect(primaryNode(s)!.kind).toBe("polygon");
  });
});

describe("rotate mode, scale and guides", () => {
  it("rotates with arrows, wraps, and escape leaves the selection", () => {
    let s = toggleRotateMode(stateWith([rect("a", 0, 0)], ["a"]));
    expect(s.rotateMode).toBe(true);
    s = nudge(s, 1, 0);
    expect(leafOf(primaryNode(s)).transform.rotation).toBe(15);
    s = nudge(s, 0, -1);
    expect(leafOf(primaryNode(s)).transform.rotation).toBe(14);
    expect(leafOf(primaryNode(s)).transform.x).toBe(0);
    s = escape(s);
    expect(s.rotateMode).toBe(false);
    expect(s.selection).toEqual(["a"]);
  });
  it("wraps 350 + 15 to 5", () => {
    const n = { ...rect("a", 0, 0), transform: { x: 0, y: 0, rotation: 350 } };
    let s = toggleRotateMode(stateWith([n], ["a"]));
    s = nudge(s, 1, 0);
    expect(leafOf(primaryNode(s)).transform.rotation).toBe(5);
  });
  it("does not enter rotate mode without a selection", () => {
    const s = toggleRotateMode(stateWith([rect("a", 0, 0)]));
    expect(s.rotateMode).toBe(false);
    expect(s.notice).toBe("図形を選んでから {{rotate-mode}} を押してください");
  });
  it("scaleSelection undoes in one step", () => {
    const width = (s: EditorState) => nodeBounds(primaryNode(s)!).maxX - nodeBounds(primaryNode(s)!).minX;
    let s = stateWith([rect("a", 0, 0)], ["a"]);
    s = scaleSelection(scaleSelection(s, 1, 0), 1, 10);
    expect(width(s)).toBe(120);
    s = undoAction(s);
    expect(width(s)).toBe(80);
  });
  it("scaleSelection scales a multi-selection as one picture, gaps included", () => {
    // Two 80-wide rects: a spans -40..40, b spans 80..160. Gap 40, whole box 200 wide.
    let s = stateWith([rect("a", 0, 0), rect("b", 120, 0)], ["a", "b"]);
    s = scaleSelection(s, 1, 0); // 200 -> 220, factor 1.1
    const [a, b] = currentDoc(s).nodes.map((n) => nodeBounds(n));
    expect(a!.minX).toBeCloseTo(-40); // top-left corner of the selection stays put
    expect(a!.minY).toBeCloseTo(-40);
    expect(a!.maxX - a!.minX).toBeCloseTo(88);
    expect(b!.maxX - b!.minX).toBeCloseTo(88);
    expect(b!.minX - a!.maxX).toBeCloseTo(44); // the gap grew by the same factor
    expect(b!.maxX).toBeCloseTo(180);
    s = scaleSelection(s, -1, 10);
    const [a2, b2] = currentDoc(s).nodes.map((n) => nodeBounds(n));
    expect(b2!.minX - a2!.maxX).toBeCloseTo(40);
    expect(b2!.maxX).toBeCloseTo(160);
  });
  it("scaleSelection keeps the top-left corner of a single shape on the grid", () => {
    let s = stateWith([rect("a", 0, 0)], ["a"]);
    s = scaleSelection(s, 1, 0);
    const b = nodeBounds(primaryNode(s)!);
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([-40, -40, 60, 60]);
  });
  it("addGuideAtCursor commits and undoes", () => {
    let s = setCursor(createEditorState(), { x: 47, y: 10 });
    s = addGuideAtCursor(s, "v");
    expect(currentDoc(s).guides).toHaveLength(1);
    expect(currentDoc(s).guides![0]).toMatchObject({ axis: "v", pos: 40 });
    s = undoAction(s);
    expect(currentDoc(s).guides ?? []).toHaveLength(0);
    expect(addGuideAtCursor(createEditorState(), "h").notice).toBe("カーソルをキャンバスに置いてから押してください");
  });
});

describe("toggleRole", () => {
  it("flips the role of the selected shape and undo restores it", () => {
    let s = stateWith([rect("a", 0, 0)], ["a"]);
    s = toggleRole(s);
    expect(getNode(currentDoc(s), "a")?.role).toBe("subtract");
    expect(s.notice).toContain("抜く図形にしました");
    expect(s.history.past).toHaveLength(1);
    s = undoAction(s);
    expect(getNode(currentDoc(s), "a")?.role).toBe("add");
    s = toggleRole(toggleRole(s));
    expect(getNode(currentDoc(s), "a")?.role).toBe("add");
  });
  it("changes only the topmost selected shape", () => {
    let s = stateWith([rect("a", 0, 0), rect("b", 40, 0)], ["b", "a"]);
    s = toggleRole(s);
    expect(getNode(currentDoc(s), "b")?.role).toBe("subtract");
    expect(getNode(currentDoc(s), "a")?.role).toBe("add");
  });
  it("asks for a selection", () => {
    const s = toggleRole(stateWith([rect("a", 0, 0)]));
    expect(s.notice).toBe("図形を選んでから {{role}} を押してください");
    expect(s.history.past).toHaveLength(0);
  });
  it("leaves a locked shape alone", () => {
    let s = stateWith([rect("a", 0, 0)], ["a"]);
    s = toggleLocked(s);
    const before = s.history.past.length;
    s = toggleRole(s);
    expect(getNode(currentDoc(s), "a")?.role).toBe("add");
    expect(s.history.past).toHaveLength(before);
  });
});

describe("toggleCombineView", () => {
  it("flips the flag without touching history, and loadDocument resets it", () => {
    let s = stateWith([rect("a", 0, 0)], ["a"]);
    s = toggleCombineView(s);
    expect(s.combineView).toBe(true);
    expect(s.history.past).toHaveLength(0);
    s = toggleCombineView(s);
    expect(s.combineView).toBe(false);
    s = toggleCombineView(s);
    s = loadDocument(s, createDocument());
    expect(s.combineView).toBe(false);
  });
});
