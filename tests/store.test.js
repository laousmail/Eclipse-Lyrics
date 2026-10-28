import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { get, set, subscribe, reset, listenerCount } from "../js/store.js";

describe("store", () => {
  beforeEach(() => reset({}));

  it("get/set merge state", () => {
    set({ a: 1 });
    set({ b: 2 });
    assert.deepEqual(get(), { a: 1, b: 2 });
  });

  it("notifies subscribers with patch", () => {
    const patches = [];
    const unsub = subscribe((_s, p) => patches.push(p));
    set({ x: 1 });
    unsub();
    set({ y: 2 });
    assert.equal(patches.length, 1);
    assert.deepEqual(patches[0], { x: 1 });
    assert.equal(listenerCount(), 0);
  });
});
