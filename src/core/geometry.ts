import { samplePath } from "./curve";
import type { Anchor, Document, GridSettings, Point, SceneNode } from "./types";

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

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

export function rotateVector(v: Point, degrees: number): Point {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function toWorld(node: SceneNode, local: Point): Point {
  const r = rotateVector(local, node.transform.rotation);
  return { x: r.x + node.transform.x, y: r.y + node.transform.y };
}

export function toLocal(node: SceneNode, world: Point): Point {
  return rotateVector(
    { x: world.x - node.transform.x, y: world.y - node.transform.y },
    -node.transform.rotation,
  );
}

function clean(v: number): number {
  return Math.round(v * 1e12) / 1e12;
}

/** Regular polygon (or star) of radius 1, first point straight up. */
function unitPolygon(sides: number, starRatio: number): Point[] {
  const pts: Point[] = [];
  const star = starRatio < 1;
  const count = star ? sides * 2 : sides;
  const step = star ? Math.PI / sides : (2 * Math.PI) / sides;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + i * step;
    const rad = star && i % 2 === 1 ? starRatio : 1;
    pts.push({ x: clean(rad * Math.cos(a)), y: clean(rad * Math.sin(a)) });
  }
  return pts;
}

/** Width and height of the box around a polygon of the given radius (used to upgrade old files). */
export function polygonBoxForRadius(sides: number, starRatio: number, radius: number): { width: number; height: number } {
  const b = boundsOf(unitPolygon(sides, starRatio));
  return { width: (b.maxX - b.minX) * radius, height: (b.maxY - b.minY) * radius };
}

export function localOutline(node: SceneNode): Point[] {
  switch (node.kind) {
    case "rect": {
      const w = node.width / 2;
      const h = node.height / 2;
      return [
        { x: -w, y: -h },
        { x: w, y: -h },
        { x: w, y: h },
        { x: -w, y: h },
      ];
    }
    case "ellipse": {
      const pts: Point[] = [];
      for (let i = 0; i < 64; i++) {
        const a = (2 * Math.PI * i) / 64;
        pts.push({ x: node.rx * Math.cos(a), y: node.ry * Math.sin(a) });
      }
      return pts;
    }
    case "polygon": {
      const unit = unitPolygon(node.sides, node.starRatio);
      const b = boundsOf(unit);
      const bw = b.maxX - b.minX;
      const bh = b.maxY - b.minY;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      return unit.map((p) => ({
        x: bw > 0 ? ((p.x - cx) / bw) * node.width : 0,
        y: bh > 0 ? ((p.y - cy) / bh) * node.height : 0,
      }));
    }
    case "path":
      return samplePath(node.points, node.closed, node.smooth, node.tension);
  }
}

export function worldOutline(node: SceneNode): Point[] {
  return localOutline(node).map((p) => toWorld(node, p));
}

function boundsOf(points: Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function nodeBounds(node: SceneNode): Bounds {
  const pts = worldOutline(node);
  if (pts.length === 0) {
    return { minX: node.transform.x, minY: node.transform.y, maxX: node.transform.x, maxY: node.transform.y };
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

export function anchorPoint(node: SceneNode, anchor: Anchor): Point {
  if (anchor === "center" || anchor === "auto") return { x: node.transform.x, y: node.transform.y };
  const b = nodeBounds(node);
  switch (anchor) {
    case "tl": return { x: b.minX, y: b.minY };
    case "tr": return { x: b.maxX, y: b.minY };
    case "bl": return { x: b.minX, y: b.maxY };
    case "br": return { x: b.maxX, y: b.maxY };
  }
}

export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToPolygonEdge(p: Point, polygon: Point[], closed: boolean): number {
  const n = polygon.length;
  if (n === 0) return Infinity;
  if (n === 1) return Math.hypot(p.x - polygon[0]!.x, p.y - polygon[0]!.y);
  const segs = closed ? n : n - 1;
  let best = Infinity;
  for (let i = 0; i < segs; i++) {
    const d = distanceToSegment(p, polygon[i]!, polygon[(i + 1) % n]!);
    if (d < best) best = d;
  }
  return best;
}

export function hitTest(node: SceneNode, p: Point, tolerance: number): boolean {
  const outline = worldOutline(node);
  if (node.kind === "path" && !node.closed) {
    if (distanceToPolygonEdge(p, outline, false) <= Math.max(tolerance, node.style.strokeWidth / 2)) return true;
    return node.style.fill !== null && pointInPolygon(p, outline);
  }
  if (pointInPolygon(p, outline)) return true;
  return distanceToPolygonEdge(p, outline, true) <= tolerance;
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
