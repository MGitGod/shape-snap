import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { hasModifier } from "../input/keyboard";
import {
  DEFAULT_KEYMAP, FIXED_KEYS, keyFor, keyLabel, type ActionId, type KeyBinding,
} from "../input/keymap";
import { keymapStore, rebindKey, resetAllKeys, resetKey, useKeymap } from "../input/keymapStore";

const GROUPS: KeyBinding["group"][] = ["置く", "選ぶ", "動かす", "編集", "表示", "見る"];
const SAVE_FAILED = "キーの設定を保存できませんでした";

function shortLabel(action: ActionId): string {
  const b = DEFAULT_KEYMAP.find((x) => x.action === action);
  return (b?.label ?? action).replace(/を置く$/, "");
}

interface Message { action: ActionId; text: string; error: boolean }

export function KeysDialog({ onClose }: { onClose: () => void }) {
  const map = useKeymap();
  const saveError = useStore(keymapStore, (s) => s.saveError);
  const [waiting, setWaiting] = useState<ActionId | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const waitingRef = useRef<ActionId | null>(null);
  waitingRef.current = waiting;

  useEffect(() => {
    boxRef.current?.focus();
    // capture phase: while waiting for a key, this runs before any other key handler
    const onKey = (e: KeyboardEvent): void => {
      const action = waitingRef.current;
      if (action === null) {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onClose();
        return;
      }
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key) || hasModifier(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") {
        setWaiting(null);
        setMessage(null);
        return;
      }
      const result = rebindKey(action, e.key);
      if (result.error !== null) {
        setMessage({ action, text: result.error, error: true });
        return;
      }
      setWaiting(null);
      setMessage(
        result.swappedWith !== null
          ? { action, text: `「${shortLabel(result.swappedWith)}」と入れ替えました`, error: false }
          : null,
      );
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const actions: { action: ActionId; label: string; group: KeyBinding["group"] }[] = [];
  for (const b of DEFAULT_KEYMAP) {
    if (!actions.some((a) => a.action === b.action)) actions.push({ action: b.action, label: b.label, group: b.group });
  }

  const row = (a: { action: ActionId; label: string }) => {
    const defaults = DEFAULT_KEYMAP.filter((b) => b.action === a.action);
    const fixed = FIXED_KEYS.includes(defaults[0]?.key ?? "");
    const current = keyFor(map, a.action);
    const changed = !fixed && current !== keyFor(DEFAULT_KEYMAP, a.action);
    const isWaiting = waiting === a.action;
    return (
      <li key={a.action} className="key-row" data-key-row={a.action}>
        <span className="key-row-label">{a.label}</span>
        {fixed ? (
          <>
            <span className="key-row-keys">
              {map.filter((b) => b.action === a.action).map((b) => <kbd key={b.key}>{keyLabel(b.key)}</kbd>)}
            </span>
            <span className="key-fixed">固定</span>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`btn key-btn${isWaiting ? " on" : ""}`}
              data-key-action={a.action}
              aria-pressed={isWaiting}
              onClick={() => { setWaiting(a.action); setMessage(null); setConfirmAll(false); }}
            >
              <kbd>{keyLabel(current)}</kbd>
            </button>
            {changed && (
              <button
                type="button"
                className="btn"
                data-key-reset={a.action}
                onClick={() => {
                  const r = resetKey(a.action);
                  setWaiting(null);
                  setMessage(r.swappedWith !== null
                    ? { action: a.action, text: `「${shortLabel(r.swappedWith)}」と入れ替えました`, error: false }
                    : null);
                }}
              >
                初めに戻す
              </button>
            )}
          </>
        )}
        {isWaiting && <span className="key-wait" data-key-wait>新しいキーを押してください（Esc でやめる）</span>}
        {message && message.action === a.action && (
          <p className={message.error ? "modal-error key-msg" : "modal-note key-msg"} role={message.error ? "alert" : "status"}>
            {message.text}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="modal-backdrop">
      <div ref={boxRef} className="modal keys-modal" role="dialog" aria-modal="true" aria-label="キーの設定" data-modal="keys" tabIndex={-1}>
        <h2>キーの設定</h2>
        {saveError && <p className="modal-error" role="alert">{SAVE_FAILED}</p>}
        {GROUPS.map((g) => {
          const items = actions.filter((a) => a.group === g);
          if (items.length === 0) return null;
          return (
            <section key={g} className="keys-group">
              <h3>{g}</h3>
              <ul className="key-list">{items.map(row)}</ul>
            </section>
          );
        })}
        <div className="modal-actions">
          {confirmAll ? (
            <>
              <span>全部のキーを初めに戻します</span>
              <button type="button" className="btn primary" data-keys-reset-confirm
                onClick={() => { resetAllKeys(); setConfirmAll(false); setWaiting(null); setMessage(null); }}>戻す</button>
              <button type="button" className="btn" onClick={() => setConfirmAll(false)}>やめる</button>
            </>
          ) : (
            <button type="button" className="btn" data-keys-reset-all onClick={() => { setConfirmAll(true); setWaiting(null); }}>全部を初めに戻す</button>
          )}
          <button type="button" className="btn" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
