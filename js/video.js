/** Lyric video renderer and MediaRecorder export. */

import { fadeUp } from "./styles/fadeUp.js";
import { glowSweep } from "./styles/glowSweep.js";
import { smoke } from "./styles/smoke.js";
import { lineAtTime } from "./sync.js";
import {
  getAudioElement,
  getMediaStreamDestination,
  resumeContext,
  seek,
  play,
  pause,
} from "./audio.js";

const STYLES = { fadeUp, glowSweep, smoke };

const COLORS = {
  text: "#f4ebe6",
  translation: "#ffb088",
  glow: "rgba(255,107,53,0.55)",
};

let previewOn = false;
let rafId = 0;
let projectGetter = null;
let bgImage = null;
let bgVideo = null;
let recorder = null;
let recordedChunks = [];
let progressTimer = null;
let visibilityHandler = null;
let onVisibilityWarn = null;

export function bindProject(getter) {
  projectGetter = getter;
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

export function parseAspect(value) {
  const [w, h] = String(value).split("x").map(Number);
  return { w: w || 1920, h: h || 1080 };
}

export function isPreviewEnabled() {
  return previewOn;
}

export function enablePreview() {
  previewOn = true;
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

export function renderFrame(project, overrideTime) {
  const canvas = document.getElementById("video-canvas");
  if (!canvas || !project) return;

  const settings = project.settings?.video || {};
  const { w, h } = parseAspect(settings.aspect || "1920x1080");
  const recording = Boolean(recorder && recorder.state === "recording");
  const scale = recording ? 1 : 0.5;
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  const t = overrideTime != null ? overrideTime : getAudioElement().currentTime || 0;
  const duration = project.duration || getAudioElement().duration || 1;

  drawBackground(ctx, width, height, settings, t, duration);

  const idx = lineAtTime(project.lines, t);
  if (idx < 0) return;

  const line = project.lines[idx];
  const start = line.start ?? 0;
  const end = line.end ?? start + 3;
  const progress = Math.max(0, Math.min(1, (t - start) / Math.max(0.001, end - start)));

  let translation = "";
  if (settings.showTranslation) {
    translation = settings.translationLang === "en" ? line.en : line.fr;
  }

  const styleFn = STYLES[settings.style] || fadeUp;
  styleFn(ctx, {
    text: line.text,
    translation,
    progress,
    width,
    height,
    colors: COLORS,
  });
}

function drawBackground(ctx, width, height, settings, t, duration) {
  const mode = settings.background || "eclipse";
  const blur = Number(settings.blur) || 0;
  const darken = (Number(settings.darken) || 0) / 100;
  const zoomOn = settings.zoom !== false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const zoom =
    !reduced && zoomOn ? 1 + 0.04 * Math.sin((t / Math.max(1, duration)) * Math.PI * 2) : 1;

  ctx.fillStyle = "#0a0608";
  ctx.fillRect(0, 0, width, height);

  if (mode === "image" && bgImage?.complete) {
    drawCover(ctx, bgImage, width, height, zoom, blur);
  } else if (mode === "video" && bgVideo) {
    drawCover(ctx, bgVideo, width, height, zoom, blur);
  } else {
    drawEclipseGlow(ctx, width, height, t, reduced);
  }

  ctx.fillStyle = `rgba(10,6,8,${darken})`;
  ctx.fillRect(0, 0, width, height);
}

function drawCover(ctx, media, width, height, zoom, blur) {
  const mw = media.videoWidth || media.naturalWidth || width;
  const mh = media.videoHeight || media.naturalHeight || height;
  const scale = Math.max(width / mw, height / mh) * zoom;
  const dw = mw * scale;
  const dh = mh * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  if (blur > 0 && ctx.filter !== undefined) ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(media, dx, dy, dw, dh);
  ctx.filter = "none";
}

function drawEclipseGlow(ctx, width, height, t, reduced) {
  const cx = width * 0.5;
  const cy = height * 0.48;
  const pulse = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 0.7);

  const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, width * 0.45 * pulse);
  g1.addColorStop(0, "rgba(255,180,120,0.35)");
  g1.addColorStop(0.35, "rgba(255,107,53,0.28)");
  g1.addColorStop(0.65, "rgba(196,30,30,0.18)");
  g1.addColorStop(1, "rgba(10,6,8,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, width, height);

  const r = width * 0.12;
  const disk = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.1, r * 0.2, cx, cy, r * 1.4);
  disk.addColorStop(0, "#1a0a0c");
  disk.addColorStop(0.7, "#0a0608");
  disk.addColorStop(1, "rgba(10,6,8,0)");
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,107,53,0.45)";
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
  ctx.stroke();
}

