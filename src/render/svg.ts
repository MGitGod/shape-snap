import { pathData, round } from "../core/curve";
import { localOutline, nodeBounds } from "../core/geometry";
import type { Bounds } from "../core/geometry";
import type { Document, SceneNode } from "../core/types";

export interface SvgElementSpec { tag: "rect" | "ellipse" | "polygon" | "path"; attrs: Record<string, string | number> }

export interface ExportOptions {
  area: "content" | Bounds;
  margin: number;
  background: string | null;
}

function transformAttr(node: SceneNode): string {
  const { x, y, rotation } = node.transform;
  const t = `translate(${round(x)} ${round(y)})`;
  return rotation === 0 ? t : `${t} rotate(${round(rotation)})`;
}

export function nodeToSvg(node: SceneNode): SvgElementSpec {
  let tag: SvgElementSpec["tag"];
  const attrs: Record<string, string | number> = {};
  switch (node.kind) {
    case "rect":
      tag = "rect";
      attrs.x = round(-node.width / 2);
      attrs.y = round(-node.height / 2);
      attrs.width = round(node.width);
      attrs.height = round(node.height);
      if (node.cornerRadius > 0) attrs.rx = round(node.cornerRadius);
      break;
    case "ellipse":
      tag = "ellipse";
      attrs.cx = 0;
      attrs.cy = 0;
      attrs.rx = round(node.rx);
      attrs.ry = round(node.ry);
      break;
    case "polygon":
      tag = "polygon";
      attrs.points = localOutline(node).map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
      break;
    case "path":
      if (node.closed && !node.smooth) {
        tag = "polygon";
        attrs.points = localOutline(node).map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
      } else {
        tag = "path";
        attrs.d = pathData(node.points, node.closed, node.smooth, node.tension);
      }
      break;
  }
  attrs.transform = transformAttr(node);
  const { fill, stroke, strokeWidth, opacity } = node.style;
  attrs.fill = fill === null ? "none" : fill;
  if (stroke !== null) {
    attrs.stroke = stroke;
    attrs["stroke-width"] = round(strokeWidth);
  }
  if (opacity !== 1) attrs.opacity = round(opacity);
  if (node.kind === "path" && !node.closed) {
    attrs["stroke-linecap"] = "round";
    attrs["stroke-linejoin"] = "round";
  }
  return { tag, attrs };
}

export function exportBounds(doc: Document, opts: ExportOptions): Bounds {
  let b: Bounds;
  if (opts.area === "content") {
    const visible = doc.nodes.filter((n) => n.visible);
    if (visible.length === 0) {
      b = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    } else {
      b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const n of visible) {
        const nb = nodeBounds(n);
        const half = n.style.stroke !== null ? n.style.strokeWidth / 2 : 0;
        b.minX = Math.min(b.minX, nb.minX - half);
        b.minY = Math.min(b.minY, nb.minY - half);
        b.maxX = Math.max(b.maxX, nb.maxX + half);
        b.maxY = Math.max(b.maxY, nb.maxY + half);
      }
    }
  } else {
    b = opts.area;
  }
  const m = opts.margin;
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

function escapeAttr(v: string | number): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function elementToString(spec: SvgElementSpec): string {
  const attrs = Object.entries(spec.attrs)
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(" ");
  return `<${spec.tag} ${attrs}/>`;
}

export function documentToSvg(doc: Document, opts: ExportOptions): string {
  const b = exportBounds(doc, opts);
  const w = round(b.maxX - b.minX);
  const h = round(b.maxY - b.minY);
  const x = round(b.minX);
  const y = round(b.minY);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">`,
  ];
  if (opts.background !== null) {
    lines.push(elementToString({
      tag: "rect",
      attrs: { x, y, width: w, height: h, fill: opts.background },
    }));
  }
  for (const node of doc.nodes) {
    if (!node.visible) continue;
    lines.push(elementToString(nodeToSvg(node)));
  }
  lines.push("</svg>");
  return lines.join("\n");
}
