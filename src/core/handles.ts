import { localOutline, rotateVector, toWorld } from "./geometry";
import type { PathNode, PolygonNode, Point, SceneNode } from "./types";

export interface Handle {
  id: string;
  kind: "edge";
  index: number;
  pos: Point;
  normal: Point;
}

interface LocalEdge { pos: Point; normal: Point }

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function localEdges(node: SceneNode): LocalEdge[] {
  if (node.kind === "rect" || node.kind === "ellipse") {
    const w = node.kind === "rect" ? node.width : node.rx * 2;
    const h = node.kind === "rect" ? node.height : node.ry * 2;
    return [
      { pos: { x: 0, y: -h / 2 }, normal: { x: 0, y: -1 } },
      { pos: { x: w / 2, y: 0 }, normal: { x: 1, y: 0 } },
      { pos: { x: 0, y: h / 2 }, normal: { x: 0, y: 1 } },
      { pos: { x: -w / 2, y: 0 }, normal: { x: -1, y: 0 } },
    ];
  }
  const pts = localOutline(node);
  const n = pts.length;
  if (n < 2) return [];
  let cx = 0;
  let cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  const mean = { x: cx / n, y: cy / n };
  const edges: LocalEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    let normal = len === 0 ? { x: 0, y: -1 } : { x: dy / len, y: -dx / len };
    if (dot(normal, { x: mid.x - mean.x, y: mid.y - mean.y }) < 0) normal = { x: -normal.x, y: -normal.y };
    edges.push({ pos: mid, normal });
  }
  return edges;
}

export function getHandles(node: SceneNode): Handle[] {
  return localEdges(node).map((e, i) => ({
    id: `edge:${i}`,
    kind: "edge" as const,
    index: i,
    pos: toWorld(node, e.pos),
    normal: rotateVector(e.normal, node.transform.rotation),
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

export function polygonToPath(node: PolygonNode): PathNode {
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

export function moveHandle(node: SceneNode, handleId: string, target: Point, minSize: number): SceneNode {
  const handle = getHandles(node).find((h) => h.id === handleId);
  if (!handle) return node;
  if (node.kind === "polygon") return moveHandle(polygonToPath(node), handleId, target, minSize);
  const d = dot({ x: target.x - handle.pos.x, y: target.y - handle.pos.y }, handle.normal);

  if (node.kind === "path") {
    const n = node.points.length;
    const i = handle.index;
    const local = rotateVector(handle.normal, -node.transform.rotation);
    const j = (i + 1) % n;
    const points = node.points.map((p, k) =>
      k === i || k === j ? { ...p, x: p.x + local.x * d, y: p.y + local.y * d } : { ...p },
    );
    return { ...node, points, transform: { ...node.transform } };
  }

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

export function nudgeHandle(node: SceneNode, handleId: string, dir: Point, step: number, minSize: number): SceneNode {
  const handle = getHandles(node).find((h) => h.id === handleId);
  if (!handle) return node;
  return moveHandle(node, handleId, { x: handle.pos.x + dir.x * step, y: handle.pos.y + dir.y * step }, minSize);
}
