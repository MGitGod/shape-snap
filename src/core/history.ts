export interface History<T> { past: T[]; present: T; future: T[]; lastKey: string | null; lastTime: number }

export const COALESCE_MS = 800;

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [], lastKey: null, lastTime: 0 };
}

export function commit<T>(h: History<T>, next: T, opts: { coalesceKey?: string; now?: number } = {}): History<T> {
  if (next === h.present) return h;
  const now = opts.now ?? Date.now();
  const key = opts.coalesceKey ?? null;
  if (key !== null && key === h.lastKey && now - h.lastTime <= COALESCE_MS) {
    return { ...h, present: next, lastTime: now };
  }
  return { past: [...h.past, h.present], present: next, future: [], lastKey: key, lastTime: now };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1] as T;
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
    lastKey: null,
    lastTime: h.lastTime,
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const next = h.future[0] as T;
  return {
    past: [...h.past, h.present],
    present: next,
    future: h.future.slice(1),
    lastKey: null,
    lastTime: h.lastTime,
  };
}
