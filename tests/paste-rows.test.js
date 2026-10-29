import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pasteIntoRows } from "../js/core/lyrics.js";

const blank = () => [{ main: "", fr: "", en: "" }];

describe("multi-line paste into the lyric grid", () => {
  it("single line returns null so the input pastes normally", () => {
    assert.equal(pasteIntoRows(blank(), { text: "just one line" }), null);
  });

  it("splits a pasted song into one row per line and drops blank lines", () => {
    const r = pasteIntoRows(blank(), { text: "A\r\nB\n\n[Chorus]\nC\n" });
    assert.deepEqual(r.rows.map((x) => x.main), ["A", "B", "[Chorus]", "C"]);
    assert.equal(r.added, 3);
    assert.equal(r.last, 3);
  });

  it("keeps text around the caret on the first line and inserts below without overwriting", () => {
    const rows = [{ main: "x", fr: "", en: "" }, { main: "keep", fr: "k", en: "" }];
    const r = pasteIntoRows(rows, { index: 0, text: "1\n2", before: "x ", after: "" });
    assert.deepEqual(r.rows.map((x) => x.main), ["x 1", "2", "keep"]);
    assert.equal(r.rows[2].fr, "k");
  });

  it("FR paste fills the column down lyric rows, skipping sections", () => {
    const rows = [
      { main: "A", fr: "", en: "" },
      { main: "[Chorus]", fr: "", en: "" },
      { main: "B", fr: "", en: "" },
    ];
    const r = pasteIntoRows(rows, { index: 0, col: "fr", text: "a\nb\nc" });
    assert.deepEqual(r.rows.map((x) => x.fr), ["a", "", "b", "c"]);
    assert.equal(r.rows[3].main, "");
    assert.equal(r.added, 1);
  });

  it("tab-separated lines spread across Main | FR | EN", () => {
    const r = pasteIntoRows(blank(), { text: "Azul\tBonjour\tHello\nAnsuf\tBienvenue\tWelcome" });
    assert.deepEqual(r.rows[1], { main: "Ansuf", fr: "Bienvenue", en: "Welcome" });
  });
});
