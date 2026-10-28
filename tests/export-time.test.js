import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toLrcTime, toSrtTime, toVttTime, toSRT, parseImportedProject } from "../js/export.js";

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
    const project = {
      title: "",
      artist: "",
      duration: 12.5,
      lines: [
        { id: "a", start: 1.999, end: null, text: "Awal", fr: "", en: "" },
        { id: "b", start: 4.5, end: null, text: "Ɣer", fr: "", en: "" },
      ],
      settings: {},
    };
    const first = toSRT(project, { includeTr: false });
    const imported = parseImportedProject(first, "x.srt");
    const second = toSRT(
      {
        ...project,
        duration: imported.lines.at(-1)?.end ?? project.duration,
        lines: imported.lines.map((l) => ({ ...l, fr: l.fr || "", en: l.en || "" })),
      },
      { includeTr: false }
    );
    assert.equal(second, first);
  });
});

