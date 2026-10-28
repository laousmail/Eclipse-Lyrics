import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toLrcTime, toSrtTime, toVttTime, toSRT, parseImportedProject } from "../js/export.js";
import { createEmptyProject, createLyricLine } from "../js/sync.js";

describe("B1 export rounding", () => {
  it("formats 1.999s without ms overflow", () => {
    assert.equal(toSrtTime(1.999), "00:00:01,999");
    assert.equal(toVttTime(1.999), "00:00:01.999");
    assert.equal(toLrcTime(1.999), "[00:02.00]");
  });

  it("formats exact boundaries", () => {
    assert.equal(toSrtTime(0), "00:00:00,000");
    assert.equal(toSrtTime(59.9995), "00:01:00,000");
    assert.equal(toLrcTime(0), "[00:00.00]");
  });

  it("SRT export → import → export is identical", () => {
    const project = createEmptyProject();
    project.audio.durationMs = 12500;
    project.lines = [
      createLyricLine({ id: "a", startMs: 1999, endMs: null, kab: "Awal" }),
      createLyricLine({ id: "b", startMs: 4500, endMs: null, kab: "Ɣer" }),
    ];
    const first = toSRT(project, { includeTr: false });
    const imported = parseImportedProject(first, "x.srt");
    const second = toSRT(
      {
        ...project,
        audio: {
          ...project.audio,
          durationMs: imported.lines.at(-1)?.endMs ?? project.audio.durationMs,
        },
        lines: imported.lines,
      },
      { includeTr: false }
    );
    assert.equal(second, first);
  });
});
