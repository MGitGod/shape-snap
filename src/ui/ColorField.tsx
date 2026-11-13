import { useEffect, useState } from "react";
import { hexToHsl, hslToHex } from "./propDefs";
import { SliderField } from "./SliderField";

export const SWATCHES = [
  "#1d2330", "#ffffff", "#e5484d", "#f76808", "#ffc53d", "#46a758",
  "#12a594", "#2f6fde", "#6e56cf", "#d6409f", "#8d8d8d", "#000000",
];

export interface ColorFieldProps {
  kind: "fill" | "stroke";
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function ColorField({ kind, label, value, onChange }: ColorFieldProps) {
  const [hsl, setHsl] = useState(() => hexToHsl(value ?? "#8d8d8d"));
  const [text, setText] = useState<string | null>(null);

  // resync the sliders when the colour changes from outside (swatch, undo, another shape)
  useEffect(() => {
    if (value === null) return;
    setHsl((cur) => (hslToHex(cur.h, cur.s, cur.l) === value.toLowerCase() ? cur : hexToHsl(value)));
  }, [value]);

  const setPart = (part: "h" | "s" | "l", v: number): void => {
    const next = { ...hsl, [part]: v };
    setHsl(next);
    onChange(hslToHex(next.h, next.s, next.l));
  };

  const commitText = (raw: string): void => {
    setText(null);
    if (HEX.test(raw.trim())) onChange(raw.trim().toLowerCase());
  };

  return (
    <div className="color-field" data-color-field={kind}>
      <div className="color-title">{label}</div>
      <div className="swatches">
        <button
          type="button"
          className={`btn none-swatch${value === null ? " on" : ""}`}
          data-color="none"
          onClick={(e) => {
            onChange(null);
            e.currentTarget.blur();
          }}
        >
          なし
        </button>
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${value === c ? " on" : ""}`}
            data-color={c}
            aria-label={`${label} ${c}`}
            style={{ background: c }}
            onClick={(e) => {
              onChange(c);
              e.currentTarget.blur();
            }}
          />
        ))}
      </div>
      <div className="color-row">
        <input
          type="text"
          className="hex-input"
          aria-label={`${label}の色コード`}
          maxLength={7}
          value={text ?? value ?? ""}
          placeholder="#rrggbb"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText(e.currentTarget.value);
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            if (text !== null) commitText(e.currentTarget.value);
          }}
        />
      </div>
      <SliderField propKey={`${kind}-h`} label="色相" value={hsl.h} min={0} max={360} step={1} active={false} onChange={(v) => setPart("h", v)} />
      <SliderField propKey={`${kind}-s`} label="彩度" value={hsl.s} min={0} max={100} step={1} active={false} onChange={(v) => setPart("s", v)} />
      <SliderField propKey={`${kind}-l`} label="明るさ" value={hsl.l} min={0} max={100} step={1} active={false} onChange={(v) => setPart("l", v)} />
    </div>
  );
}
