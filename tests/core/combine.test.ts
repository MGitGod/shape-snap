import paper from "paper/dist/paper-core";
import { describe, expect, it } from "vitest";
import { combineDocument, hasSubtract } from "../../src/core/combine";
import type { CombinedItem } from "../../src/core/combine";
import { createDocument, setRole } from "../../src/core/model";
import type { Document, EllipseNode, LeafNode, PathNode, RectNode, Role, SceneNode, Style } from "../../src/core/types";
import { combinedToSvg, documentToSvg } from "../../src/render/svg";

const BLACK: Style = { fill: "#1d2330", stroke: null, strokeWidth: 2, opacity: 1 };
const base = { name: "n", visible: true, locked: false, role: "add" as Role };

function rect(id: string, x: number, y: number, over: Partial<RectNode> = {}): RectNode {
  return {
    ...base, id, kind: "rect", width: 80, height: 80, cornerRadius: 0,
    transform: { x, y, rotation: 0 }, style: BLACK, ...over,
  };
}
function circle(id: string, x: number, y: number, r: number, over: Partial<EllipseNode> = {}): EllipseNode {
  return { ...base, id, kind: "ellipse", rx: r, ry: r, transform: { x, y, rotation: 0 }, style: BLACK, ...over };
}
function pathNode(id: string, over: Partial<PathNode> = {}): PathNode {
  return {
    ...base, id, kind: "path", closed: true, smooth: false, tension: 1,
    points: [
      { x: -40, y: -40, corner: false }, { x: 40, y: -40, corner: false },
      { x: 40, y: 40, corner: false }, { x: -40, y: 40, corner: false },
    ],
    transform: { x: 0, y: 0, rotation: 0 }, style: BLACK, ...over,
  };
}
function docOf(...nodes: SceneNode[]): Document {
  return { ...createDocument(), nodes };
}
function ok(doc: Document): CombinedItem[] {
  const r = combineDocument(doc);
  if (!r.ok) throw new Error(r.message);
  return r.items;
}
const red: Style = { ...BLACK, fill: "#ff0000" };
const near = (v: number, expected: number) => expect(Math.abs(v - expected) / expected).toBeLessThan(0.01);

describe("paper.js in node", () => {
  it("runs unite and subtract without a DOM", () => {
    paper.setup(new paper.Size(1, 1));
    const a = new paper.Path.Rectangle({ point: [-40, -40], size: [80, 80], insert: false });
    const b = new paper.Path.Rectangle({ point: [0, -40], size: [80, 80], insert: false });
    near(Math.abs((a.unite(b, { insert: false }) as paper.Path).area), 9600);
    near(Math.abs((a.subtract(b, { insert: false }) as paper.Path).area), 3200);
  });
});

