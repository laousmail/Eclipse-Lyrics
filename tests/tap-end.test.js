import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tapLine, isSyncComplete, nextTapIndex } from "../js/sync.js";

describe("B5 last-line end tap", () => {
  it("sets last end after all starts, then completes", () => {
    const project = {
      duration: 20,
      lines: [
        { id: "1", start: null, end: null, text: "a" },
        { id: "2", start: null, end: null, text: "b" },
      ],
    };
    tapLine(project, 0, 1);
    tapLine(project, 1, 3);
    assert.equal(project.lines[1].start, 3);
    assert.equal(isSyncComplete(project.lines), false);
    assert.equal(nextTapIndex(project.lines), 2);

    const endTap = tapLine(project, 1, 5);
    assert.equal(endTap.done, true);
    assert.equal(project.lines[1].end, 5);
    assert.equal(isSyncComplete(project.lines), true);

    const extra = tapLine(project, 1, 6);
    assert.equal(extra.noop, true);
    assert.equal(project.lines[1].end, 5);
  });
});
