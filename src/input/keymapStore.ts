import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import {
  DEFAULT_KEYMAP, applyOverrides, keyFor, rebind, sanitizeOverrides,
  type ActionId, type KeyBinding, type KeyOverrides, type RebindResult,
} from "./keymap";

export const KEYS_STORAGE_KEY = "shape-snap:keys";

export interface KeymapState { overrides: KeyOverrides; map: KeyBinding[]; saveError: boolean }

export const keymapStore: StoreApi<KeymapState> = createStore<KeymapState>(() => ({
  overrides: {},
  map: DEFAULT_KEYMAP,
  saveError: false,
}));

export function useKeymap(): KeyBinding[] {
  return useStore(keymapStore, (s) => s.map);
}

function persist(overrides: KeyOverrides): boolean {
  try {
    if (Object.keys(overrides).length === 0) localStorage.removeItem(KEYS_STORAGE_KEY);
    else localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
}

function commit(overrides: KeyOverrides): void {
  const saved = persist(overrides);
  keymapStore.setState({ overrides, map: applyOverrides(DEFAULT_KEYMAP, overrides), saveError: !saved });
}

/** Read the saved bindings once at start-up. Unreadable parts fall back to the defaults. */
export function loadKeymap(): void {
  let raw: unknown = null;
  try {
    const text = localStorage.getItem(KEYS_STORAGE_KEY);
    raw = text === null ? null : JSON.parse(text);
  } catch {
    raw = null;
  }
  const overrides = sanitizeOverrides(DEFAULT_KEYMAP, raw);
  keymapStore.setState({ overrides, map: applyOverrides(DEFAULT_KEYMAP, overrides), saveError: false });
}

export function rebindKey(action: ActionId, key: string): RebindResult {
  const result = rebind(DEFAULT_KEYMAP, keymapStore.getState().overrides, action, key);
  if (result.error === null) commit(result.overrides);
  return result;
}

/** Back to the built-in key. If another action holds it now, the two swap (no action is left without a key). */
export function resetKey(action: ActionId): RebindResult {
  return rebindKey(action, keyFor(DEFAULT_KEYMAP, action));
}

export function resetAllKeys(): void {
  commit({});
}
