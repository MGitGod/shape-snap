import { toLocal } from "./geometry";
import {
  GRID_MAX, GRID_MIN,
  type Document, type GridSettings, type Guide, type NodeKind, type PathNode, type Point, type SceneNode, type Style,
} from "./types";

export const DEFAULT_STYLE: Style = { fill: "#1d2330", stroke: null, strokeWidth: 2, opacity: 1 };

const NAME_PREFIX: Record<NodeKind, string> = {
  rect: "四角",
  ellipse: "円",
  polygon: "多角形",
  path: "自由な形",
};

export function createDocument(): Document {
  return { version: 1, grid: { size: 20, visible: true, snap: true }, nodes: [] };
}

export function nextName(doc: Document, kind: NodeKind, base?: string): string {
  const prefix = base ?? NAME_PREFIX[kind];
  let max = 0;
  for (const n of doc.nodes) {
    if (base === undefined && n.kind !== kind) continue;
    if (!n.name.startsWith(prefix + " ")) continue;
    const num = Number(n.name.slice(prefix.length + 1));
    if (Number.isInteger(num) && num > max) max = num;
  }
  return `${prefix} ${max + 1}`;
}

export function createNode(
  doc: Document,
  kind: "rect" | "ellipse" | "polygon",
  at: Point,
  id?: string,
): SceneNode {
  const g = doc.grid.size;
  const base = {
    id: id ?? crypto.randomUUID(),
    name: nextName(doc, kind),
    visible: true,
    locked: false,
    role: "add" as const,
    transform: { x: at.x, y: at.y, rotation: 0 },
    style: { ...DEFAULT_STYLE },
  };
  switch (kind) {
    case "rect":
      return { ...base, kind, width: 4 * g, height: 4 * g, cornerRadius: 0 };
    case "ellipse":
      return { ...base, kind, rx: 2 * g, ry: 2 * g };
    case "polygon":
      return { ...base, kind, sides: 3, width: 4 * g, height: 4 * g, starRatio: 1 };
  }
}

export function addNode(doc: Document, node: SceneNode): Document {
  return { ...doc, nodes: [...doc.nodes, node] };
}

export function getNode(doc: Document, id: string): SceneNode | undefined {
  return doc.nodes.find((n) => n.id === id);
}

export function updateNode(doc: Document, id: string, fn: (n: SceneNode) => SceneNode): Document {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? fn(n) : n)) };
}

export function removeNodes(doc: Document, ids: string[]): Document {
  const set = new Set(ids);
  return { ...doc, nodes: doc.nodes.filter((n) => !set.has(n.id)) };
}

export function translateNodes(doc: Document, ids: string[], dx: number, dy: number): Document {
  const set = new Set(ids);
  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      set.has(n.id)
        ? { ...n, transform: { ...n.transform, x: n.transform.x + dx, y: n.transform.y + dy } }
        : n,
    ),
  };
}

export function reorderNode(doc: Document, id: string, dir: 1 | -1): Document {
  const i = doc.nodes.findIndex((n) => n.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= doc.nodes.length) return doc;
  const nodes = [...doc.nodes];
  const a = nodes[i] as SceneNode;
  const b = nodes[j] as SceneNode;
  nodes[i] = b;
  nodes[j] = a;
  return { ...doc, nodes };
}

export function duplicateNodes(
  doc: Document,
  ids: string[],
  dx: number,
  dy: number,
  makeId: () => string = () => crypto.randomUUID(),
): { doc: Document; newIds: string[] } {
  let next = doc;
  const newIds: string[] = [];
  for (const id of ids) {
    const src = getNode(doc, id);
    if (!src) continue;
    const newId = makeId();
    const copy: SceneNode = {
      ...structuredClone(src),
      id: newId,
      name: nextName(next, src.kind),
      transform: { ...src.transform, x: src.transform.x + dx, y: src.transform.y + dy },
    };
    next = addNode(next, copy);
    newIds.push(newId);
  }
  return { doc: next, newIds };
}

export function setGrid(doc: Document, patch: Partial<GridSettings>): Document {
  const grid = { ...doc.grid, ...patch };
  grid.size = Math.min(GRID_MAX, Math.max(GRID_MIN, grid.size));
  return { ...doc, grid };
}

export function addGuide(doc: Document, axis: "h" | "v", pos: number, id?: string): Document {
  const guides = doc.guides ?? [];
  if (guides.some((g) => g.axis === axis && g.pos === pos)) return doc;
  const guide: Guide = { id: id ?? crypto.randomUUID(), axis, pos };
  return { ...doc, guides: [...guides, guide] };
}

export function removeGuide(doc: Document, id: string): Document {
  const guides = doc.guides ?? [];
  if (!guides.some((g) => g.id === id)) return doc;
  return { ...doc, guides: guides.filter((g) => g.id !== id) };
}

export function clearGuides(doc: Document): Document {
  if ((doc.guides ?? []).length === 0) return doc;
  return { ...doc, guides: [] };
}

export function createPathFromPoints(doc: Document, worldPoints: Point[], closed: boolean, id?: string): PathNode {
  const xs = worldPoints.map((p) => p.x);
  const ys = worldPoints.map((p) => p.y);
  const cx = worldPoints.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  const cy = worldPoints.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
  return {
    id: id ?? crypto.randomUUID(),
    name: closed ? nextName(doc, "path") : nextName(doc, "path", "線"),
    visible: true,
    locked: false,
    role: "add",
    transform: { x: cx, y: cy, rotation: 0 },
    style: closed
      ? { ...DEFAULT_STYLE, fill: DEFAULT_STYLE.fill, stroke: null }
      : { ...DEFAULT_STYLE, fill: null, stroke: DEFAULT_STYLE.fill, strokeWidth: 4 },
    kind: "path",
    points: worldPoints.map((p) => ({ x: p.x - cx, y: p.y - cy, corner: false })),
    closed,
    smooth: false,
    tension: 0.5,
  };
}

export function insertPathPoint(node: PathNode, edgeIndex: number, world: Point): PathNode {
  const l = toLocal(node, world);
  const at = Math.min(Math.max(edgeIndex + 1, 0), node.points.length);
  const points = node.points.map((p) => ({ ...p }));
  points.splice(at, 0, { x: l.x, y: l.y, corner: false });
  return { ...node, points, transform: { ...node.transform } };
}

export function removePathPoint(node: PathNode, index: number): PathNode {
  const min = node.closed ? 3 : 2;
  if (node.points.length <= min || index < 0 || index >= node.points.length) return node;
  return {
    ...node,
    points: node.points.filter((_, i) => i !== index).map((p) => ({ ...p })),
    transform: { ...node.transform },
  };
}

export function setPathCorner(node: PathNode, index: number, corner: boolean): PathNode {
  return {
    ...node,
    points: node.points.map((p, i) => (i === index ? { ...p, corner } : { ...p })),
    transform: { ...node.transform },
  };
}
