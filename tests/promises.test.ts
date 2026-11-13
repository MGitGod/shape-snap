import { describe, expect, it } from "vitest";

const files = import.meta.glob("../src/**/*.{ts,tsx,css}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const entries = Object.entries(files);

const FORBIDDEN = [
  "onMouseDown", "onMouseUp", "onDoubleClick", "onDrag", "mousedown", "mouseup",
  "dblclick", "pointerdown", "pointerup", "shiftKey", "draggable",
];
const MODIFIERS = ["ctrlKey", "altKey", "metaKey"];
// the only files that may look at modifier keys: to ignore them, or because they receive keys themselves
const MODIFIER_OK = ["input/keyboard.ts", "ui/PropsPanel.tsx", "ui/ShapeList.tsx"];

describe("accessibility promises in src/", () => {
  it("reads the source files", () => {
    expect(entries.length).toBeGreaterThan(30);
    expect(entries.some(([p]) => p.endsWith("input/keyboard.ts"))).toBe(true);
  });

  it.each(FORBIDDEN)("never uses %s", (word) => {
    const hits = entries.filter(([, text]) => text.includes(word)).map(([p]) => p);
    expect(hits).toEqual([]);
  });

  it("looks at ctrl/alt/meta only in the files that receive keys themselves", () => {
    const hits = entries
      .filter(([, text]) => MODIFIERS.some((m) => text.includes(m)))
      .map(([p]) => p)
      .filter((p) => !MODIFIER_OK.some((ok) => p.endsWith(ok)));
    expect(hits).toEqual([]);
  });

  it("keeps src/core pure: no react, window or document.", () => {
    const core = entries.filter(([p]) => p.includes("/src/core/"));
    expect(core.length).toBeGreaterThan(5);
    for (const [p, text] of core) {
      expect(/\breact\b/.test(text), `${p} mentions react`).toBe(false);
      expect(/\bwindow\b/.test(text), `${p} mentions window`).toBe(false);
      expect(text.includes("document."), `${p} mentions document.`).toBe(false);
    }
  });
});
