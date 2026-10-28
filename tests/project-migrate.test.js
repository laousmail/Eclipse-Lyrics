import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { migrateProject, isV2Project, lineMainText, msToSec } from "../js/core/project.js";

describe("project v2 migrate", () => {
  it("migrates v1 seconds + flat text to ms + text map", () => {
    const v2 = migrateProject({
      title: "Song",
      audioFileName: "a.mp3",
      duration: 12.5,
      lines: [{ id: "1", start: 1.5, end: 3, text: "Awal", fr: "Mot", en: "Word" }],
      settings: { playbackRate: 1 },
    });
    assert.equal(isV2Project(v2), true);
    assert.equal(v2.version, 2);
    assert.equal(v2.audio.fileName, "a.mp3");
    assert.equal(v2.audio.durationMs, 12500);
    assert.equal(v2.lines[0].startMs, 1500);
    assert.equal(v2.lines[0].endMs, 3000);
    assert.equal(lineMainText(v2.lines[0]), "Awal");
    assert.equal(v2.lines[0].text.fr, "Mot");
    assert.equal(msToSec(v2.lines[0].startMs), 1.5);
  });

  it("is idempotent on v2", () => {
    const once = migrateProject({
      version: 2,
      audio: { fileName: "x", durationMs: 1000, storedAudioId: "a1" },
      lines: [{ id: "L1", type: "lyric", startMs: 100, endMs: 200, text: { kab: "hi", fr: "", en: "" } }],
    });
    const twice = migrateProject(once);
    assert.equal(twice.lines[0].startMs, 100);
    assert.equal(lineMainText(twice.lines[0]), "hi");
  });
});
