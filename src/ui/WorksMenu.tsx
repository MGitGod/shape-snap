import { useEffect, useRef, useState } from "react";
import { importWorkFile, newWork, openWork, removeWork, renameWork, useWork } from "../io/session";

function formatTime(t: number): string {
  return new Date(t).toLocaleString("ja-JP", { hour12: false });
}

export function WorksMenu({ onClose }: { onClose: () => void }) {
  const works = useWork((s) => s.works);
  const currentId = useWork((s) => s.currentId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
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

  const commitRename = (id: string): void => {
    void renameWork(id, draft);
    setRenaming(null);
  };

  return (
    <div className="modal-backdrop">
      <div ref={boxRef} className="modal" role="dialog" aria-modal="true" aria-label="作品" data-modal="works" tabIndex={-1}>
        <h2>作品</h2>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => { setErrors([]); void newWork(); }}>新しい作品</button>
          <label className="btn file-btn">
            作業ファイルを読み込む
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                void file.text().then(async (text) => {
                  const r = await importWorkFile(text, file.name);
                  if (r.ok) { setErrors([]); onClose(); } else setErrors(r.errors);
                });
                input.value = "";
              }}
            />
          </label>
        </div>
        {errors.length > 0 && (
          <div className="modal-error" role="alert">
            <strong>作業ファイルを読み込めませんでした。今の作品は変わっていません。</strong>
            <ul>{errors.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}
        <ul className="works-list">
          {works.map((w) => (
            <li key={w.id} className={`work-row${w.id === currentId ? " current" : ""}`} data-work-id={w.id}>
              {renaming === w.id ? (
                <div className="work-edit">
                  <input
                    type="text"
                    className="text-input"
                    aria-label="作品の名前"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(w.id); }}
                  />
                  <button type="button" className="btn" onClick={() => commitRename(w.id)}>決定</button>
                  <button type="button" className="btn" onClick={() => setRenaming(null)}>やめる</button>
                </div>
              ) : confirming === w.id ? (
                <div className="work-edit">
                  <span>この作品を消します。元に戻せません。</span>
                  <button type="button" className="btn danger" onClick={() => { setConfirming(null); void removeWork(w.id); }}>消す</button>
                  <button type="button" className="btn" onClick={() => setConfirming(null)}>やめる</button>
                </div>
              ) : (
                <>
                  <div className="work-info">
                    <span className="work-name">{w.name}{w.id === currentId ? "（開いている作品）" : ""}</span>
                    <span className="work-time">{formatTime(w.updatedAt)}</span>
                  </div>
                  <button type="button" className="btn" disabled={w.id === currentId}
                    onClick={() => { void openWork(w.id).then((ok) => { if (ok) onClose(); }); }}>開く</button>
                  <button type="button" className="btn" onClick={() => { setDraft(w.name); setRenaming(w.id); }}>名前を変える</button>
                  <button type="button" className="btn" onClick={() => setConfirming(w.id)}>消す</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
}
