import { del, get, set, update } from "idb-keyval";
import { validateDocument } from "../core/validate";
import type { Document } from "../core/types";

export interface WorkMeta { id: string; name: string; updatedAt: number }

const WORKS = "works";
const CURRENT = "current";
const workKey = (id: string): string => `work:${id}`;

export async function listWorks(): Promise<WorkMeta[]> {
  const list = (await get<WorkMeta[]>(WORKS)) ?? [];
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadWork(id: string): Promise<Document | null> {
  const data = await get<unknown>(workKey(id));
  if (data === undefined) return null;
  const r = validateDocument(data);
  return r.ok ? r.doc : null;
}

export async function saveWork(meta: WorkMeta, doc: Document): Promise<void> {
  await set(workKey(meta.id), doc);
  await update<WorkMeta[]>(WORKS, (list) => {
    const rest = (list ?? []).filter((m) => m.id !== meta.id);
    return [...rest, meta];
  });
}

export async function deleteWork(id: string): Promise<void> {
  await del(workKey(id));
  await update<WorkMeta[]>(WORKS, (list) => (list ?? []).filter((m) => m.id !== id));
}

export async function getCurrentWorkId(): Promise<string | null> {
  return (await get<string>(CURRENT)) ?? null;
}

export async function setCurrentWorkId(id: string): Promise<void> {
  await set(CURRENT, id);
}
