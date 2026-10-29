/**
 * Pure frame renderer for lyric videos.
 * drawFrame(ctx, project, tMs, settings) — no DOM.
 */

import { STYLES } from "./styles/index.js";
import { fontString, positionY } from "./layout.js";

const DEFAULT_COLORS = {
  text: "#f4ebe6",
  translation: "#ffb088",
  glow: "rgba(255,107,53,0.55)",
};

/**
 * Find active lyric line index at time (integer ms).
 * Local copy so renderer stays free of DOM/sync imports that pull audio.
 */
export function lineAtTimeMs(lines, timeMs) {
  let active = -1;
  const t = Math.round(Number(timeMs) || 0);
  for (let i = 0; i < (lines || []).length; i++) {
    const l = lines[i];
    if (!l || l.type === "section" || l.startMs == null) continue;
    if (t >= l.startMs) active = i;
    else break;
  }
  return active;
}

/**
 * When a line leaves the screen: its end, capped at the export "max gap" (8 s by
 * default) so the video matches the subtitle files.
 */
export function lineEndMs(project, line) {
  const start = line.startMs ?? 0;
  const end = line.endMs ?? start + 3000;
  const raw = project?.settings?.export?.maxGapMs;
  const cap = Number.isFinite(Number(raw)) && raw !== null && raw !== "" ? Number(raw) : 8000;
  return cap > 0 ? Math.min(end, start + cap) : end;
}

export function lineMainText(line) {
  if (!line) return "";
  if (typeof line.text === "string") return line.text;
  return line.text?.kab || line.kab || "";
}

export function lineTranslation(line, lang = "fr") {
  if (!line) return "";
  if (typeof line.text === "object") {
    return lang === "en" ? line.text.en || "" : line.text.fr || "";
  }
  return lang === "en" ? line.en || "" : line.fr || "";
}

export function parseAspect(value) {
  const [w, h] = String(value || "1920x1080").split("x").map(Number);
  return { w: w || 1920, h: h || 1080 };
}

/**
 * Resolve export pixel size from aspect + resolution setting.
 * @param {{ aspect?: string, resolution?: string }} settings
 */
export function resolveOutputSize(settings = {}) {
  const aspect = settings.aspect || "1080x1920";
  const { w: aw, h: ah } = parseAspect(aspect);
  const res = settings.resolution || "1080p";
  const longEdge = res === "720p" ? 1280 : res === "4k" ? 3840 : 1920;
  if (aw >= ah) {
    return { w: longEdge, h: Math.round(longEdge * (ah / aw)) };
  }
  return { w: Math.round(longEdge * (aw / ah)), h: longEdge };
}

export const CHROMA_GREEN = "#00ff00";

/**
 * Lyrics-only outputs ("use on my own video"): what goes behind the text.
 * transparent: real alpha (WebM / PNG frames); green: chroma key in phone apps;
 * black: "Screen" blend mode, which keeps the glow. null = the normal scene.
 * @returns {null|"transparent"|"green"|"black"}
 */
export function overlayBackground(settings = {}) {
  if (settings.output !== "overlay") return null;
  const format = settings.overlayFormat || "webm";
  if (format === "green" || format === "black") return format;
  return "transparent";
}

/**
 * Draw one complete frame.
 *
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
 * @param {object} project
 * @param {number} tMs
 * @param {object} settings  video settings (+ optional runtime: bgImage, bgVideo, rms, width, height, showSafeZones, reducedMotion)
 */
