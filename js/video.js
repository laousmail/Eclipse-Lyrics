/** Lyric video preview + export facade (Phase 4 video studio). */

import { drawFrame, resolveOutputSize, parseAspect, rmsAtTime } from "../video/renderer.js";
import { applyTemplate, TEMPLATES } from "../video/templates.js";
import {
  getAudioElement,
  getMediaStreamDestination,
  getDecodedBuffer,
  resumeContext,
  seek,
  play,
  pause,
  getCurrentTime,
} from "./audio.js";

export {
  drawFrame,
  resolveOutputSize,
  parseAspect,
  applyTemplate,
  TEMPLATES,
};

/** Lazy-load export stack (keeps Mediabunny off the critical path). */
async function loadExportApi() {
  return import("../video/export.js");
}

export async function canUseWebCodecs() {
  const api = await loadExportApi();
  return api.canUseWebCodecs();
}

export async function detectExportPath() {
  const api = await loadExportApi();
  return api.detectExportPath();
}

export function formatEta(sec) {
  if (sec == null || !Number.isFinite(sec)) return "";
  if (sec < 5) return "<5s";
  if (sec < 60) return `~${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.ceil(sec % 60);
  return `~${m}m ${s}s`;
}

let previewOn = false;
let rafId = 0;
let projectGetter = null;
let peaksGetter = null;
let bgImage = null;
let bgVideo = null;
let scrubMs = null;
let exportHandle = null;
let showSafeZones = false;

export function bindProject(getter) {
  projectGetter = getter;
}

export function bindPeaks(getter) {
  peaksGetter = getter;
}

export function setBackgroundFile(file) {
  if (bgImage?.src?.startsWith("blob:")) URL.revokeObjectURL(bgImage.src);
  if (bgVideo?.src?.startsWith("blob:")) URL.revokeObjectURL(bgVideo.src);
  bgImage = null;
  bgVideo = null;
  if (!file) return;
  if (file.type.startsWith("video/")) {
    bgVideo = document.createElement("video");
    bgVideo.src = URL.createObjectURL(file);
    bgVideo.muted = true;
    bgVideo.loop = true;
    bgVideo.playsInline = true;
    bgVideo.play().catch(() => {});
  } else {
    bgImage = new Image();
    bgImage.src = URL.createObjectURL(file);
  }
}

export function setScrubMs(ms) {
  scrubMs = ms == null ? null : Math.round(ms);
}

export function getScrubMs() {
  return scrubMs;
}

export function setSafeZones(on) {
  showSafeZones = Boolean(on);
}

export function isPreviewEnabled() {
  return previewOn;
}

export function enablePreview() {
  previewOn = true;
  scrubMs = null;
  stopLoop();
  const tick = () => {
    if (!previewOn) return;
    const project = projectGetter?.();
    if (project) renderFrame(project);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

export function disablePreview() {
  previewOn = false;
  stopLoop();
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

export async function ensureVideoFonts(settings = {}) {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const font = settings.font || "Noto Sans";
  const sizes = [48, 32, 24];
  const weights = [400, 500, 600, 700];
  const loads = [];
  for (const size of sizes) {
    for (const w of weights) {
      loads.push(document.fonts.load(`${w} ${size}px "${font}"`));
      loads.push(document.fonts.load(`${w} ${size}px "Noto Sans"`));
      loads.push(document.fonts.load(`${w} ${size}px "Noto Sans Tifinagh"`));
      loads.push(document.fonts.load(`${w} ${size}px Outfit`));
      loads.push(document.fonts.load(`${w} ${size}px "Noto Serif"`));
    }
  }
  try {
    await Promise.all(loads);
  } catch {
    /* fonts may be unavailable offline */
  }
}

function runtimeSettings(project, override = {}) {
  const settings = { ...(project?.settings?.video || {}), ...override };
  const durationMs =
    project?.audio?.durationMs || Math.round((project?.duration || 0) * 1000) || 1;
  const tMs =
    scrubMs != null
      ? scrubMs
      : Math.round((getAudioElement().currentTime || 0) * 1000);
  const peaks = peaksGetter?.();
  let rms = 0.35;
  if (peaks && (settings.background === "reactive" || settings.background === "eclipse")) {
    rms = rmsAtTime(peaks, tMs / 1000, durationMs / 1000);
  }
  return {
    ...settings,
    bgImage,
    bgVideo,
    rms,
    showSafeZones,
    reducedMotion:
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  };
}

export function renderFrame(project, overrideTimeSec) {
  const canvas = document.getElementById("video-canvas");
  if (!canvas || !project) return;

  const settings = project.settings?.video || {};
  const { w, h } = resolveOutputSize(settings);
  const recording = Boolean(exportHandle);
  const scale = recording ? 1 : 0.45;
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    // Stage follows the output shape (9:16, 16:9, 1:1) so the preview is never letterboxed
    canvas.parentElement?.style.setProperty("aspect-ratio", `${w} / ${h}`);
  }

  const ctx = canvas.getContext("2d");
  const tMs =
    overrideTimeSec != null
      ? Math.round(overrideTimeSec * 1000)
      : scrubMs != null
        ? scrubMs
        : Math.round((getAudioElement().currentTime || 0) * 1000);

  const runtime = runtimeSettings(project, { width, height });
  drawFrame(ctx, project, tMs, runtime);
}

/**
 * Export lyric video (WebCodecs offline when available, else MediaRecorder).
 */
export async function startVideoExport(project, {
  onProgress,
  onDone,
  onError,
  onHidden,
} = {}) {
  if (exportHandle) return;

  const settings = { ...(project.settings?.video || {}) };
  await ensureVideoFonts(settings);
  await resumeContext();

  const canvas = document.getElementById("video-canvas");
  const audioBuffer = getDecodedBuffer();
  const peaks = peaksGetter?.() || null;

  try {
    const { startExport, downloadBlob, isWidelyCompatible } = await loadExportApi();
    exportHandle = await startExport({
      mode: "auto",
      project,
      settings: { ...settings, bgImage, bgVideo },
      audioBuffer,
      peaks,
      canvas,
      getCurrentTimeSec: getCurrentTime,
      seek,
      play,
      pause,
      audioDest: getMediaStreamDestination(),
      ensureFonts: () => ensureVideoFonts(settings),
      onHidden,
      onProgress: (info) => onProgress?.(info),
    });

    const result = await exportHandle.done;
    const ext = result.mimeType?.includes("mp4") ? "mp4" : "webm";
    const name = `${(project.title || "lyric-video").replace(/\s+/g, "-")}.${ext}`;
    downloadBlob(result.blob, name);
    const compatible = await isWidelyCompatible(exportHandle.path, result.blob).catch(() => true);
    exportHandle = null;
    onDone?.({ ...result, fileName: name, compatible });
  } catch (err) {
    exportHandle = null;
    if (err?.name === "AbortError") {
      onError?.(err);
      return;
    }
    onError?.(err);
  }
}

/** @deprecated use startVideoExport */
export async function startRecording(project, opts = {}) {
  return startVideoExport(project, {
    onProgress: (info) => opts.onProgress?.(info.progress ?? info),
    onDone: opts.onDone,
    onError: opts.onError,
    onHidden: opts.onHidden,
  });
}

export function resumeRecordingIfPaused() {
  if (!exportHandle?.resume) return false;
  return exportHandle.resume();
}

export function stopRecording() {
  exportHandle?.cancel?.();
  pause();
  exportHandle = null;
}

export function isExporting() {
  return Boolean(exportHandle);
}
