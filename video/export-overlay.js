/**
 * Lyrics-only exports for laying over your own footage:
 * - transparent WebM (VP9 + alpha) via Mediabunny
 * - transparent PNG frames in a ZIP (imports as an image sequence everywhere)
 * Frames are rendered offline, so the tab can be in the background.
 */

import { drawFrame, resolveOutputSize, resolveTimeRange } from "./renderer.js";
import { createRenderCanvas } from "./export-webcodecs.js";
import { ZipWriter, ZIP_MAX_ENTRIES } from "../js/zip.js";

async function loadMediabunny() {
  return import("../vendor/mediabunny.min.mjs");
}

/** True when this browser can encode VP9 (Mediabunny adds the alpha layer itself). */
export async function canExportTransparentWebm() {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return false;
  try {
    const res = await VideoEncoder.isConfigSupported({
      codec: "vp09.00.10.08",
      width: 1080,
      height: 1920,
      bitrate: 8_000_000,
      framerate: 30,
    });
    return Boolean(res?.supported);
  } catch {
    return false;
  }
}

/** "Song-Title.mp4", or "Song-Title-lyrics-transparent.webm" etc. for lyrics-only files. */
export function exportFileName(project, settings, ext) {
  const base = (project?.title || "lyric-video").replace(/\s+/g, "-");
  if (settings?.output !== "overlay") return `${base}.${ext}`;
  const suffix = {
    webm: "lyrics-transparent",
    png: "lyrics-frames",
    green: "lyrics-greenscreen",
    black: "lyrics-black",
  }[settings.overlayFormat || "webm"];
  return `${base}-${suffix || "lyrics"}.${ext}`;
}

/** Frame plan shared by both exporters. */
export function overlayFramePlan(project, settings = {}) {
  const { w, h } = resolveOutputSize(settings);
  const fps = Number(settings.fps) === 60 ? 60 : 30;
  const { startMs, endMs } = resolveTimeRange(project, settings);
  const totalFrames = Math.max(1, Math.ceil(((endMs - startMs) / 1000) * fps));
  return { w, h, fps, startMs, endMs, totalFrames };
}

/** Zero-padded frame name so editors sort and detect the sequence. */
export function frameFileName(index, total, prefix = "lyrics_") {
  const digits = Math.max(5, String(total).length);
  return `${prefix}${String(index + 1).padStart(digits, "0")}.png`;
}

function runtimeSettings(settings, w, h) {
  return {
    ...settings,
    output: "overlay",
    overlayFormat: "transparent",
    width: w,
    height: h,
    showSafeZones: false,
    reducedMotion: false,
  };
}

function progressReporter(onProgress, total) {
  const t0 = performance.now();
  return async (i) => {
    if (i % 3 !== 0 && i !== total - 1) return;
    const elapsed = (performance.now() - t0) / 1000;
    const rate = (i + 1) / Math.max(0.001, elapsed);
    const left = (total - i - 1) / Math.max(0.001, rate);
    onProgress?.({
      progress: (i + 1) / total,
      frame: i + 1,
      total,
      etaSec: Number.isFinite(left) ? left : null,
    });
    // Yield so the UI and Cancel stay responsive
    await new Promise((r) => setTimeout(r, 0));
  };
}

function cancelled() {
  return new DOMException("Export cancelled", "AbortError");
}

/**
 * @returns {Promise<{ blob: Blob, mimeType: string, ext: string }>}
 */
