import paper from "paper/dist/paper-core";
import { pathData, round } from "./curve";
import { localOutline } from "./leafGeometry";
import type { Bounds } from "./leafGeometry";
import { expandNode } from "./tree";
import type { Document, LeafNode, Style } from "./types";

export interface CombinedItem {
  kind: "region" | "stroke";
  d: string;             // SVG path in world coordinates
  style: Style;
  bounds: Bounds;        // stroke width is not included
  area: number;          // absolute area of a region; 0 for a stroke
  sourceIds: string[];   // ids of the top-level shapes it came from (no duplicates, in order of appearance)
}
export type CombineResult =
  | { ok: true; items: CombinedItem[] }
  | { ok: false; message: string; nodeId: string | null };

type Shape = paper.Path | paper.CompoundPath;

const FAIL_MESSAGE = "結合できませんでした";
const NO_INSERT = { insert: false } as const;
let ready = false;

function ensureSetup(): void {
  if (ready) return;
  paper.setup(new paper.Size(1, 1));
  ready = true;
}

/** Build the leaf shape in local coordinates, then rotate and move it into the world. */
function leafShape(leaf: LeafNode): Shape | null {
  let shape: Shape;
  switch (leaf.kind) {
    case "rect": {
      const radius = Math.min(leaf.cornerRadius, leaf.width / 2, leaf.height / 2);
      shape = new paper.Path.Rectangle({
        point: [-leaf.width / 2, -leaf.height / 2],
        size: [leaf.width, leaf.height],
        radius: radius > 0 ? radius : undefined,
        ...NO_INSERT,
      });
      break;
    }
    case "ellipse":
      shape = new paper.Path.Ellipse({ center: [0, 0], radius: [leaf.rx, leaf.ry], ...NO_INSERT });
      break;
    case "polygon": {
      const pts = localOutline(leaf);
      if (pts.length < 3) return null;
      shape = new paper.Path({ segments: pts.map((p) => [p.x, p.y]), closed: true, ...NO_INSERT });
      break;
    }
    case "path": {
      if (leaf.points.length < (leaf.closed ? 3 : 2)) return null;
      const d = pathData(leaf.points, leaf.closed, leaf.smooth, leaf.tension);
      shape = new paper.Path({ pathData: d, ...NO_INSERT });
      break;
    }
  }
  shape.rotate(leaf.transform.rotation, new paper.Point(0, 0));
  shape.translate(new paper.Point(leaf.transform.x, leaf.transform.y));
  return shape;
}

function pathToD(p: paper.Path): string {
  const segs = p.segments;
  const n = segs.length;
  const first = segs[0];
  if (!first) return "";
  const pt = (q: paper.Point): string => `${round(q.x)} ${round(q.y)}`;
  const parts = [`M ${pt(first.point)}`];
  const count = p.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = segs[i]!;
    const b = segs[(i + 1) % n]!;
    if (a.handleOut.isZero() && b.handleIn.isZero()) {
      parts.push(`L ${pt(b.point)}`);
    } else {
      parts.push(`C ${pt(a.point.add(a.handleOut))} ${pt(b.point.add(b.handleIn))} ${pt(b.point)}`);
    }
  }
  if (p.closed) parts.push("Z");
  return parts.join(" ");
}

function shapeToD(s: Shape): string {
  if (s instanceof paper.CompoundPath) {
    return (s.children as paper.Path[]).map(pathToD).filter((d) => d !== "").join(" ");
  }
  return pathToD(s);
}

function absArea(s: Shape): number {
  return Math.abs(s.area);
}

function toBounds(s: Shape): Bounds {
  const b = s.bounds;
  return { minX: b.left, minY: b.top, maxX: b.right, maxY: b.bottom };
}

function sameStyle(a: Style, b: Style): boolean {
  return a.fill === b.fill && a.stroke === b.stroke && a.strokeWidth === b.strokeWidth && a.opacity === b.opacity;
}

function pushUnique(list: string[], id: string): void {
  if (!list.includes(id)) list.push(id);
}

interface Work {
  kind: "region" | "stroke";
  shape: Shape;
  style: Style;
  sourceIds: string[];
}

export function combineDocument(doc: Document): CombineResult {
  let currentId: string | null = null;
  try {
    ensureSetup();
    const work: Work[] = [];
    for (const node of doc.nodes) {
      if (!node.visible) continue;
      currentId = node.id;
      for (const leaf of expandNode(node)) {
        const open = leaf.kind === "path" && !leaf.closed;
        if (open) {
          if (node.role !== "add") continue;
          const shape = leafShape(leaf);
          if (shape) work.push({ kind: "stroke", shape, style: leaf.style, sourceIds: [node.id] });
          continue;
        }
        const shape = leafShape(leaf);
        if (!shape || absArea(shape) < 1e-9) continue;
        if (node.role === "add") {
          const last = work[work.length - 1];
          if (last && last.kind === "region" && sameStyle(last.style, leaf.style)) {
            last.shape = last.shape.unite(shape, NO_INSERT) as Shape;
            pushUnique(last.sourceIds, node.id);
          } else {
            work.push({ kind: "region", shape, style: leaf.style, sourceIds: [node.id] });
          }
        } else {
          for (const w of work) {
            if (w.kind !== "region" || !w.shape.bounds.intersects(shape.bounds)) continue;
            w.shape = w.shape.subtract(shape, NO_INSERT) as Shape;
          }
          for (let i = work.length - 1; i >= 0; i--) {
            const w = work[i]!;
            if (w.kind === "region" && (w.shape.isEmpty() || absArea(w.shape) < 1e-6)) work.splice(i, 1);
          }
        }
      }
    }
    const items: CombinedItem[] = work.map((w) => ({
      kind: w.kind,
      d: shapeToD(w.shape),
      style: w.style,
      bounds: toBounds(w.shape),
      area: w.kind === "region" ? absArea(w.shape) : 0,
      sourceIds: w.sourceIds,
    }));
    return { ok: true, items };
  } catch {
    return { ok: false, message: FAIL_MESSAGE, nodeId: currentId };
  }
}

/** True when at least one visible top-level shape has the subtract role. */
export function hasSubtract(doc: Document): boolean {
  return doc.nodes.some((n) => n.visible && n.role === "subtract");
}
