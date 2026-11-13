import { describe, expect, it } from "vitest";
import { COALESCE_MS, commit, createHistory, redo, undo } from "../../src/core/history";

describe("history", () => {
  it("commit pushes the present onto past", () => {
    const h = commit(createHistory(1), 2, { now: 0 });
    expect(h.past).toEqual([1]);
    expect(h.present).toBe(2);
    expect(h.future).toEqual([]);
  });

  it("undo then redo returns to the same state", () => {
    const h = commit(commit(createHistory(1), 2, { now: 0 }), 3, { now: 10 });
    const u = undo(h);
    expect(u.present).toBe(2);
    expect(u.future).toEqual([3]);
    const r = redo(u);
    expect(r.present).toBe(3);
    expect(r.past).toEqual([1, 2]);
    expect(r.future).toEqual([]);
  });

  it("commit after undo clears future", () => {
    const u = undo(commit(createHistory(1), 2, { now: 0 }));
    const h = commit(u, 9, { now: 5 });
    expect(h.future).toEqual([]);
    expect(h.past).toEqual([1]);
    expect(h.present).toBe(9);
  });

  it("undo and redo at the ends return the same history", () => {
    const h = createHistory(1);
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });

  it("coalesces the same key within COALESCE_MS", () => {
    const a = commit(createHistory(1), 2, { coalesceKey: "k", now: 1000 });
    const b = commit(a, 3, { coalesceKey: "k", now: 1500 });
    expect(b.past).toEqual([1]);
    expect(b.present).toBe(3);
  });

  it("does not coalesce after the window", () => {
    const a = commit(createHistory(1), 2, { coalesceKey: "k", now: 1000 });
    const b = commit(a, 3, { coalesceKey: "k", now: 1000 + COALESCE_MS + 100 });
    expect(b.past).toEqual([1, 2]);
  });

  it("does not coalesce different keys or missing keys", () => {
    const a = commit(createHistory(1), 2, { coalesceKey: "k", now: 0 });
    expect(commit(a, 3, { coalesceKey: "other", now: 10 }).past).toEqual([1, 2]);
    expect(commit(a, 3, { now: 10 }).past).toEqual([1, 2]);
  });

  it("undo resets lastKey so the next commit does not coalesce", () => {
    const a = commit(commit(createHistory(1), 2, { coalesceKey: "k", now: 0 }), 3, { coalesceKey: "k", now: 5 });
    const u = undo(a);
    expect(u.lastKey).toBeNull();
    const b = commit(u, 7, { coalesceKey: "k", now: 10 });
    expect(b.past).toEqual([1]);
    expect(b.present).toBe(7);
    expect(redo(undo(b)).lastKey).toBeNull();
  });

  it("returns the same reference when nothing changed", () => {
    const h = createHistory({ a: 1 });
    expect(commit(h, h.present)).toBe(h);
  });
});