export async function exportTransparentWebm({ project, settings = {}, onProgress, shouldCancel } = {}) {
  const { Output, WebMOutputFormat, BufferTarget, CanvasSource } = await loadMediabunny();
  const { w, h, fps, startMs, totalFrames } = overlayFramePlan(project, settings);
  const canvas = createRenderCanvas(w, h);
  const ctx = canvas.getContext("2d", { alpha: true });

  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, {
    codec: "vp9",
    bitrate: w * h >= 3000 * 1500 ? 24_000_000 : 10_000_000,
    alpha: "keep",
    latencyMode: "quality",
  });
  output.addVideoTrack(source, { frameRate: fps });
  output.setMetadataTags({
    title: project?.title || "Lyrics",
    artist: project?.artist || "",
    comment: "Lyrics overlay, transparent background. Made with Eclipse Lyrics",
  });
  await output.start();

  const runtime = runtimeSettings(settings, w, h);
  const report = progressReporter(onProgress, totalFrames);
  const frameDur = 1 / fps;
  for (let i = 0; i < totalFrames; i++) {
    if (shouldCancel?.()) {
      await output.cancel();
      throw cancelled();
    }
    drawFrame(ctx, project, startMs + Math.round((i / fps) * 1000), runtime);
    await source.add(i * frameDur, frameDur, i % (fps * 2) === 0 ? { keyFrame: true } : undefined);
    await report(i);
  }
  await output.finalize();
  return { blob: new Blob([output.target.buffer], { type: "video/webm" }), mimeType: "video/webm", ext: "webm" };
}

async function canvasToPng(canvas) {
  const blob =
    typeof canvas.convertToBlob === "function"
      ? await canvas.convertToBlob({ type: "image/png" })
      : await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/** How to bring the frames into common editors; shipped inside the ZIP. */
export function pngReadme({ fps, w, h, total, startMs }) {
  const start = (startMs / 1000).toFixed(2);
  return [
    "Eclipse Lyrics: lyrics overlay (transparent PNG frames)",
    "",
    `${total} frames, ${w}x${h}, ${fps} fps. Frame 1 = ${start} s in the song.`,
    "Put the sequence on the track above your video and line frame 1 up with that moment.",
    "",
    "Premiere Pro: File > Import, pick the first PNG, tick 'Image Sequence'.",
    `  If it plays at the wrong speed: right-click > Modify > Interpret Footage > ${fps} fps.`,
    "DaVinci Resolve: Media page, show the folder; the frames appear as one clip.",
    "Final Cut Pro: convert first (e.g. in Compressor or ffmpeg below) to ProRes 4444, then import.",
    "After Effects: File > Import > File, pick the first PNG, tick 'PNG Sequence'.",
    "",
    "ffmpeg (ProRes 4444 with transparency):",
    `  ffmpeg -framerate ${fps} -i lyrics_%0${Math.max(5, String(total).length)}d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le lyrics.mov`,
    "",
  ].join("\n");
}

/**
 * @returns {Promise<{ blob: Blob, mimeType: string, ext: string }>}
 */
export async function exportPngFrames({ project, settings = {}, onProgress, shouldCancel } = {}) {
  const { w, h, fps, startMs, totalFrames } = overlayFramePlan(project, settings);
  if (totalFrames + 1 > ZIP_MAX_ENTRIES) {
    throw new RangeError("Too many frames for one ZIP. Render a section, or use 30 fps.");
  }
  const canvas = createRenderCanvas(w, h);
  // Pixels are read back every frame to skip re-encoding unchanged ones
  const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  const zip = new ZipWriter();
  zip.add("README.txt", pngReadme({ fps, w, h, total: totalFrames, startMs }));

  const runtime = runtimeSettings(settings, w, h);
  const report = progressReporter(onProgress, totalFrames);
  // Lyrics hold still between fades: reuse the previous PNG when the pixels match
  let prevPixels = null;
  let prevPng = null;
  for (let i = 0; i < totalFrames; i++) {
    if (shouldCancel?.()) throw cancelled();
    drawFrame(ctx, project, startMs + Math.round((i / fps) * 1000), runtime);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    let png = prevPng;
    if (!prevPixels || !samePixels(pixels, prevPixels)) {
      png = await canvasToPng(canvas);
      prevPixels = pixels;
      prevPng = png;
    }
    zip.add(frameFileName(i, totalFrames), png);
    await report(i);
  }
  return { blob: zip.finish(), mimeType: "application/zip", ext: "zip" };
}

function samePixels(a, b) {
  if (a.length !== b.length) return false;
  // Compare as 32-bit words: 4x fewer iterations than bytes
  const x = new Uint32Array(a.buffer, a.byteOffset, a.length >> 2);
  const y = new Uint32Array(b.buffer, b.byteOffset, b.length >> 2);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}
