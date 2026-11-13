import {
  GRID_MAX, GRID_MIN,
  type Document, type GridSettings, type NodeKind, type Point, type SceneNode, type Style,
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

export function nextName(doc: Document, kind: NodeKind): string {
  const prefix = NAME_PREFIX[kind];
  let max = 0;
  for (const n of doc.nodes) {
    if (n.kind !== kind) continue;
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
      return { ...base, kind, sides: 3, radius: 2 * g, starRatio: 1 };
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
