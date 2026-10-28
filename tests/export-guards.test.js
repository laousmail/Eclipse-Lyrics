import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { timedLines, createLyricLine } from "../js/sync.js";
import { toSRT } from "../js/export.js";
import { createEmptyProject } from "../js/core/project.js";

describe("B9 export guards", () => {
  it("reports zero timed lines", () => {
    const lines = [createLyricLine({ kab: "a" }), createLyricLine({ kab: "b" })];
    assert.equal(timedLines(lines).length, 0);
  });

  it("SRT skips untimed lines but keeps timed ones", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 10000;
    project.lines = [
      createLyricLine({ startMs: 1000, endMs: 2000, kab: "A" }),
      createLyricLine({ kab: "B" }),
    ];
    const out = toSRT(project, { includeTr: false });
    assert.match(out, /A/);
    assert.doesNotMatch(out, /^B$/m);
  });
});
