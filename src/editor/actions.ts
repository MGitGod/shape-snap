import { commit, redo, undo } from "../core/history";
import {
  alignNodes, distributeNodes, scaleNode, scaleStepFactor, toggleFillNone, type AlignMode,
} from "../core/arrange";
import { anchorPoint, hitStack, nodeBounds, nodesBounds, snapPointToDoc, snapValue } from "../core/geometry";
import { findHandleAt, moveHandle, nextGridLine, nextHandleId, nudgeHandle, toPath } from "../core/handles";
import {
  addGuide, addNode, clearGuides, createNode, duplicateNodes, removeGuide, removeNodes, reorderNode, setGrid, translateNodes, updateNode,
} from "../core/model";
import type { Anchor, Document, GridSettings, Point, SceneNode } from "../core/types";
import {
  createEditorState, currentDoc, primaryNode, ZOOM_MAX, ZOOM_MIN, type EditorState,
} from "./state";

export interface ClickOptions { hitTolerance: number; handleTolerance: number; now?: number }

const KIND_CHANGED_NOTICE = "自由な形に変わりました（Z で戻せます）";

// ---- helpers ----------------------------------------------------------

function normalize(s: EditorState): EditorState {
  const ids = new Set(currentDoc(s).nodes.map((n) => n.id));
  const selection = s.selection.filter((id) => ids.has(id));
  const rotateMode = selection.length === 0 ? false : s.rotateMode;
  const heldHandle = selection.length === 1 ? s.heldHandle : null;
  const solo = selection.length === 0 ? false : s.solo;
  return { ...s, selection, heldHandle, solo, rotateMode };
}

function withDoc(s: EditorState, doc: Document, key?: string, now?: number): EditorState {
  return { ...s, history: commit(s.history, doc, { coalesceKey: key, now }) };
}

function replaceNode(
  s: EditorState, node: SceneNode, next: SceneNode, key: string | undefined, now?: number,
): EditorState {
  const moved = withDoc(s, updateNode(currentDoc(s), node.id, () => next), key, now);
  return next.kind !== node.kind ? { ...moved, notice: KIND_CHANGED_NOTICE } : moved;
}

function applyHeldHandle(s: EditorState, p: Point, now?: number): EditorState {
  const node = primaryNode(s);
  if (!node || s.heldHandle === null) return s;
  const grid = currentDoc(s).grid;
  const next = moveHandle(node, s.heldHandle, snapPointToDoc(p, currentDoc(s)), grid.size, grid.snap ? grid.size : undefined);
  return replaceNode(s, node, next, undefined, now);
}

