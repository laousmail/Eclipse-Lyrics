/**
 * Step 7: export, Canva-style. One tile per chosen file; each tile fills as it
 * renders, then offers Download / Share. Everything is made on this device.
 */

import * as video from "../video.js";
import { srtBlob } from "../export.js";
import { OUTPUTS, outputVideoSettings } from "./helpers.js";
import { exportFileName } from "../../video/export-overlay.js";
import { ZipWriter } from "../zip.js";

const ICONS = {
  srt: '<path d="M5 7h14M5 12h10M5 17h12"/>',
  transparent: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16" opacity=".55"/>',
  black: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" opacity=".35"/><path d="M8 12h8"/>',
  green: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 12h8"/>',
  full: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/>',
};

const LABELS = {
  srt: ["outSrt", "outSrtFor"],
  transparent: ["outTransparent", "outTransparentFor"],
  black: ["outBlack", "outBlackFor"],
  green: ["outGreen", "outGreenFor"],
  full: ["outFull", "outFullFor"],
};

function etaText(sec) {
  if (sec == null || !Number.isFinite(sec)) return "";
  if (sec < 60) return `${Math.max(1, Math.ceil(sec))} s`;
  return `${Math.floor(sec / 60)} min ${Math.ceil(sec % 60)} s`;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function canShareFile(file) {
  try {
    return Boolean(navigator.canShare?.({ files: [file] }));
  } catch {
    return false;
  }
}

export function renderExportStep(c) {
  const { t, esc } = c;
  const p = c.project();
  const f = c.flow();
  const ids = OUTPUTS.map((o) => o.id).filter((id) => f.outputs.includes(id));
  const items = ids.map((id) => ({ id, state: "queued", progress: 0, eta: null, blob: null, fileName: "", compatible: true }));

  const el = document.createElement("div");
  el.className = "fx";
  el.innerHTML = `
    <header class="fx-head">
      <h2 class="fq-title"></h2>
      <p class="fq-help"></p>
      <div class="fx-overall" aria-hidden="true"><span></span></div>
      <p class="fx-overall-label" aria-live="polite"></p>
    </header>
    <ul class="fx-tiles"></ul>
    <div class="fx-actions">
      <button type="button" class="f-ok fx-all" hidden>${esc(t("exportAll"))}</button>
      <button type="button" class="f-btn fx-stop">${esc(t("exportCancel"))}</button>
      <button type="button" class="f-btn fx-look" hidden>${esc(t("exportBackLook"))}</button>
      <button type="button" class="f-link fx-again" hidden>${esc(t("exportAgain"))}</button>
    </div>`;
  const list = el.querySelector(".fx-tiles");

  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "fx-tile";
    li.dataset.id = it.id;
    const label = it.id === "transparent" && !c.transparentWebm() ? "outTransparentPng" : LABELS[it.id][1];
    li.innerHTML = `
      <span class="fx-fill" aria-hidden="true"></span>
      <span class="fx-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[it.id]}</svg></span>
      <span class="fx-text"><b>${esc(t(LABELS[it.id][0]))}</b><small>${esc(t(label))}</small></span>
      <span class="fx-status" aria-live="polite"></span>
      <span class="fx-btns">
        <button type="button" class="f-btn fx-dl">${esc(t("exportDownload"))}</button>
        <button type="button" class="f-btn fx-share" hidden>${esc(t("exportShare"))}</button>
        <button type="button" class="f-btn fx-retry" hidden>${esc(t("exportRetry"))}</button>
      </span>
      <p class="fx-warn" hidden>${esc(t("exportFormatWarn"))}</p>`;
    li.querySelector(".fx-dl").addEventListener("click", () => it.blob && downloadBlob(it.blob, it.fileName));
    li.querySelector(".fx-share").addEventListener("click", async () => {
      const file = new File([it.blob], it.fileName, { type: it.blob.type });
      try {
        await navigator.share({ files: [file], title: p.title || "Eclipse Lyrics" });
      } catch {
        /* user closed the share sheet */
      }
    });
    li.querySelector(".fx-retry").addEventListener("click", () => {
      it.state = "queued";
      it.progress = 0;
      paint();
      run();
    });
    list.appendChild(li);
  });

  let running = false;
  let stopped = false;
  let wakeLock = null;

  const paint = () => {
    const done = items.filter((i) => i.state === "done").length;
    const finished = items.every((i) => i.state === "done" || i.state === "error");
    el.querySelector(".fq-title").textContent = t(finished ? "exportDoneQ" : "exportQ");
    el.querySelector(".fq-help").textContent = t(finished ? "exportDoneHelp" : "exportHelp");
    const overall = items.reduce((n, i) => n + (i.state === "done" ? 1 : i.state === "working" ? i.progress : 0), 0) / Math.max(1, items.length);
    el.querySelector(".fx-overall span").style.width = `${Math.round(overall * 100)}%`;
    el.querySelector(".fx-overall-label").textContent = t("exportOverall", { done, total: items.length });
    el.querySelector(".fx-all").hidden = !(finished && done > 1);
    el.querySelector(".fx-stop").hidden = finished;
    el.querySelector(".fx-look").hidden = !finished || !items.some((i) => i.id !== "srt");
    el.querySelector(".fx-again").hidden = !finished;
    el.classList.toggle("is-finished", finished);

    items.forEach((it) => {
      const li = list.querySelector(`[data-id="${it.id}"]`);
      li.dataset.state = it.state;
      li.style.setProperty("--p", String(it.state === "done" ? 1 : it.progress));
      const status = li.querySelector(".fx-status");
      if (it.state === "queued") status.textContent = t("exportQueued");
      if (it.state === "working") {
        const pct = Math.round(it.progress * 100);
        status.textContent = `${t("exportWorking", { pct })}${it.eta ? ` · ${t("exportEta", { eta: etaText(it.eta) })}` : ""}`;
      }
      if (it.state === "done") status.textContent = `${t("exportReady")} ✓ · ${it.fileName}`;
      if (it.state === "error") status.textContent = t("exportFailed");
      li.querySelector(".fx-dl").hidden = it.state !== "done";
      li.querySelector(".fx-share").hidden =
        it.state !== "done" || !canShareFile(new File([it.blob || new Blob()], it.fileName || "x", { type: it.blob?.type }));
      li.querySelector(".fx-retry").hidden = it.state !== "error";
      li.querySelector(".fx-warn").hidden = it.state !== "done" || it.compatible !== false;
    });
  };

  const exportOne = async (it) => {
    it.state = "working";
    it.progress = 0;
    paint();
    if (it.id === "srt") {
      const v = p.settings?.video || {};
      const languages = v.showTranslation && f.translation !== "none" ? `main+${v.translationLang || "fr"}` : "main";
      it.blob = srtBlob(p, { ...(p.settings?.export || {}), languages });
      it.fileName = `${(p.title || "lyrics").replace(/\s+/g, "-")}.srt`;
      // A short fill so the tile reads as "made", not "skipped"
      it.progress = 1;
      paint();
      await new Promise((r) => setTimeout(r, 450));
      it.state = "done";
      return;
    }
    const settings = outputVideoSettings(it.id, p.settings?.video || {}, { transparentWebm: c.transparentWebm() });
    const pj = { ...p, settings: { ...p.settings, video: settings } };
    let result = null;
    let failed = null;
    await video.startVideoExport(pj, {
      autoDownload: false,
      onProgress: (info) => {
        it.progress = Math.max(0, Math.min(1, Number(info?.progress ?? info) || 0));
        it.eta = info?.etaSec ?? null;
        paint();
      },
      onDone: (res) => {
        result = res;
      },
      onError: (err) => {
        failed = err || new Error("export failed");
      },
    });
    if (stopped) return;
    if (failed || !result?.blob) {
      it.state = "error";
      return;
    }
    it.blob = result.blob;
    it.fileName = result.fileName || exportFileName(pj, settings, "mp4");
    it.compatible = result.compatible !== false;
    it.state = "done";
  };

  const run = async () => {
    if (running) return;
    running = true;
    stopped = false;
    try {
      wakeLock = await navigator.wakeLock?.request?.("screen");
    } catch {
      wakeLock = null;
    }
    for (const it of items) {
      if (stopped) break;
      if (it.state !== "queued") continue;
      try {
        await exportOne(it);
      } catch {
        it.state = "error";
      }
      paint();
    }
    running = false;
    wakeLock?.release?.().catch?.(() => {});
    wakeLock = null;
    paint();
  };

  el.querySelector(".fx-stop").addEventListener("click", () => {
    stopped = true;
    video.stopRecording();
    items.forEach((i) => {
      if (i.state === "working" || i.state === "queued") {
        i.state = "error";
      }
    });
    paint();
  });
  el.querySelector(".fx-all").addEventListener("click", async () => {
    const btn = el.querySelector(".fx-all");
    btn.disabled = true;
    try {
      const zip = new ZipWriter();
      for (const it of items) {
        if (it.state === "done" && it.blob) zip.add(it.fileName, new Uint8Array(await it.blob.arrayBuffer()));
      }
      downloadBlob(zip.finish(), `${(p.title || "lyrics").replace(/\s+/g, "-")}-eclipse-lyrics.zip`);
    } finally {
      btn.disabled = false;
    }
  });
  el.querySelector(".fx-look").addEventListener("click", () => c.go("look", -1));
  el.querySelector(".fx-again").addEventListener("click", () => c.go("welcome", -1));

  paint();
  // Start right away: the user already said "Export"
  setTimeout(run, 350);

  return {
    el,
    cleanup: () => {
      if (running) {
        stopped = true;
        video.stopRecording();
      }
      wakeLock?.release?.().catch?.(() => {});
    },
  };
}
