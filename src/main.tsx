import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { expandNode } from "./core/tree";
import { editorStore } from "./editor/store";
import { documentToSvg, type ExportOptions } from "./render/svg";
import "./styles.css";

if (import.meta.env.DEV) {
  (window as unknown as { __shapeSnap: unknown }).__shapeSnap = {
    getState: () => editorStore.getState(),
    expand: (id: string) => {
      const node = editorStore.getState().history.present.nodes.find((n) => n.id === id);
      return node ? expandNode(node) : [];
    },
    getSvg: (opts: ExportOptions) => documentToSvg(editorStore.getState().history.present, opts),
  };
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