describe("combineDocument", () => {
  it("merges overlapping shapes of the same look into one region", () => {
    const items = ok(docOf(rect("a", 0, 0), rect("b", 40, 0)));
    expect(items).toHaveLength(1);
    const it = items[0]!;
    expect(it.kind).toBe("region");
    near(it.area, 9600);
    expect(it.bounds.minX).toBeCloseTo(-40, 3);
    expect(it.bounds.minY).toBeCloseTo(-40, 3);
    expect(it.bounds.maxX).toBeCloseTo(80, 3);
    expect(it.bounds.maxY).toBeCloseTo(40, 3);
    expect(it.sourceIds).toEqual(["a", "b"]);
  });

  it("keeps different colors apart", () => {
    expect(ok(docOf(rect("a", 0, 0), rect("b", 40, 0, { style: red })))).toHaveLength(2);
  });

  it("joins separate shapes of the same look into one compound region", () => {
    const items = ok(docOf(rect("a", 0, 0), rect("b", 200, 0)));
    expect(items).toHaveLength(1);
    near(items[0]!.area, 12800);
  });

  it("does not merge across a different color in between", () => {
    expect(ok(docOf(rect("a", 0, 0), rect("b", 10, 0, { style: red }), rect("c", 20, 0)))).toHaveLength(3);
  });

  it("cuts a circle out of a rect and keeps curves", () => {
    const items = ok(docOf(rect("a", 0, 0), circle("c", 0, 0, 20, { role: "subtract" })));
    expect(items).toHaveLength(1);
    near(items[0]!.area, 6400 - Math.PI * 400);
    expect(items[0]!.d).toMatch(/C/);
  });

  it("subtract only cuts what is behind it", () => {
    const items = ok(docOf(
      rect("a", 0, 0), circle("c", 0, 0, 20, { role: "subtract" }), rect("c2", 0, 0, { style: red }),
    ));
    expect(items).toHaveLength(2);
    near(items[0]!.area, 6400 - Math.PI * 400);
    near(items[1]!.area, 6400);
  });

  it("drops a region that is fully covered", () => {
    expect(ok(docOf(rect("a", 0, 0), rect("s", 0, 0, { role: "subtract", width: 200, height: 200 })))).toEqual([]);
  });

  it("leaves a region alone when the cutter does not touch it", () => {
    const items = ok(docOf(rect("a", 0, 0), rect("s", 500, 0, { role: "subtract" })));
    expect(items).toHaveLength(1);
    near(items[0]!.area, 6400);
  });

  it("emits open lines as strokes and ignores subtract on them", () => {
    const line = pathNode("l", {
      closed: false, style: { fill: null, stroke: "#000000", strokeWidth: 4, opacity: 1 },
      points: [{ x: -40, y: 0, corner: false }, { x: 40, y: 0, corner: false }],
    });
    const cutter = rect("s", 0, 0, { role: "subtract" });
    const items = ok(docOf(line, cutter));
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("stroke");
    expect(items[0]!.area).toBe(0);
    expect(items[0]!.d).toBe(ok(docOf(line))[0]!.d);
    expect(ok(docOf({ ...line, role: "subtract" }))).toEqual([]);
  });

  it("skips hidden shapes", () => {
    expect(ok(docOf(rect("a", 0, 0, { visible: false })))).toEqual([]);
  });

  it("expands a repeat and applies the container role to every copy", () => {
    const rep = (role: Role): SceneNode => ({
      ...base, id: "r", kind: "repeat", child: rect("a", 0, 0), count: 3, dx: 100, dy: 0,
      scaleStep: 1, rotateStep: 0, role,
    });
    const items = ok(docOf(rep("add")));
    expect(items).toHaveLength(1);
    near(items[0]!.area, 19200);
    const big = rect("big", 100, 0, { width: 400, height: 200, style: red });
    const cut = ok(docOf(big, rep("subtract")));
    expect(cut).toHaveLength(1);
    near(cut[0]!.area, 400 * 200 - 19200);
  });

  it("rotates before combining", () => {
    const r = rect("a", 0, 0, { transform: { x: 0, y: 0, rotation: 45 } });
    expect(ok(docOf(r))[0]!.bounds.minX).toBeCloseTo(-56.57, 1);
  });

  it("keeps a smooth closed path as curves", () => {
    const items = ok(docOf(pathNode("p", { smooth: true })));
    expect(items[0]!.d).toMatch(/C/);
  });

  it("handles rounded corners", () => {
    near(ok(docOf(rect("a", 0, 0, { cornerRadius: 10 })))[0]!.area, 6400 - (4 - Math.PI) * 100);
  });

  it("makes an outline-only region from a closed shape without fill", () => {
    const items = ok(docOf(rect("a", 0, 0, { style: { fill: null, stroke: "#000000", strokeWidth: 2, opacity: 1 } })));
    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("region");
    expect(items[0]!.style.fill).toBeNull();
  });

  it("hasSubtract looks at visible shapes only, and setRole does not mutate", () => {
    const doc = docOf(rect("a", 0, 0), rect("b", 0, 0));
    expect(hasSubtract(doc)).toBe(false);
    const next = setRole(doc, ["b"], "subtract");
    expect(hasSubtract(next)).toBe(true);
    expect(doc.nodes[1]!.role).toBe("add");
    expect(next.nodes[0]).toBe(doc.nodes[0]);
    const hidden: Document = { ...next, nodes: [next.nodes[0]!, { ...next.nodes[1]!, visible: false }] };
    expect(hasSubtract(hidden)).toBe(false);
  });

  it("reports a failure instead of throwing", () => {
    const bad = { ...createDocument(), nodes: [null as unknown as LeafNode] } as Document;
    const r = combineDocument(bad);
    expect(r.ok).toBe(false);
  });
});

describe("combined svg", () => {
  const opts = { area: "content" as const, margin: 10, background: null, combine: true };

  it("writes one path per item", () => {
    const doc = docOf(rect("a", 0, 0), rect("b", 0, 0, { style: red }));
    const svg = combinedToSvg(doc, opts);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain('fill-rule="nonzero"');
    expect(svg).toContain('fill="#ff0000"');
  });

  it("sizes the view box to the items", () => {
    expect(combinedToSvg(docOf(rect("a", 0, 0)), opts)).toContain('viewBox="-50 -50 100 100"');
  });

  it("adds half the stroke width to the content box and uses 100x100 when empty", () => {
    const stroked = rect("a", 0, 0, { style: { fill: null, stroke: "#000000", strokeWidth: 4, opacity: 0.5 } });
    const svg = combinedToSvg(docOf(stroked), opts);
    expect(svg).toContain('viewBox="-52 -52 104 104"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke-width="4"');
    expect(svg).toContain('opacity="0.5"');
    expect(combinedToSvg(docOf(), opts)).toContain('viewBox="-10 -10 120 120"');
  });

  it("documentToSvg switches on combine, and otherwise leaves subtract shapes out", () => {
    const doc = docOf(rect("a", 0, 0), circle("c", 0, 0, 20, { role: "subtract" }));
    expect(documentToSvg(doc, opts)).toBe(combinedToSvg(doc, opts));
    const plain = documentToSvg(doc, { ...opts, combine: false });
    expect(plain).not.toContain("<ellipse");
    expect(plain).toContain("<rect");
  });

  it("throws the combine message on failure", () => {
    const bad = { ...createDocument(), nodes: [null as unknown as LeafNode] } as Document;
    expect(() => combinedToSvg(bad, opts)).toThrow("結合できませんでした");
  });
});
