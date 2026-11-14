import { editableLeaf } from "../core/tree";
import { primaryNode, type EditorState } from "../editor/state";

export type ActionId =
  | "line" | "smooth" | "corner-point" | "confirm"
  | "place-rect" | "place-ellipse" | "place-polygon"
  | "prev-shape" | "next-shape" | "next-handle" | "multi-select" | "escape" | "cycle-focus"
  | "move-up" | "move-down" | "move-left" | "move-right" | "move-to-cursor"
  | "forward" | "backward" | "duplicate" | "delete" | "undo" | "redo"
  | "toggle-visible" | "toggle-locked" | "toggle-solo"
  | "fit-view" | "grid-finer" | "grid-coarser"
  | "scale-down" | "scale-up" | "rotate-mode" | "fill-none" | "to-path" | "guide-h" | "guide-v"
  | "group" | "ungroup" | "repeat" | "mirror"
  | "role" | "combine-view";

export interface KeyBinding {
  key: string;
  action: ActionId;
  label: string;
  group: "置く" | "選ぶ" | "動かす" | "編集" | "表示" | "見る";
  repeat: boolean;
}

const b = (
  key: string, action: ActionId, label: string, group: KeyBinding["group"], repeat = false,
): KeyBinding => ({ key, action, label, group, repeat });

export const DEFAULT_KEYMAP: KeyBinding[] = [
  b("l", "line", "線", "置く"),
  b("r", "place-rect", "四角を置く", "置く"),
  b("c", "place-ellipse", "円を置く", "置く"),
  b("p", "place-polygon", "多角形を置く", "置く"),
  b("q", "prev-shape", "前の図形を選ぶ", "選ぶ"),
  b("e", "next-shape", "次の図形を選ぶ", "選ぶ"),
  b("w", "next-handle", "次のつまみ", "選ぶ"),
  b("m", "multi-select", "複数選択", "選ぶ"),
  b("Escape", "escape", "選択・つかみを外す", "選ぶ"),
  b("Tab", "cycle-focus", "操作する場所を切り替える", "選ぶ"),
  b("ArrowUp", "move-up", "上へ", "動かす", true),
  b("ArrowDown", "move-down", "下へ", "動かす", true),
  b("ArrowLeft", "move-left", "左へ", "動かす", true),
  b("ArrowRight", "move-right", "右へ", "動かす", true),
  b(" ", "move-to-cursor", "カーソルの位置へ", "動かす"),
  b("f", "forward", "一つ手前へ", "編集"),
  b("b", "backward", "一つ奥へ", "編集"),
  b("d", "duplicate", "複製", "編集"),
  b("Delete", "delete", "消す", "編集"),
  b("Backspace", "delete", "消す", "編集"),
  b("z", "undo", "取り消す", "編集"),
  b("y", "redo", "やり直す", "編集"),
  b("h", "toggle-visible", "隠す・出す", "表示"),
  b("k", "toggle-locked", "ロック", "表示"),
  b("o", "toggle-solo", "ソロ", "表示"),
  b("0", "fit-view", "全体表示", "見る"),
  b("1", "grid-finer", "グリッドを細かく", "見る"),
  b("2", "grid-coarser", "グリッドを粗く", "見る"),
  b(",", "scale-down", "縮小", "編集", true),
  b(".", "scale-up", "拡大", "編集", true),
  b("v", "rotate-mode", "回転", "動かす"),
  b("n", "fill-none", "塗りなし", "編集"),
  b("j", "to-path", "自由な形に変える", "編集"),
  b("s", "smooth", "曲線", "編集"),
  b("/", "corner-point", "点を角にする", "編集"),
  b("g", "group", "グループ", "編集"),
  b("u", "ungroup", "解く・ばらす", "編集"),
  b("a", "repeat", "連続配置", "置く"),
  b("x", "mirror", "対称", "置く"),
  b("t", "role", "足す・抜く", "編集"),
  b("3", "combine-view", "結合を表示", "見る"),
  b("Enter", "confirm", "確定", "選ぶ"),
  b("-", "guide-h", "横のガイド", "見る"),
  b("i", "guide-v", "縦のガイド", "見る"),
];

/** Alias kept for existing callers: the built-in map. */
export const KEYMAP: KeyBinding[] = DEFAULT_KEYMAP;

