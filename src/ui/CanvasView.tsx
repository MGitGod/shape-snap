import { createElement, useEffect, useLayoutEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { snapPointToDoc, worldOutline } from "../core/geometry";
import { getHandles } from "../core/handles";
import type { Point } from "../core/types";
import { clickCanvas, fitView, setCursor, zoomAt } from "../editor/actions";
import { currentDoc } from "../editor/state";
import { dispatch, editorStore, useEditor } from "../editor/store";
import { nodeToSvg } from "../render/svg";

const HANDLE_PX = 14;
const CORNER_PX = 16;
const VERTEX_PX = 16;

export function CanvasView() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const doc = useEditor((s) => currentDoc(s));
  const view = useEditor((s) => s.view);
  const selection = useEditor((s) => s.selection);
  const heldHandle = useEditor((s) => s.heldHandle);
  const solo = useEditor((s) => s.solo);
  const rotateMode = useEditor((s) => s.rotateMode);
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

  // grid lines: widen the spacing until it is at least 8 screen px (every 5th line is drawn stronger)
  let gridPx = doc.grid.size * zoom;
  while (gridPx < 8) gridPx *= 2;
  const guides = doc.guides ?? [];

  const selected = doc.nodes.filter((n) => selection.includes(n.id));
  const only = selected.length === 1 && selection.length === 1 ? selected[0] : undefined;
  const handles = only && !only.locked ? getHandles(only) : [];
  const snapTarget = cursor ? snapPointToDoc(cursor, doc) : null;

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
              id="grid-minor"
              x={panX - 0.5}
              y={panY - 0.5}
              width={gridPx}
              height={gridPx}
              patternUnits="userSpaceOnUse"
            >
              <path d={`M 0.5 0 V ${gridPx} M 0 0.5 H ${gridPx}`} fill="none" stroke="var(--grid)" strokeWidth={1} />
            </pattern>
            <pattern
              id="grid-major"
              x={panX - 0.5}
              y={panY - 0.5}
              width={gridPx * 5}
              height={gridPx * 5}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M 0.5 0 V ${gridPx * 5} M 0 0.5 H ${gridPx * 5}`}
                fill="none"
                stroke="var(--grid-major)"
                strokeWidth={1}
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-minor)" pointerEvents="none" />
          <rect width="100%" height="100%" fill="url(#grid-major)" pointerEvents="none" />
          <line data-testid="grid-axis-x" x1={0} x2="100%" y1={panY} y2={panY} stroke="var(--grid-axis)" strokeWidth={1} pointerEvents="none" />
          <line data-testid="grid-axis-y" y1={0} y2="100%" x1={panX} x2={panX} stroke="var(--grid-axis)" strokeWidth={1} pointerEvents="none" />
        </>
      )}
      <g transform={`translate(${panX} ${panY}) scale(${zoom})`}>
        {doc.nodes.filter((n) => n.visible).map((n) => {
          const spec = nodeToSvg(n);
          const attrs: Record<string, string | number> = {};
          for (const [k, v] of Object.entries(spec.attrs)) {
            attrs[k.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = v;
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
            strokeDasharray={rotateMode ? "6 4" : undefined}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
        {handles.map((h) => {
          const common = {
            "data-handle-id": h.id,
            fill: heldHandle === h.id ? "var(--accent)" : "var(--panel)",
            stroke: "var(--accent)",
            strokeWidth: 2,
            vectorEffect: "non-scaling-stroke" as const,
          };
          if (h.kind === "vertex") {
            return <circle key={h.id} {...common} cx={h.pos.x} cy={h.pos.y} r={VERTEX_PX / 2 / zoom} />;
          }
          const size = (h.kind === "corner" ? CORNER_PX : HANDLE_PX) / zoom;
          return <rect key={h.id} {...common} x={h.pos.x - size / 2} y={h.pos.y - size / 2} width={size} height={size} />;
        })}
        {snapTarget && (
          <g data-testid="snap-mark" pointerEvents="none" stroke="var(--warn)" strokeWidth={2} fill="none">
            <circle
              data-testid="snap-ring"
              cx={snapTarget.x}
              cy={snapTarget.y}
              r={9 / zoom}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={snapTarget.x - 14 / zoom}
              x2={snapTarget.x + 14 / zoom}
              y1={snapTarget.y}
              y2={snapTarget.y}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={snapTarget.x}
              x2={snapTarget.x}
              y1={snapTarget.y - 14 / zoom}
              y2={snapTarget.y + 14 / zoom}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}
      </g>
      {guides.map((g) =>
        g.axis === "h" ? (
          <line
            key={g.id}
            data-guide-id={g.id}
            x1={0}
            x2="100%"
            y1={g.pos * zoom + panY}
            y2={g.pos * zoom + panY}
            stroke="var(--guide)"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        ) : (
          <line
            key={g.id}
            data-guide-id={g.id}
            y1={0}
            y2="100%"
            x1={g.pos * zoom + panX}
            x2={g.pos * zoom + panX}
            stroke="var(--guide)"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        ),
      )}
      {rotateMode &&
        selected.filter((n) => n.visible).map((n) => {
          const cx = n.transform.x * zoom + panX;
          const cy = n.transform.y * zoom + panY;
          return (
            <g key={`rot-${n.id}`} data-testid="rotate-mark" pointerEvents="none">
              <circle cx={cx} cy={cy} r={4} fill="var(--accent)" stroke="var(--panel)" strokeWidth={1.5} />
              <text
                x={cx + 10}
                y={cy - 8}
                fill="var(--accent)"
                stroke="var(--panel)"
                strokeWidth={3}
                paintOrder="stroke"
                fontSize={14}
                fontWeight={700}
              >
                {`${Math.round(n.transform.rotation)}°`}
              </text>
            </g>
          );
        })}
    </svg>
  );
}
