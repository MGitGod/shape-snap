import { snapPointToDoc } from "../core/geometry";
import { hintsFor } from "../input/keymap";
import { useKeymap } from "../input/keymapStore";
import { currentDoc } from "../editor/state";
import { useEditor } from "../editor/store";

function fmt(v: number): string {
  return String(Number(v.toFixed(2)));
}

export function KeyHints() {
  const state = useEditor((s) => s);
  const map = useKeymap();
  const hints = hintsFor(state, map);
  const target = state.cursor ? snapPointToDoc(state.cursor, currentDoc(state)) : null;
  return (
    <div className="key-hints" aria-live="polite">
      <strong className="key-hints-title">今使えるキー</strong>
      <ul>
        {hints.map((h, i) => (
          <li key={`${i}-${h.keys}-${h.label}`}>
            {h.keys !== "" && <kbd>{h.keys}</kbd>}
            <span>{h.keys !== "" ? ": " : ""}{h.label}</span>
          </li>
        ))}
      </ul>
      {target && (
        <span className="cursor-pos" data-testid="cursor-pos">
          {`x ${fmt(target.x)}  y ${fmt(target.y)}`}
        </span>
      )}
    </div>
  );
}
