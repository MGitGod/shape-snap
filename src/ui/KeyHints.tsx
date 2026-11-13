import { hintsFor } from "../input/keymap";
import { useEditor } from "../editor/store";

export function KeyHints() {
  const state = useEditor((s) => s);
  const hints = hintsFor(state);
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
    </div>
  );
}
