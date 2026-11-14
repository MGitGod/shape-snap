import { useEffect, useRef, useState } from "react";
import { mapSourceLeaves, sourceLeaves } from "../core/tree";
import type { Anchor, GridSettings, LeafNode, MirrorMode, MirrorNode, PathNode, SceneNode, Style } from "../core/types";
import { toggleLeafFillNone } from "../core/arrange";
import { setAnchor, setMirrorMode, setNodeProp, toggleClosed } from "../editor/actions";
import { runAction, type Viewport } from "../input/keyboard";
import { KEYMAP, keyLabel, type ActionId } from "../input/keymap";
import { ArrangePanel } from "./ArrangePanel";
import { currentDoc } from "../editor/state";
import { dispatch, editorStore, useEditor } from "../editor/store";
import { ColorField } from "./ColorField";
import { clampToDef, propDefsFor } from "./propDefs";
import { SliderField } from "./SliderField";

const ANCHORS: Array<{ id: Anchor; label: string }> = [
  { id: "auto", label: "自動" },
  { id: "center", label: "中心" },
  { id: "tl", label: "左上" },
  { id: "tr", label: "右上" },
  { id: "bl", label: "左下" },
  { id: "br", label: "右下" },
];

const OPS: Array<{ action: ActionId; label: string }> = [
  { action: "scale-down", label: "縮小" },
  { action: "scale-up", label: "拡大" },
  { action: "rotate-mode", label: "回転" },
  { action: "fill-none", label: "塗りなし" },
  { action: "to-path", label: "自由な形に変える" },
];

function opsFor(node: SceneNode | undefined, selectedCount: number): Array<{ action: ActionId; label: string }> {
  const extra: Array<{ action: ActionId; label: string }> = [];
  if (selectedCount >= 2) extra.push({ action: "group", label: "グループ" });
  if (node) {
    if (node.kind === "group") extra.push({ action: "ungroup", label: "解く" });
    else if (node.kind === "repeat" || node.kind === "mirror") extra.push({ action: "ungroup", label: "ばらす" });
    extra.push({ action: "repeat", label: "連続配置" }, { action: "mirror", label: "対称" });
  }
  return [...extra, ...OPS];
}

const MIRROR_MODES: Array<{ mode: MirrorMode; label: string }> = [
  { mode: "h", label: "左右" },
  { mode: "v", label: "上下" },
  { mode: "both", label: "上下左右" },
  { mode: "rotate", label: "回転" },
];

