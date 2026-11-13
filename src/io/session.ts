import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { createDocument } from "../core/model";
import type { Document } from "../core/types";
import { loadDocument } from "../editor/actions";
import { dispatch, editorStore } from "../editor/store";
import { downloadBlob, parseDocument, safeFileName, serializeDocument } from "./files";
import {
  deleteWork, getCurrentWorkId, listWorks, loadWork, saveWork, setCurrentWorkId, type WorkMeta,
} from "./storage";

export interface WorkState {
  ready: boolean;
  currentId: string | null;
  currentName: string;
  works: WorkMeta[];
  saveError: boolean;
}

export const workStore = createStore<WorkState>(() => ({
  ready: false, currentId: null, currentName: "", works: [], saveError: false,
}));

export function useWork<T>(selector: (s: WorkState) => T): T {
  return useStore(workStore, selector);
}

const SAVE_DELAY_MS = 400;
let started: Promise<void> | null = null;
let timer: number | undefined;
let lastDoc: Document | null = null;   // the document last loaded or saved (skip no-op saves)
let chain: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

function currentDoc(): Document {
  return editorStore.getState().history.present;
}

async function refreshList(): Promise<void> {
  workStore.setState({ works: await listWorks() });
}

async function persist(id: string, name: string, doc: Document): Promise<void> {
  try {
    await enqueue(() => saveWork({ id, name, updatedAt: Date.now() }, doc));
    if (id === workStore.getState().currentId) lastDoc = doc;
    workStore.setState({ saveError: false });
    await refreshList();
  } catch {
    workStore.setState({ saveError: true });
  }
}

function saveCurrentNow(): Promise<void> {
  window.clearTimeout(timer);
  timer = undefined;
  const { currentId, currentName } = workStore.getState();
  const doc = currentDoc();
  if (currentId === null || doc === lastDoc) return Promise.resolve();
  return persist(currentId, currentName, doc);
}

function nextUntitledName(works: WorkMeta[]): string {
  let max = 0;
  for (const w of works) {
    const m = /^名前のない作品 (\d+)$/.exec(w.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `名前のない作品 ${max + 1}`;
}

async function activate(id: string, name: string, doc: Document, replaceEditor: boolean): Promise<void> {
  workStore.setState({ currentId: id, currentName: name });
  lastDoc = doc;
  if (replaceEditor) dispatch((s) => loadDocument(s, doc));
  lastDoc = currentDoc();
  try { await setCurrentWorkId(id); } catch { workStore.setState({ saveError: true }); }
}

async function createAndActivate(doc: Document, name: string, replaceEditor: boolean): Promise<void> {
  const id = crypto.randomUUID();
  workStore.setState({ currentId: id, currentName: name });
  lastDoc = null;
  if (replaceEditor) dispatch((s) => loadDocument(s, doc));
  await persist(id, name, replaceEditor ? currentDoc() : doc);
  try { await setCurrentWorkId(id); } catch { workStore.setState({ saveError: true }); }
}

export function startSession(): Promise<void> {
  if (started) return started;
  started = (async () => {
    const initial = currentDoc();
    editorStore.subscribe((s, prev) => {
      if (s.history.present === prev.history.present) return;
      if (workStore.getState().currentId === null) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void saveCurrentNow(); }, SAVE_DELAY_MS);
    });
    try {
      const works = await listWorks();
      workStore.setState({ works });
      const id = await getCurrentWorkId();
      const meta = works.find((w) => w.id === id);
      const doc = meta ? await loadWork(meta.id) : null;
      // If the user already edited before loading finished, keep their document.
      const untouched = currentDoc() === initial;
      if (meta && doc) {
        await activate(meta.id, meta.name, doc, untouched);
      } else {
        await createAndActivate(currentDoc(), nextUntitledName(works), false);
      }
    } catch {
      workStore.setState({ saveError: true });
      workStore.setState({ currentId: crypto.randomUUID(), currentName: "名前のない作品 1" });
    }
    workStore.setState({ ready: true });
  })();
  return started;
}

export async function newWork(): Promise<void> {
  await saveCurrentNow();
  await createAndActivate(createDocument(), nextUntitledName(workStore.getState().works), true);
}

export async function openWork(id: string): Promise<boolean> {
  if (id === workStore.getState().currentId) return true;
  const meta = workStore.getState().works.find((w) => w.id === id);
  if (!meta) return false;
  await saveCurrentNow();
  const doc = await loadWork(id);
  if (!doc) return false;
  await activate(id, meta.name, doc, true);
  return true;
}

export async function renameWork(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed === "") return;
  const isCurrent = id === workStore.getState().currentId;
  if (isCurrent) workStore.setState({ currentName: trimmed });
  const doc = isCurrent ? currentDoc() : await loadWork(id);
  if (!doc) return;
  await persist(id, trimmed, doc);
}

export async function removeWork(id: string): Promise<void> {
  const wasCurrent = id === workStore.getState().currentId;
  try {
    await enqueue(() => deleteWork(id));
  } catch {
    workStore.setState({ saveError: true });
    return;
  }
  await refreshList();
  if (!wasCurrent) return;
  window.clearTimeout(timer);
  const rest = workStore.getState().works;
  for (const m of rest) {
    const doc = await loadWork(m.id);
    if (doc) { await activate(m.id, m.name, doc, true); return; }
  }
  await createAndActivate(createDocument(), nextUntitledName(rest), true);
}

export type ImportResult = { ok: true } | { ok: false; errors: string[] };

export async function importWorkFile(text: string, fileName: string): Promise<ImportResult> {
  const r = parseDocument(text);
  if (!r.ok) return { ok: false, errors: r.errors };
  await saveCurrentNow();
  const base = fileName.replace(/\.[^.]*$/, "").trim();
  await createAndActivate(r.doc, base === "" ? "読み込んだ作品" : base, true);
  return { ok: true };
}

export function exportWorkFile(): void {
  const name = workStore.getState().currentName;
  downloadBlob(
    new Blob([serializeDocument(currentDoc())], { type: "application/json" }),
    `${safeFileName(name)}.json`,
  );
}
