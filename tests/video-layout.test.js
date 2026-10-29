import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  layoutText,
  applyTextCase,
  fontString,
  lyricSizePx,
  letterSpacingPx,
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

describe("lyric size follows the frame", () => {
  it("preview at 45% scale draws text at 45% of the export size", () => {
    const settings = { fontSize: 80 };
    const exportPx = lyricSizePx(settings, 1080, 1920);
    const previewPx = lyricSizePx(settings, 486, 864);
    assert.equal(exportPx, 80);
    assert.equal(previewPx, 36);
  });

  it("auto size is the same for vertical, wide and square 1080p", () => {
    assert.equal(lyricSizePx({}, 1080, 1920), 60);
    assert.equal(lyricSizePx({}, 1920, 1080), 60);
    assert.equal(lyricSizePx({ fontSize: 0 }, 1080, 1080), 60);
  });

  it("letter spacing scales with the frame", () => {
    assert.equal(letterSpacingPx({ letterSpacing: 4 }, 540, 960), 2);
    assert.equal(letterSpacingPx({}, 1080, 1920), 0);
  });
});
