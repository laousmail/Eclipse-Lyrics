import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyLyrics, lcsIndexMap } from "../js/sync.js";

describe("B3 LCS lyric rematch", () => {
  it("maps equal texts across inserts", () => {
    assert.deepEqual(lcsIndexMap(["a", "b", "c"], ["a", "x", "b", "c"]), [0, -1, 1, 2]);
  });

  it("keeps timings for unchanged lines when a line is inserted in the middle", () => {
    const project = {
      duration: 30,
      lines: [
        { id: "1", start: 1, end: 2, text: "A", fr: "", en: "" },
        { id: "2", start: 2, end: 3, text: "B", fr: "", en: "" },
        { id: "3", start: 3, end: 4, text: "C", fr: "", en: "" },
      ],
    };
    const result = applyLyrics(project, "A\nNEW\nB\nC", "", "");
    assert.equal(result.lines[0].start, 1);
    assert.equal(result.lines[1].start, null); // inserted
    assert.equal(result.lines[2].start, 2);
    assert.equal(result.lines[3].start, 3);
    assert.equal(result.added, 1);
  });

  it("keeps timing for an edited line in the same slot", () => {
    const project = {
      duration: 10,
      lines: [{ id: "1", start: 1.5, end: 3, text: "Hello", fr: "", en: "" }],
    };
    const result = applyLyrics(project, "Hello world", "", "");
    assert.equal(result.lines[0].start, 1.5);
    assert.equal(result.changed, 1);
  });
});
