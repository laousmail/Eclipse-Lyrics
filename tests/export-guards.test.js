import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { timedLines } from "../js/sync.js";
import { toSRT } from "../js/export.js";

describe("B9 export guards", () => {
  it("reports zero timed lines", () => {
    const lines = [
      { start: null, text: "a" },
      { start: null, text: "b" },
    ];
    assert.equal(timedLines(lines).length, 0);
  });

  it("SRT skips untimed lines but keeps timed ones", () => {
    const project = {
      duration: 10,
      lines: [
        { start: 1, end: 2, text: "A", fr: "", en: "" },
        { start: null, end: null, text: "B", fr: "", en: "" },
      ],
    };
    const out = toSRT(project, { includeTr: false });
    assert.match(out, /A/);
    assert.doesNotMatch(out, /^B$/m);
  });
});
