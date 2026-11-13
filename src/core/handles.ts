import { localOutline, rotateVector, snapValue, toLocal, toWorld } from "./geometry";
import type { PathNode, Point, SceneNode } from "./types";

export interface Handle {
  id: string;
  kind: "edge" | "corner" | "vertex";
  index: number;
  pos: Point;
  normal: Point;   // corner and vertex handles have {0,0}
}

interface LocalHandle { id: string; kind: Handle["kind"]; index: number; pos: Point; normal: Point }

const ZERO: Point = { x: 0, y: 0 };

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function localHandles(node: SceneNode): LocalHandle[] {
  if (node.kind === "rect" || node.kind === "ellipse") {
    const w = (node.kind === "rect" ? node.width : node.rx * 2) / 2;
    const h = (node.kind === "rect" ? node.height : node.ry * 2) / 2;
    const edges: Array<[Point, Point]> = [
      [{ x: 0, y: -h }, { x: 0, y: -1 }],
      [{ x: w, y: 0 }, { x: 1, y: 0 }],
      [{ x: 0, y: h }, { x: 0, y: 1 }],
      [{ x: -w, y: 0 }, { x: -1, y: 0 }],
    ];
    const corners: Point[] = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }];
    return [
      ...edges.map(([pos, normal], i) => ({ id: `edge:${i}`, kind: "edge" as const, index: i, pos, normal })),
      ...corners.map((pos, i) => ({ id: `corner:${i}`, kind: "corner" as const, index: i, pos, normal: ZERO })),
    ];
  }
  const pts = localOutline(node);
  const n = pts.length;
  if (n === 0) return [];
  let cx = 0;
  let cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  const mean = { x: cx / n, y: cy / n };
  const out: LocalHandle[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    out.push({ id: `vertex:${i}`, kind: "vertex", index: i, pos: { x: a.x, y: a.y }, normal: ZERO });
    if (n < 2) continue;
    const b = pts[(i + 1) % n]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    let normal = len === 0 ? { x: 0, y: -1 } : { x: dy / len, y: -dx / len };
    if (dot(normal, { x: mid.x - mean.x, y: mid.y - mean.y }) < 0) normal = { x: -normal.x, y: -normal.y };
    out.push({ id: `edge:${i}`, kind: "edge", index: i, pos: mid, normal });
  }
  return out;
}

export function getHandles(node: SceneNode): Handle[] {
  return localHandles(node).map((h) => ({
    id: h.id,
    kind: h.kind,
    index: h.index,
    pos: toWorld(node, h.pos),
    normal: h.kind === "edge" ? rotateVector(h.normal, node.transform.rotation) : { x: 0, y: 0 },
  }));
}

export function findHandleAt(node: SceneNode, p: Point, tolerance: number): Handle | null {
  let best: Handle | null = null;
  let bestD = Infinity;
  for (const h of getHandles(node)) {
    const d = Math.hypot(h.pos.x - p.x, h.pos.y - p.y);
    if (d <= tolerance && d < bestD) { best = h; bestD = d; }
  }
  return best;
}

export function nextHandleId(node: SceneNode, current: string | null): string | null {
  const hs = getHandles(node);
  if (hs.length === 0) return null;
  const i = current === null ? -1 : hs.findIndex((h) => h.id === current);
  return hs[(i + 1) % hs.length]!.id;
}

export function toPath(node: SceneNode): PathNode | null {
  if (node.kind !== "rect" && node.kind !== "polygon") return null;
  return {
    id: node.id,
    name: node.name,
    visible: node.visible,
    locked: node.locked,
    role: node.role,
    transform: { ...node.transform },
    style: { ...node.style },
    kind: "path",
    points: localOutline(node).map((p) => ({ x: p.x, y: p.y, corner: true })),
    closed: true,
    smooth: false,
    tension: 0.5,
  };
}

/** Old name for toPath. */
export const polygonToPath = toPath;

const CORNER_SIGN: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

