import { createElement, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { MouseEvent } from "react";
import { snapPointToDoc, worldOutlines } from "../core/geometry";
import { editableLeaf, expandNode, nodeCenter, sourceLeaves } from "../core/tree";
import { getHandles } from "../core/handles";
import { combineDocument } from "../core/combine";
import type { Point } from "../core/types";
import { clickCanvas, failCombine, fitView, setCursor, zoomAt } from "../editor/actions";
import { currentDoc } from "../editor/state";
import { dispatch, editorStore, useEditor } from "../editor/store";
import { resolveKeys } from "../input/keymap";
import { useKeymap } from "../input/keymapStore";
import { itemToSvg, nodeToSvgList, type SvgElementSpec } from "../render/svg";

const HANDLE_PX = 14;
const CORNER_PX = 16;
const VERTEX_PX = 16;
const AXIS_PX = 18;

function camel(spec: SvgElementSpec): Record<string, string | number> {
  const attrs: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(spec.attrs)) {
    attrs[k.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())] = v;
  }
  return attrs;
}

/** A subtract shape is drawn as a hatched, dotted-outline ghost instead of a solid fill. */
function subtractProps(spec: SvgElementSpec): Record<string, string | number> {
  const attrs = camel(spec);
  const open = attrs.fill === "none";
  return {
    ...attrs,
    fill: open ? "none" : "url(#subtract-hatch)",
    stroke: "var(--subtract)",
    strokeWidth: 2,
    strokeDasharray: "6 4",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    vectorEffect: "non-scaling-stroke",
    opacity: 1,
  };
}

