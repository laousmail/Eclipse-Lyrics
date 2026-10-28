/** Waveform drawing, zoom/scroll, and draggable markers. */

import { formatTime } from "./sync.js";

const STATE = {
  peaks: null,
  duration: 0,
  viewStart: 0,
  viewEnd: 1,
  playhead: 0,
  lines: [],
  selectedIndex: -1,
  dragging: null, // { index, pointerId }
  onSeek: null,
  onMarkerDrag: null,
  onSelect: null,
  reducedMotion: false,
};

export function initWaveform(canvas, handlers = {}) {
  STATE.onSeek = handlers.onSeek || null;
  STATE.onMarkerDrag = handlers.onMarkerDrag || null;
  STATE.onSelect = handlers.onSelect || null;
  STATE.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ctx = canvas.getContext("2d");

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  resize();
  window.addEventListener("resize", resize);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const focus = STATE.viewStart + x * (STATE.viewEnd - STATE.viewStart);
    const span = STATE.viewEnd - STATE.viewStart;
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    let newSpan = Math.min(1, Math.max(0.02, span * factor));
    let start = focus - x * newSpan;
    let end = start + newSpan;
    if (start < 0) {
      start = 0;
      end = newSpan;
    }
    if (end > 1) {
      end = 1;
      start = 1 - newSpan;
    }
    STATE.viewStart = start;
    STATE.viewEnd = end;
    draw();
  }, { passive: false });

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = xToTime(x, rect.width);
    const hit = hitMarker(x, rect.width);
    if (hit >= 0) {
      STATE.dragging = { index: hit, pointerId: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      STATE.onSelect?.(hit);
      return;
    }
    STATE.onSeek?.(t);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!STATE.dragging || STATE.dragging.pointerId !== e.pointerId) return;
    const rect = canvas.getBoundingClientRect();
    const t = xToTime(e.clientX - rect.left, rect.width);
    STATE.onMarkerDrag?.(STATE.dragging.index, t);
  });

  const endDrag = (e) => {
    if (STATE.dragging && STATE.dragging.pointerId === e.pointerId) {
      STATE.dragging = null;
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  return { draw, resize, setPeaks, setPlayhead, setLines, setSelected, setDuration };
}

export function computePeaks(audioBuffer, samplesPerPeak = 512) {
  const channel = audioBuffer.getChannelData(0);
  const peaks = [];
  for (let i = 0; i < channel.length; i += samplesPerPeak) {
    let min = 1;
    let max = -1;
    const end = Math.min(i + samplesPerPeak, channel.length);
    for (let j = i; j < end; j++) {
      const v = channel[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks.push(min, max);
  }
  return peaks;
}

function setPeaks(peaks, duration) {
  STATE.peaks = peaks;
  STATE.duration = duration || STATE.duration;
  STATE.viewStart = 0;
  STATE.viewEnd = 1;
  draw();
}

function setDuration(d) {
  STATE.duration = d;
}

function setPlayhead(t) {
  STATE.playhead = t;
  draw();
}

function setLines(lines) {
  STATE.lines = lines;
  draw();
}

function setSelected(i) {
  STATE.selectedIndex = i;
  draw();
}

function xToTime(x, width) {
  const span = STATE.viewEnd - STATE.viewStart;
  const frac = STATE.viewStart + (x / width) * span;
  return Math.max(0, Math.min(STATE.duration, frac * STATE.duration));
}

function timeToX(t, width) {
  if (!STATE.duration) return 0;
  const frac = t / STATE.duration;
  const span = STATE.viewEnd - STATE.viewStart;
  return ((frac - STATE.viewStart) / span) * width;
}

function hitMarker(x, width) {
  const threshold = 8;
  let best = -1;
  let bestDist = threshold;
  STATE.lines.forEach((line, i) => {
    if (line.start == null) return;
    const mx = timeToX(line.start, width);
    const d = Math.abs(mx - x);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

function draw() {
  const canvas = document.getElementById("waveform");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = "#0a0608";
  ctx.fillRect(0, 0, width, height);

  // Subtle grid
  ctx.strokeStyle = "rgba(255,120,80,0.08)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (STATE.peaks && STATE.peaks.length && STATE.duration) {
    drawPeaks(ctx, width, height);
  } else {
    ctx.fillStyle = "rgba(168,152,144,0.5)";
    ctx.font = "13px Noto Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Load audio to see waveform", width / 2, height / 2);
  }

  // Markers
  STATE.lines.forEach((line, i) => {
    if (line.start == null) return;
    const x = timeToX(line.start, width);
    if (x < -20 || x > width + 20) return;
    const selected = i === STATE.selectedIndex;
    ctx.strokeStyle = selected ? "#ff6b35" : "rgba(255,140,90,0.55)";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    // Handle
    ctx.fillStyle = selected ? "#ff6b35" : "#ff8f5c";
    ctx.beginPath();
    ctx.arc(x, 10, selected ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();

    // Label
    const label = String(i + 1);
    ctx.fillStyle = "rgba(10,6,8,0.75)";
    ctx.fillRect(x + 4, 2, ctx.measureText(label).width + 6, 14);
    ctx.fillStyle = "#f4ebe6";
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 7, 12);
  });

  // Playhead
  if (STATE.duration) {
    const px = timeToX(STATE.playhead, width);
    ctx.strokeStyle = "#ff3d1f";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }
}

function drawPeaks(ctx, width, height) {
  const peaks = STATE.peaks;
  const pairCount = peaks.length / 2;
  const startPeak = Math.floor(STATE.viewStart * pairCount);
  const endPeak = Math.ceil(STATE.viewEnd * pairCount);
  const mid = height / 2;
  const amp = height * 0.42;

  ctx.beginPath();
  ctx.strokeStyle = "rgba(255,107,53,0.85)";
  ctx.lineWidth = 1;

  const visible = Math.max(1, endPeak - startPeak);
  for (let i = 0; i < width; i++) {
    const peakIdx = startPeak + Math.floor((i / width) * visible);
    if (peakIdx < 0 || peakIdx >= pairCount) continue;
    const min = peaks[peakIdx * 2];
    const max = peaks[peakIdx * 2 + 1];
    const y1 = mid + min * amp;
    const y2 = mid + max * amp;
    ctx.moveTo(i, y1);
    ctx.lineTo(i, y2);
  }
  ctx.stroke();

  // Center line
  ctx.strokeStyle = "rgba(255,120,80,0.2)";
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();
}

export function formatPlayheadLabel(t) {
  return formatTime(t);
}
