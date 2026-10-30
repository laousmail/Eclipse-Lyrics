/**
 * Lyric video export orchestrator: WebCodecs+Mediabunny or MediaRecorder fallback.
 */

import { canUseWebCodecs, exportWithWebCodecs } from "./export-webcodecs.js";
import { exportWithMediaRecorder } from "./export-mediarecorder.js";

export { canUseWebCodecs };

/**
 * @returns {Promise<"webcodecs"|"mediarecorder">}
 */
export async function detectExportPath() {
  if (await canUseWebCodecs()) return "webcodecs";
  return "mediarecorder";
}

/**
 * Start an export. Returns a handle with cancel() and a done promise.
 */
export async function startExport({
  mode, // "webcodecs" | "mediarecorder" | "auto"
  project,
  settings,
  audioBuffer,
  peaks,
  canvas,
  getCurrentTimeSec,
  seek,
  play,
  pause,
  audioDest,
  ensureFonts,
  onProgress,
  onHidden,
} = {}) {
  let cancelled = false;
  const shouldCancel = () => cancelled;

  // Lyrics only with real transparency: its own offline exporter
  const transparent = settings?.output === "overlay" && ["webm", "png"].includes(settings.overlayFormat || "webm");
  if (transparent) {
    const { exportTransparentWebm, exportPngFrames } = await import("./export-overlay.js");
    const run = (settings.overlayFormat || "webm") === "png" ? exportPngFrames : exportTransparentWebm;
    return {
      path: "overlay",
      cancel() {
        cancelled = true;
      },
      done: run({
        project,
        settings,
        shouldCancel,
        onProgress: (info) => onProgress?.({ ...info, path: "overlay" }),
      }),
    };
  }

  let path = mode || "auto";
  if (path === "auto") path = await detectExportPath();

  if (path === "webcodecs") {
    const started = performance.now();
    const promise = exportWithWebCodecs({
      project,
      settings,
      audioBuffer,
      peaks,
      shouldCancel,
      onProgress: (info) => {
        onProgress?.({
          progress: info.progress,
          frame: info.frame,
          total: info.total,
          etaSec: info.etaSec,
          path: "webcodecs",
          elapsedSec: (performance.now() - started) / 1000,
        });
      },
    });
    return {
      path: "webcodecs",
      cancel() {
        cancelled = true;
      },
      done: promise,
    };
  }

  const session = await exportWithMediaRecorder({
    canvas,
    project,
    settings,
    getCurrentTimeSec,
    seek,
    play,
    pause,
    audioDest: typeof audioDest === "function" ? audioDest() : audioDest,
    ensureFonts,
    onHidden,
    onProgress: (p) => onProgress?.({ progress: p, path: "mediarecorder" }),
  });

  return {
    path: "mediarecorder",
    cancel() {
      session.stop();
    },
    resume() {
      return session.resume();
    },
    done: session.done,
  };
}

const HEADER_BYTES = 256 * 1024;

/**
 * Read the codec tags from an MP4's sample descriptions. Browsers can claim H.264
 * support and still record VP9, so the file itself is the only reliable answer.
 * The moov box sits at the start (fragmented MP4) or the end, so both are scanned.
 * @param {Uint8Array} head first bytes of the file
 * @param {Uint8Array} [tail] last bytes of the file
 * @returns {{ h264: boolean, aac: boolean }}
 */
export function sniffMp4Codecs(head, tail = new Uint8Array()) {
  const has = (bytes, tag) => {
    const [a, b, c, d] = [...tag].map((ch) => ch.charCodeAt(0));
    for (let i = 0; i + 3 < bytes.length; i++) {
      if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return true;
    }
    return false;
  };
  return {
    h264: has(head, "avc1") || has(tail, "avc1"),
    aac: has(head, "mp4a") || has(tail, "mp4a"),
  };
}

/**
 * True when the file is an MP4 with H.264 video and AAC audio, the combination
 * Instagram, TikTok, QuickTime and iPhone Photos all accept. WebCodecs always
 * encodes that here; MediaRecorder may fall back to VP9 / Opus / WebM.
 * @param {"webcodecs"|"mediarecorder"} path
 * @param {Blob} blob
 */
export async function isWidelyCompatible(path, blob) {
  if (path === "webcodecs" || path === "overlay") return true;
  if (!blob || !String(blob.type).toLowerCase().startsWith("video/mp4")) return false;
  const size = blob.size || 0;
  const head = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer());
  const tail =
    size > HEADER_BYTES
      ? new Uint8Array(await blob.slice(Math.max(HEADER_BYTES, size - HEADER_BYTES)).arrayBuffer())
      : new Uint8Array();
  const { h264, aac } = sniffMp4Codecs(head, tail);
  return h264 && aac;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function formatEta(sec) {
  if (sec == null || !Number.isFinite(sec)) return "";
  if (sec < 5) return "<5s";
  if (sec < 60) return `~${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.ceil(sec % 60);
  return `~${m}m ${s}s`;
}
