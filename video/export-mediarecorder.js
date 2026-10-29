/**
 * MediaRecorder fallback for lyric video export (B10/B11 fixes).
 * Real-time capture; pauses when the tab is hidden.
 */

import { drawFrame, resolveOutputSize, resolveTimeRange } from "./renderer.js";

/**
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {object} opts.project
 * @param {object} opts.settings
 * @param {() => number} opts.getCurrentTimeSec  audio clock
 * @param {(t: number) => void} opts.seek
 * @param {() => Promise<void>} opts.play
 * @param {() => void} opts.pause
 * @param {MediaStreamAudioDestinationNode} [opts.audioDest]
 * @param {(p: number) => void} [opts.onProgress]
 * @param {() => void} [opts.onHidden]
 * @param {(err: Error) => void} [opts.onError]
 * @returns {Promise<{ blob: Blob, mimeType: string, stop: () => void, resume: () => boolean }>}
 */
export async function exportWithMediaRecorder({
  canvas,
  project,
  settings = {},
  getCurrentTimeSec,
  seek,
  play,
  pause,
  audioDest,
  onProgress,
  onHidden,
  ensureFonts,
} = {}) {
  const { w, h } = resolveOutputSize(settings);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });

  await ensureFonts?.();

  const fps = Number(settings.fps) === 60 ? 60 : 30;
  const { startMs, endMs } = resolveTimeRange(project, settings);
  const startSec = startMs / 1000;
  const endSec = endMs / 1000;
  const duration = Math.max(0.1, endSec - startSec);

  const canvasStream = canvas.captureStream(fps);
  const tracks = [...canvasStream.getVideoTracks()];
  if (audioDest) tracks.push(...audioDest.stream.getAudioTracks());
  const combined = new MediaStream(tracks);

  const mime = pickMime();
  const squareish = Math.abs(w - h) < Math.min(w, h) * 0.2;
  const bits = squareish ? 6_000_000 : 10_000_000;
  const recorderOpts = { videoBitsPerSecond: bits };
  if (mime) recorderOpts.mimeType = mime;

  let recorder;
  try {
    recorder = new MediaRecorder(combined, recorderOpts);
  } catch {
    recorder = new MediaRecorder(combined, mime ? { mimeType: mime } : undefined);
  }

  const chunks = [];
  let rafId = 0;
  let progressTimer = null;
  let visibilityHandler = null;
  let previewOn = true;

  const runtime = {
    ...settings,
    width: w,
    height: h,
    showSafeZones: false,
  };

  const tick = () => {
    if (!previewOn) return;
    const tSec = getCurrentTimeSec?.() ?? 0;
    drawFrame(ctx, project, Math.round(tSec * 1000), runtime);
    rafId = requestAnimationFrame(tick);
  };

  const blobPromise = new Promise((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    recorder.onerror = (e) => reject(e.error || e);
    recorder.onstop = () => {
      previewOn = false;
      if (rafId) cancelAnimationFrame(rafId);
      clearInterval(progressTimer);
      detachVisibility();
      const type = mime || "video/webm";
      resolve({ blob: new Blob(chunks, { type }), mimeType: type });
    };
  });

  function attachVisibility() {
    visibilityHandler = () => {
      if (document.visibilityState !== "hidden") return;
      if (!recorder || recorder.state !== "recording") return;
      try {
        pause?.();
        if (typeof recorder.pause === "function") recorder.pause();
      } catch {
        /* ignore */
      }
      onHidden?.();
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  }

  function detachVisibility() {
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
  }

  seek?.(startSec);
  rafId = requestAnimationFrame(tick);
  recorder.start(250);
  await play?.();
  attachVisibility();

  progressTimer = setInterval(() => {
    const t = getCurrentTimeSec?.() ?? 0;
    const p = Math.max(0, Math.min(1, (t - startSec) / duration));
    onProgress?.(p);
    if (t >= endSec - 0.05) {
      stop();
    }
  }, 200);

  function stop() {
    pause?.();
    detachVisibility();
    previewOn = false;
    if (rafId) cancelAnimationFrame(rafId);
    clearInterval(progressTimer);
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
  }

  function resume() {
    if (!recorder || recorder.state !== "paused") return false;
    try {
      if (typeof recorder.resume === "function") recorder.resume();
      play?.();
      return true;
    } catch {
      return false;
    }
  }

  return {
    done: blobPromise,
    stop,
    resume,
  };
}

function pickMime() {
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    // H.264 video even when AAC isn't offered (plain video/mp4 can mean VP9)
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "";
}
