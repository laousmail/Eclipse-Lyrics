import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  tapLine,
  isSyncComplete,
  nextTapIndex,
  createEmptyProject,
  createLyricLine,
} from "../js/sync.js";

describe("B5 last-line end tap", () => {
  it("sets last end after all starts, then completes", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 20000;
    project.lines = [
      createLyricLine({ id: "1", kab: "a" }),
      createLyricLine({ id: "2", kab: "b" }),
    ];
    tapLine(project, 0, 1000);
    tapLine(project, 1, 3000);
    assert.equal(project.lines[1].startMs, 3000);
    assert.equal(isSyncComplete(project.lines), false);
    assert.equal(nextTapIndex(project.lines), 2);

    const endTap = tapLine(project, 1, 5000);
    assert.equal(endTap.done, true);
    assert.equal(project.lines[1].endMs, 5000);
    assert.equal(isSyncComplete(project.lines), true);

    const extra = tapLine(project, 1, 6000);
    assert.equal(extra.noop, true);
    assert.equal(project.lines[1].endMs, 5000);
  });
});
