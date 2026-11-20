import { useEffect, useRef, useState } from "react";

export interface SliderFieldProps {
  propKey: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  active: boolean;
  onChange: (v: number) => void;
}

function tidy(v: number): number {
  return Number(v.toFixed(4));
}

export function SliderField(props: SliderFieldProps) {
  const { propKey, label, value, min, max, step, active, onChange } = props;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const numberRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const input = numberRef.current;
    if (!input) return;
    const onWheel = (event: WheelEvent): void => {
      if (document.activeElement !== input) return;
      // A focused number input consumes the wheel to step its value in Chromium.
      // Keep the draft and focus, and scroll the surrounding pane instead.
      event.preventDefault();
      for (let parent = input.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (!/^(auto|scroll)$/.test(style.overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? parent.clientHeight
          : event.deltaMode === WheelEvent.DOM_DELTA_LINE ? parseFloat(style.lineHeight) || 16 : 1;
        const delta = event.deltaY * unit;
        if ((delta < 0 && parent.scrollTop > 0)
          || (delta > 0 && parent.scrollTop < parent.scrollHeight - parent.clientHeight)) {
          parent.scrollBy({ top: delta });
          break;
        }
      }
    };
    input.addEventListener("wheel", onWheel, { passive: false });
    return () => input.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const commit = (input: HTMLInputElement): void => {
    const raw = input.value.trim();
    const n = Number(raw);
    setDraft(null);
    if (raw === "" || !Number.isFinite(n)) {
      setInvalid(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setInvalid(false), 1000);
      return;
    }
    onChange(tidy(Math.min(max, Math.max(min, n))));
  };

  return (
    <div ref={rowRef} className={`field-row${active ? " active" : ""}`} data-prop={propKey}>
      <span className="field-label">{label}</span>
      <input
        type="range"
        className="field-range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(tidy(Number(e.target.value)))}
        onClick={(e) => e.currentTarget.blur()}
      />
      <input
        type="number"
        ref={numberRef}
        className={`field-number${invalid ? " invalid" : ""}`}
        aria-label={`${label}の数値`}
        min={min}
        max={max}
        step={step}
        value={draft ?? String(tidy(value))}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          // apply as you type while the text reads as a number inside the range
          const n = Number(raw.trim());
          if (raw.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(tidy(n));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget);
            e.currentTarget.blur();
          }
        }}
        onBlur={(e) => {
          if (draft !== null) commit(e.currentTarget);
        }}
      />
    </div>
  );
}
