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
  const latest = useRef(props);
  latest.current = props;
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const p = latest.current;
      const dir = e.deltaY < 0 ? 1 : -1;
      p.onChange(tidy(Math.min(p.max, Math.max(p.min, p.value + dir * p.step))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
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
        className={`field-number${invalid ? " invalid" : ""}`}
        aria-label={`${label}の数値`}
        min={min}
        max={max}
        step={step}
        value={draft ?? String(tidy(value))}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
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
