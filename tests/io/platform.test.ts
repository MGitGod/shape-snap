import { afterEach, describe, expect, it } from "vitest";
import { isDesktop } from "../../src/io/platform";

const g = globalThis as Record<string, unknown>;

afterEach(() => {
  delete g.window;
});

describe("isDesktop", () => {
  it("is false when there is no window", () => {
    delete g.window;
    expect(isDesktop()).toBe(false);
  });

  it("is false when window has no Tauri marker", () => {
    g.window = {};
    expect(isDesktop()).toBe(false);
  });

  it("is true when window has the Tauri marker", () => {
    g.window = { __TAURI_INTERNALS__: {} };
    expect(isDesktop()).toBe(true);
  });
});