function MirrorModes({ node }: { node: MirrorNode }) {
  return (
    <div className="anchor-field">
      <div className="color-title">対称の種類</div>
      <div className="anchor-row" data-testid="mirror-modes">
        {MIRROR_MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            className={`btn${node.mode === m.mode ? " on" : ""}`}
            data-mirror-mode={m.mode}
            aria-pressed={node.mode === m.mode}
            onClick={(e) => {
              dispatch((s) => setMirrorMode(s, m.mode));
              e.currentTarget.blur();
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OpButtons({ getViewport, node, selectedCount }: { getViewport: () => Viewport; node?: SceneNode; selectedCount: number }) {
  const rotating = useEditor((s) => s.rotateMode);
  return (
    <div className="op-row" data-testid="shape-ops">
      {opsFor(node, selectedCount).map((op) => {
        const binding = KEYMAP.find((b) => b.action === op.action);
        const pressed = op.action === "rotate-mode" ? rotating : undefined;
        return (
          <button
            key={op.action}
            type="button"
            className={`btn${pressed ? " on" : ""}`}
            data-op={op.action}
            aria-pressed={pressed}
            onClick={(e) => {
              runAction(op.action, getViewport());
              e.currentTarget.blur();
            }}
          >
            {op.label} {binding ? <kbd>{keyLabel(binding.key)}</kbd> : null}
          </button>
        );
      })}
    </div>
  );
}

function PathButtons({ node, getViewport }: { node: PathNode; getViewport: () => Viewport }) {
  const held = useEditor((s) => s.heldHandle);
  const kbd = (action: ActionId) => {
    const b = KEYMAP.find((x) => x.action === action);
    return b ? <kbd>{keyLabel(b.key)}</kbd> : null;
  };
  const run = (action: ActionId) => (e: { currentTarget: HTMLElement }) => {
    runAction(action, getViewport());
    e.currentTarget.blur();
  };
  const onVertex = held !== null && held.startsWith("vertex:");
  const onEdge = held !== null && held.startsWith("edge:");
  return (
    <div className="op-row" data-testid="path-ops">
      <button type="button" className="btn" data-path-action="smooth" onClick={run("smooth")}>
        {node.smooth ? "直線に戻す" : "曲線にする"} {kbd("smooth")}
      </button>
      <button
        type="button"
        className="btn"
        data-path-action="closed"
        onClick={(e) => {
          dispatch((s) => toggleClosed(s));
          e.currentTarget.blur();
        }}
      >
        {node.closed ? "開く" : "閉じる"}
      </button>
      {onEdge && (
        <button type="button" className="btn" data-path-action="add-point" onClick={run("confirm")}>
          点を足す {kbd("confirm")}
        </button>
      )}
      {onVertex && node.smooth && (
        <button type="button" className="btn" data-path-action="corner" onClick={run("corner-point")}>
          {node.points[Number(held.slice(7))]?.corner ? "点を丸める" : "点を角にする"} {kbd("corner-point")}
        </button>
      )}
      {onVertex && (
        <button type="button" className="btn" data-path-action="delete-point" onClick={run("delete")}>
          点を消す <kbd>Delete</kbd>
        </button>
      )}
    </div>
  );
}

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/** A patch for `node` that restyles every source leaf (the node itself for a leaf, its inner shapes for a container). */
function restyle(node: SceneNode, style: (leaf: LeafNode) => Style): Partial<SceneNode> {
  const next = mapSourceLeaves(node, (leaf) => ({ ...leaf, style: style(leaf) }));
  if (next.kind === "group") return { children: next.children };
  if (next.kind === "repeat" || next.kind === "mirror") return { child: next.child };
  return { style: next.style };
}

function tidy(v: number): number {
  return Number(v.toFixed(4));
}

function PropsBody({ node, grid, getViewport }: { node: SceneNode; grid: GridSettings; getViewport: () => Viewport }) {
  const anchor = useEditor((s) => s.anchor);
  const focusArea = useEditor((s) => s.focusArea);
  const [active, setActive] = useState(0);
  const defs = propDefsFor(node, grid);
  const lead = sourceLeaves(node)[0];
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
      {node.kind === "mirror" && <MirrorModes node={node} />}
      {node.kind === "path" && <PathButtons node={node} getViewport={getViewport} />}
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
      {lead && (
        <ColorField
          kind="fill"
          label="塗りの色"
          value={lead.style.fill}
          onChange={(v) =>
            apply("fill", restyle(node, (leaf) => (v === null ? toggleLeafFillNone(leaf).style : { ...leaf.style, fill: v })))}
        />
      )}
      {lead && (
        <ColorField
          kind="stroke"
          label="線の色"
          value={lead.style.stroke}
          onChange={(v) => apply("stroke", restyle(node, (leaf) => ({ ...leaf.style, stroke: v })))}
        />
      )}
      <OpButtons getViewport={getViewport} node={node} selectedCount={1} />
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

export function PropsPanel({ getViewport }: { getViewport: () => Viewport }) {
  const doc = useEditor((s) => currentDoc(s));
  const selection = useEditor((s) => s.selection);
  const onlyId = selection.length === 1 ? selection[0] : undefined;
  const node = onlyId === undefined ? undefined : doc.nodes.find((n) => n.id === onlyId);
  return (
    <section className="panel" data-area="props" aria-label="設定">
      <h2>設定</h2>
      {selection.length === 0 && <p className="empty">図形を選ぶと、ここに設定が出ます</p>}
      {selection.length > 1 && <p className="empty">{selection.length} 個の図形を選んでいます</p>}
      {selection.length > 1 && <ArrangePanel />}
      {selection.length > 1 && <OpButtons getViewport={getViewport} selectedCount={selection.length} />}
      {node && <PropsBody key={node.id} node={node} grid={doc.grid} getViewport={getViewport} />}
    </section>
  );
}
