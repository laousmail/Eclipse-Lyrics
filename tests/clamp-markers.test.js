import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clampLineStart, nudgeLine, setLineStart } from "../js/sync.js";

describe("B4 marker clamp", () => {
  it("clamps between neighbours with 10ms gap", () => {
    const lines = [
      { start: 1.0 },
      { start: 2.0 },
      { start: 3.0 },
    ];
    assert.equal(clampLineStart(lines, 1, 0.5, 10), 1.01);
    assert.equal(clampLineStart(lines, 1, 5, 10), 2.99);
  });

  it("nudge and setLineStart refuse to cross", () => {
    const project = {
      duration: 10,
      lines: [
        { start: 1.0, end: 2.0, text: "a" },
        { start: 2.0, end: 3.0, text: "b" },
        { start: 3.0, end: 4.0, text: "c" },
      ],
    };
    nudgeLine(project, 1, -5);
    assert.ok(project.lines[1].start >= project.lines[0].start + 0.01);
    setLineStart(project, 1, 9);
    assert.ok(project.lines[1].start <= project.lines[2].start - 0.01);
  });
});
