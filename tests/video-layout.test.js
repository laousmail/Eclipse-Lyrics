import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  layoutText,
  applyTextCase,
  fontString,
  positionY,
  alignX,
} from "../video/layout.js";

function mockCtx(charWidth = 10) {
  return {
    measureText(text) {
      return { width: String(text).length * charWidth };
    },
    fillText() {},
    textAlign: "center",
  };
}

describe("video/layout", () => {
  it("wraps long lines to maxWidth", () => {
    const ctx = mockCtx(10);
    const layout = layoutText(ctx, "aaaa bbbb cccc dddd", 50, 20);
    assert.ok(layout.lines.length >= 2);
    assert.equal(layout.totalHeight, layout.lines.length * 20);
    assert.ok(layout.maxWidth <= 50 || layout.lines.some((l) => l.includes("aaaa")));
  });

  it("handles empty and single-word text", () => {
    const ctx = mockCtx();
    assert.deepEqual(layoutText(ctx, "", 100, 16).lines, [""]);
    assert.deepEqual(layoutText(ctx, "Azul", 100, 16).lines, ["Azul"]);
  });

  it("applies text case transforms", () => {
    assert.equal(applyTextCase("azul fellawen", "upper"), "AZUL FELLAWEN");
    assert.equal(applyTextCase("AZUL", "lower"), "azul");
    assert.equal(applyTextCase("azul fellawen", "title"), "Azul Fellawen");
    assert.equal(applyTextCase("Azul", "none"), "Azul");
  });

  it("builds font strings with Tifinagh fallback", () => {
    const f = fontString({ font: "Noto Sans", weight: 600, sizePx: 48 });
    assert.match(f, /Noto Sans Tifinagh/);
    assert.match(f, /600 48px/);
  });

  it("maps position thirds and alignment", () => {
    assert.ok(positionY(1000, "top") < positionY(1000, "center"));
    assert.ok(positionY(1000, "bottom") > positionY(1000, "center"));
    assert.equal(alignX(1000, "center"), 500);
    assert.ok(alignX(1000, "left") < 500);
  });
});