export function drawFrame(ctx, project, tMs, settings = {}) {
  const overlay = overlayBackground(settings);
  // A glow halo would leave a green fringe after chroma keying
  if (overlay === "green") settings = { ...settings, glowColor: "rgba(0,0,0,0)" };
  const width = settings.width || ctx.canvas?.width || 1080;
  const height = settings.height || ctx.canvas?.height || 1920;
  const tSec = (Number(tMs) || 0) / 1000;
  const durationMs =
    project?.audio?.durationMs ||
    Math.round((project?.duration || 0) * 1000) ||
    1;
  const durationSec = durationMs / 1000;

  if (overlay) {
    // Lyrics only: nothing behind the text but the keyable colour, if any
    ctx.clearRect(0, 0, width, height);
    if (overlay !== "transparent") {
      ctx.fillStyle = overlay === "green" ? CHROMA_GREEN : "#000000";
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    drawBackground(ctx, width, height, settings, tSec, durationSec);
  }

  // Intro title card (first 3s by default), never covering the first sung line
  const introSec = introDurationSec(project, settings);
  if (introSec > 0 && tSec < introSec) {
    drawTitleCard(ctx, width, height, project, settings, tSec / introSec);
  } else {
    drawLyrics(ctx, project, tMs, width, height, settings);
  }

  if (settings.letterbox && !overlay) drawLetterbox(ctx, width, height);
  if (settings.watermark) drawWatermark(ctx, width, height, settings);
  if (settings.progressBar) drawProgressBar(ctx, width, height, tSec, durationSec);
  if (settings.credit !== false) drawCredit(ctx, width, height);
  if (settings.showSafeZones) drawSafeZones(ctx, width, height);
}

/** Title card length in seconds: ends before the first timed line, dropped if too short to read. */
export function introDurationSec(project, settings = {}) {
  if (settings.introCard === false) return 0;
  const wanted = Number(settings.introDurationSec) || 3;
  const starts = (project?.lines || [])
    .filter((l) => l.type !== "section" && Number.isFinite(l.startMs))
    .map((l) => l.startMs / 1000);
  const first = starts.length ? Math.min(...starts) : Infinity;
  const sec = Math.min(wanted, first - 0.2);
  return sec >= 1 ? sec : 0;
}

function drawLyrics(ctx, project, tMs, width, height, settings) {
  const lines = project?.lines || [];
  const idx = lineAtTimeMs(lines, tMs);
  if (idx < 0) return;
  const line = lines[idx];
  if (line.type === "section") return;

  const start = line.startMs ?? 0;
  const end = lineEndMs(project, line);
  // Long instrumental gaps and outros: the line fades out instead of staying up
  if (tMs >= end) return;
  const progress = Math.max(0, Math.min(1, (tMs - start) / Math.max(1, end - start)));

  let translation = "";
  if (settings.showTranslation) {
    translation = lineTranslation(line, settings.translationLang || "fr");
  }

  const colors = {
    text: settings.textColor || DEFAULT_COLORS.text,
    translation: settings.translationColor || DEFAULT_COLORS.translation,
    glow: settings.glowColor || DEFAULT_COLORS.glow,
  };

  const styleFn = STYLES[settings.style] || STYLES.fadeUp;
  styleFn(ctx, {
    text: lineMainText(line),
    translation,
    progress,
    width,
    height,
    colors,
    settings,
    reducedMotion: Boolean(settings.reducedMotion),
  });
}

function drawBackground(ctx, width, height, settings, t, duration) {
  const mode = settings.background || "eclipse";
  const blur = Number(settings.blur) || 0;
  const darken = (Number(settings.darken) || 0) / 100;
  const zoomOn = settings.zoom !== false;
  const reduced = Boolean(settings.reducedMotion);
  const zoom = !reduced && zoomOn ? 1 + 0.04 * Math.sin((t / Math.max(1, duration)) * Math.PI * 2) : 1;

  ctx.fillStyle = settings.solidColor || "#0a0608";
  ctx.fillRect(0, 0, width, height);

  if (mode === "solid") {
    ctx.fillStyle = settings.solidColor || "#000000";
    ctx.fillRect(0, 0, width, height);
  } else if (mode === "gradient") {
    drawGradientBg(ctx, width, height, settings);
  } else if (mode === "image" && settings.bgImage) {
    drawCover(ctx, settings.bgImage, width, height, zoom, blur);
  } else if (mode === "video" && settings.bgVideo) {
    drawCover(ctx, settings.bgVideo, width, height, zoom, blur);
  } else if (mode === "reactive") {
    drawEclipseGlow(ctx, width, height, t, reduced, settings.rms || 0.35, settings.position);
  } else {
    drawEclipseGlow(ctx, width, height, t, reduced, 1, settings.position);
  }

  if (mode !== "solid") {
    ctx.fillStyle = `rgba(10,6,8,${darken})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function drawGradientBg(ctx, width, height, settings) {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, settings.gradientFrom || "#1a0a0c");
  g.addColorStop(1, settings.gradientTo || "#0a0608");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function drawCover(ctx, media, width, height, zoom, blur) {
  const mw = media.videoWidth || media.naturalWidth || media.width || width;
  const mh = media.videoHeight || media.naturalHeight || media.height || height;
  if (!mw || !mh) return;
  const scale = Math.max(width / mw, height / mh) * zoom;
  const dw = mw * scale;
  const dh = mh * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  if (blur > 0 && ctx.filter !== undefined) ctx.filter = `blur(${blur}px)`;
  try {
    ctx.drawImage(media, dx, dy, dw, dh);
  } catch {
    /* media not ready */
  }
  ctx.filter = "none";
}

function usesEclipse(settings) {
  if (overlayBackground(settings)) return false;
  const mode = settings.background || "eclipse";
  return mode === "eclipse" || mode === "reactive" || !["solid", "gradient", "image", "video"].includes(mode);
}

/**
 * Eclipse placement: sized from the short side, and kept clear of the lyric block
 * (above it, or below when lyrics sit at the top) so text never crosses the ring.
 * @returns {{ cx: number, cy: number, r: number }} r is the ring radius at full energy
 */
export function eclipseGeometry(width, height, position = "center") {
  const s = Math.min(width, height);
  const textY = positionY(height, position);
  const offset = s * 0.32;
  return {
    cx: width * 0.5,
    cy: position === "top" ? textY + offset : textY - offset,
    r: s * 0.12 * 1.1 * 1.05,
  };
}

function drawEclipseGlow(ctx, width, height, t, reduced, energy = 1, position = "center") {
  const { cx, cy } = eclipseGeometry(width, height, position);
  const s = Math.min(width, height);
  const pulse = reduced ? 1 : (0.85 + 0.15 * Math.sin(t * 0.7)) * (0.7 + 0.3 * energy);

  const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.45 * pulse);
  g1.addColorStop(0, `rgba(255,180,120,${0.35 * energy})`);
  g1.addColorStop(0.35, `rgba(255,107,53,${0.28 * energy})`);
  g1.addColorStop(0.65, `rgba(196,30,30,${0.18 * energy})`);
  g1.addColorStop(1, "rgba(10,6,8,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, width, height);

  const r = s * 0.12 * (0.9 + 0.2 * energy);
  const disk = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.1, r * 0.2, cx, cy, r * 1.4);
  disk.addColorStop(0, "#1a0a0c");
  disk.addColorStop(0.7, "#0a0608");
  disk.addColorStop(1, "rgba(10,6,8,0)");
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255,107,53,${0.45 * Math.min(1.2, energy)})`;
  ctx.lineWidth = Math.max(2, s * 0.003);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTitleCard(ctx, width, height, project, settings, p) {
  const opacity = p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = settings.textColor || DEFAULT_COLORS.text;
  ctx.shadowColor = settings.glowColor || DEFAULT_COLORS.glow;
  ctx.shadowBlur = 28;
  const title = project?.title || "Untitled";
  const artist = project?.artist || "";
  // Title sits in the eclipse when there is one, otherwise mid-frame
  const s = Math.min(width, height);
  const cy = usesEclipse(settings) ? eclipseGeometry(width, height, settings.position).cy : height * 0.46;
  const titleY = artist ? cy - s * 0.025 : cy;
  ctx.font = fontString({
    font: settings.font || "Outfit",
    weight: 700,
    sizePx: Math.round(s * 0.055),
  });
  ctx.fillText(title, width / 2, titleY);
  if (artist) {
    ctx.shadowBlur = 12;
    ctx.font = fontString({
      font: settings.font || "Noto Sans",
      weight: 400,
      sizePx: Math.round(s * 0.028),
    });
    ctx.fillStyle = settings.translationColor || DEFAULT_COLORS.translation;
    ctx.fillText(artist, width / 2, titleY + s * 0.06);
  }
  ctx.restore();
}

function drawLetterbox(ctx, width, height) {
  const bar = Math.round(height * 0.12);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, bar);
  ctx.fillRect(0, height - bar, width, bar);
}

function drawWatermark(ctx, width, height, settings) {
  const label = settings.watermarkText || settings.artistWatermark || "";
  if (!label) return;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = settings.textColor || "#f4ebe6";
  ctx.font = fontString({
    font: settings.font || "Noto Sans",
    weight: 500,
    sizePx: Math.round(width * 0.018),
  });
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, width * 0.94, height * 0.96);
  ctx.restore();
}

function drawProgressBar(ctx, width, height, t, duration) {
  const p = duration > 0 ? Math.max(0, Math.min(1, t / duration)) : 0;
  const h = Math.max(3, Math.round(height * 0.004));
  const y = height - h;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(0, y, width, h);
  ctx.fillStyle = "rgba(255,107,53,0.85)";
  ctx.fillRect(0, y, width * p, h);
}

function drawCredit(ctx, width, height) {
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#f4ebe6";
  ctx.font = fontString({
    font: "Noto Sans",
    weight: 400,
    sizePx: Math.max(10, Math.round(width * 0.014)),
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("Made with Eclipse Lyrics", width * 0.04, height * 0.975);
  ctx.restore();
}

/** Preview-only safe zones for 9:16 (TikTok/Reels UI). */
function drawSafeZones(ctx, width, height) {
  ctx.save();
  ctx.fillStyle = "rgba(255,80,80,0.12)";
  // Bottom ~20%
  ctx.fillRect(0, height * 0.8, width, height * 0.2);
  // Right edge ~8%
  ctx.fillRect(width * 0.92, 0, width * 0.08, height * 0.8);
  ctx.strokeStyle = "rgba(255,120,100,0.45)";
  ctx.lineWidth = 1;
  ctx.setLineDash?.([6, 6]);
  ctx.strokeRect(width * 0.04, height * 0.08, width * 0.88, height * 0.72);
  ctx.restore();
}

/**
 * Sample approximate RMS energy from a peaks array at time tSec.
 * peaks: Float32Array or number[] of RMS buckets spanning the full duration.
 */
export function rmsAtTime(peaks, tSec, durationSec) {
  if (!peaks?.length || !durationSec) return 0.35;
  const i = Math.max(0, Math.min(peaks.length - 1, Math.floor((tSec / durationSec) * peaks.length)));
  const v = Number(peaks[i]) || 0;
  return Math.max(0.15, Math.min(1.5, v * 2.2));
}

/**
 * Resolve render time range from settings (full song or section by line index).
 */
export function resolveTimeRange(project, settings = {}) {
  const durationMs =
    project?.audio?.durationMs ||
    Math.round((project?.duration || 0) * 1000) ||
    0;
  let startMs = 0;
  let endMs = durationMs;

  const startLine = settings.sectionStartLine;
  const endLine = settings.sectionEndLine;
  if (startLine != null && startLine !== "" && project?.lines) {
    const line = project.lines[Number(startLine)];
    if (line?.startMs != null) startMs = line.startMs;
  }
  if (endLine != null && endLine !== "" && project?.lines) {
    const line = project.lines[Number(endLine)];
    if (line?.endMs != null) endMs = line.endMs;
    else if (line?.startMs != null) endMs = line.startMs + 3000;
  }

  if (endMs <= startMs) endMs = startMs + 1000;
  return { startMs, endMs, durationMs: endMs - startMs };
}
