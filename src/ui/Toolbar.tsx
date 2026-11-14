import { useEditor } from "../editor/store";
import { runAction, type Viewport } from "../input/keyboard";
import { KEYMAP, keyLabel, type ActionId } from "../input/keymap";

type Item = { action: ActionId; label: string } | "sep";

const ITEMS: Item[] = [
  { action: "place-rect", label: "四角" },
  { action: "place-ellipse", label: "円" },
  { action: "place-polygon", label: "多角形" },
  { action: "line", label: "線" },
  "sep",
  { action: "repeat", label: "連続配置" },
  { action: "mirror", label: "対称" },
  { action: "group", label: "グループ" },
  { action: "ungroup", label: "解く" },
  "sep",
  { action: "role", label: "足す・抜く" },
  { action: "combine-view", label: "結合を表示" },
  "sep",
  { action: "duplicate", label: "複製" },
  { action: "delete", label: "消す" },
  { action: "forward", label: "手前へ" },
  { action: "backward", label: "奥へ" },
  { action: "scale-down", label: "縮小" },
  { action: "scale-up", label: "拡大" },
  { action: "rotate-mode", label: "回転" },
  { action: "smooth", label: "曲線" },
  "sep",
  { action: "multi-select", label: "複数選択" },
  { action: "toggle-solo", label: "ソロ" },
  "sep",
  { action: "undo", label: "戻す" },
  { action: "redo", label: "やり直す" },
  { action: "fit-view", label: "全体表示" },
];

export function Toolbar({ getViewport, onOpenWorks, onOpenExport }: {
  getViewport: () => Viewport;
  onOpenWorks?: () => void;
  onOpenExport?: () => void;
}) {
  const multi = useEditor((s) => s.multiSelect);
  const solo = useEditor((s) => s.solo);
  const rotating = useEditor((s) => s.rotateMode);
  const drawing = useEditor((s) => s.drawing !== null);
  const combining = useEditor((s) => s.combineView);
  return (
    <>
      <h1>Shape Snap</h1>
      <div className="tools" role="toolbar" aria-label="道具">
        {ITEMS.map((it, i) => {
          if (it === "sep") return <span key={`sep-${i}`} className="tool-sep" aria-hidden="true" />;
          const binding = KEYMAP.find((b) => b.action === it.action);
          const pressed = it.action === "multi-select" ? multi : it.action === "toggle-solo" ? solo : it.action === "rotate-mode" ? rotating : it.action === "line" ? drawing : it.action === "combine-view" ? combining : undefined;
          return (
            <button
              key={it.action}
              type="button"
              className={`btn tool${pressed ? " on" : ""}`}
              data-action={it.action}
              aria-pressed={pressed}
              onClick={(e) => {
                runAction(it.action, getViewport());
                e.currentTarget.blur();
              }}
            >
              <kbd>{binding ? keyLabel(binding.key) : ""}</kbd> {it.label}
            </button>
          );
        })}
      </div>
      <div className="toolbar-end" data-slot="toolbar-end">
        <button type="button" className="btn" data-action="works" onClick={(e) => { onOpenWorks?.(); e.currentTarget.blur(); }}>作品</button>
        <button type="button" className="btn" data-action="export" onClick={(e) => { onOpenExport?.(); e.currentTarget.blur(); }}>書き出し</button>
      </div>
    </>
  );
}
