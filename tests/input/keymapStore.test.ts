import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorState } from "../../src/editor/state";
import {
  DEFAULT_KEYMAP, FIXED_KEYS, applyOverrides, findBindingIn, hintsFor, isAssignableKey, keyFor,
  normalizeKey, rebind, resolveKeys, sanitizeOverrides, type ActionId, type KeyOverrides,
} from "../../src/input/keymap";
import {
  KEYS_STORAGE_KEY, keymapStore, loadKeymap, rebindKey, resetAllKeys, resetKey,
} from "../../src/input/keymapStore";

function noDuplicateKeys(overrides: KeyOverrides): void {
  const keys = applyOverrides(DEFAULT_KEYMAP, overrides).map((b) => b.key);
  expect(new Set(keys).size).toBe(keys.length);
}

describe("key helpers", () => {
  it("normalizes and validates keys", () => {
    expect(normalizeKey("R")).toBe("r");
    expect(normalizeKey("Enter")).toBe("Enter");
    for (const k of ["a", "Z", "5", ",", ".", "/", "-", ";", "'", "[", "]", "\\", "=", "`"]) {
      expect(isAssignableKey(k), k).toBe(true);
    }
    for (const k of ["Enter", "F1", "Home", " ", "Escape", "Tab", "ArrowUp", "Delete", "あ", ""]) {
      expect(isAssignableKey(k), k).toBe(false);
    }
    expect(FIXED_KEYS).toContain("Escape");
  });
  it("looks keys up in a given map", () => {
    const map = applyOverrides(DEFAULT_KEYMAP, { "place-rect": ";" });
    expect(findBindingIn(map, ";")?.action).toBe("place-rect");
    expect(findBindingIn(map, "r")).toBeUndefined();
    expect(keyFor(map, "place-rect")).toBe(";");
    expect(keyFor(map, "delete")).toBe("Delete");
  });
});

describe("applyOverrides", () => {
  it("changes only the named action", () => {
    const map = applyOverrides(DEFAULT_KEYMAP, { "place-rect": ";" });
    expect(keyFor(map, "place-rect")).toBe(";");
    const others = map.filter((b) => b.action !== "place-rect");
    expect(others).toEqual(DEFAULT_KEYMAP.filter((b) => b.action !== "place-rect"));
  });
  it("never changes a fixed key", () => {
    const map = applyOverrides(DEFAULT_KEYMAP, { escape: "q", delete: "x" });
    expect(keyFor(map, "escape")).toBe("Escape");
    expect(map.filter((b) => b.action === "delete").map((b) => b.key)).toEqual(["Delete", "Backspace"]);
  });
});

describe("rebind", () => {
  it("assigns a free key", () => {
    const r = rebind(DEFAULT_KEYMAP, {}, "place-rect", ";");
    expect(r).toEqual({ overrides: { "place-rect": ";" }, swappedWith: null, error: null });
  });
  it("swaps with the action that holds the key", () => {
    const r = rebind(DEFAULT_KEYMAP, {}, "place-rect", "c");
    expect(r.overrides).toEqual({ "place-rect": "c", "place-ellipse": "r" });
    expect(r.swappedWith).toBe("place-ellipse");
    expect(r.error).toBeNull();
  });
  it("drops an entry when a swap brings it back to the default", () => {
    const first = rebind(DEFAULT_KEYMAP, {}, "place-rect", "c");
    const back = rebind(DEFAULT_KEYMAP, first.overrides, "place-rect", "r");
    expect(back.overrides).toEqual({});
    expect(back.swappedWith).toBe("place-ellipse");
  });
  it("refuses fixed and unsupported keys", () => {
    for (const key of ["Enter", "F1", "Tab", " ", "Home"]) {
      const r = rebind(DEFAULT_KEYMAP, { "place-rect": ";" }, "place-rect", key);
      expect(r.error, key).not.toBeNull();
      expect(r.overrides).toEqual({ "place-rect": ";" });
      expect(r.swappedWith).toBeNull();
    }
  });
  it("refuses to rebind a fixed action", () => {
    const r = rebind(DEFAULT_KEYMAP, {}, "escape", "q");
    expect(r.error).not.toBeNull();
    expect(r.overrides).toEqual({});
    expect(rebind(DEFAULT_KEYMAP, {}, "delete", "q").error).not.toBeNull();
  });
  it("folds case", () => {
    const r = rebind(DEFAULT_KEYMAP, {}, "place-rect", "R");
    expect(r.overrides).toEqual({});
    expect(r.error).toBeNull();
    expect(rebind(DEFAULT_KEYMAP, {}, "place-rect", "J").overrides).toEqual({ "place-rect": "j", "to-path": "r" });
  });
  it("leaves no duplicate key after any sequence of rebinds", () => {
    const actions = DEFAULT_KEYMAP.map((b) => b.action).filter((a, i, arr) => arr.indexOf(a) === i);
    const keys = ["a", "b", "c", ";", "1", "r", "/", "x", "Z"];
    let o: KeyOverrides = {};
    for (let i = 0; i < 120; i++) {
      const action = actions[(i * 7) % actions.length] as ActionId;
      const r = rebind(DEFAULT_KEYMAP, o, action, keys[(i * 5) % keys.length] as string);
      o = r.overrides;
      noDuplicateKeys(o);
    }
  });
});

