/** Detailed waveform: cached peaks, regions, zoom/pan/follow (no accidental seek on mobile). */

import { formatTime } from "./sync.js";
import { lineMainText, isLyric } from "./core/project.js";

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
  onRegionEdge: null,
  onRegionMove: null,
  onSelect: null,
  onSeek: null,
  emptyLabel: "Load audio to see waveform",
  peaksCache: null,
  follow: true,
  userPanned: false,
  canvas: null,
  pinch: null,
  pan: null,
};

let peaksWorker = null;
let peaksReqId = 0;

function getWorker() {
  if (peaksWorker) return peaksWorker;
  try {
    peaksWorker = new Worker(new URL("./peaks.worker.js", import.meta.url), { type: "module" });
  } catch {
    peaksWorker = null;
  }
  return peaksWorker;
}

export function initWaveform(canvas, handlers = {}) {
  STATE.canvas = canvas;
  STATE.onMarkerDrag = handlers.onMarkerDrag || null;
  STATE.onRegionEdge = handlers.onRegionEdge || null;
  STATE.onRegionMove = handlers.onRegionMove || null;
  STATE.onSelect = handlers.onSelect || null;
  STATE.onSeek = handlers.onSeek || null;

  const ctx = canvas.getContext("2d");

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    STATE.peaksCache = null;
    draw();
  }

  resize();
  window.addEventListener("resize", resize);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.shiftKey) {
        panBy(e.deltaY !== 0 ? e.deltaY : e.deltaX);
      } else {
        zoomAt(e.clientX, e.deltaY > 0 ? 1.15 : 1 / 1.15);
      }
    },
    { passive: false }
  );

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const hit = hitTest(x, rect.width);

    if (e.pointerType === "touch") {
      // Track for pinch
      if (!STATE.pinch) STATE.pinch = new Map();
      STATE.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (STATE.pinch.size === 2) {
        const pts = [...STATE.pinch.values()];
        STATE.pinchMeta = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          mid: (pts[0].x + pts[1].x) / 2,
          viewStart: STATE.viewStart,
          viewEnd: STATE.viewEnd,
        };
        STATE.dragging = null;
        STATE.pan = null;
        return;
      }
    }

    if (hit) {
      STATE.dragging = {
        kind: hit.kind,
        index: hit.index,
        pointerId: e.pointerId,
        startX: x,
        startTime: hit.kind === "move" ? lineStartSec(STATE.lines[hit.index]) : null,
        grabOffset: hit.kind === "move" ? x - timeToX(lineStartSec(STATE.lines[hit.index]), rect.width) : 0,
      };
      canvas.setPointerCapture(e.pointerId);
      STATE.onSelect?.(hit.index);
      return;
    }

    // Desktop: click empty to seek
    if (e.pointerType === "mouse" && STATE.onSeek) {
      const t = xToTime(x, rect.width);
      STATE.onSeek(t);
      return;
    }

    // One-finger pan when zoomed
    if (viewSpan() < 0.999) {
      STATE.pan = { pointerId: e.pointerId, lastX: x, width: rect.width };
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (STATE.pinch?.has(e.pointerId)) {
      STATE.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (STATE.pinch.size === 2 && STATE.pinchMeta) {
        const pts = [...STATE.pinch.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = (pts[0].x + pts[1].x) / 2;
        const scale = STATE.pinchMeta.dist / Math.max(1, dist);
        const rect = canvas.getBoundingClientRect();
        const focusX = (mid - rect.left) / rect.width;
        const oldSpan = STATE.pinchMeta.viewEnd - STATE.pinchMeta.viewStart;
        let newSpan = Math.min(1, Math.max(0.015, oldSpan * scale));
        const focus = STATE.pinchMeta.viewStart + focusX * oldSpan;
        let start = focus - focusX * newSpan;
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
        STATE.peaksCache = null;
        disableFollow();
        draw();
        return;
      }
    }

    if (STATE.pan && STATE.pan.pointerId === e.pointerId) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const dx = x - STATE.pan.lastX;
      STATE.pan.lastX = x;
      panByPx(-dx, rect.width);
      return;
    }

    if (!STATE.dragging || STATE.dragging.pointerId !== e.pointerId) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = xToTime(x, rect.width);
    const { kind, index } = STATE.dragging;
    if (kind === "start" || kind === "marker") {
      STATE.onMarkerDrag?.(index, t);
      STATE.onRegionEdge?.(index, "start", t);
    } else if (kind === "end") {
      STATE.onRegionEdge?.(index, "end", t);
    } else if (kind === "move") {
      const startT = xToTime(x - STATE.dragging.grabOffset, rect.width);
      const delta = startT - (STATE.dragging.startTime || 0);
      STATE.onRegionMove?.(index, delta);
    }
  });

  const endDrag = (e) => {
    STATE.pinch?.delete(e.pointerId);
    if (STATE.pinch && STATE.pinch.size < 2) STATE.pinchMeta = null;
    if (STATE.pan && STATE.pan.pointerId === e.pointerId) STATE.pan = null;
    if (STATE.dragging && STATE.dragging.pointerId === e.pointerId) {
      STATE.dragging = null;
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  return {
    draw,
    resize,
    setPeaks,
    setPlayhead,
    setLines,
    setSelected,
    setDuration,
    setEmptyLabel,
    setFollow,
    getFollow: () => STATE.follow,
    zoomIn: () => zoomAt(null, 1 / 1.2),
    zoomOut: () => zoomAt(null, 1.2),
    resetView: () => {
      STATE.viewStart = 0;
      STATE.viewEnd = 1;
      STATE.peaksCache = null;
      draw();
    },
  };
}

function lineStartSec(line) {
  if (!line) return 0;
  if (line.start != null) return line.start;
  return 0;
}

function viewSpan() {
  return STATE.viewEnd - STATE.viewStart;
}

function disableFollow() {
  STATE.follow = false;
  STATE.userPanned = true;
}

function panBy(delta) {
  const span = viewSpan();
  const shift = (delta / 400) * span;
  let start = STATE.viewStart + shift;
  let end = STATE.viewEnd + shift;
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > 1) {
    start -= end - 1;
    end = 1;
  }
  STATE.viewStart = Math.max(0, start);
  STATE.viewEnd = Math.min(1, end);
  STATE.peaksCache = null;
  disableFollow();
  draw();
}

