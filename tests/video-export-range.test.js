import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveTimeRange, resolveOutputSize } from "../video/renderer.js";

describe("video export helpers", () => {
  it("4K long edge is 3840", () => {
    const s = resolveOutputSize({ aspect: "1920x1080", resolution: "4k" });
    assert.equal(s.w, 3840);
    assert.equal(s.h, 2160);
  });

  it("clamps inverted section range", () => {
    const project = {
      audio: { durationMs: 60000 },
      lines: [
        { type: "lyric", startMs: 20000, endMs: 25000, text: { kab: "a" } },
        { type: "lyric", startMs: 5000, endMs: 8000, text: { kab: "b" } },
      ],
    };
    // start after end indices still produce positive duration via clamp
    const r = resolveTimeRange(project, { sectionStartLine: "0", sectionEndLine: "1" });
    assert.ok(r.durationMs >= 1000);
  });
});
