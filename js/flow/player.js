/**
 * Video-style preview: the real renderer on a canvas, driven by the song.
 * Play / pause, seek bar, time, full screen. Same frames as the export.
 */

import * as audio from "../audio.js";
import { drawFrame, resolveOutputSize, overlayBackground } from "../../video/renderer.js";
import { formatTime } from "../sync.js";

const MAX_PREVIEW_EDGE = 1280;

/**
 * @param {{ project: () => object, settings: () => object, t: (k: string) => string, esc: (s: string) => string }} opts
 */
export function createPlayer({ project, settings, t, esc }) {
  const el = document.createElement("div");
  el.className = "fp";
  el.innerHTML = `
    <div class="fp-frame">
      <canvas class="fp-canvas" aria-label="Video preview"></canvas>
      <button type="button" class="fp-big" aria-label="${esc(t("playerPlay"))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
      </button>
    </div>
    <div class="fp-bar">
      <button type="button" class="fp-btn fp-toggle" aria-label="${esc(t("playerPlay"))}">
        <svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        <svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>
      </button>
      <span class="fp-time">0:00</span>
      <input type="range" class="fp-seek" min="0" max="1000" value="0" step="1" aria-label="${esc(t("playerSeek"))}" />
      <span class="fp-dur">0:00</span>
      <button type="button" class="fp-btn fp-fs" aria-label="${esc(t("playerFull"))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>
      </button>
    </div>`;

  const frame = el.querySelector(".fp-frame");
  const canvas = el.querySelector("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const seek = el.querySelector(".fp-seek");
  let raf = 0;
  let seeking = false;
  let destroyed = false;
  let loadedFont = "";

  const duration = () => audio.getDuration() || (project()?.audio?.durationMs || 0) / 1000;

  /** Size the canvas to the frame's on-screen size (sharp but not wasteful). */
  const fit = () => {
    const s = settings();
    const { w, h } = resolveOutputSize(s);
    frame.style.setProperty("--ar", `${w} / ${h}`);
    frame.style.setProperty("--arn", String(w / h));
    const box = frame.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cw = Math.max(1, Math.round((box.width || 320) * dpr));
    let ch = Math.round(cw * (h / w));
    const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(cw, ch));
    cw = Math.round(cw * scale);
    ch = Math.round(ch * scale);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
  };

  const ensureFont = (s) => {
    const fam = s.font || "Outfit";
    const key = `${s.fontWeight || 600} ${fam}`;
    if (loadedFont === key || !document.fonts?.load) return;
    loadedFont = key;
    document.fonts
      .load(`${s.fontWeight || 600} 48px "${fam}"`)
      .then(() => !destroyed && draw())
      .catch(() => {});
  };

  const draw = () => {
    const s = settings();
    fit();
    ensureFont(s);
    frame.dataset.bg = overlayBackground(s) || "full";
    const now = audio.getCurrentTime();
    drawFrame(ctx, project(), Math.round(now * 1000), {
      ...s,
      width: canvas.width,
      height: canvas.height,
      reducedMotion: false,
    });
    const d = duration();
    if (!seeking) seek.value = String(d ? Math.round((now / d) * 1000) : 0);
    el.querySelector(".fp-time").textContent = formatTime(now);
    el.querySelector(".fp-dur").textContent = formatTime(d);
  };

  const loop = () => {
    draw();
    if (audio.isPlaying() && !destroyed) raf = requestAnimationFrame(loop);
    else raf = 0;
  };

  const syncState = () => {
    const playing = audio.isPlaying();
    el.classList.toggle("is-playing", playing);
    const label = t(playing ? "playerPause" : "playerPlay");
    el.querySelector(".fp-toggle").setAttribute("aria-label", label);
    el.querySelector(".fp-big").setAttribute("aria-label", label);
    if (playing && !raf) raf = requestAnimationFrame(loop);
    if (!playing) draw();
  };

  const toggle = async () => {
    if (audio.isPlaying()) {
      audio.pause();
    } else {
      if (audio.getCurrentTime() >= duration() - 0.2) audio.seek(0);
      await audio.play();
    }
    syncState();
  };

  el.querySelector(".fp-big").addEventListener("click", toggle);
  el.querySelector(".fp-toggle").addEventListener("click", toggle);
  canvas.addEventListener("click", toggle);
  seek.addEventListener("input", () => {
    seeking = true;
    audio.seek((Number(seek.value) / 1000) * duration());
    draw();
  });
  seek.addEventListener("change", () => {
    seeking = false;
  });

  const fsBtn = el.querySelector(".fp-fs");
  const setFsLabel = () => {
    const on = el.classList.contains("is-fs") || document.fullscreenElement === el;
    fsBtn.setAttribute("aria-label", t(on ? "playerExitFull" : "playerFull"));
  };
  fsBtn.addEventListener("click", async () => {
    if (document.fullscreenElement === el) {
      await document.exitFullscreen?.();
    } else if (el.classList.contains("is-fs")) {
      el.classList.remove("is-fs");
    } else if (el.requestFullscreen) {
      try {
        await el.requestFullscreen();
      } catch {
        el.classList.add("is-fs");
      }
    } else {
      // iPhone Safari: no element full screen, fill the viewport instead
      el.classList.add("is-fs");
    }
    setFsLabel();
    requestAnimationFrame(draw);
  });
  const onFs = () => {
    setFsLabel();
    requestAnimationFrame(draw);
  };
  document.addEventListener("fullscreenchange", onFs);

  const offPlay = audio.onPlayState(syncState);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => draw()) : null;
  ro?.observe(frame);
  requestAnimationFrame(() => syncState());

  return {
    el,
    redraw: () => draw(),
    toggle,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      offPlay();
      ro?.disconnect();
      document.removeEventListener("fullscreenchange", onFs);
      if (document.fullscreenElement === el) document.exitFullscreen?.();
      audio.pause();
    },
  };
}
