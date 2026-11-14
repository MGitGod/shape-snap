import { samplePath } from "./curve";
import type { LeafNode, Point } from "./types";

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export function rotateVector(v: Point, degrees: number): Point {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function toWorld(node: LeafNode, local: Point): Point {
  const r = rotateVector(local, node.transform.rotation);
  return { x: r.x + node.transform.x, y: r.y + node.transform.y };
}

export function toLocal(node: LeafNode, world: Point): Point {
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

export function localOutline(node: LeafNode): Point[] {
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

export function worldOutline(node: LeafNode): Point[] {
  return localOutline(node).map((p) => toWorld(node, p));
}

export function boundsOf(points: Point[]): Bounds {
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

export function distanceToSegment(p: Point, a: Point, b: Point): number {
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

/** Outline of a leaf as a point list, and whether it is a closed shape. */
export function leafOutline(node: LeafNode): { points: Point[]; closed: boolean } {
  return { points: worldOutline(node), closed: node.kind === "path" ? node.closed : true };
}

export function hitLeaf(node: LeafNode, p: Point, tolerance: number): boolean {
  const outline = worldOutline(node);
  if (node.kind === "path" && !node.closed) {
    if (distanceToPolygonEdge(p, outline, false) <= Math.max(tolerance, node.style.strokeWidth / 2)) return true;
    return node.style.fill !== null && pointInPolygon(p, outline);
  }
  if (pointInPolygon(p, outline)) return true;
  return distanceToPolygonEdge(p, outline, true) <= tolerance;
}
