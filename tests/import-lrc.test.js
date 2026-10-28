import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseImportedProject } from "../js/export.js";

describe("B8 LRC import", () => {
  it("duplicates multi-timestamp lines and sorts", () => {
    const lrc = `[ti:Test]
[00:12.00][01:30.00]chorus
[00:05.50]intro
`;
    const proj = parseImportedProject(lrc, "x.lrc");
    assert.equal(proj.title, "Test");
    assert.equal(proj.lines.length, 3);
    assert.deepEqual(
      proj.lines.map((l) => [l.start, l.text]),
      [
        [5.5, "intro"],
        [12, "chorus"],
        [90, "chorus"],
      ]
    );
  });

  it("applies [offset:+/-ms]", () => {
    const lrc = `[offset:+1000]
[00:01.00]hello
`;
    const proj = parseImportedProject(lrc, "x.lrc");
    assert.equal(proj.lines[0].start, 2);
  });
});
