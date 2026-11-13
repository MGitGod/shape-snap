import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { createEditorState, type EditorState } from "./state";

export const editorStore: StoreApi<EditorState> = createStore<EditorState>(() => createEditorState());

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(editorStore, selector);
}

export function dispatch(fn: (s: EditorState) => EditorState): void {
  editorStore.setState(fn(editorStore.getState()), true);
}
