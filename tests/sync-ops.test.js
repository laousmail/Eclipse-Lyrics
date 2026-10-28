import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyProject,
  createLyricLine,
  createSectionLine,
  gapEndCurrent,
  holdPress,
  holdRelease,
  splitLyricAt,
  mergeWithNext,
  progressTimed,
  applyLyrics,
  isLyric,
} from "../js/sync.js";

describe("Phase 2 sync ops", () => {
  it("gap ends current without starting next", () => {
    const project = createEmptyProject();
    project.settings.tapOffsetMs = 0;
    project.audio.durationMs = 20000;
    project.lines = [
      createLyricLine({ kab: "a", startMs: 1000, endMs: 5000 }),
      createLyricLine({ kab: "b" }),
    ];
    const r = gapEndCurrent(project, 0, 2500);
    assert.ok(r);
    assert.equal(project.lines[0].endMs, 2500);
    assert.equal(project.lines[0].endManual, true);
    assert.equal(project.lines[1].startMs, null);
  });

  it("hold press/release sets start and end", () => {
    const project = createEmptyProject();
    project.settings.tapOffsetMs = 0;
    project.lines = [createLyricLine({ kab: "a" }), createLyricLine({ kab: "b" })];
    holdPress(project, 0, 1000);
    assert.equal(project.lines[0].startMs, 1000);
    const end = holdRelease(project, 0, 2200);
    assert.ok(end.setEnd);
    assert.equal(project.lines[0].endMs, 2200);
    assert.equal(project.lines[0].endManual, true);
    assert.equal(project.lines[1].startMs, null);
  });

  it("split and merge lines", () => {
    const project = createEmptyProject();
    project.lines = [createLyricLine({ kab: "hello world" })];
    assert.equal(splitLyricAt(project, 0, 5), true);
    assert.equal(project.lines.length, 2);
    assert.equal(project.lines[0].text.kab, "hello");
    assert.equal(project.lines[1].text.kab, "world");
    assert.equal(mergeWithNext(project, 0), true);
    assert.equal(project.lines.length, 1);
    assert.equal(project.lines[0].text.kab, "hello world");
  });

  it("progress chip counts lyrics only", () => {
    const lines = [
      createSectionLine({ label: "Chorus" }),
      createLyricLine({ kab: "a", startMs: 1 }),
      createLyricLine({ kab: "b" }),
    ];
    assert.deepEqual(progressTimed(lines), { timed: 1, total: 2 });
  });

  it("applyLyrics keeps section markers out of exportable lyrics", () => {
    const project = createEmptyProject();
    const { lines } = applyLyrics(project, "[Chorus]\nAwal\nƔer", "Mot\nX", "");
    assert.equal(lines[0].type, "section");
    assert.equal(lines.filter(isLyric).length, 2);
    assert.equal(lines[1].text.fr, "Mot");
  });
});
