import { useEffect, useRef, useState } from "react";
import type { SceneNode } from "../core/types";
import { selectOnly, setNodeProp } from "../editor/actions";
import { currentDoc } from "../editor/state";
import { dispatch, editorStore, useEditor } from "../editor/store";

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

function Row({ node, selected }: { node: SceneNode; selected: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const choose = (): void => {
    dispatch((s) => {
      if (s.multiSelect) {
        const selection = s.selection.includes(node.id)
          ? s.selection.filter((id) => id !== node.id)
          : [...s.selection, node.id];
        return { ...s, selection, heldHandle: null, focusArea: "list" as const };
      }
      return { ...selectOnly(s, node.id), focusArea: "list" as const };
    });
  };

  const finishRename = (raw: string, save: boolean): void => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const name = raw.trim();
    if (save && name !== "" && name !== node.name) {
      dispatch((s) => setNodeProp(s, node.id, { name }, "rename"));
    }
  };

  const stop = (fn: () => void) => (e: { stopPropagation: () => void; currentTarget: HTMLElement }) => {
    e.stopPropagation();
    fn();
    e.currentTarget.blur();
  };

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selected}
      data-list-id={node.id}
      className={`list-row${selected ? " selected" : ""}${node.visible ? "" : " dim"}`}
      onClick={choose}
    >
      {editing ? (
        <input
          className="name-input"
          aria-label="新しい名前"
          defaultValue={node.name}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finishRename(e.currentTarget.value, true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              finishRename("", false);
            }
          }}
          onBlur={(e) => finishRename(e.currentTarget.value, true)}
        />
      ) : (
        <span className="row-name">{node.name}</span>
      )}
      {!editing && (
        <>
          <button
            type="button"
            className="btn small"
            data-row-action="rename"
            onClick={stop(() => {
              finished.current = false;
              setEditing(true);
            })}
          >
            名前を変える
          </button>
          <button
            type="button"
            className="btn small"
            data-row-action="visible"
            onClick={stop(() => dispatch((s) => setNodeProp(s, node.id, { visible: !node.visible }, `visible:${node.id}`)))}
          >
            {node.visible ? "表示" : "非表示"}
          </button>
          <button
            type="button"
            className={`btn small${node.locked ? " on" : ""}`}
            data-row-action="lock"
            aria-pressed={node.locked}
            onClick={stop(() => dispatch((s) => setNodeProp(s, node.id, { locked: !node.locked }, `locked:${node.id}`)))}
          >
            ロック
          </button>
        </>
      )}
    </div>
  );
}

export function ShapeList() {
  const doc = useEditor((s) => currentDoc(s));
  const selection = useEditor((s) => s.selection);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = editorStore.getState();
      if (s.focusArea !== "list") return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isTextField(e.target)) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const shown = [...currentDoc(s).nodes].reverse();
      if (shown.length === 0) return;
      const main = s.selection[s.selection.length - 1];
      const i = main === undefined ? -1 : shown.findIndex((n) => n.id === main);
      const j = i < 0 ? 0 : Math.min(shown.length - 1, Math.max(0, i + (e.key === "ArrowUp" ? -1 : 1)));
      const target = shown[j];
      if (target) dispatch((st) => selectOnly(st, target.id));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = [...doc.nodes].reverse();
  return (
    <section className="panel" data-area="list" aria-label="図形リスト">
      <h2>図形リスト</h2>
      {shown.length === 0 ? (
        <p className="empty">R・C・P で図形、L で線を置けます</p>
      ) : (
        <div role="listbox" aria-label="図形" aria-multiselectable="true">
          {shown.map((n) => (
            <Row key={n.id} node={n} selected={selection.includes(n.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
