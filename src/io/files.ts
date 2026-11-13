import { validateDocument, type ValidateResult } from "../core/validate";
import type { Document } from "../core/types";

export function serializeDocument(doc: Document): string {
  return JSON.stringify(doc, null, 2);
}

export function parseDocument(text: string): ValidateResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["ファイルを JSON として読めません"] };
  }
  return validateDocument(data);
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\/:*?"<>|]/g, "").trim();
  return cleaned === "" ? "shape-snap" : cleaned;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
