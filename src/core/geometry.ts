import type { Bounds } from "./leafGeometry";
import { boundsOf, hitLeaf, leafOutline } from "./leafGeometry";
import { expandNode, nodeCenter, sourceBounds } from "./tree";
import type { Anchor, Document, GridSettings, Point, SceneNode } from "./types";

export type { Bounds } from "./leafGeometry";
export {
  boundsOf, distanceToPolygonEdge, localOutline, pointInPolygon, polygonBoxForRadius,
  rotateVector, toLocal, toWorld, worldOutline,
} from "./leafGeometry";

export function snapValue(v: number, size: number): number {
  return Math.round(v / size) * size;
}

export function snapPoint(p: Point, grid: GridSettings): Point {
  if (!grid.snap) return p;
  return { x: snapValue(p.x, grid.size), y: snapValue(p.y, grid.size) };
}

function snapAxis(v: number, axis: "h" | "v", doc: Document): number {
  const range = doc.grid.size / 2;
  let best = v;
  let bestDist = Infinity;
  if (doc.grid.snap) {
    best = snapValue(v, doc.grid.size);
    bestDist = Math.abs(best - v);
  }
  for (const g of doc.guides ?? []) {
    if (g.axis !== axis) continue;
    const d = Math.abs(g.pos - v);
    if (d <= range && d <= bestDist) {
      best = g.pos;
      bestDist = d;
    }
  }
  return best;
}

/** Snap to grid lines and guides; x uses vertical guides, y uses horizontal ones. */
export function snapPointToDoc(p: Point, doc: Document): Point {
  return { x: snapAxis(p.x, "v", doc), y: snapAxis(p.y, "h", doc) };
}

export function nodeBounds(node: SceneNode): Bounds {
  const pts = expandNode(node).flatMap((leaf) => leafOutline(leaf).points);
  if (pts.length === 0) {
    const c = nodeCenter(node);
    return { minX: c.x, minY: c.y, maxX: c.x, maxY: c.y };
  }
  return boundsOf(pts);
}

export function nodesBounds(nodes: SceneNode[]): Bounds | null {
  if (nodes.length === 0) return null;
  const all = nodes.map(nodeBounds);
  return {
    minX: Math.min(...all.map((b) => b.minX)),
    minY: Math.min(...all.map((b) => b.minY)),
    maxX: Math.max(...all.map((b) => b.maxX)),
    maxY: Math.max(...all.map((b) => b.maxY)),
  };
}

/** Outlines of every leaf the node expands to. */
export function worldOutlines(node: SceneNode): { points: Point[]; closed: boolean }[] {
  return expandNode(node).map(leafOutline);
}

/** Anchor positions use the source shapes only (copies are not counted). */
export function anchorPoint(node: SceneNode, anchor: Anchor): Point {
  if (anchor === "center" || anchor === "auto") return nodeCenter(node);
  const b = sourceBounds(node);
  switch (anchor) {
    case "tl": return { x: b.minX, y: b.minY };
    case "tr": return { x: b.maxX, y: b.minY };
    case "bl": return { x: b.minX, y: b.maxY };
    case "br": return { x: b.maxX, y: b.maxY };
  }
}

export function hitTest(node: SceneNode, p: Point, tolerance: number): boolean {
  return expandNode(node).some((leaf) => hitLeaf(leaf, p, tolerance));
}

export function hitStack(doc: Document, p: Point, tolerance: number, only?: string[]): string[] {
  const result: string[] = [];
  for (let i = doc.nodes.length - 1; i >= 0; i--) {
    const node = doc.nodes[i]!;
    if (!node.visible || node.locked) continue;
    if (only && !only.includes(node.id)) continue;
    if (hitTest(node, p, tolerance)) result.push(node.id);
  }
  return result;
}