export async function startRecording(project, { onProgress, onDone, onError, onHidden } = {}) {
  if (recorder) return;

  const canvas = document.getElementById("video-canvas");
  const settings = project.settings?.video || {};
  const { w, h } = parseAspect(settings.aspect || "1920x1080");
  canvas.width = w;
  canvas.height = h;

  await resumeContext();
  const fps = 30;
  const canvasStream = canvas.captureStream(fps);
  const dest = getMediaStreamDestination();
  const tracks = [...canvasStream.getVideoTracks()];
  if (dest) tracks.push(...dest.stream.getAudioTracks());

  const combined = new MediaStream(tracks);
  recordedChunks = [];
  const mime = pickMime();
  onVisibilityWarn = onHidden || null;
  const squareish = Math.abs(w - h) < Math.min(w, h) * 0.2;
  const bits = squareish ? 6_000_000 : 10_000_000;
  const recorderOpts = { videoBitsPerSecond: bits };
  if (mime) recorderOpts.mimeType = mime;

  try {
    recorder = new MediaRecorder(combined, recorderOpts);
  } catch (err) {
    try {
      recorder = new MediaRecorder(combined, mime ? { mimeType: mime } : undefined);
    } catch (err2) {
      recorder = null;
      onError?.(err2);
      return;
    }
  }

  recorder.ondataavailable = (e) => {
    if (e.data?.size) recordedChunks.push(e.data);
  };

  recorder.onstop = () => {
    clearInterval(progressTimer);
    progressTimer = null;
    detachVisibilityWatch();
    const type = mime || "video/webm";
    const blob = new Blob(recordedChunks, { type });
    const ext = type.includes("mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(project.title || "lyric-video").replace(/\s+/g, "-")}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    recorder = null;
    onDone?.(blob);
  };

  recorder.onerror = (e) => onError?.(e.error || e);

  seek(0);
  enablePreview();
  recorder.start(250);
  await play();
  attachVisibilityWatch();

  const duration = project.duration || getAudioElement().duration || 0;
  const audio = getAudioElement();
  progressTimer = setInterval(() => {
    if (!recorder) {
      clearInterval(progressTimer);
      return;
    }
    const p = duration ? audio.currentTime / duration : 0;
    onProgress?.(Math.min(1, p));
    if (audio.ended || (duration && audio.currentTime >= duration - 0.05)) {
      stopRecording();
    }
  }, 200);
}

function attachVisibilityWatch() {
  detachVisibilityWatch();
  visibilityHandler = () => {
    if (document.visibilityState !== "hidden") return;
    if (!recorder || recorder.state !== "recording") return;
    try {
      pause();
      if (typeof recorder.pause === "function") recorder.pause();
    } catch {
      /* ignore */
    }
    onVisibilityWarn?.();
  };
  document.addEventListener("visibilitychange", visibilityHandler);
}

function detachVisibilityWatch() {
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  onVisibilityWarn = null;
}

export function resumeRecordingIfPaused() {
  if (!recorder || recorder.state !== "paused") return false;
  try {
    if (typeof recorder.resume === "function") recorder.resume();
    play();
    return true;
  } catch {
    return false;
  }
}

export function stopRecording() {
  pause();
  detachVisibilityWatch();
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch {
      /* ignore */
    }
  } else {
    recorder = null;
  }
  clearInterval(progressTimer);
  progressTimer = null;
}

function pickMime() {
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
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
