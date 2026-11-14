import type { Bounds } from "./leafGeometry";
import { boundsOf, rotateVector, worldOutline } from "./leafGeometry";
import type { LeafNode, MirrorNode, Point, RepeatNode, SceneNode } from "./types";

function normDeg(r: number): number {
  const v = ((r % 360) + 360) % 360;
  return v === 0 ? 0 : v;
}

/** Scale a leaf's shape around its own center (the center does not move). */
export function scaleLeaf(node: LeafNode, f: number): LeafNode {
  switch (node.kind) {
    case "rect":
      return { ...node, width: node.width * f, height: node.height * f, cornerRadius: node.cornerRadius * f };
    case "ellipse":
      return { ...node, rx: node.rx * f, ry: node.ry * f };
    case "polygon":
      return { ...node, width: node.width * f, height: node.height * f };
    case "path":
      return { ...node, points: node.points.map((p) => ({ ...p, x: p.x * f, y: p.y * f })) };
  }
}

function moveLeaf(leaf: LeafNode, dx: number, dy: number): LeafNode {
  return { ...leaf, transform: { ...leaf.transform, x: leaf.transform.x + dx, y: leaf.transform.y + dy } };
}

function scaleLeafAbout(leaf: LeafNode, pivot: Point, f: number): LeafNode {
  const s = scaleLeaf(leaf, f);
  return {
    ...s,
    transform: {
      ...s.transform,
      x: pivot.x + (leaf.transform.x - pivot.x) * f,
      y: pivot.y + (leaf.transform.y - pivot.y) * f,
    },
  };
}

function rotateLeafAbout(leaf: LeafNode, pivot: Point, degrees: number): LeafNode {
  const v = rotateVector({ x: leaf.transform.x - pivot.x, y: leaf.transform.y - pivot.y }, degrees);
  return {
    ...leaf,
    transform: { x: pivot.x + v.x, y: pivot.y + v.y, rotation: normDeg(leaf.transform.rotation + degrees) },
  };
}

export function reflectLeaf(leaf: LeafNode, axis: "x" | "y", at: number): LeafNode {
  const t = leaf.transform;
  if (axis === "x") {
    const transform = { x: 2 * at - t.x, y: t.y, rotation: normDeg(-t.rotation) };
    if (leaf.kind === "path") return { ...leaf, transform, points: leaf.points.map((p) => ({ ...p, x: 0 - p.x })) };
    return { ...leaf, transform };
  }
  const y = 2 * at - t.y;
  if (leaf.kind === "path") {
    return {
      ...leaf,
      transform: { x: t.x, y, rotation: normDeg(-t.rotation) },
      points: leaf.points.map((p) => ({ ...p, y: 0 - p.y })),
    };
  }
  const rotation = leaf.kind === "polygon" ? normDeg(180 - t.rotation) : normDeg(-t.rotation);
  return { ...leaf, transform: { x: t.x, y, rotation } };
}

export function sourceLeaves(node: SceneNode): LeafNode[] {
  switch (node.kind) {
    case "group": return node.children.flatMap(sourceLeaves);
    case "repeat":
    case "mirror": return sourceLeaves(node.child);
    default: return [node];
  }
}

export function mapSourceLeaves(node: SceneNode, fn: (leaf: LeafNode) => LeafNode): SceneNode {
  switch (node.kind) {
    case "group": return { ...node, children: node.children.map((c) => mapSourceLeaves(c, fn)) };
    case "repeat":
    case "mirror": return { ...node, child: mapSourceLeaves(node.child, fn) };
    default: return fn(node);
  }
}

export function editableLeaf(node: SceneNode): LeafNode | null {
  switch (node.kind) {
    case "group": return null;
    case "repeat":
    case "mirror": return editableLeaf(node.child);
    default: return node;
  }
}

export function withEditableLeaf(node: SceneNode, fn: (leaf: LeafNode) => LeafNode): SceneNode {
  switch (node.kind) {
    case "group": return node;
    case "repeat":
    case "mirror": return { ...node, child: withEditableLeaf(node.child, fn) };
    default: return fn(node);
  }
}

export function sourceBounds(node: SceneNode): Bounds {
  const pts = sourceLeaves(node).flatMap((leaf) => worldOutline(leaf));
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return boundsOf(pts);
}

