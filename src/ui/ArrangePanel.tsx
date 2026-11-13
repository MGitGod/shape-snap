import { useEffect, useRef, useState } from "react";
import { averageGap, type AlignMode } from "../core/arrange";
import { alignSelection, distributeSelection } from "../editor/actions";
import { currentDoc } from "../editor/state";
import { dispatch, editorStore, useEditor } from "../editor/store";
import { SliderField } from "./SliderField";

const ALIGNS: Array<{ mode: AlignMode; label: string }> = [
  { mode: "left", label: "左" },
  { mode: "hcenter", label: "左右の中央" },
  { mode: "right", label: "右" },
  { mode: "top", label: "上" },
  { mode: "vcenter", label: "上下の中央" },
  { mode: "bottom", label: "下" },
];

const GAP_MIN = 0;
const GAP_MAX = 400;

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

function shownGap(g: number | null): number {
  return g === null ? 0 : Math.max(GAP_MIN, Math.round(g));
}

function gapOf(axis: "x" | "y"): number {
  const s = editorStore.getState();
  return shownGap(averageGap(currentDoc(s), s.selection, axis));
}

export function ArrangePanel() {
  const doc = useEditor((s) => currentDoc(s));
  const selection = useEditor((s) => s.selection);
  const focusArea = useEditor((s) => s.focusArea);
  const [active, setActive] = useState(0);
  const step = doc.grid.size / 2;
  const latest = useRef({ active, step });
  latest.current = { active, step };

  const gapX = shownGap(averageGap(doc, selection, "x"));
  const gapY = shownGap(averageGap(doc, selection, "y"));

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (editorStore.getState().focusArea !== "props") return;
      if (isTextField(e.target)) return;
      const { active: a, step: st } = latest.current;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setActive((cur) => Math.min(1, Math.max(0, cur + (e.key === "ArrowUp" ? -1 : 1))));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const axis = a === 0 ? "x" : "y";
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const v = Math.min(GAP_MAX, Math.max(GAP_MIN, Number((gapOf(axis) + dir * st).toFixed(4))));
        dispatch((s) => distributeSelection(s, axis, v, `gap-${axis}`));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div className="arrange" data-testid="arrange-panel">
      <div className="color-title">揃える</div>
      <div className="arrange-row">
        {ALIGNS.map((a) => (
          <button
            key={a.mode}
            type="button"
            className="btn"
            data-align={a.mode}
            onClick={(e) => {
              dispatch((s) => alignSelection(s, a.mode));
              e.currentTarget.blur();
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="color-title">間隔</div>
      <SliderField
        propKey="gap-x"
        label="横の間隔"
        value={gapX}
        min={GAP_MIN}
        max={GAP_MAX}
        step={step}
        active={focusArea === "props" && active === 0}
        onChange={(v) => dispatch((s) => distributeSelection(s, "x", v, "gap-x"))}
      />
      <SliderField
        propKey="gap-y"
        label="縦の間隔"
        value={gapY}
        min={GAP_MIN}
        max={GAP_MAX}
        step={step}
        active={focusArea === "props" && active === 1}
        onChange={(v) => dispatch((s) => distributeSelection(s, "y", v, "gap-y"))}
      />
      <div className="arrange-row">
        <button
          type="button"
          className="btn"
          data-distribute="x"
          onClick={(e) => {
            dispatch((s) => distributeSelection(s, "x", null));
            e.currentTarget.blur();
          }}
        >
          横に等間隔
        </button>
        <button
          type="button"
          className="btn"
          data-distribute="y"
          onClick={(e) => {
            dispatch((s) => distributeSelection(s, "y", null));
            e.currentTarget.blur();
          }}
        >
          縦に等間隔
        </button>
      </div>
    </div>
  );
}
