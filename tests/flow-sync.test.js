import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { syncStatus } from "../js/flow/sync-step.js";
import { createLyricLine, createSectionLine } from "../js/core/project.js";

const lines = () => [
  createSectionLine({ label: "Verse" }),
  createLyricLine({ kab: "A" }),
  createLyricLine({ kab: "B" }),
];

describe("tap step status", () => {
  it("starts on the first lyric, skipping section headers", () => {
    const s = syncStatus(lines());
    assert.equal(s.total, 2);
    assert.equal(s.tapIndex, 1);
    assert.equal(s.position, 0);
    assert.equal(s.done, false);
  });

  it("asks for one more tap to end the last line", () => {
    const l = lines();
    l[1].startMs = 1000;
    l[2].startMs = 2000;
    const s = syncStatus(l);
    assert.equal(s.awaitingEnd, true);
    assert.equal(s.done, false);
  });

  it("is done once the last line has its end", () => {
    const l = lines();
    l[1].startMs = 1000;
    l[2].startMs = 2000;
    l[2].endMs = 3000;
    l[2].endManual = true;
    const s = syncStatus(l);
    assert.equal(s.done, true);
    assert.equal(s.timed, 2);
  });
});
