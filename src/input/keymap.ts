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

export const KEYMAP: KeyBinding[] = [
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

export function findBinding(key: string): KeyBinding | undefined {
  const k = key.length === 1 ? key.toLowerCase() : key;
  return KEYMAP.find((x) => x.key === k);
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

export interface Hint { keys: string; label: string }

const h = (keys: string, label: string): Hint => ({ keys, label });

function drawingHints(s: EditorState): Hint[] {
  const start = s.drawing && s.drawing.points.length === 0 ? [h("グリッド点をクリック", "線を始める")] : [];
  return [
    ...start,
    h("クリック / Space", "点を足す"),
    h("Enter", "確定"),
    h("最初の点をクリック", "閉じて確定"),
    h("右クリック / Backspace", "一つ戻す"),
    h("Esc", "やめる"),
  ];
}

function baseHints(s: EditorState): Hint[] {
  if (s.drawing) return drawingHints(s);
  if (s.rotateMode) {
    return [h("← →", "15°ずつ回す"), h("↑ ↓", "1°ずつ回す"), h("V / Esc", "回転を終える")];
  }
  if (s.heldHandle !== null) {
    const node = primaryNode(s);
    const extra: Hint[] = [];
    const leaf = node ? editableLeaf(node) : null;
    if (leaf && s.heldHandle.startsWith("edge:") && (leaf.kind === "path" || leaf.kind === "polygon" || leaf.kind === "rect")) {
      extra.push(h("Enter", "点を足す"));
    }
    if (leaf && leaf.kind === "path" && s.heldHandle.startsWith("vertex:")) {
      if (leaf.smooth) extra.push(h("/", "角にする・丸める"));
      extra.push(h("Delete", "点を消す"));
    }
    if (s.heldHandle === "axis:0") {
      return [h("クリック / 矢印", "軸を動かす"), h("W", "次のつまみ"), h("右クリック / Esc", "つかむのをやめる")];
    }
    return [
      h("クリック / 矢印 / Space", "つまみを動かす"),
      h("W", "次のつまみ"),
      ...extra,
      h("右クリック / Esc", "つかむのをやめる"),
    ];
  }
  if (s.multiSelect) {
    return [
      h("クリック", "足す・外す"), h("M", "複数選択を終える"), h("矢印", "動かす"),
      h("G", "グループ"),
      h("設定", "揃える・間隔"),
    ];
  }
  if (s.selection.length > 0) {
    const main = primaryNode(s);
    const isContainer = main !== undefined && (main.kind === "group" || main.kind === "repeat" || main.kind === "mirror");
    return [
      h("つまみをクリック", "つかむ"),
      ...(main && editableLeaf(main)?.kind === "path" ? [h("S", "曲線・直線")] : []),
      ...(isContainer ? [h("U", "解く・ばらす")] : []),
      h("A", "連続配置"),
      h("X", "対称"),
      h("T", "足す・抜く"),
      h("何もない点をクリック / Space / 矢印", "動かす"),
      h("W", "つまみ"),
      h("V", "回転"),
      h(", .", "縮小・拡大"),
      h("D", "複製"),
      h("Delete", "消す"),
      h("右クリック / Esc", "選択を外す"),
    ];
  }
  return [
    h("R", "四角"),
    h("C", "円"),
    h("P", "多角形"),
    h("L", "線"),
    h("図形をクリック / Q / E", "選ぶ"),
    h("ホイール", "拡大縮小"),
    h("矢印", "表示を動かす"),
  ];
}

export function hintsFor(s: EditorState): Hint[] {
  const base = baseHints(s);
  const hints = s.combineView ? [h("3", "結合の表示を終える"), ...base] : base;
  return s.notice ? [{ keys: "", label: s.notice }, ...hints] : hints;
}
