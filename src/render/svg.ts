import { combineDocument } from "../core/combine";
import type { CombinedItem } from "../core/combine";
import { pathData, round } from "../core/curve";
import { localOutline, nodeBounds } from "../core/geometry";
import type { Bounds } from "../core/geometry";
import { expandNode } from "../core/tree";
import type { Document, LeafNode, SceneNode } from "../core/types";

export interface SvgElementSpec { tag: "rect" | "ellipse" | "polygon" | "path"; attrs: Record<string, string | number> }

export interface ExportOptions {
  area: "content" | Bounds;
  margin: number;
  background: string | null;
  combine?: boolean;
}

function transformAttr(node: LeafNode): string {
  const { x, y, rotation } = node.transform;
  const t = `translate(${round(x)} ${round(y)})`;
  return rotation === 0 ? t : `${t} rotate(${round(rotation)})`;
}

/** Every SVG element a node draws (containers expand into their leaves, back to front). */
export function nodeToSvgList(node: SceneNode): SvgElementSpec[] {
  return expandNode(node).map(nodeToSvg);
}

export function nodeToSvg(node: LeafNode): SvgElementSpec {
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

function withMargin(b: Bounds, margin: number): Bounds {
  return { minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin };
}

function itemsBounds(items: CombinedItem[]): Bounds {
  if (items.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const it of items) {
    const half = it.style.stroke !== null ? it.style.strokeWidth / 2 : 0;
    b.minX = Math.min(b.minX, it.bounds.minX - half);
    b.minY = Math.min(b.minY, it.bounds.minY - half);
    b.maxX = Math.max(b.maxX, it.bounds.maxX + half);
    b.maxY = Math.max(b.maxY, it.bounds.maxY + half);
  }
  return b;
}

export function exportBounds(doc: Document, opts: ExportOptions): Bounds {
  if (opts.combine && opts.area === "content") {
    const r = combineDocument(doc);
    if (r.ok) return withMargin(itemsBounds(r.items), opts.margin);
  }
  let b: Bounds;
  if (opts.area === "content") {
    // a subtract shape is only drawn by the combined export, so it does not count here
    const visible = doc.nodes.filter((n) => n.visible && (opts.combine || n.role !== "subtract"));
    if (visible.length === 0) {
      b = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    } else {
      b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const n of visible) {
        for (const leaf of expandNode(n)) {
          const nb = nodeBounds(leaf);
          const half = leaf.style.stroke !== null ? leaf.style.strokeWidth / 2 : 0;
          b.minX = Math.min(b.minX, nb.minX - half);
          b.minY = Math.min(b.minY, nb.minY - half);
          b.maxX = Math.max(b.maxX, nb.maxX + half);
          b.maxY = Math.max(b.maxY, nb.maxY + half);
        }
      }
    }
  } else {
    b = opts.area;
  }
  return withMargin(b, opts.margin);
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

function svgOpen(b: Bounds, background: string | null): string[] {
  const w = round(b.maxX - b.minX);
  const h = round(b.maxY - b.minY);
  const x = round(b.minX);
  const y = round(b.minY);
  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">`,
  ];
  if (background !== null) {
    lines.push(elementToString({ tag: "rect", attrs: { x, y, width: w, height: h, fill: background } }));
  }
  return lines;
}

function itemToSvg(item: CombinedItem): SvgElementSpec {
  const attrs: Record<string, string | number> = { d: item.d };
  const { fill, stroke, strokeWidth, opacity } = item.style;
  attrs.fill = fill === null ? "none" : fill;
  if (item.kind === "region") attrs["fill-rule"] = "nonzero";
  if (stroke !== null) {
    attrs.stroke = stroke;
    attrs["stroke-width"] = round(strokeWidth);
  }
  if (opacity !== 1) attrs.opacity = round(opacity);
  if (item.kind === "stroke") {
    attrs["stroke-linecap"] = "round";
    attrs["stroke-linejoin"] = "round";
  }
  return { tag: "path", attrs };
}

/** The document with add and subtract shapes merged into outlines. Throws when the merge fails. */
export function combinedToSvg(doc: Document, opts: ExportOptions): string {
  const r = combineDocument(doc);
  if (!r.ok) throw new Error(r.message);
  const b = opts.area === "content"
    ? withMargin(itemsBounds(r.items), opts.margin)
    : withMargin(opts.area, opts.margin);
  const lines = svgOpen(b, opts.background);
  for (const item of r.items) lines.push(elementToString(itemToSvg(item)));
  lines.push("</svg>");
  return lines.join("\n");
}

export function documentToSvg(doc: Document, opts: ExportOptions): string {
  if (opts.combine) return combinedToSvg(doc, opts);
  const lines = svgOpen(exportBounds(doc, opts), opts.background);
  for (const node of doc.nodes) {
    if (!node.visible || node.role === "subtract") continue;
    for (const spec of nodeToSvgList(node)) lines.push(elementToString(spec));
  }
  lines.push("</svg>");
  return lines.join("\n");
}
