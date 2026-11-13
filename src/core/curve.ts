import type { PathPoint, Point } from "./types";

export interface CubicSegment { p0: Point; c1: Point; c2: Point; p1: Point }

/** Round to 3 decimals and normalize -0 (shared with render/svg.ts). */
export function round(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
}

export function pathSegments(
  points: PathPoint[], closed: boolean, smooth: boolean, tension: number,
): CubicSegment[] {
  const n = points.length;
  if (n < 2) return [];
  const count = closed ? n : n - 1;
  const at = (i: number): PathPoint => {
    if (closed) return points[((i % n) + n) % n]!;
    return points[Math.min(n - 1, Math.max(0, i))]!;
  };
  const out: CubicSegment[] = [];
  for (let i = 0; i < count; i++) {
    const P0 = at(i - 1);
    const P1 = at(i);
    const P2 = at(i + 1);
    const P3 = at(i + 2);
    const a: Point = { x: P1.x, y: P1.y };
    const b: Point = { x: P2.x, y: P2.y };
    let c1 = a;
    let c2 = b;
    if (smooth) {
      if (!P1.corner) {
        c1 = { x: P1.x + ((P2.x - P0.x) * tension) / 3, y: P1.y + ((P2.y - P0.y) * tension) / 3 };
      }
      if (!P2.corner) {
        c2 = { x: P2.x - ((P3.x - P1.x) * tension) / 3, y: P2.y - ((P3.y - P1.y) * tension) / 3 };
      }
    }
    out.push({ p0: a, c1, c2, p1: b });
  }
  return out;
}

function isStraight(s: CubicSegment): boolean {
  return s.c1.x === s.p0.x && s.c1.y === s.p0.y && s.c2.x === s.p1.x && s.c2.y === s.p1.y;
}

export function samplePath(
  points: PathPoint[], closed: boolean, smooth: boolean, tension: number, perSegment = 12,
): Point[] {
  const segs = pathSegments(points, closed, smooth, tension);
  const out: Point[] = [];
  for (const s of segs) {
    if (isStraight(s)) {
      out.push({ x: s.p0.x, y: s.p0.y });
      continue;
    }
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment;
      const u = 1 - t;
      const w0 = u * u * u;
      const w1 = 3 * u * u * t;
      const w2 = 3 * u * t * t;
      const w3 = t * t * t;
      out.push({
        x: w0 * s.p0.x + w1 * s.c1.x + w2 * s.c2.x + w3 * s.p1.x,
        y: w0 * s.p0.y + w1 * s.c1.y + w2 * s.c2.y + w3 * s.p1.y,
      });
    }
  }
  if (!closed && segs.length > 0) {
    const last = segs[segs.length - 1]!;
    out.push({ x: last.p1.x, y: last.p1.y });
  }
  return out;
}

export function pathData(
  points: PathPoint[], closed: boolean, smooth: boolean, tension: number,
): string {
  const segs = pathSegments(points, closed, smooth, tension);
  const first = segs[0];
  if (!first) return "";
  const parts = [`M ${round(first.p0.x)} ${round(first.p0.y)}`];
  for (const s of segs) {
    if (isStraight(s)) {
      parts.push(`L ${round(s.p1.x)} ${round(s.p1.y)}`);
    } else {
      parts.push(
        `C ${round(s.c1.x)} ${round(s.c1.y)} ${round(s.c2.x)} ${round(s.c2.y)} ${round(s.p1.x)} ${round(s.p1.y)}`,
      );
    }
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}
