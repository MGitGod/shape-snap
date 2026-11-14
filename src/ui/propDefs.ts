import { editableLeaf, withEditableLeaf } from "../core/tree";
import type { GridSettings, LeafNode, SceneNode } from "../core/types";

export interface PropDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get: (n: SceneNode) => number;
  set: (n: SceneNode, v: number) => Partial<SceneNode>;
}

type LeafProp = Omit<PropDef, "get" | "set"> & { get: (n: LeafNode) => number; set: (n: LeafNode, v: number) => Partial<LeafNode> };

const transformDef = (key: "x" | "y" | "rotation", label: string, min: number, max: number, step: number): LeafProp => ({
  key, label, min, max, step,
  get: (n) => n.transform[key],
  set: (n, v) => ({ transform: { ...n.transform, [key]: v } }),
});

const styleDef = (key: "strokeWidth" | "opacity", label: string, min: number, max: number, step: number): LeafProp => ({
  key, label, min, max, step,
  get: (n) => n.style[key],
  set: (n, v) => ({ style: { ...n.style, [key]: v } }),
});

const fieldDef = (key: string, label: string, min: number, max: number, step: number): LeafProp => ({
  key, label, min, max, step,
  get: (n) => (n as unknown as Record<string, number>)[key] ?? 0,
  set: (_n, v) => ({ [key]: v }) as Partial<LeafNode>,
});

function leafDefs(node: LeafNode, grid: GridSettings, withPosition: boolean): LeafProp[] {
  const g = grid.size;
  const half = g / 2;
  const defs: LeafProp[] = withPosition
    ? [transformDef("x", "横の位置", -2000, 2000, g), transformDef("y", "縦の位置", -2000, 2000, g)]
    : [];
  switch (node.kind) {
    case "rect":
      defs.push(
        fieldDef("width", "幅", g, 2000, g),
        fieldDef("height", "高さ", g, 2000, g),
        fieldDef("cornerRadius", "角の丸み", 0, Math.min(node.width, node.height) / 2, 1),
      );
      break;
    case "ellipse":
      defs.push(fieldDef("rx", "横の半径", half, 1000, half), fieldDef("ry", "縦の半径", half, 1000, half));
      break;
    case "polygon":
      defs.push(
        fieldDef("sides", "辺の数", 3, 12, 1),
        fieldDef("width", "幅", g, 2000, g),
        fieldDef("height", "高さ", g, 2000, g),
        fieldDef("starRatio", "星形の割合", 0.1, 1, 0.05),
      );
      break;
    case "path":
      if (node.smooth) defs.push(fieldDef("tension", "丸みの強さ", 0, 1, 0.05));
      break;
  }
  const openPath = node.kind === "path" && !node.closed;
  defs.push(
    transformDef("rotation", "回転", 0, 359, 15),
    styleDef("strokeWidth", "線の太さ", openPath ? 1 : 0, 40, 1),
    styleDef("opacity", "不透明度", 0, 1, 0.05),
  );
  return defs;
}

const containerDef = (key: string, label: string, min: number, max: number, step: number): PropDef => ({
  key, label, min, max, step,
  get: (n) => (n as unknown as Record<string, number>)[key] ?? 0,
  set: (_n, v) => ({ [key]: v }) as Partial<SceneNode>,
});

/** A leaf property shown on a container: reads and writes the editable leaf inside it. */
function throughContainer(def: LeafProp): PropDef {
  return {
    key: def.key, label: def.label, min: def.min, max: def.max, step: def.step,
    get: (n) => {
      const leaf = editableLeaf(n);
      return leaf ? def.get(leaf) : 0;
    },
    set: (n, v) => {
      const next = withEditableLeaf(n, (leaf) => ({ ...leaf, ...def.set(leaf, v) }) as LeafNode);
      return (next.kind === "repeat" || next.kind === "mirror" ? { child: next.child } : {}) as Partial<SceneNode>;
    },
  };
}

export function propDefsFor(node: SceneNode, grid: GridSettings): PropDef[] {
  const g = grid.size;
  if (node.kind === "group") return [];
  if (node.kind === "rect" || node.kind === "ellipse" || node.kind === "polygon" || node.kind === "path") {
    return leafDefs(node, grid, true) as unknown as PropDef[];
  }
  const own: PropDef[] =
    node.kind === "repeat"
      ? [
          containerDef("count", "個数", 2, 50, 1),
          containerDef("dx", "横の間隔", -2000, 2000, g),
          containerDef("dy", "縦の間隔", -2000, 2000, g),
          containerDef("scaleStep", "大きさの変化", 0.5, 1.5, 0.05),
          containerDef("rotateStep", "回転の増分", -180, 180, 15),
        ]
      : [
          ...(node.mode === "rotate" ? [containerDef("count", "回転の数", 2, 36, 1)] : []),
          containerDef("axisX", "軸の横の位置", -2000, 2000, g),
          containerDef("axisY", "軸の縦の位置", -2000, 2000, g),
        ];
  const leaf = editableLeaf(node);
  return leaf ? [...own, ...leafDefs(leaf, grid, false).map(throughContainer)] : own;
}

export function clampToDef(def: PropDef, v: number): number {
  return Math.min(def.max, Math.max(def.min, v));
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r1, g1, b1] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = lig - c / 2;
  const to = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}
