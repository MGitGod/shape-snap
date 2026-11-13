import { describe, expect, it } from "vitest";
import { createDocument } from "../../src/core/model";
import { parseDocument, safeFileName, serializeDocument } from "../../src/io/files";
import type { Document } from "../../src/core/types";

const sample: Document = {
  ...createDocument(),
  nodes: [
    {
      id: "a", name: "四角 1", visible: true, locked: false, role: "add",
      transform: { x: 40, y: 60, rotation: 0 },
      style: { fill: "#1d2330", stroke: null, strokeWidth: 2, opacity: 1 },
      kind: "rect", width: 80, height: 40, cornerRadius: 0,
    },
  ],
};

describe("files", () => {
  it("round-trips a document", () => {
    const r = parseDocument(serializeDocument(sample));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toEqual(sample);
  });
  it("rejects broken JSON", () => {
    const r = parseDocument("{ nope");
    expect(r).toEqual({ ok: false, errors: ["ファイルを JSON として読めません"] });
  });
  it("rejects a document that fails validation", () => {
    const r = parseDocument('{"version":1}');
    expect(r.ok).toBe(false);
  });
  it("sanitizes file names", () => {
    expect(safeFileName("a/b:c ")).toBe("abc");
    expect(safeFileName("  ")).toBe("shape-snap");
    expect(safeFileName(' x\y*z?"<>| ')).toBe("xyz");
  });
});
