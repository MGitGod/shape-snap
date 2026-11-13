import type { EditorState } from "../editor/state";

export type ActionId =
  | "place-rect" | "place-ellipse" | "place-polygon"
  | "prev-shape" | "next-shape" | "next-handle" | "multi-select" | "escape" | "cycle-focus"
  | "move-up" | "move-down" | "move-left" | "move-right" | "move-to-cursor"
  | "forward" | "backward" | "duplicate" | "delete" | "undo" | "redo"
  | "toggle-visible" | "toggle-locked" | "toggle-solo"
  | "fit-view" | "grid-finer" | "grid-coarser";

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

function baseHints(s: EditorState): Hint[] {
  if (s.heldHandle !== null) {
    return [
      h("クリック / 矢印 / Space", "つまみを動かす"),
      h("W", "次のつまみ"),
      h("右クリック / Esc", "つかむのをやめる"),
    ];
  }
  if (s.multiSelect) {
    return [h("クリック", "足す・外す"), h("M", "複数選択を終える"), h("矢印", "動かす")];
  }
  if (s.selection.length > 0) {
    return [
      h("つまみをクリック", "つかむ"),
      h("何もない点をクリック / Space / 矢印", "動かす"),
      h("W", "つまみ"),
      h("D", "複製"),
      h("Delete", "消す"),
      h("右クリック / Esc", "選択を外す"),
    ];
  }
  return [
    h("R", "四角"),
    h("C", "円"),
    h("P", "多角形"),
    h("図形をクリック / Q / E", "選ぶ"),
    h("ホイール", "拡大縮小"),
    h("矢印", "表示を動かす"),
  ];
}

export function hintsFor(s: EditorState): Hint[] {
  const hints = baseHints(s);
  return s.notice ? [{ keys: "", label: s.notice }, ...hints] : hints;
}
