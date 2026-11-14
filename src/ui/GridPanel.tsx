import { addGuideAtCursor, clearGuidesAction, removeGuideAction, setGridProp } from "../editor/actions";
import { currentDoc } from "../editor/state";
import { dispatch, editorStore, useEditor } from "../editor/store";
import { keyFor, keyLabel } from "../input/keymap";
import { useKeymap } from "../input/keymapStore";
import { SliderField } from "./SliderField";

/** World point at the middle of the visible canvas, for guides added from the panel. */
function canvasCentre(): { x: number; y: number } {
  const r = document.querySelector('[data-testid="canvas"]')?.getBoundingClientRect();
  const v = editorStore.getState().view;
  if (!r) return { x: 0, y: 0 };
  return { x: (r.width / 2 - v.panX) / v.zoom, y: (r.height / 2 - v.panY) / v.zoom };
}

export function GridPanel() {
  const map = useKeymap();
  const grid = useEditor((s) => currentDoc(s).grid);
  const guides = useEditor((s) => currentDoc(s).guides) ?? [];
  return (
    <section className="panel" aria-label="グリッド">
      <h2>グリッド</h2>
      <SliderField
        propKey="grid-size"
        label="間隔"
        value={grid.size}
        min={5}
        max={160}
        step={5}
        active={false}
        onChange={(v) => dispatch((s) => setGridProp(s, { size: v }, "grid-size"))}
      />
      <label className="check-row">
        <input
          type="checkbox"
          checked={grid.visible}
          onChange={(e) => dispatch((s) => setGridProp(s, { visible: e.target.checked }, "grid-visible"))}
        />
        グリッドを表示
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={grid.snap}
          onChange={(e) => dispatch((s) => setGridProp(s, { snap: e.target.checked }, "grid-snap"))}
        />
        グリッドに吸着
      </label>
      <div className="color-title">ガイド</div>
      {guides.length === 0 ? (
        <p className="empty">ガイドはありません（- と I で足せます）</p>
      ) : (
        <div className="guide-list">
          {guides.map((g) => (
            <div key={g.id} className="guide-row" data-guide-row={g.id}>
              <span>{g.axis === "h" ? `横 y = ${g.pos}` : `縦 x = ${g.pos}`}</span>
              <button
                type="button"
                className="btn small"
                onClick={(e) => {
                  dispatch((s) => removeGuideAction(s, g.id));
                  e.currentTarget.blur();
                }}
              >
                消す
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="op-row">
        <button
          type="button"
          className="btn"
          data-guide-action="add-h"
          onClick={(e) => {
            dispatch((s) => addGuideAtCursor(s, "h", undefined, canvasCentre()));
            e.currentTarget.blur();
          }}
        >
          横のガイドを足す <kbd>{keyLabel(keyFor(map, "guide-h"))}</kbd>
        </button>
        <button
          type="button"
          className="btn"
          data-guide-action="add-v"
          onClick={(e) => {
            dispatch((s) => addGuideAtCursor(s, "v", undefined, canvasCentre()));
            e.currentTarget.blur();
          }}
        >
          縦のガイドを足す <kbd>{keyLabel(keyFor(map, "guide-v"))}</kbd>
        </button>
        {guides.length > 0 && (
          <button
            type="button"
            className="btn danger"
            data-guide-action="clear"
            onClick={(e) => {
              dispatch((s) => clearGuidesAction(s));
              e.currentTarget.blur();
            }}
          >
            ガイドを全部消す
          </button>
        )}
      </div>
    </section>
  );
}
