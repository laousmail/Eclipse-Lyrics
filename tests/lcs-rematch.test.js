import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyLyrics, lcsIndexMap, createEmptyProject, createLyricLine } from "../js/sync.js";

describe("B3 LCS lyric rematch", () => {
  it("maps equal texts across inserts", () => {
    assert.deepEqual(lcsIndexMap(["a", "b", "c"], ["a", "x", "b", "c"]), [0, -1, 1, 2]);
  });

  it("keeps timings for unchanged lines when a line is inserted in the middle", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 30000;
    project.lines = [
      createLyricLine({ id: "1", startMs: 1000, endMs: 2000, kab: "A" }),
      createLyricLine({ id: "2", startMs: 2000, endMs: 3000, kab: "B" }),
      createLyricLine({ id: "3", startMs: 3000, endMs: 4000, kab: "C" }),
    ];
    const result = applyLyrics(project, "A\nNEW\nB\nC", "", "");
    assert.equal(result.lines[0].startMs, 1000);
    assert.equal(result.lines[1].startMs, null);
    assert.equal(result.lines[2].startMs, 2000);
    assert.equal(result.lines[3].startMs, 3000);
    assert.equal(result.added, 1);
  });

  it("keeps timing for an edited line in the same slot", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 10000;
    project.lines = [createLyricLine({ id: "1", startMs: 1500, endMs: 3000, kab: "Hello" })];
    const result = applyLyrics(project, "Hello world", "", "");
    assert.equal(result.lines[0].startMs, 1500);
    assert.equal(result.changed, 1);
  });
});
