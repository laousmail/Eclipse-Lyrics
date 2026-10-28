import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as history from "../js/history.js";

describe("history", () => {
  beforeEach(() => history.clear());

  it("undo/redo restores values", () => {
    let n = 0;
    history.push({
      label: "inc",
      do: () => {
        n += 1;
      },
      undo: () => {
        n -= 1;
      },
    });
    assert.equal(n, 1);
    history.undo();
    assert.equal(n, 0);
    history.redo();
    assert.equal(n, 1);
  });

  it("new push clears redo", () => {
    let n = 0;
    history.push({
      label: "a",
      do: () => {
        n = 1;
      },
      undo: () => {
        n = 0;
      },
    });
    history.undo();
    history.push({
      label: "b",
      do: () => {
        n = 2;
      },
      undo: () => {
        n = 0;
      },
    });
    assert.equal(history.canRedo(), false);
    assert.equal(n, 2);
  });
});
