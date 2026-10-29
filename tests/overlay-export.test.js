import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { overlayBackground, drawFrame } from "../video/renderer.js";
import { frameFileName, exportFileName, overlayFramePlan, pngReadme } from "../video/export-overlay.js";
import { ZipWriter, readZip, crc32 } from "../js/zip.js";

describe("lyrics-only overlay mode", () => {
  it("maps formats to what goes behind the text", () => {
    assert.equal(overlayBackground({}), null);
    assert.equal(overlayBackground({ output: "full", overlayFormat: "green" }), null);
    assert.equal(overlayBackground({ output: "overlay" }), "transparent");
    assert.equal(overlayBackground({ output: "overlay", overlayFormat: "png" }), "transparent");
    assert.equal(overlayBackground({ output: "overlay", overlayFormat: "green" }), "green");
    assert.equal(overlayBackground({ output: "overlay", overlayFormat: "black" }), "black");
  });

  it("transparent frames clear the canvas and skip the scene; green fills the key colour", () => {
    const calls = [];
    const ctx = new Proxy(
      { canvas: { width: 108, height: 192 }, measureText: () => ({ width: 10 }) },
      {
        get(target, key) {
          if (key in target) return target[key];
          return (...args) => {
            calls.push(key);
            if (key === "createRadialGradient" || key === "createLinearGradient") return { addColorStop() {} };
            return undefined;
          };
        },
        set(target, key, value) {
          if (key === "fillStyle") calls.push(`fill:${value}`);
          target[key] = value;
          return true;
        },
      }
    );
    const project = { audio: { durationMs: 10000 }, lines: [] };
    drawFrame(ctx, project, 5000, { output: "overlay", overlayFormat: "webm", credit: false });
    assert.equal(calls[0], "clearRect");
    assert.ok(!calls.includes("createRadialGradient"), "no eclipse glow behind the lyrics");

    calls.length = 0;
    drawFrame(ctx, project, 5000, { output: "overlay", overlayFormat: "green", credit: false });
    assert.ok(calls.includes("fill:#00ff00"));
  });
});

describe("overlay files", () => {
  it("frame names are zero-padded and sort in order", () => {
    assert.equal(frameFileName(0, 360), "lyrics_00001.png");
    assert.equal(frameFileName(359, 360), "lyrics_00360.png");
    assert.equal(frameFileName(0, 123456), "lyrics_000001.png");
  });

  it("file names say what they are", () => {
    const p = { title: "Tafat n wul" };
    assert.equal(exportFileName(p, {}, "mp4"), "Tafat-n-wul.mp4");
    assert.equal(exportFileName(p, { output: "overlay", overlayFormat: "webm" }, "webm"), "Tafat-n-wul-lyrics-transparent.webm");
    assert.equal(exportFileName(p, { output: "overlay", overlayFormat: "png" }, "zip"), "Tafat-n-wul-lyrics-frames.zip");
    assert.equal(exportFileName(p, { output: "overlay", overlayFormat: "green" }, "mp4"), "Tafat-n-wul-lyrics-greenscreen.mp4");
  });

  it("frame plan follows ratio, resolution and fps", () => {
    const project = { audio: { durationMs: 10000 }, lines: [] };
    const plan = overlayFramePlan(project, { aspect: "1080x1350", resolution: "4k", fps: 30 });
    assert.equal(plan.h, 3840);
    assert.equal(plan.w, 3072);
    assert.equal(plan.totalFrames, 300);
  });

  it("README gives the frame rate and an ffmpeg line for ProRes 4444", () => {
    const txt = pngReadme({ fps: 30, w: 1080, h: 1920, total: 360, startMs: 0 });
    assert.match(txt, /30 fps/);
    assert.match(txt, /prores_ks -profile:v 4444/);
    assert.match(txt, /lyrics_%05d\.png/);
  });
});

describe("streaming ZIP writer", () => {
  it("crc32 matches the reference value", () => {
    assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  });

  it("round-trips entries through readZip", async () => {
    const zip = new ZipWriter();
    zip.add("a.txt", "hello");
    zip.add("b.bin", new Uint8Array([1, 2, 3]));
    const files = await readZip(zip.finish());
    assert.equal(new TextDecoder().decode(files.get("a.txt")), "hello");
    assert.deepEqual([...files.get("b.bin")], [1, 2, 3]);
    assert.equal(zip.count, 2);
  });
});
