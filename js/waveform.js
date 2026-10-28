/** Detailed waveform drawing, zoom, and draggable markers (no seek-on-tap). */

import { formatTime } from "./sync.js";

const STATE = {
  peaks: null,
  duration: 0,
  viewStart: 0,
  viewEnd: 1,
  playhead: 0,
  lines: [],
  selectedIndex: -1,
  dragging: null,
  onMarkerDrag: null,
  onSelect: null,
  emptyLabel: "Load audio to see waveform",
};

export function initWaveform(canvas, handlers = {}) {
  STATE.onMarkerDrag = handlers.onMarkerDrag || null;
  STATE.onSelect = handlers.onSelect || null;

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

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const focus = STATE.viewStart + x * (STATE.viewEnd - STATE.viewStart);
      const span = STATE.viewEnd - STATE.viewStart;
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      let newSpan = Math.min(1, Math.max(0.015, span * factor));
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
    },
    { passive: false }
  );

  // Markers only — seeking is via the scrubber control
  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const hit = hitMarker(x, rect.width);
    if (hit >= 0) {
      STATE.dragging = { index: hit, pointerId: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
      STATE.onSelect?.(hit);
    }
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

  return { draw, resize, setPeaks, setPlayhead, setLines, setSelected, setDuration, setEmptyLabel };
}

/**
 * Build high-resolution min/max peaks (and RMS envelope) from the buffer.
 * Target ~2–4 peaks per screen CSS pixel at full zoom-out for detail.
 */
export function computePeaks(audioBuffer, targetPeaks = 4000) {
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  const length = ch0.length;
  const peaksCount = Math.min(targetPeaks, Math.max(256, Math.floor(length / 64)));
  const block = Math.max(1, Math.floor(length / peaksCount));
  const peaks = new Float32Array(peaksCount * 3); // min, max, rms

  for (let i = 0; i < peaksCount; i++) {
    const start = i * block;
    const end = Math.min(start + block, length);
    let min = 1;
    let max = -1;
    let sumSq = 0;
    let n = 0;
    for (let j = start; j < end; j++) {
      let v = ch0[j];
      if (ch1) v = (v + ch1[j]) * 0.5;
      if (v < min) min = v;
      if (v > max) max = v;
      sumSq += v * v;
      n += 1;
    }
    const rms = n ? Math.sqrt(sumSq / n) : 0;
    const idx = i * 3;
    peaks[idx] = min;
    peaks[idx + 1] = max;
    peaks[idx + 2] = rms;
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

function setEmptyLabel(label) {
  STATE.emptyLabel = label || STATE.emptyLabel;
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
  const threshold = 14;
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
  ctx.fillStyle = "#0a0608";
  ctx.fillRect(0, 0, width, height);

  if (STATE.peaks && STATE.peaks.length && STATE.duration) {
    drawPeaks(ctx, width, height);
  } else {
    ctx.fillStyle = "rgba(176,166,153,0.65)";
    ctx.font = "13px Outfit, Noto Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(STATE.emptyLabel, width / 2, height / 2 + 4);
  }

  STATE.lines.forEach((line, i) => {
    if (line.start == null) return;
    const x = timeToX(line.start, width);
    if (x < -20 || x > width + 20) return;
    const selected = i === STATE.selectedIndex;
    ctx.strokeStyle = selected ? "#ff6a13" : "rgba(255,179,71,0.55)";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    ctx.fillStyle = selected ? "#ff6a13" : "#ffb347";
    ctx.beginPath();
    ctx.arc(x, 10, selected ? 5 : 4, 0, Math.PI * 2);
    ctx.fill();

    const label = String(i + 1);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "rgba(7,6,5,0.8)";
    ctx.fillRect(x + 4, 2, ctx.measureText(label).width + 6, 14);
    ctx.fillStyle = "#f2e9dd";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 7, 12);
  });

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
  const stride = 3;
  const pairCount = peaks.length / stride;
  const startPeak = Math.floor(STATE.viewStart * pairCount);
  const endPeak = Math.ceil(STATE.viewEnd * pairCount);
  const mid = height / 2;
  const amp = height * 0.46;
  const visible = Math.max(1, endPeak - startPeak);

  // Soft RMS fill (song energy)
  ctx.beginPath();
  ctx.fillStyle = "rgba(255,106,19,0.22)";
  for (let i = 0; i < width; i++) {
    const peakIdx = startPeak + Math.floor((i / width) * visible);
    if (peakIdx < 0 || peakIdx >= pairCount) continue;
    const rms = peaks[peakIdx * stride + 2];
    const h = Math.max(1, rms * amp * 1.6);
    ctx.fillRect(i, mid - h, 1, h * 2);
  }

  // Detailed min/max bars
  for (let i = 0; i < width; i++) {
    const peakIdx = startPeak + Math.floor((i / width) * visible);
    if (peakIdx < 0 || peakIdx >= pairCount) continue;
    const min = peaks[peakIdx * stride];
    const max = peaks[peakIdx * stride + 1];
    const y1 = mid + min * amp;
    const y2 = mid + max * amp;
    const hot = Math.abs(max - min) > 0.35;
    ctx.strokeStyle = hot ? "rgba(255,179,71,0.95)" : "rgba(255,106,19,0.85)";
    ctx.beginPath();
    ctx.moveTo(i + 0.5, y1);
    ctx.lineTo(i + 0.5, y2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,120,80,0.18)";
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();
}

export function formatPlayheadLabel(t) {
  return formatTime(t);
}
