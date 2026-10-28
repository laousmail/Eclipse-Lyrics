import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Mirrors the B15 HTML detect regex (without empty alternative). */
function looksLikeGoogleHtmlGate(sample) {
  return /<!DOCTYPE html>/i.test(sample.slice(0, 200)) && /accounts\.google|Sign in/i.test(sample);
}

describe("B15 Google Docs detect", () => {
  it("does not treat plain lyrics as HTML", () => {
    assert.equal(looksLikeGoogleHtmlGate("Awal ameqran\nSecond line"), false);
  });

  it("detects a login HTML page", () => {
    const html = "<!DOCTYPE html><html><body>Sign in with accounts.google</body></html>";
    assert.equal(looksLikeGoogleHtmlGate(html), true);
  });

  it("old empty-alternative regex would false-positive on anything", () => {
    const broken = /<!DOCTYPE html|/i;
    assert.equal(broken.test("plain lyrics"), true);
    assert.equal(/<!DOCTYPE html>/i.test("plain lyrics"), false);
  });
});