function outlinePoints(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export function CanvasView() {
  const keymap = useKeymap();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const doc = useEditor((s) => currentDoc(s));
  const view = useEditor((s) => s.view);
  const selection = useEditor((s) => s.selection);
  const heldHandle = useEditor((s) => s.heldHandle);
  const solo = useEditor((s) => s.solo);
  const rotateMode = useEditor((s) => s.rotateMode);
  const cursor = useEditor((s) => s.cursor);
  const drawing = useEditor((s) => s.drawing);
  const combineView = useEditor((s) => s.combineView);
  const { zoom, panX, panY } = view;

  // recomputed only when the drawing itself changes
  const combined = useMemo(() => (combineView ? combineDocument(doc) : null), [combineView, doc]);
  useEffect(() => {
    if (combined && !combined.ok) dispatch((s) => failCombine(s, combined.message, combined.nodeId));
  }, [combined]);

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
      style={drawing ? { cursor: "crosshair" } : undefined}
      onMouseMove={(e) => dispatch((s) => setCursor(s, toWorld(e)))}
      onMouseLeave={() => dispatch((s) => setCursor(s, null))}
      onClick={(e) => click(e, "left")}
      onContextMenu={(e) => {
        e.preventDefault();
        click(e, "right");
      }}
    >
      <defs>
        <pattern id="subtract-hatch" patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={8} stroke="var(--subtract)" strokeWidth={2} opacity={0.35} />
        </pattern>
      </defs>
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
        {combineView && combined && combined.ok && (
          <g data-testid="combined">
            {combined.items.map((item, i) => {
              const spec = itemToSvg(item);
              return createElement(spec.tag, {
                ...camel(spec), key: `combined-${i}`, "data-combined-kind": item.kind, pointerEvents: "none",
              });
            })}
          </g>
        )}
        {!combineView && doc.nodes.filter((n) => n.visible).map((n) => (
          <g
            key={n.id}
            data-node-id={n.id}
            data-role={n.role === "subtract" ? "subtract" : undefined}
            opacity={solo && !selection.includes(n.id) ? 0.25 : undefined}
          >
            {nodeToSvgList(n).map((spec, i) =>
              createElement(spec.tag, { ...(n.role === "subtract" ? subtractProps(spec) : camel(spec)), key: `${n.id}:${i}` }))}
          </g>
        ))}
        {combineView && selected.filter((n) => n.visible && n.role === "subtract").flatMap((n) =>
          worldOutlines(n).map((o, i) => (
            <polyline
              key={`sub-${n.id}:${i}`}
              data-subtract-outline={n.id}
              points={outlinePoints(o.closed && o.points[0] ? [...o.points, o.points[0]] : o.points)}
              fill="none"
              stroke="var(--subtract)"
              strokeWidth={2}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )))}
        {selected.filter((n) => n.visible).flatMap((n) => {
          const sourceIds = new Set(sourceLeaves(n).map((l) => l.id));
          const leaves = expandNode(n);
          return worldOutlines(n).map((o, i) => ({ n, o, i, copy: !sourceIds.has(leaves[i]?.id ?? "") }));
        }).map(({ n, o, i, copy }) => {
          const outline = {
            key: `outline-${n.id}:${i}`,
            "data-outline": copy ? "copy" : "source",
            points: o.points.map((p) => `${p.x},${p.y}`).join(" "),
            fill: "none",
            stroke: "var(--accent)",
            strokeWidth: 2,
            strokeDasharray: copy ? "2 4" : rotateMode ? "6 4" : undefined,
            vectorEffect: "non-scaling-stroke" as const,
            pointerEvents: "none" as const,
          };
          return o.closed ? <polygon {...outline} /> : <polyline {...outline} />;
        })}
        {handles.map((h) => {
          const common = {
            "data-handle-id": h.id,
            fill: heldHandle === h.id ? "var(--accent)" : "var(--panel)",
            stroke: "var(--accent)",
            strokeWidth: 2,
            vectorEffect: "non-scaling-stroke" as const,
          };
          const lead = only ? editableLeaf(only) : null;
          const pt = lead && lead.kind === "path" && lead.smooth ? lead.points[h.index] : undefined;
          if (h.kind === "vertex" && pt?.corner) {
            const r = VERTEX_PX / 2 / zoom;
            const d = `M ${h.pos.x} ${h.pos.y - r} L ${h.pos.x + r} ${h.pos.y} L ${h.pos.x} ${h.pos.y + r} L ${h.pos.x - r} ${h.pos.y} Z`;
            return <path key={h.id} {...common} d={d} data-handle-shape="diamond" />;
          }
          if (h.kind === "axis") {
            const r = AXIS_PX / 2 / zoom;
            const d = `M ${h.pos.x} ${h.pos.y - r} L ${h.pos.x + r} ${h.pos.y} L ${h.pos.x} ${h.pos.y + r} L ${h.pos.x - r} ${h.pos.y} Z`;
            return <path key={h.id} {...common} d={d} data-handle-shape="diamond" />;
          }
          if (h.kind === "vertex") {
            return <circle key={h.id} {...common} cx={h.pos.x} cy={h.pos.y} r={VERTEX_PX / 2 / zoom} />;
          }
          const size = (h.kind === "corner" ? CORNER_PX : HANDLE_PX) / zoom;
          return <rect key={h.id} {...common} x={h.pos.x - size / 2} y={h.pos.y - size / 2} width={size} height={size} />;
        })}
        {drawing && (
          <g data-testid="drawing-preview" pointerEvents="none" fill="none" stroke="var(--accent)" strokeWidth={2}>
            {drawing.points.length > 1 && (
              <polyline
                points={drawing.points.map((p) => `${p.x},${p.y}`).join(" ")}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {snapTarget && drawing.points.length > 0 && (
              <line
                data-testid="drawing-rubber"
                x1={drawing.points[drawing.points.length - 1]!.x}
                y1={drawing.points[drawing.points.length - 1]!.y}
                x2={snapTarget.x}
                y2={snapTarget.y}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {drawing.points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={(i === 0 ? 4 : 3) / zoom}
                fill="var(--accent)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {drawing.points[0] && (
              <circle
                data-testid="drawing-first"
                cx={drawing.points[0].x}
                cy={drawing.points[0].y}
                r={8 / zoom}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {drawing.points[0] && drawing.points.length >= 3 && (
              <circle
                data-testid="drawing-close"
                cx={drawing.points[0].x}
                cy={drawing.points[0].y}
                r={12 / zoom}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        )}
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
      {only && only.kind === "mirror" && only.visible && (() => {
        const ax = only.axisX * zoom + panX;
        const ay = only.axisY * zoom + panY;
        const common = { stroke: "var(--guide)", strokeWidth: 1.5, pointerEvents: "none" as const };
        const vLine = <line key="axis-v" y1={0} y2="100%" x1={ax} x2={ax} {...common} />;
        const hLine = <line key="axis-h" x1={0} x2="100%" y1={ay} y2={ay} {...common} />;
        return (
          <g data-testid="mirror-axis" data-axis-mode={only.mode} pointerEvents="none">
            {(only.mode === "h" || only.mode === "both") && vLine}
            {(only.mode === "v" || only.mode === "both") && hLine}
            {only.mode === "rotate" && (
              <>
                <line x1={ax - 24} x2={ax + 24} y1={ay} y2={ay} {...common} />
                <line y1={ay - 24} y2={ay + 24} x1={ax} x2={ax} {...common} />
                <circle cx={ax} cy={ay} r={14} fill="none" {...common} />
              </>
            )}
          </g>
        );
      })()}
      {rotateMode &&
        selected.filter((n) => n.visible).map((n) => {
          const center = nodeCenter(n);
          const cx = center.x * zoom + panX;
          const cy = center.y * zoom + panY;
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
                {`${Math.round(editableLeaf(n)?.transform.rotation ?? 0)}°`}
              </text>
            </g>
          );
        })}
      {combineView && (
        <g data-testid="combine-badge" pointerEvents="none">
          <rect x={12} y={12} width={196} height={28} rx={6} fill="var(--panel)" stroke="var(--accent)" strokeWidth={1.5} />
          <text x={22} y={31} fill="var(--ink)" fontSize={14} fontWeight={700}>{resolveKeys("結合を表示中（{{combine-view}} で戻る）", keymap)}</text>
        </g>
      )}
    </svg>
  );
}