function panByPx(dx, width) {
  const span = viewSpan();
  const shift = (dx / width) * span;
  let start = STATE.viewStart + shift;
  let end = start + span;
  if (start < 0) {
    start = 0;
    end = span;
  }
  if (end > 1) {
    end = 1;
    start = 1 - span;
  }
  STATE.viewStart = start;
  STATE.viewEnd = end;
  STATE.peaksCache = null;
  disableFollow();
  draw();
}

function zoomAt(clientX, factor) {
  const canvas = STATE.canvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = clientX == null ? 0.5 : (clientX - rect.left) / rect.width;
  const focus = STATE.viewStart + x * (STATE.viewEnd - STATE.viewStart);
  const span = STATE.viewEnd - STATE.viewStart;
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
  STATE.peaksCache = null;
  draw();
}

function setFollow(on) {
  STATE.follow = Boolean(on);
  if (STATE.follow) STATE.userPanned = false;
  draw();
}

/**
 * Build high-resolution min/max peaks (and RMS envelope) from the buffer.
 * Prefer Web Worker when available.
 */
export function computePeaks(audioBuffer, targetPeaks = 4000) {
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  return computePeaksSync(ch0, ch1, targetPeaks);
}

export function computePeaksAsync(audioBuffer, targetPeaks = 4000) {
  const worker = getWorker();
  if (!worker) {
    return Promise.resolve(computePeaks(audioBuffer, targetPeaks));
  }
  const id = ++peaksReqId;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  const copy0 = ch0.slice().buffer;
  const copy1 = ch1 ? ch1.slice().buffer : null;
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      if (e.data?.id !== id) return;
      worker.removeEventListener("message", onMsg);
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.peaks);
    };
    worker.addEventListener("message", onMsg);
    const transfer = copy1 ? [copy0, copy1] : [copy0];
    worker.postMessage({ id, ch0: copy0, ch1: copy1, targetPeaks }, transfer);
  });
}

function computePeaksSync(ch0, ch1, targetPeaks = 4000) {
  const length = ch0.length;
  const peaksCount = Math.min(targetPeaks, Math.max(256, Math.floor(length / 64)));
  const block = Math.max(1, Math.floor(length / peaksCount));
  const peaks = new Float32Array(peaksCount * 3);
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
  STATE.peaksCache = null;
  draw();
}

function setDuration(d) {
  STATE.duration = d;
}

