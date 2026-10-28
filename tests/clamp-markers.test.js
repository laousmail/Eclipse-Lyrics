import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampLineStart, nudgeLine, setLineStart, createEmptyProject, createLyricLine } from "../js/sync.js";

describe("B4 marker clamp", () => {
  it("clamps between neighbours with 10ms gap", () => {
    const lines = [
      createLyricLine({ startMs: 1000, kab: "a" }),
      createLyricLine({ startMs: 2000, kab: "b" }),
      createLyricLine({ startMs: 3000, kab: "c" }),
    ];
    assert.equal(clampLineStart(lines, 1, 500, 10000), 1010);
    assert.equal(clampLineStart(lines, 1, 5000, 10000), 2990);
  });

  it("nudge and setLineStart refuse to cross", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 10000;
    project.lines = [
      createLyricLine({ startMs: 1000, endMs: 2000, kab: "a" }),
      createLyricLine({ startMs: 2000, endMs: 3000, kab: "b" }),
      createLyricLine({ startMs: 3000, endMs: 4000, kab: "c" }),
    ];
    nudgeLine(project, 1, -5000);
    assert.ok(project.lines[1].startMs >= project.lines[0].startMs + 10);
    setLineStart(project, 1, 9000);
    assert.ok(project.lines[1].startMs <= project.lines[2].startMs - 10);
  });
});
