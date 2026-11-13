import { createHistory, type History } from "../core/history";
import { createDocument } from "../core/model";
import type { Anchor, Document, Point, SceneNode } from "../core/types";

export type FocusArea = "canvas" | "list" | "props";
export interface View { zoom: number; panX: number; panY: number }   // screen = world * zoom + pan
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 16;

export interface EditorState {
  history: History<Document>;
  selection: string[];
  heldHandle: string | null;
  multiSelect: boolean;
  rotateMode: boolean;
  solo: boolean;
  focusArea: FocusArea;
  view: View;
  cursor: Point | null;
  anchor: Anchor;
  lastClick: Point | null;
  notice: string | null;
  drawing: { points: Point[] } | null;   // a line being drawn: world points, already snapped
}

export function createEditorState(doc?: Document): EditorState {
  return {
    history: createHistory(doc ?? createDocument()),
    selection: [],
    heldHandle: null,
    multiSelect: false,
    rotateMode: false,
    solo: false,
    focusArea: "canvas",
    view: { zoom: 1, panX: 0, panY: 0 },
    cursor: null,
    anchor: "auto",
    lastClick: null,
    notice: null,
    drawing: null,
  };
}

export function currentDoc(s: EditorState): Document {
  return s.history.present;
}

export function primaryNode(s: EditorState): SceneNode | undefined {
  const id = s.selection[s.selection.length - 1];
  if (id === undefined) return undefined;
  return s.history.present.nodes.find((n) => n.id === id);
}