/** Keys that can never be reassigned, nor given to another action. */
export const FIXED_KEYS: string[] = [
  "Escape", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Backspace", " ",
];

export function normalizeKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

const ASSIGNABLE = /^[a-z0-9,./\-;'[\]\\=`]$/;

export function isAssignableKey(key: string): boolean {
  return ASSIGNABLE.test(normalizeKey(key));
}

export type KeyOverrides = Partial<Record<ActionId, string>>;

export function findBindingIn(map: KeyBinding[], key: string): KeyBinding | undefined {
  const k = normalizeKey(key);
  return map.find((x) => x.key === k);
}

export function findBinding(key: string): KeyBinding | undefined {
  return findBindingIn(DEFAULT_KEYMAP, key);
}

/** The (first) key of an action; "" if the action is unknown. */
export function keyFor(map: KeyBinding[], action: ActionId): string {
  return map.find((x) => x.action === action)?.key ?? "";
}

function isFixedKey(key: string): boolean {
  return FIXED_KEYS.includes(key);
}

export function applyOverrides(defaults: KeyBinding[], overrides: KeyOverrides): KeyBinding[] {
  return defaults.map((b) => {
    const k = overrides[b.action];
    return k !== undefined && !isFixedKey(b.key) ? { ...b, key: k } : b;
  });
}

function dropDefaults(defaults: KeyBinding[], o: KeyOverrides): KeyOverrides {
  const out: KeyOverrides = {};
  for (const [a, k] of Object.entries(o) as [ActionId, string][]) {
    if (keyFor(defaults, a) !== k) out[a] = k;
  }
  return out;
}

export function sanitizeOverrides(defaults: KeyBinding[], raw: unknown): KeyOverrides {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  let out: KeyOverrides = {};
  for (const [a, k] of Object.entries(raw as Record<string, unknown>)) {
    const def = defaults.find((x) => x.action === a);
    if (!def || isFixedKey(def.key) || typeof k !== "string" || !isAssignableKey(k)) continue;
    out[def.action] = normalizeKey(k);
  }
  out = dropDefaults(defaults, out);
  // drop every override that collides with another action's key, until none is left
  for (;;) {
    const map = applyOverrides(defaults, out);
    const count = new Map<string, number>();
    for (const b of map) count.set(b.key, (count.get(b.key) ?? 0) + 1);
    const next: KeyOverrides = {};
    for (const [a, k] of Object.entries(out) as [ActionId, string][]) {
      if ((count.get(k) ?? 0) <= 1) next[a] = k;
    }
    if (Object.keys(next).length === Object.keys(out).length) return out;
    out = next;
  }
}

export interface RebindResult { overrides: KeyOverrides; swappedWith: ActionId | null; error: string | null }

export function rebind(defaults: KeyBinding[], overrides: KeyOverrides, action: ActionId, key: string): RebindResult {
  const fail = (error: string): RebindResult => ({ overrides, swappedWith: null, error });
  const def = defaults.find((x) => x.action === action);
  if (!def) return fail("このキーは使えません");
  if (isFixedKey(def.key)) return fail("このキーは変えられません");
  if (!isAssignableKey(key)) return fail("このキーは使えません");
  const k = normalizeKey(key);
  const map = applyOverrides(defaults, overrides);
  const current = keyFor(map, action);
  if (current === k) return { overrides, swappedWith: null, error: null };
  const other = map.find((x) => x.key === k && x.action !== action);
  const next: KeyOverrides = { ...overrides, [action]: k };
  if (other) next[other.action] = current;
  return { overrides: dropDefaults(defaults, next), swappedWith: other ? other.action : null, error: null };
}

const LABELS: Record<string, string> = {
  " ": "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
};

export function keyLabel(key: string): string {
  const named = LABELS[key];
  if (named !== undefined) return named;
  return key.length === 1 ? key.toUpperCase() : key;
}

/** Replace `{{action-id}}` tokens with the live key label; unknown ids are left as they are. */
export function resolveKeys(text: string, map: KeyBinding[]): string {
  return text.replace(/\{\{([a-z-]+)\}\}/g, (whole, id: string) => {
    const key = keyFor(map, id as ActionId);
    return key === "" ? whole : keyLabel(key);
  });
}

export interface Hint { keys: string; label: string }

const h = (keys: string, label: string): Hint => ({ keys, label });

type Keys = (action: ActionId) => string;

function drawingHints(s: EditorState, k: Keys): Hint[] {
  const start = s.drawing && s.drawing.points.length === 0 ? [h("グリッド点をクリック", "線を始める")] : [];
  return [
    ...start,
    h(`クリック / ${k("move-to-cursor")}`, "点を足す"),
    h(k("confirm"), "確定"),
    h("最初の点をクリック", "閉じて確定"),
    h("右クリック / Backspace", "一つ戻す"),
    h(k("escape"), "やめる"),
  ];
}

function baseHints(s: EditorState, k: Keys): Hint[] {
  if (s.drawing) return drawingHints(s, k);
  if (s.rotateMode) {
    return [h("← →", "15°ずつ回す"), h("↑ ↓", "1°ずつ回す"), h(`${k("rotate-mode")} / ${k("escape")}`, "回転を終える")];
  }
  if (s.heldHandle !== null) {
    const node = primaryNode(s);
    const extra: Hint[] = [];
    const leaf = node ? editableLeaf(node) : null;
    if (leaf && s.heldHandle.startsWith("edge:") && (leaf.kind === "path" || leaf.kind === "polygon" || leaf.kind === "rect")) {
      extra.push(h(k("confirm"), "点を足す"));
    }
    if (leaf && leaf.kind === "path" && s.heldHandle.startsWith("vertex:")) {
      if (leaf.smooth) extra.push(h(k("corner-point"), "角にする・丸める"));
      extra.push(h(k("delete"), "点を消す"));
    }
    if (s.heldHandle === "axis:0") {
      return [h("クリック / 矢印", "軸を動かす"), h(k("next-handle"), "次のつまみ"), h(`右クリック / ${k("escape")}`, "つかむのをやめる")];
    }
    return [
      h(`クリック / 矢印 / ${k("move-to-cursor")}`, "つまみを動かす"),
      h(k("next-handle"), "次のつまみ"),
      ...extra,
      h(`右クリック / ${k("escape")}`, "つかむのをやめる"),
    ];
  }
  if (s.multiSelect) {
    return [
      h("クリック", "足す・外す"), h(k("multi-select"), "複数選択を終える"), h("矢印", "動かす"),
      h(k("group"), "グループ"),
      h("設定", "揃える・間隔"),
    ];
  }
  if (s.selection.length > 0) {
    const main = primaryNode(s);
    const isContainer = main !== undefined && (main.kind === "group" || main.kind === "repeat" || main.kind === "mirror");
    return [
      h("つまみをクリック", "つかむ"),
      ...(main && editableLeaf(main)?.kind === "path" ? [h(k("smooth"), "曲線・直線")] : []),
      ...(isContainer ? [h(k("ungroup"), "解く・ばらす")] : []),
      h(k("repeat"), "連続配置"),
      h(k("mirror"), "対称"),
      h(k("role"), "足す・抜く"),
      h(`何もない点をクリック / ${k("move-to-cursor")} / 矢印`, "動かす"),
      h(k("next-handle"), "つまみ"),
      h(k("rotate-mode"), "回転"),
      h(`${k("scale-down")} ${k("scale-up")}`, "縮小・拡大"),
      h(k("duplicate"), "複製"),
      h(k("delete"), "消す"),
      h(`右クリック / ${k("escape")}`, "選択を外す"),
    ];
  }
  return [
    h(k("place-rect"), "四角"),
    h(k("place-ellipse"), "円"),
    h(k("place-polygon"), "多角形"),
    h(k("line"), "線"),
    h(`図形をクリック / ${k("prev-shape")} / ${k("next-shape")}`, "選ぶ"),
    h("ホイール", "拡大縮小"),
    h("矢印", "表示を動かす"),
  ];
}

export function hintsFor(s: EditorState, map: KeyBinding[] = DEFAULT_KEYMAP): Hint[] {
  const k: Keys = (action) => keyLabel(keyFor(map, action));
  const base = baseHints(s, k);
  const hints = s.combineView ? [h(k("combine-view"), "結合の表示を終える"), ...base] : base;
  return s.notice ? [{ keys: "", label: resolveKeys(s.notice, map) }, ...hints] : hints;
}
