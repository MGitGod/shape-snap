import { setGridProp } from "../editor/actions";
import { currentDoc } from "../editor/state";
import { dispatch, useEditor } from "../editor/store";
import { SliderField } from "./SliderField";

export function GridPanel() {
  const grid = useEditor((s) => currentDoc(s).grid);
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
    </section>
  );
}
