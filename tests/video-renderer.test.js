import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  drawFrame,
  lineAtTimeMs,
  lineMainText,
  resolveOutputSize,
  resolveTimeRange,
  parseAspect,
  rmsAtTime,
  introDurationSec,
  eclipseGeometry,
  lineEndMs,
} from "../video/renderer.js";
import { applyTemplate, TEMPLATES } from "../video/templates.js";

function createFakeCtx(width = 540, height = 960) {
  const calls = [];
  const gradient = {
    addColorStop() {},
  };
  const ctx = {
    canvas: { width, height },
    fillStyle: "",
    strokeStyle: "",
    font: "",
    globalAlpha: 1,
    textAlign: "center",
    textBaseline: "middle",
    shadowColor: "",
    shadowBlur: 0,
    lineWidth: 1,
    filter: "none",
    letterSpacing: "0px",
    save() {
      calls.push("save");
    },
    restore() {
      calls.push("restore");
    },
    fillRect(...a) {
      calls.push(["fillRect", ...a]);
    },
    strokeRect() {},
    fillText(t, x, y) {
      calls.push(["fillText", t, x, y]);
    },
    measureText(t) {
      return { width: String(t).length * 8 };
    },
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    createRadialGradient() {
      return gradient;
    },
    createLinearGradient() {
      return gradient;
    },
    drawImage() {},
    setLineDash() {},
    clip() {},
    rect() {},
  };
  return { ctx, calls };
}

const sampleProject = {
  title: "Azul",
  artist: "laousmail",
  audio: { durationMs: 120000 },
  lines: [
    {
      id: "L1",
      type: "lyric",
      startMs: 5000,
      endMs: 9000,
      text: { kab: "Azul fellawen", fr: "Bonjour à vous", en: "Hello to you" },
    },
    {
      id: "L2",
      type: "lyric",
      startMs: 10000,
      endMs: 14000,
      text: { kab: "ⴰⵣⵓⵍ", fr: "Salut", en: "Hi" },
    },
  ],
};

describe("video/renderer", () => {
  it("lineAtTimeMs picks the active lyric", () => {
    assert.equal(lineAtTimeMs(sampleProject.lines, 0), -1);
    assert.equal(lineAtTimeMs(sampleProject.lines, 6000), 0);
    assert.equal(lineAtTimeMs(sampleProject.lines, 11000), 1);
  });

  it("lineMainText reads kabyle", () => {
    assert.equal(lineMainText(sampleProject.lines[0]), "Azul fellawen");
    assert.equal(lineMainText(sampleProject.lines[1]), "ⴰⵣⵓⵍ");
  });

  it("resolveOutputSize respects resolution and aspect", () => {
    const p1080 = resolveOutputSize({ aspect: "1920x1080", resolution: "1080p" });
    assert.equal(p1080.w, 1920);
    assert.equal(p1080.h, 1080);
    const v720 = resolveOutputSize({ aspect: "1080x1920", resolution: "720p" });
    assert.equal(v720.h, 1280);
    assert.ok(v720.w < v720.h);
  });

  it("resolveTimeRange supports section-only export", () => {
    const full = resolveTimeRange(sampleProject, {});
    assert.equal(full.startMs, 0);
    assert.equal(full.endMs, 120000);
    const section = resolveTimeRange(sampleProject, {
      sectionStartLine: "0",
      sectionEndLine: "0",
    });
    assert.equal(section.startMs, 5000);
    assert.equal(section.endMs, 9000);
  });

  it("drawFrame paints background and lyric without throwing", () => {
    const { ctx, calls } = createFakeCtx();
    drawFrame(ctx, sampleProject, 6000, {
      width: 540,
      height: 960,
      style: "fadeUp",
      background: "eclipse",
      introCard: false,
      credit: true,
      font: "Noto Sans",
    });
    assert.ok(calls.some((c) => c === "save" || Array.isArray(c)));
    assert.ok(calls.some((c) => Array.isArray(c) && c[0] === "fillText"));
  });

  it("drawFrame shows title card in the intro window", () => {
    const { ctx, calls } = createFakeCtx();
    drawFrame(ctx, sampleProject, 500, {
      width: 540,
      height: 960,
      introCard: true,
      introDurationSec: 3,
      credit: false,
    });
    const texts = calls.filter((c) => Array.isArray(c) && c[0] === "fillText").map((c) => c[1]);
    assert.ok(texts.includes("Azul"));
  });

  it("drawFrame draws Tifinagh line text", () => {
    const { ctx, calls } = createFakeCtx();
    drawFrame(ctx, sampleProject, 11000, {
      width: 540,
      height: 960,
      style: "fadeUp",
      introCard: false,
      credit: false,
    });
    const texts = calls.filter((c) => Array.isArray(c) && c[0] === "fillText").map((c) => c[1]);
    assert.ok(texts.some((t) => String(t).includes("ⴰⵣⵓⵍ")));
  });

  it("templates cover Eclipse Minimal Cinema Karaoke Bilingual", () => {
    for (const id of ["eclipse", "minimal", "cinema", "karaoke", "bilingual"]) {
      assert.ok(TEMPLATES[id], id);
      const applied = applyTemplate({}, id);
      assert.equal(applied.template, id);
      assert.ok(applied.style);
    }
  });

  it("parseAspect and rmsAtTime helpers", () => {
    assert.deepEqual(parseAspect("1080x1920"), { w: 1080, h: 1920 });
    const peaks = [0.1, 0.5, 0.9];
    assert.ok(rmsAtTime(peaks, 0.5, 1) > 0.1);
  });
});

