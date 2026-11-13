import { describe, expect, it } from "vitest";
import { createDocument, createNode } from "../../src/core/model";
import { addNode } from "../../src/core/model";
import { createEditorState } from "../../src/editor/state";
import type { EditorState } from "../../src/editor/state";
import { findBinding, hintsFor, keyLabel, KEYMAP, type ActionId } from "../../src/input/keymap";

const ALL_ACTIONS: ActionId[] = [
  "place-rect", "place-ellipse", "place-polygon",
  "prev-shape", "next-shape", "next-handle", "multi-select", "escape", "cycle-focus",
  "move-up", "move-down", "move-left", "move-right", "move-to-cursor",
  "forward", "backward", "duplicate", "delete", "undo", "redo",
  "toggle-visible", "toggle-locked", "toggle-solo",
  "fit-view", "grid-finer", "grid-coarser",
];

function withShape(): EditorState {
  const node = createNode(createDocument(), "rect", { x: 0, y: 0 }, "a");
  return { ...createEditorState(addNode(createDocument(), node)), selection: ["a"] };
}

describe("KEYMAP", () => {
  it("binds every action at least once", () => {
    for (const a of ALL_ACTIONS) {
      expect(KEYMAP.some((b) => b.action === a), a).toBe(true);
    }
  });
  it("never repeats a key", () => {
    const keys = KEYMAP.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("allows auto-repeat only on the four arrows", () => {
    const rep = KEYMAP.filter((b) => b.repeat).map((b) => b.key).sort();
    expect(rep).toEqual(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);
  });
  it("finds bindings case-insensitively", () => {
    expect(findBinding("R")?.action).toBe("place-rect");
    expect(findBinding("r")?.action).toBe("place-rect");
    expect(findBinding(" ")?.action).toBe("move-to-cursor");
    expect(findBinding("Backspace")?.action).toBe("delete");
    expect(findBinding("Delete")?.action).toBe("delete");
    expect(findBinding("F13")).toBeUndefined();
  });
  it("labels keys", () => {
    expect(keyLabel("r")).toBe("R");
    expect(keyLabel(" ")).toBe("Space");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel("Escape")).toBe("Esc");
  });
});

describe("hintsFor", () => {
  it("nothing selected", () => {
    const h = hintsFor(createEditorState());
    expect(h[0]).toEqual({ keys: "R", label: "四角" });
    expect(h.map((x) => x.label)).toContain("円");
  });
  it("shape selected", () => {
    const h = hintsFor(withShape());
    expect(h[0]).toEqual({ keys: "つまみをクリック", label: "つかむ" });
    expect(h.map((x) => x.keys)).toContain("Delete");
  });
  it("multi-select in progress", () => {
    const h = hintsFor({ ...withShape(), multiSelect: true });
    expect(h[0]).toEqual({ keys: "クリック", label: "足す・外す" });
    expect(h[1]).toEqual({ keys: "M", label: "複数選択を終える" });
  });
  it("handle held", () => {
    const h = hintsFor({ ...withShape(), heldHandle: "edge:0", multiSelect: true });
    expect(h[0]).toEqual({ keys: "クリック / 矢印 / Space", label: "つまみを動かす" });
    expect(h[2]).toEqual({ keys: "右クリック / Esc", label: "つかむのをやめる" });
  });
  it("prepends the notice", () => {
    const h = hintsFor({ ...createEditorState(), notice: "テスト" });
    expect(h[0]).toEqual({ keys: "", label: "テスト" });
    expect(h[1]).toEqual({ keys: "R", label: "四角" });
  });
});
