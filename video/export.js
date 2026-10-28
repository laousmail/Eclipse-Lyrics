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
  let path = mode || "auto";
  if (path === "auto") path = await detectExportPath();

  let cancelled = false;
  const shouldCancel = () => cancelled;

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
    audioDest,
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
