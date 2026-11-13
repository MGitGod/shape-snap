import { describe, it, expect } from "vitest";
import { createDocument, createNode, addNode } from "../../src/core/model";
import { validateDocument } from "../../src/core/validate";

function errorsOf(data: unknown): string[] {
  const r = validateDocument(data);
  if (r.ok) throw new Error("expected failure");
  return r.errors;
}

describe("validateDocument", () => {
  it("accepts a fresh document", () => {
    const r = validateDocument(createDocument());
    expect(r.ok).toBe(true);
  });
  it("accepts a document with every kind", () => {
    let doc = createDocument();
    doc = addNode(doc, createNode(doc, "rect", { x: 0, y: 0 }, "a"));
    doc = addNode(doc, createNode(doc, "ellipse", { x: 0, y: 0 }, "b"));
    doc = addNode(doc, createNode(doc, "polygon", { x: 0, y: 0 }, "c"));
    doc = addNode(doc, {
      ...createNode(doc, "rect", { x: 0, y: 0 }, "d"),
      kind: "path", name: "自由な形 1", smooth: false, tension: 0.5, closed: true,
      points: [{ x: 0, y: 0, corner: true }, { x: 10, y: 0, corner: false }],
    } as never);
    const r = validateDocument(JSON.parse(JSON.stringify(doc)));
    expect(r.ok).toBe(true);
  });
  it("rejects non-objects", () => {
    expect(validateDocument(null).ok).toBe(false);
    expect(validateDocument(5).ok).toBe(false);
  });
  it("rejects wrong version", () => {
    const errs = errorsOf({ version: 2, grid: { size: 20, visible: true, snap: true }, nodes: [] });
    expect(errs.some((e) => e.includes("version"))).toBe(true);
  });
  it("rejects bad grid", () => {
    expect(validateDocument({ version: 1, grid: { size: 1, visible: true, snap: true }, nodes: [] }).ok).toBe(false);
    expect(validateDocument({ version: 1, grid: { size: 20, visible: 1, snap: true }, nodes: [] }).ok).toBe(false);
    expect(validateDocument({ version: 1, nodes: [] }).ok).toBe(false);
  });
  it("rejects non-array nodes", () => {
    const errs = errorsOf({ version: 1, grid: { size: 20, visible: true, snap: true }, nodes: {} });
    expect(errs.some((e) => e.includes("nodes"))).toBe(true);
  });
  it("rejects a rect with non-numeric width, naming the field", () => {
    const doc = createDocument();
    const rect = { ...createNode(doc, "rect", { x: 0, y: 0 }, "a"), width: "x" };
    const errs = errorsOf({ ...doc, nodes: [rect] });
    expect(errs.some((e) => e.includes("width"))).toBe(true);
    expect(errs[0]).toBe("図形 1（四角 1）: width が数値ではありません");
  });
  it("rejects non-finite numbers", () => {
    const doc = createDocument();
    const rect = { ...createNode(doc, "rect", { x: 0, y: 0 }, "a"), height: Infinity };
    expect(validateDocument({ ...doc, nodes: [rect] }).ok).toBe(false);
  });
  it("rejects duplicate ids", () => {
    let doc = createDocument();
    doc = addNode(doc, createNode(doc, "rect", { x: 0, y: 0 }, "a"));
    const dup = { ...doc, nodes: [...doc.nodes, { ...doc.nodes[0]!, name: "四角 2" }] };
    const errs = errorsOf(dup);
    expect(errs.some((e) => e.includes("id"))).toBe(true);
  });
  it("rejects unknown kinds", () => {
    const doc = createDocument();
    const errs = errorsOf({ ...doc, nodes: [{ ...createNode(doc, "rect", { x: 0, y: 0 }, "a"), kind: "star" }] });
    expect(errs.some((e) => e.includes("kind"))).toBe(true);
  });
  it("rejects bad style and transform", () => {
    const doc = createDocument();
    const base = createNode(doc, "rect", { x: 0, y: 0 }, "a");
    expect(validateDocument({ ...doc, nodes: [{ ...base, style: { ...base.style, fill: 3 } }] }).ok).toBe(false);
    expect(validateDocument({ ...doc, nodes: [{ ...base, transform: { x: 0, y: 0 } }] }).ok).toBe(false);
    expect(validateDocument({ ...doc, nodes: [{ ...base, role: "mul" }] }).ok).toBe(false);
    expect(validateDocument({ ...doc, nodes: [{ ...base, visible: "yes" }] }).ok).toBe(false);
  });
  it("rejects bad path points", () => {
    const doc = createDocument();
    const base = createNode(doc, "rect", { x: 0, y: 0 }, "a");
    const path = { ...base, kind: "path", closed: true, smooth: false, tension: 0.5, points: [{ x: 0, y: "q", corner: true }] };
    expect(validateDocument({ ...doc, nodes: [path] }).ok).toBe(false);
  });
});
