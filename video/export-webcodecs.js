/**
 * Offline MP4 export via WebCodecs + Mediabunny (H.264 + AAC).
 * Frame-by-frame; works with the tab in the background (no rAF).
 * Mediabunny is loaded lazily so the app shell stays light.
 */

import {
  drawFrame,
  resolveOutputSize,
  rmsAtTime,
  parseAspect,
  resolveTimeRange,
} from "./renderer.js";

async function loadMediabunny() {
  return import("../vendor/mediabunny.min.mjs");
}

/**
 * Feature-detect WebCodecs path.
 * @returns {Promise<boolean>}
 */
export async function canUseWebCodecs() {
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") {
    return false;
  }
  if (typeof VideoFrame === "undefined") return false;
  try {
    const okVideo = await VideoEncoder.isConfigSupported({
      codec: "avc1.42001f",
      width: 1280,
      height: 720,
      bitrate: 5_000_000,
      framerate: 30,
    });
    const okAudio = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      numberOfChannels: 2,
      sampleRate: 48000,
      bitrate: 128_000,
    });
    return Boolean(okVideo?.supported && okAudio?.supported);
  } catch {
    return false;
  }
}

/**
 * Create a canvas for offline rendering (OffscreenCanvas when available).
 */
export function createRenderCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/**
 * Slice an AudioBuffer to [startSec, endSec).
 */
export function sliceAudioBuffer(buffer, startSec, endSec) {
  if (!buffer) return null;
  const sr = buffer.sampleRate;
  const start = Math.max(0, Math.floor(startSec * sr));
  const end = Math.min(buffer.length, Math.ceil(endSec * sr));
  const len = Math.max(1, end - start);
  const nCh = buffer.numberOfChannels;
  const tmp = createEmptyAudioBuffer(nCh, len, sr);
  if (!tmp) return null;
  for (let ch = 0; ch < nCh; ch++) {
    tmp.copyToChannel(buffer.getChannelData(ch).subarray(start, start + len), ch);
  }
  return tmp;
}

function createEmptyAudioBuffer(numberOfChannels, length, sampleRate) {
  if (typeof OfflineAudioContext !== "undefined") {
    return new OfflineAudioContext(numberOfChannels, length, sampleRate).createBuffer(
      numberOfChannels,
      length,
      sampleRate
    );
  }
  if (typeof AudioContext !== "undefined" || typeof webkitAudioContext !== "undefined") {
    const AC = AudioContext || webkitAudioContext;
    const ac = new AC();
    const buf = ac.createBuffer(numberOfChannels, length, sampleRate);
    ac.close?.();
    return buf;
  }
  return null;
}

export { resolveTimeRange };

/**
 * Offline encode lyric video to MP4.
 *
 * @param {object} opts
 * @param {object} opts.project
 * @param {object} opts.settings
 * @param {AudioBuffer} [opts.audioBuffer]
 * @param {Float32Array|number[]} [opts.peaks]
 * @param {(p: {progress: number, frame: number, total: number, etaSec: number|null}) => void} [opts.onProgress]
 * @param {() => boolean} [opts.shouldCancel]
 * @returns {Promise<{ blob: Blob, mimeType: string, usedWorker: boolean }>}
 */
export async function exportWithWebCodecs({
  project,
  settings = {},
  audioBuffer = null,
  peaks = null,
  onProgress,
  shouldCancel,
  useWorker = true,
} = {}) {
  if (useWorker && typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
    try {
      return await exportInWorker({
        project,
        settings,
        audioBuffer,
        peaks,
        onProgress,
        shouldCancel,
      });
    } catch (err) {
      console.warn("[eclipse] worker export failed, falling back to main thread", err);
    }
  }
  return exportOnMainThread({
    project,
    settings,
    audioBuffer,
    peaks,
    onProgress,
    shouldCancel,
  });
}