export function nodeCenter(node: SceneNode): Point {
  if (node.kind !== "group" && node.kind !== "repeat" && node.kind !== "mirror") {
    return { x: node.transform.x, y: node.transform.y };
  }
  const b = sourceBounds(node);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function translateNode(node: SceneNode, dx: number, dy: number): SceneNode {
  if (dx === 0 && dy === 0) return node;
  switch (node.kind) {
    case "group": return { ...node, children: node.children.map((c) => translateNode(c, dx, dy)) };
    case "repeat": return { ...node, child: translateNode(node.child, dx, dy) };
    case "mirror":
      return { ...node, child: translateNode(node.child, dx, dy), axisX: node.axisX + dx, axisY: node.axisY + dy };
    default: return moveLeaf(node, dx, dy);
  }
}

export function scaleNodeAbout(node: SceneNode, pivot: Point, f: number): SceneNode {
  switch (node.kind) {
    case "group": return { ...node, children: node.children.map((c) => scaleNodeAbout(c, pivot, f)) };
    case "repeat":
      return { ...node, child: scaleNodeAbout(node.child, pivot, f), dx: node.dx * f, dy: node.dy * f };
    case "mirror":
      return {
        ...node,
        child: scaleNodeAbout(node.child, pivot, f),
        axisX: pivot.x + (node.axisX - pivot.x) * f,
        axisY: pivot.y + (node.axisY - pivot.y) * f,
      };
    default: return scaleLeafAbout(node, pivot, f);
  }
}

export function rotateNodeAbout(node: SceneNode, pivot: Point, degrees: number): SceneNode {
  switch (node.kind) {
    case "group": return { ...node, children: node.children.map((c) => rotateNodeAbout(c, pivot, degrees)) };
    case "repeat": {
      const d = rotateVector({ x: node.dx, y: node.dy }, degrees);
      return { ...node, child: rotateNodeAbout(node.child, pivot, degrees), dx: d.x, dy: d.y };
    }
    case "mirror": {
      const a = rotateVector({ x: node.axisX - pivot.x, y: node.axisY - pivot.y }, degrees);
      return { ...node, child: rotateNodeAbout(node.child, pivot, degrees), axisX: pivot.x + a.x, axisY: pivot.y + a.y };
    }
    default: return rotateLeafAbout(node, pivot, degrees);
  }
}

/** `base#k`, bumping k when that id is already taken, so ids stay unique and deterministic. */
function copyId(base: string, k: number, taken: Set<string>): string {
  let n = k;
  while (taken.has(`${base}#${n}`)) n++;
  const id = `${base}#${n}`;
  taken.add(id);
  return id;
}

function expandRepeat(node: RepeatNode): LeafNode[] {
  const source = expandNode(node.child);
  const c = nodeCenter(node.child);
  const taken = new Set(source.map((l) => l.id));
  const out: LeafNode[] = [];
  for (let i = 0; i < node.count; i++) {
    const f = node.scaleStep ** i;
    for (const leaf of source) {
      let l = scaleLeafAbout(leaf, c, f);
      l = rotateLeafAbout(l, c, node.rotateStep * i);
      l = moveLeaf(l, node.dx * i, node.dy * i);
      out.push(i === 0 ? leaf : { ...l, id: copyId(leaf.id, i, taken) });
    }
  }
  return out;
}

function expandMirror(node: MirrorNode): LeafNode[] {
  const source = expandNode(node.child);
  const taken = new Set(source.map((l) => l.id));
  const out: LeafNode[] = [...source];
  const push = (k: number, make: (l: LeafNode) => LeafNode): void => {
    for (const leaf of source) out.push({ ...make(leaf), id: copyId(leaf.id, k, taken) });
  };
  const flipH = (l: LeafNode): LeafNode => reflectLeaf(l, "x", node.axisX);
  const flipV = (l: LeafNode): LeafNode => reflectLeaf(l, "y", node.axisY);
  switch (node.mode) {
    case "h": push(1, flipH); break;
    case "v": push(1, flipV); break;
    case "both":
      push(1, flipH);
      push(2, flipV);
      push(3, (l) => flipV(flipH(l)));
      break;
    case "rotate": {
      const pivot = { x: node.axisX, y: node.axisY };
      for (let k = 1; k < node.count; k++) push(k, (l) => rotateLeafAbout(l, pivot, (360 * k) / node.count));
      break;
    }
  }
  return out;
}

export function expandNode(node: SceneNode): LeafNode[] {
  switch (node.kind) {
    case "group": return node.children.flatMap(expandNode);
    case "repeat": return expandRepeat(node);
    case "mirror": return expandMirror(node);
    default: return [node];
  }
}

/** "Break apart": the expanded leaves with fresh ids and de-duplicated names. */
export function flattenNode(node: SceneNode, makeId: () => string): LeafNode[] {
  const seen = new Map<string, number>();
  return expandNode(node).map((leaf) => {
    const n = (seen.get(leaf.name) ?? 0) + 1;
    seen.set(leaf.name, n);
    return { ...leaf, id: makeId(), name: n === 1 ? leaf.name : `${leaf.name} ${n}` };
  });
}
