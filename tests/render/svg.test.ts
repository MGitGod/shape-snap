import { describe, it, expect } from "vitest";
import { nodeToSvg, exportBounds, documentToSvg } from "../../src/render/svg";
import type { Document, RectNode, EllipseNode, PolygonNode, PathNode, Style } from "../../src/core/types";

const style: Style = { fill: "#ff0000", stroke: null, strokeWidth: 2, opacity: 1 };
const base = { name: "n", visible: true, locked: false, role: "add" as const };

function rect(over: Partial<RectNode> = {}): RectNode {
  return {
    ...base, id: "r1", kind: "rect", width: 80, height: 80, cornerRadius: 0,
    transform: { x: 100, y: 100, rotation: 0 }, style, ...over,
  };
}
function ellipse(over: Partial<EllipseNode> = {}): EllipseNode {
  return {
    ...base, id: "e1", kind: "ellipse", rx: 30, ry: 20,
    transform: { x: 10, y: 20, rotation: 0 }, style, ...over,
  };
}
function polygon(over: Partial<PolygonNode> = {}): PolygonNode {
  return {
    ...base, id: "p1", kind: "polygon", sides: 3, width: 100, height: 100, starRatio: 1,
    transform: { x: 0, y: 0, rotation: 0 }, style, ...over,
  };
}
function doc(nodes: Document["nodes"]): Document {
  return { version: 1, grid: { size: 20, visible: true, snap: true }, nodes };
}

describe("nodeToSvg", () => {
  it("rect: local geometry plus translate transform", () => {
    const s = nodeToSvg(rect());
    expect(s.tag).toBe("rect");
    expect(s.attrs.x).toBe(-40);
    expect(s.attrs.y).toBe(-40);
    expect(s.attrs.width).toBe(80);
    expect(s.attrs.height).toBe(80);
    expect(s.attrs.transform).toBe("translate(100 100)");
    expect("rx" in s.attrs).toBe(false);
  });
  it("rect: rx only when cornerRadius > 0", () => {
    expect(nodeToSvg(rect({ cornerRadius: 8 })).attrs.rx).toBe(8);
  });
  it("adds rotate when rotation is non-zero", () => {
    const s = nodeToSvg(rect({ transform: { x: 100, y: 100, rotation: 30 } }));
    expect(s.attrs.transform).toBe("translate(100 100) rotate(30)");
  });
  it("fill null becomes none", () => {
    expect(nodeToSvg(rect({ style: { ...style, fill: null } })).attrs.fill).toBe("none");
    expect(nodeToSvg(rect()).attrs.fill).toBe("#ff0000");
  });
  it("stroke null has no stroke or stroke-width; stroke set has both", () => {
    const a = nodeToSvg(rect()).attrs;
    expect("stroke" in a).toBe(false);
    expect("stroke-width" in a).toBe(false);
    const b = nodeToSvg(rect({ style: { ...style, stroke: "#000000", strokeWidth: 4 } })).attrs;
    expect(b.stroke).toBe("#000000");
    expect(b["stroke-width"]).toBe(4);
  });
  it("opacity only when not 1", () => {
    expect("opacity" in nodeToSvg(rect()).attrs).toBe(false);
    expect(nodeToSvg(rect({ style: { ...style, opacity: 0.5 } })).attrs.opacity).toBe(0.5);
  });
  it("ellipse: cx cy 0, rx ry", () => {
    const s = nodeToSvg(ellipse());
    expect(s.tag).toBe("ellipse");
    expect(s.attrs.cx).toBe(0);
    expect(s.attrs.cy).toBe(0);
    expect(s.attrs.rx).toBe(30);
    expect(s.attrs.ry).toBe(20);
    expect(s.attrs.transform).toBe("translate(10 20)");
  });
  it("polygon (triangle): 3 point pairs", () => {
    const s = nodeToSvg(polygon());
    expect(s.tag).toBe("polygon");
    const pts = String(s.attrs.points).split(" ");
    expect(pts).toHaveLength(3);
    expect(pts[0]).toBe("0,-50");
    for (const p of pts) expect(p.split(",")).toHaveLength(2);
  });
  it("closed path becomes polygon with its points", () => {
    const path: PathNode = {
      ...base, id: "q1", kind: "path", closed: true, smooth: false, tension: 0,
      points: [
        { x: -10, y: -10, corner: true }, { x: 10, y: -10, corner: true }, { x: 0, y: 12.3456, corner: true },
      ],
      transform: { x: 5, y: 5, rotation: 0 }, style,
    };
    const s = nodeToSvg(path);
    expect(s.tag).toBe("polygon");
    expect(s.attrs.points).toBe("-10,-10 10,-10 0,12.346");
  });
  it("rounds to 3 decimals and drops trailing zeros", () => {
    const s = nodeToSvg(rect({ width: 24.6912, height: 3, transform: { x: 12.5, y: 0.0004, rotation: 0 } }));
    expect(s.attrs.width).toBe(24.691);
    expect(s.attrs.height).toBe(3);
    expect(s.attrs.x).toBe(-12.346);
    expect(s.attrs.transform).toBe("translate(12.5 0)");
    expect(nodeToSvg(rect({ width: 12.3456 })).attrs.width).toBe(12.346);
  });
});