function moveBoxCorner(
  node: SceneNode & { kind: "rect" | "ellipse" }, index: number, target: Point, minSize: number,
): SceneNode {
  const w = (node.kind === "rect" ? node.width : node.rx * 2) / 2;
  const h = (node.kind === "rect" ? node.height : node.ry * 2) / 2;
  const [sx, sy] = CORNER_SIGN[index]!;
  const o = { x: -sx * w, y: -sy * h };   // the opposite corner stays put
  const t = toLocal(node, target);
  const nx = o.x + sx * Math.max(sx * (t.x - o.x), minSize);
  const ny = o.y + sy * Math.max(sy * (t.y - o.y), minSize);
  const width = Math.abs(nx - o.x);
  const height = Math.abs(ny - o.y);
  const center = toWorld(node, { x: (o.x + nx) / 2, y: (o.y + ny) / 2 });
  const transform = { ...node.transform, x: center.x, y: center.y };
  return node.kind === "rect"
    ? { ...node, width, height, transform }
    : { ...node, rx: width / 2, ry: height / 2, transform };
}

export function moveHandle(
  node: SceneNode, handleId: string, target: Point, minSize: number, gridSize?: number,
): SceneNode {
  const handle = getHandles(node).find((h) => h.id === handleId);
  if (!handle) return node;
  if (node.kind === "polygon") return moveHandle(toPath(node)!, handleId, target, minSize, gridSize);

  if (node.kind === "path") {
    const n = node.points.length;
    const i = handle.index;
    if (handle.kind === "vertex") {
      const l = toLocal(node, target);
      const points = node.points.map((p, k) => (k === i ? { ...p, x: l.x, y: l.y } : { ...p }));
      return { ...node, points, transform: { ...node.transform } };
    }
    let dx = target.x - handle.pos.x;
    let dy = target.y - handle.pos.y;
    if (gridSize !== undefined) {
      dx = snapValue(dx, gridSize);
      dy = snapValue(dy, gridSize);
    }
    const local = rotateVector({ x: dx, y: dy }, -node.transform.rotation);
    const j = (i + 1) % n;
    const points = node.points.map((p, k) =>
      k === i || k === j ? { ...p, x: p.x + local.x, y: p.y + local.y } : { ...p },
    );
    return { ...node, points, transform: { ...node.transform } };
  }

  if (handle.kind === "corner") return moveBoxCorner(node, handle.index, target, minSize);

  const d = dot({ x: target.x - handle.pos.x, y: target.y - handle.pos.y }, handle.normal);
  const horizontal = handle.index === 1 || handle.index === 3;
  const current =
    node.kind === "rect" ? (horizontal ? node.width : node.height) : (horizontal ? node.rx : node.ry) * 2;
  const dd = Math.max(d, minSize - current);
  const transform = {
    ...node.transform,
    x: node.transform.x + (handle.normal.x * dd) / 2,
    y: node.transform.y + (handle.normal.y * dd) / 2,
  };
  if (node.kind === "rect") {
    return horizontal
      ? { ...node, width: node.width + dd, transform }
      : { ...node, height: node.height + dd, transform };
  }
  return horizontal ? { ...node, rx: node.rx + dd / 2, transform } : { ...node, ry: node.ry + dd / 2, transform };
}

/** The next grid line past `v` in direction `dir` (strictly beyond, with a small tolerance). */
export function nextGridLine(v: number, dir: number, step: number): number {
  return dir > 0 ? (Math.floor(v / step + 1e-6) + 1) * step : (Math.ceil(v / step - 1e-6) - 1) * step;
}

export function nudgeHandle(
  node: SceneNode, handleId: string, dir: Point, step: number, minSize: number, snap: boolean,
): SceneNode {
  const handle = getHandles(node).find((h) => h.id === handleId);
  if (!handle) return node;
  const target = snap
    ? {
        x: dir.x !== 0 ? nextGridLine(handle.pos.x, dir.x, step) : handle.pos.x,
        y: dir.y !== 0 ? nextGridLine(handle.pos.y, dir.y, step) : handle.pos.y,
      }
    : { x: handle.pos.x + dir.x * step, y: handle.pos.y + dir.y * step };
  return moveHandle(node, handleId, target, minSize);
}
