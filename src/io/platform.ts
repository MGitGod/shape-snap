import { downloadBlob } from "./files";

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const EXT_NAMES: Record<string, string> = {
  json: "作業ファイル",
  svg: "SVG 画像",
  png: "PNG 画像",
};

/** Browser: download. Desktop: ask where to save, then write there. Throws if writing fails. */
export async function saveFile(blob: Blob, fileName: string): Promise<"saved" | "cancelled"> {
  if (!isDesktop()) {
    downloadBlob(blob, fileName);
    return "saved";
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  const ext = fileName.includes(".") ? (fileName.split(".").pop() ?? "").toLowerCase() : "";
  const path = await save({
    defaultPath: fileName,
    filters: ext === "" ? undefined : [{ name: EXT_NAMES[ext] ?? ext, extensions: [ext] }],
  });
  if (path === null) return "cancelled";
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  return "saved";
}
