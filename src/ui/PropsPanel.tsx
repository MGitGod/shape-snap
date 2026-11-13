import { useEffect, useRef, useState } from "react";
import type { Anchor, GridSettings, SceneNode } from "../core/types";
import { setAnchor, setNodeProp } from "../editor/actions";
import { currentDoc } from "../editor/state";
import { dispatch, editorStore, useEditor } from "../editor/store";
import { ColorField } from "./ColorField";
import { clampToDef, propDefsFor } from "./propDefs";
import { SliderField } from "./SliderField";

const ANCHORS: Array<{ id: Anchor; label: string }> = [
  { id: "center", label: "中心" },
  { id: "tl", label: "左上" },
  { id: "tr", label: "右上" },
  { id: "bl", label: "左下" },
  { id: "br", label: "右下" },
];

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

function tidy(v: number): number {
  return Number(v.toFixed(4));
}

function PropsBody({ node, grid }: { node: SceneNode; grid: GridSettings }) {
  const anchor = useEditor((s) => s.anchor);
  const focusArea = useEditor((s) => s.focusArea);
  const [active, setActive] = useState(0);
  const defs = propDefsFor(node, grid);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ node, defs, active });
  latest.current = { node, defs, active };

  const apply = (key: string, patch: Partial<SceneNode>): void => {
    dispatch((s) => setNodeProp(s, node.id, patch, `prop:${key}`));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (editorStore.getState().focusArea !== "props") return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isTextField(e.target)) return;
      const { node: n, defs: ds, active: a } = latest.current;
      if (ds.length === 0) return;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setActive((cur) => Math.min(ds.length - 1, Math.max(0, cur + (e.key === "ArrowUp" ? -1 : 1))));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const def = ds[a];
        if (!def) return;
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const v = clampToDef(def, tidy(def.get(n) + dir * def.step));
        dispatch((s) => setNodeProp(s, n.id, def.set(n, v), `prop:${def.key}`));
      } else if (/^[0-9.]$/.test(e.key) || e.key === "-") {
        if (e.repeat) return;
        const def = ds[a];
        const input = def
          ? rootRef.current?.querySelector<HTMLInputElement>(`[data-prop="${def.key}"] input[type="number"]`)
          : null;
        if (!input) return;
        // keep the digit away from the single-key shortcuts; the default action types it into the field
        e.stopImmediatePropagation();
        input.focus();
        input.select();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div ref={rootRef}>
      {defs.map((def, i) => (
        <SliderField
          key={def.key}
          propKey={def.key}
          label={def.label}
          value={def.get(node)}
          min={def.min}
          max={def.max}
          step={def.step}
          active={focusArea === "props" && i === active}
          onChange={(v) => apply(def.key, def.set(node, clampToDef(def, v)))}
        />
      ))}
      <ColorField
        kind="fill"
        label="塗りの色"
        value={node.style.fill}
        onChange={(v) => apply("fill", { style: { ...node.style, fill: v } })}
      />
      <ColorField
        kind="stroke"
        label="線の色"
        value={node.style.stroke}
        onChange={(v) => apply("stroke", { style: { ...node.style, stroke: v } })}
      />
      <div className="anchor-field">
        <div className="color-title">基準点</div>
        <div className="anchor-row">
          {ANCHORS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`btn${anchor === a.id ? " on" : ""}`}
              data-anchor={a.id}
              aria-pressed={anchor === a.id}
              onClick={(e) => {
                dispatch((s) => setAnchor(s, a.id));
                e.currentTarget.blur();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PropsPanel() {
  const doc = useEditor((s) => currentDoc(s));
  const selection = useEditor((s) => s.selection);
  const onlyId = selection.length === 1 ? selection[0] : undefined;
  const node = onlyId === undefined ? undefined : doc.nodes.find((n) => n.id === onlyId);
  return (
    <section className="panel" data-area="props" aria-label="設定">
      <h2>設定</h2>
      {selection.length === 0 && <p className="empty">図形を選ぶと、ここに設定が出ます</p>}
      {selection.length > 1 && <p className="empty">{selection.length} 個の図形を選んでいます</p>}
      {node && <PropsBody key={node.id} node={node} grid={doc.grid} />}
    </section>
  );
}