describe("intro title card timing", () => {
  const proj = (startMs) => ({ lines: [{ type: "lyric", startMs }] });

  it("keeps the 3 s card when the first line starts later", () => {
    assert.equal(introDurationSec(proj(12000), {}), 3);
  });

  it("ends before an early first line instead of hiding it", () => {
    assert.ok(Math.abs(introDurationSec(proj(2000), {}) - 1.8) < 1e-9);
  });

  it("drops the card when the song starts almost immediately or it is off", () => {
    assert.equal(introDurationSec(proj(900), {}), 0);
    assert.equal(introDurationSec(proj(20000), { introCard: false }), 0);
  });
});

describe("eclipse ring stays clear of the lyrics", () => {
  // Two wrapped lines of auto-size text (60 px at 1080, line height 1.28)
  const halfText = (w, h) => (Math.min(w, h) / 1080) * 60 * 1.28;
  for (const [w, h] of [[1080, 1920], [1920, 1080], [1080, 1080]]) {
    for (const position of ["center", "top", "bottom"]) {
      it(`${w}x${h} ${position}`, () => {
        const { cy, r } = eclipseGeometry(w, h, position);
        const textY = position === "top" ? h * 0.28 : position === "bottom" ? h * 0.72 : h * 0.55;
        assert.ok(Math.abs(textY - cy) - r - halfText(w, h) > 0, "ring overlaps text");
        assert.ok(cy - r > 0 && cy + r < h, "ring leaves the frame");
      });
    }
  }
});

describe("lines leave the screen during long gaps", () => {
  const line = { startMs: 10000, endMs: 60000 };
  it("caps at 8 s by default, like the subtitle export", () => {
    assert.equal(lineEndMs({}, line), 18000);
  });
  it("follows the project's max gap, and 0 means no cap", () => {
    assert.equal(lineEndMs({ settings: { export: { maxGapMs: 5000 } } }, line), 15000);
    assert.equal(lineEndMs({ settings: { export: { maxGapMs: 0 } } }, line), 60000);
  });
  it("keeps short lines as they are", () => {
    assert.equal(lineEndMs({}, { startMs: 1000, endMs: 3000 }), 3000);
  });
});
