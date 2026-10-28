import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCueTime, parseImportedProject, hasMultiLineCues } from "../js/export.js";
import { lineMainText, lineFr } from "../js/sync.js";

describe("B7 SRT/VTT import", () => {
  it("parses times with and without hours", () => {
    assert.equal(parseCueTime("01:23.456"), 83.456);
    assert.equal(parseCueTime("00:01:23,456"), 83.456);
    assert.equal(parseCueTime("1:02:03.004"), 3723.004);
  });

  it("joins multi-line cue text by default", () => {
    const srt = `1
00:00:01,000 --> 00:00:02,000
Line one
Line two
Line three
`;
    assert.equal(hasMultiLineCues(srt, "x.srt"), true);
    const proj = parseImportedProject(srt, "x.srt");
    assert.equal(lineMainText(proj.lines[0]), "Line one\nLine two\nLine three");
    assert.equal(lineFr(proj.lines[0]), "");
  });

  it("maps second line to translation when opted in", () => {
    const vtt = `WEBVTT

01:23.456 --> 01:25.000
Hello
Bonjour
`;
    const proj = parseImportedProject(vtt, "x.vtt", { secondLineIsTranslation: true });
    assert.equal(proj.lines[0].startMs, 83456);
    assert.equal(lineMainText(proj.lines[0]), "Hello");
    assert.equal(lineFr(proj.lines[0]), "Bonjour");
  });
});
