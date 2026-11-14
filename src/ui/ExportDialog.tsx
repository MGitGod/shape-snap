import { useEffect, useRef, useState } from "react";
import { hasSubtract } from "../core/combine";
import { exportBounds, documentToSvg, type ExportOptions } from "../render/svg";
import { useEditor } from "../editor/store";
import { safeFileName, serializeDocument } from "../io/files";
import { isDesktop, saveFile } from "../io/platform";
import { svgToPngBlob } from "../io/png";
import { workStore } from "../io/session";
import { SliderField } from "./SliderField";

type Format = "svg" | "png" | "work";
type Bg = "transparent" | "white" | "color";

const COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.history.present);
  const [format, setFormat] = useState<Format>("svg");
  const [margin, setMargin] = useState(doc.grid.size);
  const [bg, setBg] = useState<Bg>("transparent");
  const [color, setColor] = useState("#ffffff");
  const [longSide, setLongSide] = useState(1024);
  const subtractAny = hasSubtract(doc);
  const [combine, setCombine] = useState(subtractAny);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    boxRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const empty = doc.nodes.length === 0;
  const colorOk = format === "work" || bg !== "color" || COLOR_RE.test(color);
  const sizeOk = format !== "png" || (Number.isInteger(longSide) && longSide >= 1 && longSide <= 8192);
  const canExport = !empty && colorOk && sizeOk && !busy;

  const run = async (): Promise<void> => {
    setError(null);
    const name = safeFileName(workStore.getState().currentName);
    let result: "saved" | "cancelled" = "saved";
    try {
      if (format === "work") {
        result = await saveFile(new Blob([serializeDocument(doc)], { type: "application/json" }), `${name}.json`);
      } else {
        const opts: ExportOptions = {
          area: "content",
          margin,
          background: bg === "transparent" ? null : bg === "white" ? "#ffffff" : color,
          combine,
        };
        const svg = documentToSvg(doc, opts);
        if (format === "svg") {
          result = await saveFile(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
        } else {
          setBusy(true);
          const b = exportBounds(doc, opts);
          const w = b.maxX - b.minX;
          const h = b.maxY - b.minY;
          const scale = longSide / Math.max(w, h);
          const blob = await svgToPngBlob(svg, w * scale, h * scale);
          result = await saveFile(blob, `${name}.png`);
        }
      }
      if (result === "saved") onClose();
    } catch (e) {
      setError(isDesktop() ? "保存できませんでした" : e instanceof Error ? e.message : "書き出せませんでした");
    } finally {
      setBusy(false);
    }
  };

  const radio = <T extends string>(label: string, value: T, current: T, set: (v: T) => void) => (
    <label className={`btn choice${current === value ? " on" : ""}`}>
      <input type="radio" name={label} checked={current === value} onChange={() => set(value)} />
      {label}
    </label>
  );

  return (
    <div className="modal-backdrop">
      <div ref={boxRef} className="modal" role="dialog" aria-modal="true" aria-label="書き出し" data-modal="export" tabIndex={-1}>
        <h2>書き出し</h2>
        <fieldset className="export-group">
          <legend>形式</legend>
          {radio("SVG", "svg", format, setFormat)}
          {radio("PNG", "png", format, setFormat)}
          {radio("作業ファイル", "work", format, setFormat)}
        </fieldset>
        {format !== "work" && (
          <>
            <fieldset className="export-group">
              <legend>範囲</legend>
              <span>図形がちょうど収まる枠</span>
            </fieldset>
            <SliderField
              propKey="export-margin" label="余白" value={margin} min={0} max={200}
              step={doc.grid.size / 2} active={false} onChange={setMargin}
            />
            <fieldset className="export-group">
              <legend>背景</legend>
              {radio("透明", "transparent", bg, setBg)}
              {radio("白", "white", bg, setBg)}
              {radio("色コード", "color", bg, setBg)}
              {bg === "color" && (
                <input
                  type="text" className="text-input" aria-label="背景の色コード" value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              )}
            </fieldset>
            <label className="check-row">
              <input
                type="checkbox" data-testid="export-combine" checked={combine}
                onChange={(e) => setCombine(e.target.checked)}
              />
              一つの輪郭にまとめる
            </label>
            {!combine && subtractAny && <p className="modal-note">抜く図形は書き出されません</p>}
            {!colorOk && <p className="modal-error">色コードは #fff か #ffffff の形で入れてください</p>}
          </>
        )}
        {format === "png" && (
          <fieldset className="export-group">
            <legend>PNG の大きさ（長い辺）</legend>
            {[512, 1024, 2048].map((n) => (
              <button key={n} type="button" className={`btn${longSide === n ? " on" : ""}`} aria-pressed={longSide === n}
                onClick={() => setLongSide(n)}>{n}</button>
            ))}
            <input
              type="number" className="text-input" aria-label="長い辺の数値" min={1} max={8192} value={longSide}
              onChange={(e) => setLongSide(Number(e.target.value))}
            />
            {!sizeOk && <p className="modal-error">1 から 8192 の整数を入れてください</p>}
          </fieldset>
        )}
        {empty && <p className="modal-error">図形がありません</p>}
        {error && <p className="modal-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn primary" disabled={!canExport} onClick={() => { void run(); }}>書き出す</button>
          <button type="button" className="btn" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