function moveSelectionToPoint(s: EditorState, p: Point, now?: number): EditorState {
  const node = primaryNode(s);
  if (!node) return s;
  const doc = currentDoc(s);
  let dx: number;
  let dy: number;
  if (s.anchor === "auto") {
    // centre the primary shape on the click, then slide it so its top-left lands on grid lines
    const b = nodeBounds(node);
    dx = p.x - node.transform.x;
    dy = p.y - node.transform.y;
    if (doc.grid.snap) {
      dx = snapValue(b.minX + dx, doc.grid.size) - b.minX;
      dy = snapValue(b.minY + dy, doc.grid.size) - b.minY;
    }
  } else {
    const target = snapPointToDoc(p, doc);
    const from = anchorPoint(node, s.anchor);
    dx = target.x - from.x;
    dy = target.y - from.y;
  }
  if (dx === 0 && dy === 0) return s;
  const ids = s.selection.filter((id) => {
    const n = doc.nodes.find((x) => x.id === id);
    return n !== undefined && !n.locked;
  });
  if (ids.length === 0) return s;
  return withDoc(s, translateNodes(doc, ids, dx, dy), undefined, now);
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---- actions ----------------------------------------------------------

export function placeShape(
  s: EditorState, kind: "rect" | "ellipse" | "polygon", fallbackCenter: Point, now?: number,
): EditorState {
  const doc = currentDoc(s);
  const at = snapPointToDoc(s.cursor ?? fallbackCenter, doc);
  const node = createNode(doc, kind, at);
  return {
    ...withDoc(s, addNode(doc, node), undefined, now),
    selection: [node.id],
    heldHandle: null,
    focusArea: "canvas",
  };
}

export function escape(s: EditorState): EditorState {
  if (s.rotateMode) return { ...s, rotateMode: false, notice: null };
  if (s.heldHandle !== null) return { ...s, heldHandle: null, notice: null };
  return { ...s, selection: [], heldHandle: null, multiSelect: false, solo: false, rotateMode: false, notice: null };
}

export function clickCanvas(s: EditorState, p: Point, button: "left" | "right", opts: ClickOptions): EditorState {
  if (button === "right") return escape(s);
  const doc = currentDoc(s);
  const primary = primaryNode(s);

  // 1. grab a handle
  if (s.selection.length === 1 && primary && !primary.locked) {
    const h = findHandleAt(primary, p, opts.handleTolerance);
    if (h) return { ...s, heldHandle: h.id };
  }
  // 2. move the held handle
  if (s.heldHandle !== null && primary) return applyHeldHandle(s, p, opts.now);

  // 3. pick from the stack under the click
  const stack = hitStack(doc, p, opts.hitTolerance, s.solo ? s.selection : undefined);
  if (stack.length > 0) {
    const first = stack[0] as string;
    let selection: string[];
    if (s.multiSelect) {
      selection = s.selection.includes(first)
        ? s.selection.filter((id) => id !== first)
        : [...s.selection, first];
    } else {
      const main = s.selection[s.selection.length - 1];
      const i = main === undefined ? -1 : stack.indexOf(main);
      if (i >= 0 && s.lastClick && dist(s.lastClick, p) <= opts.hitTolerance * 2) {
        selection = [stack[(i + 1) % stack.length] as string];
      } else {
        selection = [first];
      }
    }
    return normalize({ ...s, selection, heldHandle: null, lastClick: p });
  }

  // 4. move the selection
  if (s.selection.length > 0 && !s.multiSelect) return moveSelectionToPoint(s, p, opts.now);
  // 5. nothing
  return s;
}

export function moveToCursor(s: EditorState, now?: number): EditorState {
  if (!s.cursor) return s;
  if (s.heldHandle !== null) return applyHeldHandle(s, s.cursor, now);
  return moveSelectionToPoint(s, s.cursor, now);
}

export function nudge(s: EditorState, dx: -1 | 0 | 1, dy: -1 | 0 | 1, now?: number): EditorState {
  const doc = currentDoc(s);
  const step = doc.grid.size;
  const node = primaryNode(s);
  if (s.rotateMode && s.selection.length > 0) {
    const delta = dx * 15 + dy * 1;
    const ids = new Set(s.selection);
    const nodes = doc.nodes.map((n) => {
      if (!ids.has(n.id) || n.locked) return n;
      const rotation = (((n.transform.rotation + delta) % 360) + 360) % 360;
      return { ...n, transform: { ...n.transform, rotation } };
    });
    return withDoc(s, { ...doc, nodes }, "rotate", now);
  }
  if (s.heldHandle !== null && node) {
    const next = nudgeHandle(node, s.heldHandle, { x: dx, y: dy }, step, step, doc.grid.snap);
    return replaceNode(s, node, next, "nudge-handle", now);
  }
  if (s.selection.length > 0) {
    let mx = dx * step;
    let my = dy * step;
    if (doc.grid.snap && node) {
      // move the bounding box to the next grid line, not by a fixed amount
      const b = nodeBounds(node);
      if (dx !== 0) mx = nextGridLine(b.minX, dx, step) - b.minX;
      if (dy !== 0) my = nextGridLine(b.minY, dy, step) - b.minY;
    }
    return withDoc(s, translateNodes(doc, s.selection, mx, my), "nudge", now);
  }
  return panBy(s, -dx * 40, -dy * 40);
}

export function convertToPath(s: EditorState, now?: number): EditorState {
  const doc = currentDoc(s);
  let next = doc;
  let changed = 0;
  for (const id of s.selection) {
    const node = doc.nodes.find((n) => n.id === id);
    const path = node ? toPath(node) : null;
    if (!path) continue;
    next = updateNode(next, id, () => path);
    changed++;
  }
  if (changed === 0) return { ...s, notice: "円は自由な形に変えられません（線の機能と一緒に入ります）" };
  return { ...withDoc(s, next, undefined, now), heldHandle: null, notice: "自由な形に変えました（Z で戻せます）" };
}

const NEED_TWO_NOTICE = "2 個以上の図形を選んでください（M で複数選択）";

export function alignSelection(s: EditorState, mode: AlignMode, now?: number): EditorState {
  if (s.selection.length < 2) return { ...s, notice: NEED_TWO_NOTICE };
  const doc = currentDoc(s);
  const next = alignNodes(doc, s.selection, mode);
  return next === doc ? s : withDoc(s, next, undefined, now);
}

export function distributeSelection(
  s: EditorState, axis: "x" | "y", gap: number | null, coalesceKey?: string, now?: number,
): EditorState {
  if (s.selection.length < 2) return { ...s, notice: NEED_TWO_NOTICE };
  const doc = currentDoc(s);
  return withDoc(s, distributeNodes(doc, s.selection, axis, gap), coalesceKey, now);
}

export function scaleSelection(s: EditorState, dir: 1 | -1, now?: number): EditorState {
  const doc = currentDoc(s);
  const ids = new Set(s.selection);
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    if (!ids.has(n.id) || n.locked) return n;
    const f = scaleStepFactor(n, dir, doc.grid.size);
    if (f === 1) return n;
    changed = true;
    return scaleNode(n, f);
  });
  if (!changed) return s;
  return withDoc(s, { ...doc, nodes }, "scale", now);
}

