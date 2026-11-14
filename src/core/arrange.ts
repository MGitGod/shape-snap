import type { Bounds } from "./geometry";
import { DEFAULT_STYLE } from "./model";
import { mapSourceLeaves, scaleLeaf, sourceBounds, translateNode } from "./tree";
import type { Document, LeafNode, SceneNode } from "./types";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

function shift(node: SceneNode, dx: number, dy: number): SceneNode {
  return translateNode(node, dx, dy);
}

function unionBounds(nodes: SceneNode[]): Bounds {
  const all = nodes.map(sourceBounds);
  return {
    minX: Math.min(...all.map((b) => b.minX)),
    minY: Math.min(...all.map((b) => b.minY)),
    maxX: Math.max(...all.map((b) => b.maxX)),
    maxY: Math.max(...all.map((b) => b.maxY)),
  };
}

function pick(doc: Document, ids: string[]): SceneNode[] {
  const set = new Set(ids);
  return doc.nodes.filter((n) => set.has(n.id));
}

export function alignNodes(doc: Document, ids: string[], mode: AlignMode): Document {
  const picked = pick(doc, ids);
  if (picked.length < 2) return doc;
  const box = unionBounds(picked);
  const moves = new Map<string, SceneNode>();
  for (const n of picked) {
    if (n.locked) continue;
    const b = sourceBounds(n);
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case "left": dx = box.minX - b.minX; break;
      case "right": dx = box.maxX - b.maxX; break;
      case "hcenter": dx = (box.minX + box.maxX) / 2 - (b.minX + b.maxX) / 2; break;
      case "top": dy = box.minY - b.minY; break;
      case "bottom": dy = box.maxY - b.maxY; break;
      case "vcenter": dy = (box.minY + box.maxY) / 2 - (b.minY + b.maxY) / 2; break;
    }
    moves.set(n.id, shift(n, dx, dy));
  }
  return { ...doc, nodes: doc.nodes.map((n) => moves.get(n.id) ?? n) };
}

function span(n: SceneNode, axis: "x" | "y"): { min: number; max: number } {
  const b = sourceBounds(n);
  return axis === "x" ? { min: b.minX, max: b.maxX } : { min: b.minY, max: b.maxY };
}

function sortedByMin(doc: Document, ids: string[], axis: "x" | "y"): SceneNode[] {
  return pick(doc, ids).sort((a, b) => span(a, axis).min - span(b, axis).min);
}

export function averageGap(doc: Document, ids: string[], axis: "x" | "y"): number | null {
  const list = sortedByMin(doc, ids, axis);
  if (list.length < 2) return null;
  const first = span(list[0]!, axis);
  const last = span(list[list.length - 1]!, axis);
  const total = list.reduce((sum, n) => {
    const s = span(n, axis);
    return sum + (s.max - s.min);
  }, 0);
  return (last.max - first.min - total) / (list.length - 1);
}

export function distributeNodes(doc: Document, ids: string[], axis: "x" | "y", gap: number | null): Document {
  const list = sortedByMin(doc, ids, axis);
  if (list.length < 2) return doc;
  const g = gap ?? averageGap(doc, ids, axis)!;
  const moves = new Map<string, SceneNode>();
  let cursor = span(list[0]!, axis).max;
  for (let i = 1; i < list.length; i++) {
    const n = list[i]!;
    const s = span(n, axis);
    const target = cursor + g;
    const delta = target - s.min;
    if (n.locked) {
      cursor = s.max;
    } else {
      moves.set(n.id, axis === "x" ? shift(n, delta, 0) : shift(n, 0, delta));
      cursor = s.max + delta;
    }
  }
  return { ...doc, nodes: doc.nodes.map((n) => moves.get(n.id) ?? n) };
}

/** Scale one leaf shape around its own center. Containers go through scaleNodeAbout. */
export function scaleNode(node: LeafNode, f: number): LeafNode {
  return scaleLeaf(node, f);
}

export function scaleStepFactor(node: SceneNode, dir: 1 | -1, gridSize: number): number {
  const b = sourceBounds(node);
  const L = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const next = L + dir * gridSize;
  if (L <= 0 || next < gridSize) return 1;
  return next / L;
}

export function toggleLeafFillNone(node: LeafNode): LeafNode {
  const st = node.style;
  if (st.fill !== null) {
    return {
      ...node,
      style: {
        ...st,
        fill: null,
        stroke: st.stroke ?? st.fill,
        strokeWidth: st.stroke === null ? Math.max(st.strokeWidth, 2) : st.strokeWidth,
      },
    };
  }
  return { ...node, style: { ...st, fill: st.stroke ?? DEFAULT_STYLE.fill } };
}

/** Leaves toggle directly; containers apply it to every source leaf. */
export function toggleFillNone(node: SceneNode): SceneNode {
  return mapSourceLeaves(node, toggleLeafFillNone);
}