function setPlayhead(t) {
  STATE.playhead = t;
  if (STATE.follow && STATE.duration && viewSpan() < 0.999) {
    const frac = t / STATE.duration;
    const span = viewSpan();
    const margin = span * 0.2;
    if (frac < STATE.viewStart + margin || frac > STATE.viewEnd - margin) {
      let start = frac - span * 0.4;
      let end = start + span;
      if (start < 0) {
        start = 0;
        end = span;
      }
      if (end > 1) {
        end = 1;
        start = 1 - span;
      }
      if (start !== STATE.viewStart || end !== STATE.viewEnd) {
        STATE.viewStart = start;
        STATE.viewEnd = end;
        STATE.peaksCache = null;
      }
    }
  }
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

function hitTest(x, width) {
  const edge = 8;
  let best = null;
  let bestDist = 16;
  STATE.lines.forEach((line, i) => {
    if (!isLyric(line) && line.type === "section") return;
    const start = line.start;
    if (start == null) return;
    const end = line.end != null ? line.end : start + 1;
    const x0 = timeToX(start, width);
    const x1 = timeToX(end, width);
    const dStart = Math.abs(x - x0);
    const dEnd = Math.abs(x - x1);
    if (dStart < bestDist) {
      bestDist = dStart;
      best = { kind: "start", index: i };
    }
    if (dEnd < bestDist) {
      bestDist = dEnd;
      best = { kind: "end", index: i };
    }
    if (x > x0 + edge && x < x1 - edge) {
      best = { kind: "move", index: i };
      bestDist = 0;
    }
  });
  return best;
}

function peaksCacheValid(width, height, dpr) {
  const c = STATE.peaksCache;
  return (
    c &&
    c.viewStart === STATE.viewStart &&
    c.viewEnd === STATE.viewEnd &&
    c.width === width &&
    c.height === height &&
    c.dpr === dpr
  );
}

function rebuildPeaksCache(width, height, dpr) {
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.floor(width * dpr));
  off.height = Math.max(1, Math.floor(height * dpr));
  const octx = off.getContext("2d");
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.fillStyle = "#0a0608";
  octx.fillRect(0, 0, width, height);
  paintPeaks(octx, width, height);
  STATE.peaksCache = {
    canvas: off,
    viewStart: STATE.viewStart,
    viewEnd: STATE.viewEnd,
    width,
    height,
    dpr,
  };
}

function draw() {
  const canvas = STATE.canvas || document.getElementById("waveform");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;

  ctx.clearRect(0, 0, width, height);

  if (STATE.peaks && STATE.peaks.length && STATE.duration) {
    if (!peaksCacheValid(width, height, dpr)) rebuildPeaksCache(width, height, dpr);
    ctx.drawImage(STATE.peaksCache.canvas, 0, 0, width, height);
  } else {
    ctx.fillStyle = "#0a0608";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "rgba(176,166,153,0.65)";
    ctx.font = "13px Outfit, Noto Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(STATE.emptyLabel, width / 2, height / 2 + 4);
  }

  // Regions
  const showText = viewSpan() < 0.35;
  STATE.lines.forEach((line, i) => {
    if (line.type === "section") {
      // section label tick — no timed region
      return;
    }
    if (line.start == null) return;
    const x0 = timeToX(line.start, width);
    const x1 = timeToX(line.end != null ? line.end : line.start + 0.5, width);
    if (x1 < -20 || x0 > width + 20) return;
    const selected = i === STATE.selectedIndex;
    const left = Math.max(0, x0);
    const right = Math.min(width, x1);
    ctx.fillStyle = selected ? "rgba(255,106,19,0.28)" : "rgba(255,179,71,0.16)";
    ctx.fillRect(left, height * 0.18, Math.max(2, right - left), height * 0.64);
    ctx.strokeStyle = selected ? "#ff6a13" : "rgba(255,179,71,0.55)";
    ctx.lineWidth = selected ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x0, height * 0.12);
    ctx.lineTo(x0, height * 0.88);
    ctx.moveTo(x1, height * 0.12);
    ctx.lineTo(x1, height * 0.88);
    ctx.stroke();

    if (showText && right - left > 36) {
      const label = lineMainText(line) || String(i + 1);
      ctx.font = "11px Outfit, Noto Sans, sans-serif";
      ctx.fillStyle = "rgba(242,233,221,0.9)";
      ctx.textAlign = "left";
      const clipped = label.length > 28 ? `${label.slice(0, 27)}…` : label;
      ctx.fillText(clipped, left + 6, height * 0.42);
    }
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

function paintPeaks(ctx, width, height) {
  const peaks = STATE.peaks;
  const stride = 3;
  const pairCount = peaks.length / stride;
  const startPeak = Math.floor(STATE.viewStart * pairCount);
  const endPeak = Math.ceil(STATE.viewEnd * pairCount);
  const mid = height / 2;
  const amp = height * 0.46;
  const visible = Math.max(1, endPeak - startPeak);

  ctx.fillStyle = "rgba(255,106,19,0.22)";
  for (let i = 0; i < width; i++) {
    const peakIdx = startPeak + Math.floor((i / width) * visible);
    if (peakIdx < 0 || peakIdx >= pairCount) continue;
    const rms = peaks[peakIdx * stride + 2];
    const h = Math.max(1, rms * amp * 1.6);
    ctx.fillRect(i, mid - h, 1, h * 2);
  }

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