export function toggleRotateMode(s: EditorState): EditorState {
  if (s.rotateMode) return { ...s, rotateMode: false, notice: null };
  if (s.selection.length === 0) return { ...s, notice: "図形を選んでから V を押してください" };
  return { ...s, rotateMode: true, heldHandle: null, notice: null };
}

export function toggleFillNoneSelection(s: EditorState, now?: number): EditorState {
  const doc = currentDoc(s);
  const ids = new Set(s.selection);
  const nodes = doc.nodes.map((n) => (ids.has(n.id) && !n.locked ? toggleFillNone(n) : n));
  if (s.selection.length === 0) return s;
  return withDoc(s, { ...doc, nodes }, undefined, now);
}

/** `at` is used when the cursor is not over the canvas (e.g. the panel buttons): the
 *  selected shape's centre if there is one, otherwise the point the caller passes. */
export function addGuideAtCursor(s: EditorState, axis: "h" | "v", now?: number, at?: Point): EditorState {
  const main = primaryNode(s);
  const from = s.cursor ?? (main ? { x: main.transform.x, y: main.transform.y } : at);
  if (!from) return { ...s, notice: "カーソルをキャンバスに置いてから押してください" };
  const doc = currentDoc(s);
  const snapped = snapPointToDoc(from, doc);
  const next = addGuide(doc, axis, axis === "h" ? snapped.y : snapped.x);
  return next === doc ? s : withDoc(s, next, undefined, now);
}

export function removeGuideAction(s: EditorState, id: string, now?: number): EditorState {
  const doc = currentDoc(s);
  const next = removeGuide(doc, id);
  return next === doc ? s : withDoc(s, next, undefined, now);
}

export function clearGuidesAction(s: EditorState, now?: number): EditorState {
  const doc = currentDoc(s);
  const next = clearGuides(doc);
  return next === doc ? s : withDoc(s, next, undefined, now);
}

export function cycleSelection(s: EditorState, dir: 1 | -1): EditorState {
  const doc = currentDoc(s);
  const list = doc.nodes.filter((n) => n.visible && !n.locked && (!s.solo || s.selection.includes(n.id)));
  if (list.length === 0) return s;
  const main = s.selection[s.selection.length - 1];
  const i = main === undefined ? -1 : list.findIndex((n) => n.id === main);
  const j = i < 0 ? (dir === 1 ? list.length - 1 : 0) : (i - dir + list.length) % list.length;
  return { ...s, selection: [(list[j] as SceneNode).id], heldHandle: null };
}

export function cycleHandle(s: EditorState): EditorState {
  const node = primaryNode(s);
  if (!node || s.selection.length !== 1) return s;
  return { ...s, heldHandle: nextHandleId(node, s.heldHandle) };
}

export function toggleMultiSelect(s: EditorState): EditorState {
  return { ...s, multiSelect: !s.multiSelect, heldHandle: null };
}

export function duplicateSelection(s: EditorState, now?: number): EditorState {
  if (s.selection.length === 0) return s;
  const doc = currentDoc(s);
  const g = doc.grid.size;
  const { doc: next, newIds } = duplicateNodes(doc, s.selection, g, g);
  if (newIds.length === 0) return s;
  return { ...withDoc(s, next, undefined, now), selection: newIds, heldHandle: null };
}

export function deleteSelection(s: EditorState, now?: number): EditorState {
  const doc = currentDoc(s);
  const ids = s.selection.filter((id) => {
    const n = doc.nodes.find((x) => x.id === id);
    return n !== undefined && !n.locked;
  });
  if (ids.length === 0) return s;
  const remaining = s.selection.filter((id) => !ids.includes(id));
  return normalize({ ...withDoc(s, removeNodes(doc, ids), undefined, now), selection: remaining, heldHandle: null });
}