describe("sanitizeOverrides", () => {
  it("keeps only valid entries", () => {
    expect(sanitizeOverrides(DEFAULT_KEYMAP, { "place-rect": ";", nope: "x", "place-ellipse": "Enter" }))
      .toEqual({ "place-rect": ";" });
  });
  it("returns {} for garbage", () => {
    for (const raw of ["x", null, 5, [], undefined, [1, 2]]) {
      expect(sanitizeOverrides(DEFAULT_KEYMAP, raw)).toEqual({});
    }
  });
  it("drops both entries that share a key", () => {
    expect(sanitizeOverrides(DEFAULT_KEYMAP, { "place-rect": ";", "place-ellipse": ";" })).toEqual({});
  });
  it("drops an entry that takes another action's key", () => {
    expect(sanitizeOverrides(DEFAULT_KEYMAP, { "place-rect": "c" })).toEqual({});
  });
  it("drops entries for fixed actions and entries equal to the default", () => {
    expect(sanitizeOverrides(DEFAULT_KEYMAP, { escape: "q", "place-rect": "r", "place-polygon": "5" }))
      .toEqual({ "place-polygon": "5" });
  });
});

describe("hintsFor with a custom map", () => {
  it("shows the new key and not the old one", () => {
    const map = applyOverrides(DEFAULT_KEYMAP, { "place-rect": ";" });
    const h = hintsFor(createEditorState(), map);
    expect(h[0]).toEqual({ keys: ";", label: "四角" });
    expect(h.map((x) => x.keys)).not.toContain("R");
  });
});

describe("keymapStore", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
    });
    resetAllKeys();
    data.clear();
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("saves only the differences and reloads them", () => {
    rebindKey("place-rect", ";");
    expect(JSON.parse(data.get(KEYS_STORAGE_KEY) ?? "null")).toEqual({ "place-rect": ";" });
    keymapStore.setState({ overrides: {}, map: DEFAULT_KEYMAP });
    loadKeymap();
    expect(keyFor(keymapStore.getState().map, "place-rect")).toBe(";");
  });
  it("swaps and reports it, then resets one key (swapping back)", () => {
    const r = rebindKey("place-rect", "c");
    expect(r.swappedWith).toBe("place-ellipse");
    expect(keyFor(keymapStore.getState().map, "place-ellipse")).toBe("r");
    resetKey("place-rect");
    expect(keymapStore.getState().overrides).toEqual({});
    expect(data.has(KEYS_STORAGE_KEY)).toBe(false);
  });
  it("resets all", () => {
    rebindKey("place-rect", ";");
    rebindKey("line", "9");
    resetAllKeys();
    expect(keymapStore.getState().overrides).toEqual({});
    expect(keymapStore.getState().map).toEqual(DEFAULT_KEYMAP);
  });
  it("does not change anything on an invalid key", () => {
    const r = rebindKey("place-rect", "F1");
    expect(r.error).not.toBeNull();
    expect(keymapStore.getState().overrides).toEqual({});
  });
  it("starts from the defaults when the saved text is broken", () => {
    data.set(KEYS_STORAGE_KEY, "{not json");
    loadKeymap();
    expect(keymapStore.getState().map).toEqual(DEFAULT_KEYMAP);
  });
  it("keeps a change in memory and flags it when saving throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
      removeItem: () => { throw new Error("quota"); },
    });
    const r = rebindKey("place-rect", ";");
    expect(r.error).toBeNull();
    expect(keyFor(keymapStore.getState().map, "place-rect")).toBe(";");
    expect(keymapStore.getState().saveError).toBe(true);
  });
});

describe("resolveKeys", () => {
  it("replaces tokens with the default keys", () => {
    expect(resolveKeys("戻す（{{undo}} で戻せます）", DEFAULT_KEYMAP)).toBe("戻す（Z で戻せます）");
    expect(resolveKeys("{{combine-view}} と {{multi-select}}", DEFAULT_KEYMAP)).toBe("3 と M");
  });
  it("uses a rebound map", () => {
    const map = applyOverrides(DEFAULT_KEYMAP, { undo: ";" });
    expect(resolveKeys("（{{undo}} で戻せます）", map)).toBe("（; で戻せます）");
  });
  it("leaves unknown tokens and plain text alone", () => {
    expect(resolveKeys("{{nope}} と {{undo}", DEFAULT_KEYMAP)).toBe("{{nope}} と {{undo}");
    expect(resolveKeys("そのまま", DEFAULT_KEYMAP)).toBe("そのまま");
  });
  it("is applied to the notice in hintsFor", () => {
    const map = applyOverrides(DEFAULT_KEYMAP, { undo: ";" });
    const h = hintsFor({ ...createEditorState(), notice: "戻せます（{{undo}}）" }, map);
    expect(h[0]).toEqual({ keys: "", label: "戻せます（;）" });
  });
});
