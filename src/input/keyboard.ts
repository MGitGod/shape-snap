import {
  cycleFocus, cycleHandle, cycleSelection, deleteSelection, duplicateSelection, escape, fitView,
  gridCoarser, gridFiner, moveToCursor, nudge, placeShape, redoAction, reorderSelection,
  toggleLocked, toggleMultiSelect, toggleSolo, toggleVisible, undoAction,
} from "../editor/actions";
import { dispatch, editorStore } from "../editor/store";
import { findBinding, type ActionId } from "./keymap";

export interface Viewport { width: number; height: number }

export function runAction(action: ActionId, viewport: Viewport): void {
  switch (action) {
    case "place-rect":
    case "place-ellipse":
    case "place-polygon": {
      const kind = action === "place-rect" ? "rect" : action === "place-ellipse" ? "ellipse" : "polygon";
      dispatch((s) => {
        const { zoom, panX, panY } = s.view;
        const center = { x: (viewport.width / 2 - panX) / zoom, y: (viewport.height / 2 - panY) / zoom };
        return placeShape(s, kind, center);
      });
      break;
    }
    case "prev-shape": dispatch((s) => cycleSelection(s, -1)); break;
    case "next-shape": dispatch((s) => cycleSelection(s, 1)); break;
    case "next-handle": dispatch(cycleHandle); break;
    case "multi-select": dispatch(toggleMultiSelect); break;
    case "escape": dispatch(escape); break;
    case "cycle-focus": dispatch(cycleFocus); break;
    case "move-up": dispatch((s) => nudge(s, 0, -1)); break;
    case "move-down": dispatch((s) => nudge(s, 0, 1)); break;
    case "move-left": dispatch((s) => nudge(s, -1, 0)); break;
    case "move-right": dispatch((s) => nudge(s, 1, 0)); break;
    case "move-to-cursor": dispatch((s) => moveToCursor(s)); break;
    case "forward": dispatch((s) => reorderSelection(s, 1)); break;
    case "backward": dispatch((s) => reorderSelection(s, -1)); break;
    case "duplicate": dispatch((s) => duplicateSelection(s)); break;
    case "delete": dispatch((s) => deleteSelection(s)); break;
    case "undo": dispatch(undoAction); break;
    case "redo": dispatch(redoAction); break;
    case "toggle-visible": dispatch((s) => toggleVisible(s)); break;
    case "toggle-locked": dispatch((s) => toggleLocked(s)); break;
    case "toggle-solo": dispatch(toggleSolo); break;
    case "fit-view": dispatch((s) => fitView(s, viewport)); break;
    case "grid-finer": dispatch((s) => gridFiner(s)); break;
    case "grid-coarser": dispatch((s) => gridCoarser(s)); break;
  }
}

function isTextField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const ARROWS = new Set<ActionId>(["move-up", "move-down", "move-left", "move-right"]);

export function attachKeyboard(getViewport: () => Viewport): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (isTextField(e.target)) {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    const binding = findBinding(e.key);
    if (!binding) return;
    if (e.repeat && !binding.repeat) return;
    if (ARROWS.has(binding.action) && editorStore.getState().focusArea !== "canvas") return;
    e.preventDefault();
    runAction(binding.action, getViewport());
  };
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
