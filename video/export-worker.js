/**
 * Web Worker: OffscreenCanvas + Mediabunny offline MP4 encode.
 * Receives project JSON + optional audio channel data.
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
} from "../vendor/mediabunny.min.mjs";
import { drawFrame, resolveOutputSize, rmsAtTime, resolveTimeRange } from "./renderer.js";

let cancelled = false;

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (msg?.type === "cancel") {
    cancelled = true;
    return;
  }
  if (msg?.type !== "start") return;

  cancelled = false;
  try {
    const result = await runExport(msg);
    self.postMessage({ type: "done", buffer: result }, [result]);
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err?.name === "AbortError" ? "Export cancelled" : err?.message || String(err),
    });
  }
};

async function runExport({ project, settings, peaks, audio, bgBitmap }) {
  const { w, h } = resolveOutputSize(settings || {});
  const fps = Number(settings?.fps) === 60 ? 60 : 30;
  const { startMs, endMs } = resolveTimeRange(project, settings);
  const durationSec = (endMs - startMs) / 1000;
  const totalFrames = Math.max(1, Math.ceil(durationSec * fps));
  const frameDur = 1 / fps;

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { alpha: false });

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const videoSource = new CanvasSource(canvas, {
    codec: "avc",
    bitrate: bitrateForSize(w, h, fps),
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource = null;
  let audioBuffer = null;
  if (audio?.channels?.length) {
    audioBuffer = await rebuildAudioBuffer(audio);
    audioSource = new AudioBufferSource({ codec: "aac", bitrate: 192_000 });
    output.addAudioTrack(audioSource);
  }

  output.setMetadataTags({
    title: project?.title || "Lyric video",
    artist: project?.artist || "",
    comment: "Made with Eclipse Lyrics",
  });

  await output.start();

  if (audioSource && audioBuffer) {
    const sliced = sliceAudio(audioBuffer, startMs / 1000, endMs / 1000);
    if (sliced) await audioSource.add(sliced);
  }

  const runtime = {
    ...(settings || {}),
    width: w,
    height: h,
    showSafeZones: false,
    reducedMotion: false,
    bgImage: bgBitmap || null,
  };

  const t0 = performance.now();
  for (let i = 0; i < totalFrames; i++) {
    if (cancelled) {
      await output.cancel();
      throw new DOMException("Export cancelled", "AbortError");
    }
    const tMs = startMs + Math.round((i / fps) * 1000);
    if (peaks && (settings?.background === "reactive" || settings?.background === "eclipse")) {
      runtime.rms = rmsAtTime(peaks, tMs / 1000, (project.audio?.durationMs || endMs) / 1000);
    }
    drawFrame(ctx, project, tMs, runtime);
    await videoSource.add(i * frameDur, frameDur, i % (fps * 2) === 0 ? { keyFrame: true } : undefined);

    if (i % 3 === 0 || i === totalFrames - 1) {
      const elapsed = (performance.now() - t0) / 1000;
      const rate = (i + 1) / Math.max(0.001, elapsed);
      const left = (totalFrames - i - 1) / Math.max(0.001, rate);
      self.postMessage({
        type: "progress",
        progress: (i + 1) / totalFrames,
        frame: i + 1,
        total: totalFrames,
        etaSec: Number.isFinite(left) ? left : null,
      });
    }
  }

  await output.finalize();
  return output.target.buffer;
}

function bitrateForSize(w, h, fps) {
  const pixels = w * h;
  const base = pixels >= 3000 * 1500 ? 28_000_000 : pixels >= 1500 * 800 ? 12_000_000 : 6_000_000;
  return fps > 30 ? Math.round(base * 1.35) : base;
}

async function rebuildAudioBuffer(audio) {
  const { sampleRate, numberOfChannels, length, channels } = audio;
  // OfflineAudioContext.createBuffer works in workers in Chromium
  if (typeof OfflineAudioContext !== "undefined") {
    const offline = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    const buf = offline.createBuffer(numberOfChannels, length, sampleRate);
    for (let ch = 0; ch < numberOfChannels; ch++) {
      buf.copyToChannel(channels[ch], ch);
    }
    return buf;
  }
  throw new Error("Cannot rebuild AudioBuffer in worker");
}

function sliceAudio(buffer, startSec, endSec) {
  const sr = buffer.sampleRate;
  const start = Math.max(0, Math.floor(startSec * sr));
  const end = Math.min(buffer.length, Math.ceil(endSec * sr));
  const len = Math.max(1, end - start);
  const offline = new OfflineAudioContext(buffer.numberOfChannels, len, sr);
  const tmp = offline.createBuffer(buffer.numberOfChannels, len, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    tmp.copyToChannel(buffer.getChannelData(ch).subarray(start, start + len), ch);
  }
  return tmp;
}
