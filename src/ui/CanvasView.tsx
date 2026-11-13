import { createElement, useEffect, useLayoutEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { snapPoint, worldOutline } from "../core/geometry";
import { getHandles } from "../core/handles";
import type { Point } from "../core/types";
import { clickCanvas, fitView, setCursor, zoomAt } from "../editor/actions";
import { currentDoc } from "../editor/state";
import { dispatch, editorStore, useEditor } from "../editor/store";
import { nodeToSvg } from "../render/svg";

const HANDLE_PX = 14;

export function CanvasView() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const doc = useEditor((s) => currentDoc(s));
  const view = useEditor((s) => s.view);
  const selection = useEditor((s) => s.selection);
  const heldHandle = useEditor((s) => s.heldHandle);
  const solo = useEditor((s) => s.solo);
  const cursor = useEditor((s) => s.cursor);
  const { zoom, panX, panY } = view;

  // screen position inside the svg -> world, using the latest view from the store
  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current?.getBoundingClientRect();
    const sx = e.clientX - (r?.left ?? 0);
    const sy = e.clientY - (r?.top ?? 0);
    const v = editorStore.getState().view;
    return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom };
  };

  useLayoutEffect(() => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) dispatch((s) => fitView(s, { width: r.width, height: r.height }));
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      dispatch((s) => zoomAt(s, p, e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const click = (e: MouseEvent, button: "left" | "right"): void => {
    const w = toWorld(e);
    const z = editorStore.getState().view.zoom;
    dispatch((s) => ({
      ...clickCanvas(s, w, button, { hitTolerance: 4 / z, handleTolerance: HANDLE_PX / z }),
      focusArea: "canvas" as const,
    }));
  };

  // grid dots: widen the spacing until it is at least 8 screen px
  let gridPx = doc.grid.size * zoom;
  while (gridPx < 8) gridPx *= 2;

  const selected = doc.nodes.filter((n) => selection.includes(n.id));
  const only = selected.length === 1 && selection.length === 1 ? selected[0] : undefined;
  const handles = only && !only.locked ? getHandles(only) : [];
  const snapTarget = cursor && doc.grid.snap ? snapPoint(cursor, doc.grid) : null;
  const hs = HANDLE_PX / zoom;

  return (
    <svg
      ref={svgRef}
      data-testid="canvas"
      className="canvas"
      onMouseMove={(e) => dispatch((s) => setCursor(s, toWorld(e)))}
      onMouseLeave={() => dispatch((s) => setCursor(s, null))}
      onClick={(e) => click(e, "left")}
      onContextMenu={(e) => {
        e.preventDefault();
        click(e, "right");
      }}
    >
      {doc.grid.visible && (
        <>
          <defs>
            <pattern
              id="grid-dots"
              x={panX - gridPx / 2}
              y={panY - gridPx / 2}
              width={gridPx}
              height={gridPx}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={gridPx / 2} cy={gridPx / 2} r={1.2} fill="var(--grid)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-dots)" pointerEvents="none" />
        </>
      )}
      <g transform={`translate(${panX} ${panY}) scale(${zoom})`}>
        {doc.nodes.filter((n) => n.visible).map((n) => {
          const spec = nodeToSvg(n);
          const attrs: Record<string, string | number> = {};
          for (const [k, v] of Object.entries(spec.attrs)) {
            attrs[k === "stroke-width" ? "strokeWidth" : k] = v;
          }
          if (solo && !selection.includes(n.id)) {
            const base = typeof attrs.opacity === "number" ? attrs.opacity : 1;
            attrs.opacity = base * 0.25;
          }
          return createElement(spec.tag, { ...attrs, key: n.id, "data-node-id": n.id });
        })}
        {selected.filter((n) => n.visible).map((n) => (
          <polygon
            key={`outline-${n.id}`}
            points={worldOutline(n).map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
        {handles.map((h) => (
          <rect
            key={h.id}
            data-handle-id={h.id}
            x={h.pos.x - hs / 2}
            y={h.pos.y - hs / 2}
            width={hs}
            height={hs}
            fill={heldHandle === h.id ? "var(--accent)" : "var(--panel)"}
            stroke="var(--accent)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {snapTarget && (
          <circle
            data-testid="snap-ring"
            cx={snapTarget.x}
            cy={snapTarget.y}
            r={8 / zoom}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </g>
    </svg>
  );
}
