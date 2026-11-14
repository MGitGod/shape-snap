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
  "scale-down", "scale-up", "rotate-mode", "fill-none", "to-path", "guide-h", "guide-v",
  "line", "smooth", "corner-point", "confirm",
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
  it("allows auto-repeat only on the four arrows and scale keys", () => {
    const rep = KEYMAP.filter((b) => b.repeat).map((b) => b.key).sort();
    expect(rep).toEqual([",", ".", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"]);
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
    expect(h[2]).toEqual({ keys: "Enter", label: "点を足す" });
    expect(h[3]).toEqual({ keys: "右クリック / Esc", label: "つかむのをやめる" });
  });
  it("prepends the notice", () => {
    const h = hintsFor({ ...createEditorState(), notice: "テスト" });
    expect(h[0]).toEqual({ keys: "", label: "テスト" });
    expect(h[1]).toEqual({ keys: "R", label: "四角" });
  });
});

describe("stage 1.5 bindings", () => {
  it("finds the new keys and rotate hints", () => {
    const pairs: [string, ActionId][] = [
      [",", "scale-down"], [".", "scale-up"], ["v", "rotate-mode"], ["n", "fill-none"],
      ["j", "to-path"], ["-", "guide-h"], ["i", "guide-v"],
    ];
    for (const [k, a] of pairs) expect(findBinding(k)?.action).toBe(a);
    const h = hintsFor({ ...withShape(), rotateMode: true });
    expect(h.map((x) => x.label)).toEqual(["15°ずつ回す", "1°ずつ回す", "回転を終える"]);
  });
});

describe("stage 2 line keys", () => {
  it("finds l s / Enter", () => {
    expect(findBinding("l")?.action).toBe("line");
    expect(findBinding("S")?.action).toBe("smooth");
    expect(findBinding("/")?.action).toBe("corner-point");
    expect(findBinding("Enter")?.action).toBe("confirm");
  });
  it("shows drawing hints first", () => {
    const empty = hintsFor({ ...createEditorState(), drawing: { points: [] } });
    expect(empty[0]).toEqual({ keys: "グリッド点をクリック", label: "線を始める" });
    const some = hintsFor({ ...createEditorState(), drawing: { points: [{ x: 0, y: 0 }] } });
    expect(some.map((x) => x.keys)).toEqual(
      ["クリック / Space", "Enter", "最初の点をクリック", "右クリック / Backspace", "Esc"],
    );
  });
  it("adds L to the idle hints", () => {
    expect(hintsFor(createEditorState()).map((x) => x.keys)).toContain("L");
  });
});

describe("stage 4 combine keys", () => {
  it("binds T and 3, without repeating a key", () => {
    expect(findBinding("t")?.action).toBe("role");
    expect(findBinding("T")?.action).toBe("role");
    expect(findBinding("3")?.action).toBe("combine-view");
    const keys = KEYMAP.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("puts the combined view hint first and adds T to the selected hints", () => {
    const h = hintsFor({ ...withShape(), combineView: true });
    expect(h[0]).toEqual({ keys: "3", label: "結合の表示を終える" });
    expect(hintsFor(withShape())).toContainEqual({ keys: "T", label: "足す・抜く" });
    expect(hintsFor(withShape())[0]).toEqual({ keys: "つまみをクリック", label: "つかむ" });
  });
});
