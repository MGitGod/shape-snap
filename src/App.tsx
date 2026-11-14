import { useCallback, useEffect, useState } from "react";
import { useEditor } from "./editor/store";
import { attachKeyboard } from "./input/keyboard";
import { exportWorkFile, startSession, useWork } from "./io/session";
import { Banner } from "./ui/Banner";
import { CanvasView } from "./ui/CanvasView";
import { ExportDialog } from "./ui/ExportDialog";
import { GridPanel } from "./ui/GridPanel";
import { KeyHints } from "./ui/KeyHints";
import { KeysDialog } from "./ui/KeysDialog";
import { PropsPanel } from "./ui/PropsPanel";
import { ShapeList } from "./ui/ShapeList";
import { Toolbar } from "./ui/Toolbar";
import { WorksMenu } from "./ui/WorksMenu";

function canvasViewport(): { width: number; height: number } {
  const el = document.querySelector('[data-testid="canvas"]');
  const r = el?.getBoundingClientRect();
  return { width: r?.width ?? 800, height: r?.height ?? 600 };
}

export function App() {
  const focusArea = useEditor((s) => s.focusArea);
  const notice = useEditor((s) => s.notice);
  const ready = useWork((s) => s.ready);
  const saveError = useWork((s) => s.saveError);
  const [dialog, setDialog] = useState<"works" | "export" | "keys" | null>(null);
  const closeDialog = useCallback(() => setDialog(null), []);
  useEffect(() => attachKeyboard(canvasViewport), []);
  useEffect(() => { void startSession(); }, []);
  return (
    <div className="app" data-focus={focusArea} data-ready={ready}>
      <header className="toolbar">
        <Toolbar
          getViewport={canvasViewport}
          onOpenWorks={() => setDialog("works")}
          onOpenExport={() => setDialog("export")}
          onOpenKeys={() => setDialog("keys")}
        />
      </header>
      <main className="stage">
        <CanvasView />
      </main>
      <aside className="side">
        <ShapeList />
        <PropsPanel getViewport={canvasViewport} />
        <GridPanel />
      </aside>
      <footer className="hints">
        <KeyHints />
      </footer>
      {saveError && (
        <Banner
          message="自動保存に失敗しました。作業ファイルを書き出して控えを取ってください。"
          actionLabel="作業ファイルを書き出す"
          onAction={exportWorkFile}
        />
      )}
      {notice !== null && notice.startsWith("結合できませんでした") && <Banner message={notice} />}
      {dialog === "works" && <WorksMenu onClose={closeDialog} />}
      {dialog === "keys" && <KeysDialog onClose={closeDialog} />}
      {dialog === "export" && <ExportDialog onClose={closeDialog} />}
    </div>
  );
}