describe("exportBounds", () => {
  it("content: bounds plus margin", () => {
    expect(exportBounds(doc([rect()]), { area: "content", margin: 10, background: null }))
      .toEqual({ minX: 50, minY: 50, maxX: 150, maxY: 150 });
  });
  it("content: adds half stroke width when stroked", () => {
    const n = rect({ style: { ...style, stroke: "#000", strokeWidth: 10 } });
    expect(exportBounds(doc([n]), { area: "content", margin: 0, background: null }))
      .toEqual({ minX: 55, minY: 55, maxX: 145, maxY: 145 });
  });
  it("content: ignores hidden shapes", () => {
    const hidden = rect({ id: "h", visible: false, transform: { x: 1000, y: 1000, rotation: 0 } });
    expect(exportBounds(doc([rect(), hidden]), { area: "content", margin: 0, background: null }))
      .toEqual({ minX: 60, minY: 60, maxX: 140, maxY: 140 });
  });
  it("content: no visible shapes gives 0,0,100,100 plus margin", () => {
    const b = exportBounds(doc([rect({ visible: false })]), { area: "content", margin: 5, background: null });
    expect(b).toEqual({ minX: -5, minY: -5, maxX: 105, maxY: 105 });
  });
  it("explicit area is used as given plus margin", () => {
    const b = exportBounds(doc([]), { area: { minX: 0, minY: 0, maxX: 200, maxY: 100 }, margin: 10, background: null });
    expect(b).toEqual({ minX: -10, minY: -10, maxX: 210, maxY: 110 });
  });
});

describe("documentToSvg", () => {
  it("emits viewBox, width and height", () => {
    const svg = documentToSvg(doc([rect()]), { area: "content", margin: 10, background: null });
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="50 50 100 100" width="100" height="100">');
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect(svg).toContain('<rect x="-40" y="-40" width="80" height="80"');
  });
  it("omits hidden shapes", () => {
    const svg = documentToSvg(
      doc([rect(), ellipse({ visible: false })]),
      { area: "content", margin: 0, background: null },
    );
    expect(svg).not.toContain("<ellipse");
    expect(svg).toContain("<rect");
  });
  it("puts the background rect first, same size as the viewBox", () => {
    const svg = documentToSvg(doc([rect()]), { area: "content", margin: 10, background: "#ffffff" });
    const first = svg.split("\n").find((l) => l.startsWith("<rect"))!;
    expect(first).toContain('x="50"');
    expect(first).toContain('y="50"');
    expect(first).toContain('width="100"');
    expect(first).toContain('height="100"');
    expect(first).toContain('fill="#ffffff"');
    expect(svg.indexOf('fill="#ffffff"')).toBeLessThan(svg.indexOf('fill="#ff0000"'));
  });
  it("has no background rect when background is null, and no grid", () => {
    const svg = documentToSvg(doc([ellipse()]), { area: "content", margin: 0, background: null });
    expect(svg).not.toContain("<rect");
    expect(svg).not.toContain("<line");
    expect(svg).not.toContain("<pattern");
  });
  it("escapes attribute values", () => {
    const n = rect({ style: { ...style, fill: 'a&b<c>"d' } });
    const svg = documentToSvg(doc([n]), { area: "content", margin: 0, background: null });
    expect(svg).toContain('fill="a&amp;b&lt;c&gt;&quot;d"');
  });
  it("puts one shape per line", () => {
    const svg = documentToSvg(doc([rect(), ellipse()]), { area: "content", margin: 0, background: null });
    const lines = svg.split("\n").filter((l) => l.startsWith("<rect") || l.startsWith("<ellipse"));
    expect(lines).toHaveLength(2);
  });
});
