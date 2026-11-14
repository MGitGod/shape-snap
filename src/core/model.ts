import { snapValue, toLocal } from "./geometry";
import { flattenNode, sourceBounds, translateNode } from "./tree";
import {
  GRID_MAX, GRID_MIN,
  type Document, type GridSettings, type Guide, type LeafNode, type NodeKind, type PathNode, type Point, type Role, type SceneNode, type Style,
} from "./types";

export const DEFAULT_STYLE: Style = { fill: "#1d2330", stroke: null, strokeWidth: 2, opacity: 1 };

const NAME_PREFIX: Record<NodeKind, string> = {
  rect: "四角",
  ellipse: "円",
  polygon: "多角形",
  path: "自由な形",
  group: "グループ",
  repeat: "連続配置",
  mirror: "対称",
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
): LeafNode {
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
  return { ...doc, nodes: doc.nodes.map((n) => (set.has(n.id) ? translateNode(n, dx, dy) : n)) };
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

/** Give every node inside a container a fresh id (the node itself keeps its id; the caller sets it). */
function reid(node: SceneNode, makeId: () => string): SceneNode {
  switch (node.kind) {
    case "group": return { ...node, children: node.children.map((c) => reid({ ...c, id: makeId() }, makeId)) };
    case "repeat":
    case "mirror": return { ...node, child: reid({ ...node.child, id: makeId() }, makeId) };
    default: return node;
  }
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
    const fresh = reid(structuredClone(src), makeId);
    const copy: SceneNode = translateNode({ ...fresh, id: newId, name: nextName(next, src.kind) }, dx, dy);
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

export function groupNodes(doc: Document, ids: string[], id?: string): { doc: Document; id: string | null } {
  const set = new Set(ids);
  const members = doc.nodes.filter((n) => set.has(n.id));
  if (members.length < 2) return { doc, id: null };
  const front = members[members.length - 1]!;
  const groupId = id ?? crypto.randomUUID();
  const group: SceneNode = {
    id: groupId,
    name: nextName(doc, "group"),
    visible: front.visible,
    locked: front.locked,
    role: front.role,
    kind: "group",
    children: members,
  };
  const nodes: SceneNode[] = [];
  for (const n of doc.nodes) {
    if (n === front) nodes.push(group);
    else if (!set.has(n.id)) nodes.push(n);
  }
  return { doc: { ...doc, nodes }, id: groupId };
}

export function ungroupNode(
  doc: Document,
  id: string,
  makeId: () => string = () => crypto.randomUUID(),
): { doc: Document; ids: string[] } {
  const i = doc.nodes.findIndex((n) => n.id === id);
  const node = doc.nodes[i];
  if (!node || node.kind === "rect" || node.kind === "ellipse" || node.kind === "polygon" || node.kind === "path") {
    return { doc, ids: [] };
  }
  const parts: SceneNode[] = node.kind === "group" ? node.children : flattenNode(node, makeId);
  const nodes = [...doc.nodes.slice(0, i), ...parts, ...doc.nodes.slice(i + 1)];
  return { doc: { ...doc, nodes }, ids: parts.map((p) => p.id) };
}

function wrap(
  doc: Document,
  id: string,
  kind: "repeat" | "mirror",
  wrapperId: string | undefined,
  make: (node: SceneNode, common: { id: string; name: string; visible: boolean; locked: boolean; role: SceneNode["role"] }) => SceneNode,
): { doc: Document; id: string | null } {
  const i = doc.nodes.findIndex((n) => n.id === id);
  const node = doc.nodes[i];
  if (!node) return { doc, id: null };
  const newId = wrapperId ?? crypto.randomUUID();
  const wrapper = make(node, {
    id: newId,
    name: nextName(doc, kind),
    visible: node.visible,
    locked: node.locked,
    role: node.role,
  });
  return { doc: { ...doc, nodes: doc.nodes.map((n, k) => (k === i ? wrapper : n)) }, id: newId };
}

export function wrapRepeat(doc: Document, id: string, wrapperId?: string): { doc: Document; id: string | null } {
  const g = doc.grid.size;
  return wrap(doc, id, "repeat", wrapperId, (node, common) => {
    const b = sourceBounds(node);
    const width = b.maxX - b.minX;
    return {
      ...common, kind: "repeat", child: node, count: 5,
      dx: width > 0 ? snapValue(width, g) + g : 2 * g, dy: 0, scaleStep: 1, rotateStep: 0,
    };
  });
}

export function wrapMirror(doc: Document, id: string, wrapperId?: string): { doc: Document; id: string | null } {
  const g = doc.grid.size;
  return wrap(doc, id, "mirror", wrapperId, (node, common) => {
    const b = sourceBounds(node);
    return {
      ...common, kind: "mirror", child: node, mode: "h", count: 6,
      axisX: snapValue(b.maxX, g) + g, axisY: snapValue((b.minY + b.maxY) / 2, g),
    };
  });
}

/** Give the listed top-level shapes the add or subtract role. */
export function setRole(doc: Document, ids: string[], role: Role): Document {
  const set = new Set(ids);
  return { ...doc, nodes: doc.nodes.map((n) => (set.has(n.id) && n.role !== role ? { ...n, role } : n)) };
}
