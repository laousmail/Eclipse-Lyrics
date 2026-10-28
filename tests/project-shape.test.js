import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mirrors main.js isValidProjectShape for unit coverage (B6). */
function isValidProjectShape(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(data.lines)) return false;
  return data.lines.every((l) => {
    if (!l || typeof l !== "object") return false;
    const startOk = l.start == null || typeof l.start === "number";
    const endOk = l.end == null || typeof l.end === "number";
    return startOk && endOk;
  });
}

describe("B6 project JSON shape", () => {
  it("accepts valid lines with null or number times", () => {
    assert.equal(
      isValidProjectShape({ lines: [{ start: 1, end: null, text: "a" }, { start: null, end: null }] }),
      true
    );
  });

  it("rejects missing lines or bad times", () => {
    assert.equal(isValidProjectShape({}), false);
    assert.equal(isValidProjectShape({ lines: [{ start: "x" }] }), false);
    assert.equal(isValidProjectShape(null), false);
  });
});
