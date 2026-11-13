import { describe, it, expect } from "vitest";
import {
  createDocument, createNode, addNode, getNode, updateNode, removeNodes,
  translateNodes, reorderNode, duplicateNodes, setGrid, nextName, DEFAULT_STYLE,
} from "../../src/core/model";
import type { Document } from "../../src/core/types";

function docWith(...ids: string[]): Document {
  let doc = createDocument();
  for (const id of ids) doc = addNode(doc, createNode(doc, "rect", { x: 100, y: 100 }, id));
  return doc;
}

describe("createDocument", () => {
  it("has default grid and no nodes", () => {
    const doc = createDocument();
    expect(doc.version).toBe(1);
    expect(doc.grid).toEqual({ size: 20, visible: true, snap: true });
    expect(doc.nodes.length).toBe(0);
  });
});

describe("createNode", () => {
  it("creates a rect at grid-scaled size", () => {
    const n = createNode(createDocument(), "rect", { x: 100, y: 100 }, "a");
    expect(n).toMatchObject({
      id: "a", kind: "rect", width: 80, height: 80, cornerRadius: 0,
      name: "四角 1", visible: true, locked: false, role: "add",
      transform: { x: 100, y: 100, rotation: 0 },
    });
    expect(n.style).toEqual(DEFAULT_STYLE);
    expect(n.style).not.toBe(DEFAULT_STYLE);
  });
  it("creates an ellipse", () => {
    const n = createNode(createDocument(), "ellipse", { x: 0, y: 0 }, "e");
    expect(n).toMatchObject({ kind: "ellipse", rx: 40, ry: 40, name: "円 1" });
  });
  it("creates a polygon", () => {
    const n = createNode(createDocument(), "polygon", { x: 0, y: 0 }, "p");
    expect(n).toMatchObject({ kind: "polygon", sides: 3, width: 80, height: 80, starRatio: 1, name: "多角形 1" });
  });
  it("scales with grid size", () => {
    const doc = setGrid(createDocument(), { size: 10 });
    const n = createNode(doc, "rect", { x: 0, y: 0 }, "a");
    expect(n).toMatchObject({ width: 40, height: 40 });
  });
  it("generates an id when omitted", () => {
    const n = createNode(createDocument(), "rect", { x: 0, y: 0 });
    expect(typeof n.id).toBe("string");
    expect(n.id.length).toBeGreaterThan(0);
  });
});

describe("nextName", () => {
  it("increments per kind", () => {
    let doc = createDocument();
    doc = addNode(doc, createNode(doc, "rect", { x: 0, y: 0 }, "a"));
    expect(nextName(doc, "rect")).toBe("四角 2");
    expect(nextName(doc, "ellipse")).toBe("円 1");
    expect(nextName(doc, "path")).toBe("自由な形 1");
    doc = addNode(doc, createNode(doc, "rect", { x: 0, y: 0 }, "b"));
    expect(doc.nodes[1]?.name).toBe("四角 2");
  });
  it("uses max number + 1", () => {
    let doc = docWith("a", "b");
    doc = removeNodes(doc, ["a"]);
    expect(doc.nodes.map((n) => n.name)).toEqual(["四角 2"]);
    expect(nextName(doc, "rect")).toBe("四角 3");
  });
});

describe("addNode / getNode / updateNode / removeNodes", () => {
  it("addNode does not mutate and appends to front", () => {
    const doc = docWith("a");
    const next = addNode(doc, createNode(doc, "ellipse", { x: 0, y: 0 }, "b"));
    expect(doc.nodes.length).toBe(1);
    expect(next.nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });
  it("getNode finds or returns undefined", () => {
    const doc = docWith("a");
    expect(getNode(doc, "a")?.id).toBe("a");
    expect(getNode(doc, "zz")).toBeUndefined();
  });
  it("updateNode replaces only the target without mutating", () => {
    const doc = docWith("a", "b");
    const next = updateNode(doc, "a", (n) => ({ ...n, name: "X" }));
    expect(next.nodes.map((n) => n.name)).toEqual(["X", "四角 2"]);
    expect(doc.nodes[0]?.name).toBe("四角 1");
  });
  it("removeNodes removes the given ids", () => {
    const doc = docWith("a", "b", "c");
    const next = removeNodes(doc, ["a", "c"]);
    expect(next.nodes.map((n) => n.id)).toEqual(["b"]);
    expect(doc.nodes.length).toBe(3);
  });
});

describe("translateNodes", () => {
  it("moves only the targeted node", () => {
    const doc = docWith("a", "b");
    const next = translateNodes(doc, ["a"], 20, -20);
    expect(next.nodes[0]?.transform).toEqual({ x: 120, y: 80, rotation: 0 });
    expect(next.nodes[1]?.transform).toEqual({ x: 100, y: 100, rotation: 0 });
    expect(doc.nodes[0]?.transform.x).toBe(100);
  });
});

describe("reorderNode", () => {
  it("moves one step toward front", () => {
    const doc = docWith("a", "b", "c");
    expect(reorderNode(doc, "b", 1).nodes.map((n) => n.id)).toEqual(["a", "c", "b"]);
  });
  it("moves one step toward back", () => {
    const doc = docWith("a", "b", "c");
    expect(reorderNode(doc, "b", -1).nodes.map((n) => n.id)).toEqual(["b", "a", "c"]);
  });
  it("returns same doc at the ends", () => {
    const doc = docWith("a", "b", "c");
    expect(reorderNode(doc, "c", 1)).toBe(doc);
    expect(reorderNode(doc, "a", -1)).toBe(doc);
  });
  it("returns same doc for unknown id", () => {
    const doc = docWith("a");
    expect(reorderNode(doc, "zz", 1)).toBe(doc);
  });
});

describe("duplicateNodes", () => {
  it("adds offset copies at the end with new ids and names", () => {
    const doc = docWith("a", "b");
    let n = 0;
    const { doc: next, newIds } = duplicateNodes(doc, ["a"], 20, 20, () => `n${++n}`);
    expect(newIds).toEqual(["n1"]);
    expect(newIds.length).toBe(1);
    expect(next.nodes.length).toBe(3);
    const copy = next.nodes[2];
    expect(copy?.id).toBe("n1");
    expect(copy?.transform).toEqual({ x: 120, y: 120, rotation: 0 });
    expect(copy?.name).toBe("四角 3");
    expect(doc.nodes.length).toBe(2);
  });
  it("uses random ids by default and keeps order of ids", () => {
    const doc = docWith("a", "b");
    const { doc: next, newIds } = duplicateNodes(doc, ["a", "b"], 10, 0);
    expect(newIds.length).toBe(2);
    expect(newIds[0]).not.toBe("a");
    expect(next.nodes.slice(2).map((x) => x.id)).toEqual(newIds);
    expect(next.nodes.slice(2).map((x) => x.name)).toEqual(["四角 3", "四角 4"]);
  });
});

describe("setGrid", () => {
  it("clamps size", () => {
    const doc = createDocument();
    expect(setGrid(doc, { size: 1 }).grid.size).toBe(5);
    expect(setGrid(doc, { size: 999 }).grid.size).toBe(160);
    expect(setGrid(doc, { size: 40 }).grid.size).toBe(40);
  });
  it("patches other fields without mutating", () => {
    const doc = createDocument();
    const next = setGrid(doc, { snap: false });
    expect(next.grid).toEqual({ size: 20, visible: true, snap: false });
    expect(doc.grid.snap).toBe(true);
  });
});
