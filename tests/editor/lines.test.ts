import { describe, expect, it } from "vitest";
import { addNode, createDocument, createNode, createPathFromPoints } from "../../src/core/model";
import type { PathNode, Point } from "../../src/core/types";
import {
  addLinePoint, cancelLine, clickCanvas, convertToPath, deleteSelection, escape, finishLine, insertPointAtHandle,
  moveToCursor, nudge, placeShape, redoAction, setCursor, startLine, toggleClosed, toggleCornerAtHandle, toggleSmooth,
  undoAction, undoLinePoint,
} from "../../src/editor/actions";
import { createEditorState, currentDoc, primaryNode, type EditorState } from "../../src/editor/state";

const opts = { hitTolerance: 6, handleTolerance: 8 };
const L = (s: EditorState, p: Point) => clickCanvas(s, p, "left", opts);
const R = (s: EditorState, p: Point) => clickCanvas(s, p, "right", opts);

function withPath(points: Point[], closed = false, extra: Partial<PathNode> = {}): EditorState {
  const doc = createDocument();
  const node = { ...createPathFromPoints(doc, points, closed, "p"), ...extra };
  return { ...createEditorState(addNode(doc, node)), selection: ["p"] };
}
const ZIG: Point[] = [{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 0 }, { x: 120, y: 40 }];
const pathOf = (s: EditorState) => primaryNode(s) as PathNode;

describe("drawing a line", () => {
  it("startLine opens an empty drawing and clears the selection", () => {
    const s0 = {
      ...createEditorState(), selection: ["x"], heldHandle: "edge:0", rotateMode: true, multiSelect: true,
      focusArea: "list" as const,
    };
    const s = startLine(s0);
    expect(s.drawing).toEqual({ points: [] });
    expect(s).toMatchObject({ selection: [], heldHandle: null, rotateMode: false, multiSelect: false, focusArea: "canvas" });
  });

  it("addLinePoint snaps, keeps the drawing out of the history", () => {
    let s = startLine(createEditorState());
    for (const p of [{ x: 3, y: 2 }, { x: 41, y: 38 }, { x: 82, y: 1 }]) s = addLinePoint(s, p, 10);
    expect(s.drawing!.points).toEqual([{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 0 }]);
    expect(currentDoc(s).nodes).toHaveLength(0);
    expect(s.history.past).toHaveLength(0);
  });

  it("ignores a repeated point", () => {
    let s = startLine(createEditorState());
    s = addLinePoint(s, { x: 41, y: 38 }, 10);
    s = addLinePoint(s, { x: 39, y: 42 }, 10);
    expect(s.drawing!.points).toHaveLength(1);
  });

  it("finishLine makes a selected open path as one history step, undoable", () => {
    let s = startLine(createEditorState());
    s = addLinePoint(s, { x: 0, y: 0 }, 10);
    s = addLinePoint(s, { x: 40, y: 40 }, 10);
    const before = s.history.past.length;
    s = finishLine(s);
    const n = currentDoc(s).nodes[0] as PathNode;
    expect(currentDoc(s).nodes).toHaveLength(1);
    expect(n).toMatchObject({ kind: "path", closed: false, name: "線 1" });
    expect(s.selection).toEqual([n.id]);
    expect(s.drawing).toBeNull();
    expect(s.history.past).toHaveLength(before + 1);
    s = undoAction(s);
    expect(currentDoc(s).nodes).toHaveLength(0);
  });

  it("finishLine with one point keeps drawing and shows a notice", () => {
    let s = startLine(createEditorState());
    s = addLinePoint(s, { x: 0, y: 0 }, 10);
    s = finishLine(s);
    expect(s.drawing).not.toBeNull();
    expect(s.notice).toBe("点を 2 つ以上クリックしてください");
  });

  it("clicking near the first point of 3+ points closes and finishes", () => {
    let s = startLine(createEditorState());
    for (const p of [{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 0 }]) s = addLinePoint(s, p, 10);
    s = addLinePoint(s, { x: 3, y: 4 }, 10);
    const n = currentDoc(s).nodes[0] as PathNode;
    expect(n).toMatchObject({ closed: true, name: "自由な形 1" });
    expect(n.points).toHaveLength(3);
    expect(s.drawing).toBeNull();
  });

  it("a closed finish with fewer than 3 points gives an open line", () => {
    let s = startLine(createEditorState());
    s = addLinePoint(s, { x: 0, y: 0 }, 10);
    s = addLinePoint(s, { x: 40, y: 0 }, 10);
    s = finishLine(s, true);
    expect((currentDoc(s).nodes[0] as PathNode).closed).toBe(false);
  });

  it("undoLinePoint removes the last point, and cancels when empty", () => {
    let s = startLine(createEditorState());
    for (const p of [{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 80, y: 0 }]) s = addLinePoint(s, p, 10);
    s = undoLinePoint(s);
    expect(s.drawing!.points).toHaveLength(2);
    expect(undoLinePoint(startLine(createEditorState())).drawing).toBeNull();
  });

  it("clickCanvas adds points (and never selects) while drawing; right click steps back", () => {
    const doc = addNode(createDocument(), createNode(createDocument(), "rect", { x: 100, y: 100 }, "a"));
    let s = startLine(createEditorState(doc));
    s = L(s, { x: 100, y: 100 });
    expect(s.selection).toEqual([]);
    expect(s.drawing!.points).toEqual([{ x: 100, y: 100 }]);
    s = L(s, { x: 200, y: 100 });
    s = R(s, { x: 0, y: 0 });
    expect(s.drawing!.points).toHaveLength(1);
  });

  it("Space (moveToCursor) adds the cursor point", () => {
    let s = startLine(setCursor(createEditorState(), { x: 61, y: 19 }));
    s = moveToCursor(s);
    expect(s.drawing!.points).toEqual([{ x: 60, y: 20 }]);
  });

  it("escape cancels and leaves the picture alone", () => {
    let s = startLine(createEditorState());
    s = addLinePoint(s, { x: 0, y: 0 }, 10);
    s = escape(s);
    expect(s.drawing).toBeNull();
    expect(currentDoc(s).nodes).toHaveLength(0);
    expect(cancelLine(s)).toBe(s);
  });

  it("blocks other actions while drawing; undo steps back, redo does nothing, nudge pans", () => {
    let s = startLine(createEditorState());
    s = addLinePoint(s, { x: 0, y: 0 }, 10);
    expect(placeShape(s, "rect", { x: 0, y: 0 })).toBe(s);
    expect(convertToPath(s)).toBe(s);
    expect(toggleSmooth(s)).toBe(s);
    expect(redoAction(s)).toBe(s);
    expect(undoAction(s).drawing!.points).toHaveLength(0);
    expect(deleteSelection(s).drawing!.points).toHaveLength(0);
    const p = nudge(s, 1, 0);
    expect(p.view.panX).toBe(-40);
    expect(p.drawing).toBe(s.drawing);
  });
});

