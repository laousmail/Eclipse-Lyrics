import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyTapOffset,
  computeAverageDelayMs,
  offsetFromAverageDelay,
  createCalibrationPlan,
} from "../js/core/timing.js";
import { isSectionText, sectionLabel, parseLinesWithSections, isOverCharLimit } from "../js/core/lyrics.js";
import { createLyricLine } from "../js/core/project.js";

describe("Phase 2 timing offset", () => {
  it("applies negative offset and clamps at 0", () => {
    assert.equal(applyTapOffset(1000, -150), 850);
    assert.equal(applyTapOffset(50, -150), 0);
  });

  it("computes calibration delay and suggested offset", () => {
    const expected = createCalibrationPlan(0, 4, 500);
    const actual = expected.map((t) => t + 140);
    const avg = computeAverageDelayMs(expected, actual);
    assert.equal(avg, 140);
    assert.equal(offsetFromAverageDelay(avg), -140);
  });

  it("tapLine applies project tapOffsetMs", async () => {
    const { tapLine, createEmptyProject, createLyricLine } = await import("../js/sync.js");
    const project = createEmptyProject();
    project.settings.tapOffsetMs = -150;
    project.lines = [createLyricLine({ kab: "a" })];
    tapLine(project, 0, 1000);
    assert.equal(project.lines[0].startMs, 850);
  });
});

describe("Phase 2 section markers", () => {
  it("detects [Chorus] style sections", () => {
    assert.equal(isSectionText("[Chorus]"), true);
    assert.equal(sectionLabel("[Verse 2]"), "Verse 2");
    assert.equal(isSectionText("normal line"), false);
  });

  it("parses mixed lyric + section lines", () => {
    // FR/EN are lyric-aligned (no slot for section rows)
    const lines = parseLinesWithSections(["[Chorus]", "Awal", "Ɣer"], ["Mot", "Mot2"], ["Word", "Word2"]);
    assert.equal(lines[0].type, "section");
    assert.equal(lines[0].label, "Chorus");
    assert.equal(lines[1].type, "lyric");
    assert.equal(lines[1].text.kab, "Awal");
    assert.equal(lines[1].text.fr, "Mot");
    assert.equal(lines[2].text.en, "Word2");
  });

  it("warns over 42 characters", () => {
    const long = createLyricLine({ kab: "x".repeat(43) });
    assert.equal(isOverCharLimit(long), true);
    assert.equal(isOverCharLimit(createLyricLine({ kab: "short" })), false);
  });
});
