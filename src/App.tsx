import { useEffect } from "react";
import { attachKeyboard } from "./input/keyboard";
import { CanvasView } from "./ui/CanvasView";
import { KeyHints } from "./ui/KeyHints";

function canvasViewport(): { width: number; height: number } {
  const el = document.querySelector('[data-testid="canvas"]');
  const r = el?.getBoundingClientRect();
  return { width: r?.width ?? 800, height: r?.height ?? 600 };
}

export function App() {
  useEffect(() => attachKeyboard(canvasViewport), []);
  return (
    <div className="app">
      <header className="toolbar">
        <h1>Shape Snap</h1>
      </header>
      <main className="stage">
        <CanvasView />
      </main>
      <aside className="side" />
      <footer className="hints">
        <KeyHints />
      </footer>
    </div>
  );
}