export function undoAction(s: EditorState): EditorState {
  return normalize({ ...s, history: undo(s.history), heldHandle: null, notice: null });
}

export function redoAction(s: EditorState): EditorState {
  return normalize({ ...s, history: redo(s.history), heldHandle: null, notice: null });
}

export function reorderSelection(s: EditorState, dir: 1 | -1, now?: number): EditorState {
  const node = primaryNode(s);
  if (!node) return s;
  return withDoc(s, reorderNode(currentDoc(s), node.id, dir), undefined, now);
}

function toggleFlag(s: EditorState, key: "visible" | "locked", now?: number): EditorState {
  const node = primaryNode(s);
  if (!node) return s;
  const doc = updateNode(currentDoc(s), node.id, (n) => ({ ...n, [key]: !n[key] }) as SceneNode);
  return withDoc(s, doc, undefined, now);
}

export function toggleVisible(s: EditorState, now?: number): EditorState {
  return toggleFlag(s, "visible", now);
}

export function toggleLocked(s: EditorState, now?: number): EditorState {
  return toggleFlag(s, "locked", now);
}

export function toggleSolo(s: EditorState): EditorState {
  if (s.selection.length === 0) return s;
  return { ...s, solo: !s.solo };
}

export function selectOnly(s: EditorState, id: string | null): EditorState {
  return normalize({ ...s, selection: id === null ? [] : [id], heldHandle: null });
}

export function setNodeProp(
  s: EditorState, id: string, patch: Partial<SceneNode>, coalesceKey: string, now?: number,
): EditorState {
  const doc = currentDoc(s);
  if (!doc.nodes.some((n) => n.id === id)) return s;
  return withDoc(s, updateNode(doc, id, (n) => ({ ...n, ...patch }) as SceneNode), coalesceKey, now);
}

export function setGridProp(
  s: EditorState, patch: Partial<GridSettings>, coalesceKey: string, now?: number,
): EditorState {
  return withDoc(s, setGrid(currentDoc(s), patch), coalesceKey, now);
}

export function gridFiner(s: EditorState, now?: number): EditorState {
  const doc = currentDoc(s);
  return withDoc(s, setGrid(doc, { size: doc.grid.size / 2 }), undefined, now);
}

export function gridCoarser(s: EditorState, now?: number): EditorState {
  const doc = currentDoc(s);
  return withDoc(s, setGrid(doc, { size: doc.grid.size * 2 }), undefined, now);
}

export function zoomAt(s: EditorState, screenPoint: Point, factor: number): EditorState {
  const { zoom, panX, panY } = s.view;
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
  const wx = (screenPoint.x - panX) / zoom;
  const wy = (screenPoint.y - panY) / zoom;
  return { ...s, view: { zoom: next, panX: screenPoint.x - wx * next, panY: screenPoint.y - wy * next } };
}

export function panBy(s: EditorState, dxScreen: number, dyScreen: number): EditorState {
  return { ...s, view: { ...s.view, panX: s.view.panX + dxScreen, panY: s.view.panY + dyScreen } };
}

export function fitView(s: EditorState, viewport: { width: number; height: number }): EditorState {
  const b = nodesBounds(currentDoc(s).nodes);
  if (!b) return { ...s, view: { zoom: 1, panX: viewport.width / 2, panY: viewport.height / 2 } };
  const margin = 40;
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  const fit = Math.min(
    bw > 0 ? (viewport.width - margin * 2) / bw : Infinity,
    bh > 0 ? (viewport.height - margin * 2) / bh : Infinity,
  );
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fit));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { ...s, view: { zoom, panX: viewport.width / 2 - cx * zoom, panY: viewport.height / 2 - cy * zoom } };
}

export function setCursor(s: EditorState, p: Point | null): EditorState {
  return { ...s, cursor: p };
}

export function setAnchor(s: EditorState, anchor: Anchor): EditorState {
  return { ...s, anchor };
}

export function cycleFocus(s: EditorState): EditorState {
  const next = s.focusArea === "canvas" ? "list" : s.focusArea === "list" ? "props" : "canvas";
  return { ...s, focusArea: next };
}

export function loadDocument(s: EditorState, doc: Document): EditorState {
  const fresh = createEditorState(doc);
  return { ...fresh, rotateMode: false, view: s.view, anchor: s.anchor, focusArea: s.focusArea, cursor: s.cursor };
}