async function exportOnMainThread({
  project,
  settings,
  audioBuffer,
  peaks,
  onProgress,
  shouldCancel,
}) {
  const {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    CanvasSource,
    AudioBufferSource,
  } = await loadMediabunny();

  const { w, h } = resolveOutputSize(settings);
  const fps = Number(settings.fps) === 60 ? 60 : 30;
  const { startMs, endMs } = resolveTimeRange(project, settings);
  const durationSec = (endMs - startMs) / 1000;
  const totalFrames = Math.max(1, Math.ceil(durationSec * fps));
  const frameDur = 1 / fps;

  const canvas = createRenderCanvas(w, h);
  const ctx = canvas.getContext("2d", { alpha: false });

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: bitrateForSize(w, h, fps),
    latencyMode: "quality",
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource = null;
  if (audioBuffer) {
    audioSource = new AudioBufferSource({
      codec: "aac",
      bitrate: 192_000,
    });
    output.addAudioTrack(audioSource);
  }

  output.setMetadataTags({
    title: project?.title || "Lyric video",
    artist: project?.artist || "",
    comment: "Made with Eclipse Lyrics",
  });

  await output.start();

  if (audioSource && audioBuffer) {
    const sliced = sliceAudioBuffer(audioBuffer, startMs / 1000, endMs / 1000);
    if (sliced) await audioSource.add(sliced);
  }

  const t0 = performance.now();
  const runtime = {
    ...settings,
    width: w,
    height: h,
    showSafeZones: false,
    reducedMotion: false,
  };

  for (let i = 0; i < totalFrames; i++) {
    if (shouldCancel?.()) {
      await output.cancel();
      throw new DOMException("Export cancelled", "AbortError");
    }
    const tMs = startMs + Math.round((i / fps) * 1000);
    const tSec = tMs / 1000;
    if (peaks && (settings.background === "reactive" || settings.background === "eclipse")) {
      runtime.rms = rmsAtTime(peaks, tSec, (project.audio?.durationMs || endMs) / 1000);
    }
    // Seek bg video if present
    if (runtime.bgVideo && typeof runtime.bgVideo.currentTime === "number") {
      try {
        runtime.bgVideo.currentTime = tSec % (runtime.bgVideo.duration || tSec + 1);
      } catch {
        /* ignore seek errors */
      }
    }
    drawFrame(ctx, project, tMs, runtime);
    await videoSource.add(i * frameDur, frameDur, i % (fps * 2) === 0 ? { keyFrame: true } : undefined);

    if (i % 3 === 0 || i === totalFrames - 1) {
      const elapsed = (performance.now() - t0) / 1000;
      const rate = (i + 1) / Math.max(0.001, elapsed);
      const left = (totalFrames - i - 1) / Math.max(0.001, rate);
      onProgress?.({
        progress: (i + 1) / totalFrames,
        frame: i + 1,
        total: totalFrames,
        etaSec: Number.isFinite(left) ? left : null,
      });
      // Yield so UI + cancel stay responsive (and background tabs keep pumping)
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await output.finalize();
  const buffer = output.target.buffer;
  const blob = new Blob([buffer], { type: "video/mp4" });
  return { blob, mimeType: "video/mp4", usedWorker: false };
}

function bitrateForSize(w, h, fps) {
  const pixels = w * h;
  const base = pixels >= 3000 * 1500 ? 28_000_000 : pixels >= 1500 * 800 ? 12_000_000 : 6_000_000;
  return fps > 30 ? Math.round(base * 1.35) : base;
}

/**
 * Worker-based encode: OffscreenCanvas lives in the worker.
 * Audio channel data is transferred as plain Float32Arrays.
 */
async function exportInWorker({
  project,
  settings,
  audioBuffer,
  peaks,
  onProgress,
  shouldCancel,
}) {
  const worker = new Worker(new URL("./export-worker.js", import.meta.url), { type: "module" });

  // Strip non-cloneable runtime media from settings; bg image as ImageBitmap if possible
  const cleanSettings = { ...settings };
  delete cleanSettings.bgImage;
  delete cleanSettings.bgVideo;
  let bgBitmap = null;
  if (settings.bgImage && typeof createImageBitmap === "function") {
    try {
      bgBitmap = await createImageBitmap(settings.bgImage);
    } catch {
      bgBitmap = null;
    }
  }

  let audioPayload = null;
  if (audioBuffer) {
    const channels = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      channels.push(audioBuffer.getChannelData(ch).slice(0));
    }
    audioPayload = {
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length,
      channels,
    };
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      try {
        worker.terminate();
      } catch {
        /* ignore */
      }
    };

    const cancelPoll = setInterval(() => {
      if (shouldCancel?.()) {
        worker.postMessage({ type: "cancel" });
      }
    }, 200);

    worker.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === "progress") {
        onProgress?.(msg);
        return;
      }
      if (msg.type === "done") {
        if (settled) return;
        settled = true;
        clearInterval(cancelPoll);
        cleanup();
        const blob = new Blob([msg.buffer], { type: "video/mp4" });
        resolve({ blob, mimeType: "video/mp4", usedWorker: true });
      }
      if (msg.type === "error") {
        if (settled) return;
        settled = true;
        clearInterval(cancelPoll);
        cleanup();
        reject(new Error(msg.message || "Worker export failed"));
      }
    };
    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearInterval(cancelPoll);
      cleanup();
      reject(err.error || err);
    };

    const transfer = [];
    if (bgBitmap) transfer.push(bgBitmap);
    if (audioPayload) {
      for (const ch of audioPayload.channels) transfer.push(ch.buffer);
    }

    worker.postMessage(
      {
        type: "start",
        project,
        settings: cleanSettings,
        peaks: peaks ? Array.from(peaks) : null,
        audio: audioPayload,
        bgBitmap,
      },
      transfer
    );
  });
}

export { parseAspect, resolveOutputSize };