describe("smoothing and closing", () => {
  it("toggleSmooth flips smooth; turning it off resets corners", () => {
    let s = withPath(ZIG);
    s = toggleSmooth(s);
    expect(pathOf(s).smooth).toBe(true);
    s = toggleCornerAtHandle({ ...s, heldHandle: "vertex:1" });
    expect(pathOf(s).points[1]!.corner).toBe(true);
    s = toggleSmooth(s);
    expect(pathOf(s).smooth).toBe(false);
    expect(pathOf(s).points.every((p) => !p.corner)).toBe(true);
  });

  it("toggleSmooth drops a held edge handle that no longer exists", () => {
    const s = toggleSmooth({ ...withPath(ZIG), heldHandle: "edge:0" });
    expect(s.heldHandle).toBeNull();
  });

  it("toggleSmooth on a rect only gives a notice", () => {
    const doc = addNode(createDocument(), createNode(createDocument(), "rect", { x: 0, y: 0 }, "a"));
    const s = toggleSmooth({ ...createEditorState(doc), selection: ["a"] });
    expect(s.notice).toBe("線か自由な形を選んでください（四角と多角形は {{to-path}} で自由な形に変えられます）");
    expect(s.history.past).toHaveLength(0);
  });

  it("toggleClosed closes with a fill and reopens with a stroke", () => {
    let s = toggleClosed(withPath(ZIG.slice(0, 3)));
    expect(pathOf(s)).toMatchObject({ closed: true });
    expect(pathOf(s).style.fill).not.toBeNull();
    s = toggleClosed(s);
    expect(pathOf(s)).toMatchObject({ closed: false });
    expect(pathOf(s).style.fill).toBeNull();
    expect(pathOf(s).style.stroke).not.toBeNull();
  });

  it("toggleClosed refuses a 2-point line", () => {
    const t = toggleClosed(withPath(ZIG.slice(0, 2)));
    expect(t.notice).toBe("閉じるには点が 3 つ以上要ります");
    expect(pathOf(t).closed).toBe(false);
  });
});

describe("point editing", () => {
  it("toggleCornerAtHandle needs a smooth path and a vertex handle", () => {
    const t = toggleCornerAtHandle({ ...withPath(ZIG), heldHandle: "vertex:1" });
    expect(t.notice).toBe("曲線の点（丸いつまみ）をつかんでから押してください");
    const u = toggleCornerAtHandle({ ...withPath(ZIG, false, { smooth: true }), heldHandle: "vertex:1" });
    expect(pathOf(u).points[1]!.corner).toBe(true);
  });

  it("insertPointAtHandle adds a midpoint to a path", () => {
    const s = insertPointAtHandle({ ...withPath(ZIG), heldHandle: "edge:1" });
    expect(pathOf(s).points).toHaveLength(5);
    expect(s.heldHandle).toBe("vertex:2");
    const c = pathOf(s);
    expect({ x: c.transform.x + c.points[2]!.x, y: c.transform.y + c.points[2]!.y }).toEqual({ x: 60, y: 20 });
  });

  it("insertPointAtHandle turns a rect into a 5-point path", () => {
    const doc = addNode(createDocument(), createNode(createDocument(), "rect", { x: 100, y: 100 }, "a"));
    const s = insertPointAtHandle({ ...createEditorState(doc), selection: ["a"], heldHandle: "edge:0" });
    expect(pathOf(s).kind).toBe("path");
    expect(pathOf(s).points).toHaveLength(5);
  });

  it("deleteSelection removes the held point of a path, not the shape", () => {
    const s = deleteSelection({ ...withPath(ZIG), heldHandle: "vertex:1" });
    expect(currentDoc(s).nodes).toHaveLength(1);
    expect(pathOf(s).points).toHaveLength(3);
    expect(s.heldHandle).toBeNull();
  });

  it("deleteSelection refuses to drop a closed shape below 3 points", () => {
    const s = deleteSelection({ ...withPath(ZIG.slice(0, 3), true), heldHandle: "vertex:1" });
    expect(s.notice).toBe("これ以上点を減らせません");
    expect(pathOf(s).points).toHaveLength(3);
  });

  it("convertToPath gives the new notice when nothing converts", () => {
    expect(convertToPath(withPath(ZIG)).notice).toBe("自由な形に変えられる図形を選んでください");
  });
});
