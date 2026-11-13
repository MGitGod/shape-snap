import { useEffect } from "react";
import { useEditor } from "./editor/store";
import { attachKeyboard } from "./input/keyboard";
import { CanvasView } from "./ui/CanvasView";
import { GridPanel } from "./ui/GridPanel";
import { KeyHints } from "./ui/KeyHints";
import { PropsPanel } from "./ui/PropsPanel";
import { ShapeList } from "./ui/ShapeList";
import { Toolbar } from "./ui/Toolbar";

function canvasViewport(): { width: number; height: number } {
  const el = document.querySelector('[data-testid="canvas"]');
  const r = el?.getBoundingClientRect();
  return { width: r?.width ?? 800, height: r?.height ?? 600 };
}

export function App() {
  const focusArea = useEditor((s) => s.focusArea);
  useEffect(() => attachKeyboard(canvasViewport), []);
  return (
    <div className="app" data-focus={focusArea}>
      <header className="toolbar">
        <Toolbar getViewport={canvasViewport} />
      </header>
      <main className="stage">
        <CanvasView />
      </main>
      <aside className="side">
        <ShapeList />
        <PropsPanel />
        <GridPanel />
      </aside>
      <footer className="hints">
        <KeyHints />
      </footer>
    </div>
  );
}
