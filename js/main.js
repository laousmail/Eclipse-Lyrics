/** App state and wiring for Eclipse Lyrics Sync. */

import * as audio from "./audio.js";
import * as sync from "./sync.js";
import * as storage from "./storage.js";
import * as db from "./db.js";
import * as store from "./store.js";
import * as history from "./history.js";
import * as exp from "./export.js";
import { initWaveform, computePeaks } from "./waveform.js";
import * as video from "./video.js";
import * as i18n from "./i18n.js";
import * as docs from "./docs.js";
import * as haptics from "./haptics.js";
import { showToast } from "./ui/toast.js";
import { openDialog, closeDialog, isDialogOpen as dialogIsOpen } from "./ui/dialog.js";
import { applyIcons, iconHtml } from "./ui/icons.js";
import { renderLineListInPlace } from "./lineList.js";
import {
  migrateProject,
  setDurationSec,
  durationSec,
  lineMainText,
  lineFr,
  lineEn,
  audioId,
} from "./core/project.js";

const state = {
  project: sync.createEmptyProject(),
  selectedIndex: 0,
  tapIndex: 0,
  audioBlob: null,
  waveform: null,
  screen: "audio",
  scrubbing: false,
  audioReady: false,
  lastActiveLine: -1,
  userScrollPauseUntil: 0,
};

store.reset({
  project: state.project,
  screen: state.screen,
  selectedIndex: 0,
  tapIndex: 0,
});

video.bindProject(() => state.project);

function publishStore(patch = {}) {
  store.set({
    project: state.project,
    screen: state.screen,
    selectedIndex: state.selectedIndex,
    tapIndex: state.tapIndex,
    ...patch,
  });
}

const $ = (id) => document.getElementById(id);
const SCREENS = ["audio", "lyrics", "sync", "export", "video"];
const SCRUB_MAX = 1000;

function showScreen(name, { pushHash = true, persistScreen = true } = {}) {
  if (!SCREENS.includes(name)) return;
  const changed = state.screen !== name;
  state.screen = name;
  if (persistScreen) {
    state.project.lastScreen = name;
    if (changed) persist();
  }
  document.querySelectorAll(".screen").forEach((el) => {
    const active = el.dataset.screen === name;
    el.classList.toggle("is-active", active);
    el.hidden = !active;
    if (active) {
      el.classList.remove("screen-enter");
      // reflow for enter animation
      void el.offsetWidth;
      el.classList.add("screen-enter");
    }
  });
  document.querySelectorAll(".app-tabbar .tab").forEach((tab) => {
    const active = tab.dataset.goto === name;
    tab.classList.toggle("is-active", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  updateDockVisibility();
  if (name === "sync") {
    requestAnimationFrame(() => {
      state.waveform?.resize?.();
      state.waveform?.draw?.();
      updateScrubber();
      scrollTapLineIntoView(true);
    });
  }
  if (name === "video") video.renderFrame(state.project);
  const main = $("main");
  if (main) main.scrollTop = 0;
  if (pushHash) {
    const hash = `#${name}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }
  if (changed) haptics.tick();
}

function updateDockVisibility() {
  const dock = $("player-dock");
  const show = state.screen === "sync" || audio.isPlaying();
  dock.hidden = !show;
  document.body.classList.toggle("dock-on", show);
  document.body.classList.add("has-tabbar");
}

function openSheet(id) {
  openDialog(id);
}

function closeSheet(id) {
  closeDialog(id);
}

function persist() {
  state.project.updatedAt = Date.now();
  db.scheduleSaveProject(state.project);
  publishStore();
}

function setStatus(msg) {
  const el = $("audio-status");
  if (el) el.textContent = msg;
}


function formatClock(t) {
  return sync.formatTime(t);
}

function updateAudioLoadedUI(fileName, duration) {
  const pick = $("audio-pick");
  const loaded = $("audio-loaded");
  const prompt = $("meta-prompt");
  const btn = $("btn-continue-lyrics");
  if (pick) pick.hidden = true;
  if (loaded) loaded.hidden = false;
  if (prompt) prompt.hidden = false;
  if ($("loaded-file-name")) $("loaded-file-name").textContent = fileName || "—";
  if ($("loaded-duration")) $("loaded-duration").textContent = formatClock(duration || 0);
  state.audioReady = true;
  if (btn) {
    btn.dataset.i18n = "loadedContinue";
    btn.textContent = i18n.t("loadedContinue");
  }
  document.body.classList.add("audio-ready");
}

function resetAudioPickUI() {
  const pick = $("audio-pick");
  const loaded = $("audio-loaded");
  const prompt = $("meta-prompt");
  const btn = $("btn-continue-lyrics");
  if (pick) pick.hidden = false;
  if (loaded) loaded.hidden = true;
  if (prompt) prompt.hidden = true;
  state.audioReady = false;
  if (btn) {
    btn.dataset.i18n = "continueLyrics";
    btn.textContent = i18n.t("continueLyrics");
  }
  document.body.classList.remove("audio-ready");
}

function updateScrubber() {
  const scrub = $("scrubber");
  if (!scrub || state.scrubbing) return;
  const dur = audio.getDuration() || durationSec(state.project) || state.project.duration || 0;
  const cur = audio.getCurrentTime();
  scrub.max = String(SCRUB_MAX);
  scrub.value = String(dur > 0 ? Math.round((cur / dur) * SCRUB_MAX) : 0);
}

function updateTimeDisplay() {
  const cur = audio.getCurrentTime();
  const dur = audio.getDuration() || durationSec(state.project) || state.project.duration || 0;
  const td = $("time-display");
  if (td) td.textContent = `${formatClock(cur)} / ${formatClock(dur)}`;
  state.waveform?.setPlayhead(cur);
  updateScrubber();
  updatePreview(cur);
  updateActiveLine(cur);
}

function updatePlayButton() {
  const playing = audio.isPlaying();
  const btn = $("btn-play");
  if (btn) {
    btn.innerHTML = playing ? iconHtml("pause") : iconHtml("play");
    btn.setAttribute("aria-label", playing ? i18n.t("pause") : i18n.t("play"));
  }
  updateDockVisibility();
}

function updateTapButtons() {
  const hasLines = state.project.lines.length > 0;
  const done = sync.isSyncComplete(state.project.lines);
  const tap = $("btn-tap");
  const undo = $("btn-undo");
  const redo = $("btn-redo");
  const mark = $("tap-mark-label");
  const fileName = state.project.audio?.fileName || state.project.audioFileName;
  if (tap) {
    tap.disabled = !hasLines || !fileName || done;
    tap.classList.toggle("is-done", done);
  }
  if (mark) {
    const lyrics = state.project.lines.filter(sync.isLyric);
    if (done) mark.textContent = i18n.t("allLinesTimed");
    else if (lyrics.length && lyrics.every((l) => l.startMs != null) && !lyrics.at(-1)?.endManual) {
      mark.textContent = i18n.t("markEnd");
    } else {
      mark.textContent = i18n.t("markStart");
    }
  }
  if (undo) undo.disabled = !history.canUndo();
  if (redo) redo.disabled = !history.canRedo();
}

function scrollTapLineIntoView(force = false) {
  const list = $("line-list");
  if (!list) return;
  const idx = state.selectedIndex;
  const el = list.querySelector(`.line-item[data-index="${idx}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: force ? "auto" : "smooth" });
}

function renderLineList() {
  const list = $("line-list");
  renderLineListInPlace(list, {
    lines: state.project.lines,
    selectedIndex: state.selectedIndex,
    tapIndex: state.tapIndex,
    onSelect: (i, seek) => selectLine(i, seek),
  });
  // Waveform uses seconds for markers
  state.waveform?.setLines(
    state.project.lines.map((l) => ({
      ...l,
      start: sync.msToSec(l.startMs),
      end: sync.msToSec(l.endMs),
    }))
  );
  state.waveform?.setSelected(state.selectedIndex);
  updateTapButtons();
  updateExportButtons();
  publishStore();
  scrollTapLineIntoView();
}

function selectLine(i, seekTo = false) {
  if (i < 0 || i >= state.project.lines.length) return;
  state.selectedIndex = i;
  state.tapIndex = i;
  renderLineList();
  const line = state.project.lines[i];
  if (seekTo && line.startMs != null) {
    audio.seek(sync.msToSec(line.startMs));
    updateTimeDisplay();
  }
}

function updateActiveLine(tSec) {
  const idx = sync.lineAtTime(state.project.lines, Math.round(tSec * 1000));
  const changed = idx !== state.lastActiveLine;
  document.querySelectorAll(".line-item").forEach((el) => {
    const on = Number(el.dataset.index) === idx;
    el.classList.toggle("active-play", on);
  });
  if (
    changed &&
    idx >= 0 &&
    audio.isPlaying() &&
    Date.now() >= state.userScrollPauseUntil
  ) {
    const el = document.querySelector(`.line-item[data-index="${idx}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  state.lastActiveLine = idx;
}

function updatePreview(tSec) {
  const lines = state.project.lines;
  const idx = sync.lineAtTime(lines, Math.round(tSec * 1000));
  const prev = $("preview-prev");
  const cur = $("preview-current");
  const next = $("preview-next");
  const tr = $("preview-tr");
  if (!cur) return;

  if (idx < 0) {
    prev.textContent = "";
    cur.textContent = lineMainText(lines[0]) || "—";
    next.textContent = lineMainText(lines[1]) || "";
    tr.textContent = "";
    return;
  }

  prev.textContent = lineMainText(lines[idx - 1]) || "";
  cur.textContent = lineMainText(lines[idx]) || "—";
  next.textContent = lineMainText(lines[idx + 1]) || "";
  const lang = state.project.settings.translationLang || "fr";
  const translation = lang === "en" ? lineEn(lines[idx]) : lineFr(lines[idx]);
  tr.textContent = translation || "";
}

function flashTapConfirm() {
  const cur = $("preview-current");
  const dock = $("btn-tap");
  cur?.classList.remove("tap-flash");
  dock?.classList.remove("tap-flash");
  void cur?.offsetWidth;
  cur?.classList.add("tap-flash");
  dock?.classList.add("tap-flash");
}

function applyLyricsFromFields() {
  const before = structuredClone
    ? structuredClone(state.project.lines)
    : JSON.parse(JSON.stringify(state.project.lines));
  const result = sync.applyLyrics(
    state.project,
    $("field-lyrics").value,
    $("field-fr").value,
    $("field-en").value
  );
  const after = result.lines;
  const warn = $("translation-warn");
  if (result.warnings.length) {
    warn.hidden = false;
    warn.textContent = result.warnings
      .map((w) =>
        i18n
          .t(w.key)
          .replace("{fr}", String(w.fr ?? ""))
          .replace("{en}", String(w.en ?? ""))
          .replace("{main}", String(w.main ?? ""))
      )
      .join(" ");
  } else {
    warn.hidden = true;
    warn.textContent = "";
  }

  history.push({
    label: "lyrics",
    do: () => {
      state.project.lines = after;
      state.selectedIndex = 0;
      state.tapIndex = sync.firstUntimedIndex(state.project.lines);
      renderLineList();
      persist();
    },
    undo: () => {
      state.project.lines = before;
      state.selectedIndex = 0;
      state.tapIndex = sync.nextTapIndex(state.project.lines);
      renderLineList();
      persist();
    },
  });

  if (result.changed || result.added) {
    showToast(
      i18n
        .t("lyricsRematch")
        .replace("{changed}", String(result.changed))
        .replace("{added}", String(result.added))
    );
  } else if (state.project.lines.length) {
    showToast(i18n.t("lyricsRematchNone"));
  }
  if (state.project.lines.length) {
    haptics.success();
    showScreen("sync");
  }
}

async function handleAudioFile(file, { stayOnScreen = false } = {}) {
  if (!file) return;
  setStatus(i18n.t("loadingAudio"));
  try {
    const result = await audio.loadAudioFile(file);
    state.audioBlob = result.blob;
    if (!state.project.audio) state.project.audio = { fileName: "", durationMs: 0, storedAudioId: audioId() };
    state.project.audio.fileName = result.fileName;
    if (!state.project.audio.storedAudioId) state.project.audio.storedAudioId = audioId();
    setDurationSec(state.project, result.duration);
    // legacy mirrors
    state.project.audioFileName = result.fileName;
    state.project.duration = result.duration;
    const peaks = computePeaks(result.buffer);
    state.waveform?.setPeaks(peaks, result.duration);
    state.waveform?.setDuration(result.duration);
    setStatus(`${result.fileName} · ${formatClock(result.duration)}`);
    sync.recomputeEnds(state.project.lines, state.project.audio.durationMs);
    renderLineList();
    persist();
    await db.saveAudio(state.project.audio.storedAudioId, result.blob, result.fileName);
    updateTimeDisplay();
    updateAudioLoadedUI(result.fileName, result.duration);
    haptics.success();
    if (!stayOnScreen) {
      showScreen("audio");
      requestAnimationFrame(() => {
        const title = $("field-title");
        title?.focus();
        title?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  } catch (err) {
    console.error(err);
    setStatus(i18n.t("errAudioLoad"));
  }
}

async function handleAudioUrl() {
  const input = $("field-audio-url");
  const errEl = $("audio-url-error");
  const url = input?.value?.trim() || "";
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = "";
  }
  if (!url) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = i18n.t("errAudioUrlEmpty");
    }
    return;
  }
  setStatus(i18n.t("loadingAudio"));
  try {
    const result = await audio.loadAudioFromUrl(url);
    state.audioBlob = result.blob;
    if (!state.project.audio) state.project.audio = { fileName: "", durationMs: 0, storedAudioId: audioId() };
    state.project.audio.fileName = result.fileName;
    if (!state.project.audio.storedAudioId) state.project.audio.storedAudioId = audioId();
    setDurationSec(state.project, result.duration);
    state.project.audioFileName = result.fileName;
    state.project.duration = result.duration;
    const peaks = computePeaks(result.buffer);
    state.waveform?.setPeaks(peaks, result.duration);
    state.waveform?.setDuration(result.duration);
    setStatus(`${result.fileName} · ${formatClock(result.duration)}`);
    sync.recomputeEnds(state.project.lines, state.project.audio.durationMs);
    renderLineList();
    persist();
    await db.saveAudio(state.project.audio.storedAudioId, result.blob, result.fileName);
    updateTimeDisplay();
    updateAudioLoadedUI(result.fileName, result.duration);
    haptics.success();
    showScreen("audio");
    requestAnimationFrame(() => $("field-title")?.focus());
  } catch (err) {
    console.error(err);
    setStatus(i18n.t("errAudioUrl"));
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = i18n.t("errAudioUrl");
    }
  }
}

async function handleGoogleDocs() {
  const input = $("field-gdocs");
  const errEl = $("gdocs-error");
  const raw = input?.value?.trim() || "";
  if (errEl) {
    errEl.hidden = true;
    errEl.textContent = "";
  }
  if (!raw) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = i18n.t("errGdocsEmpty");
    }
    return;
  }
  if (!docs.parseGoogleDocId(raw)) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = i18n.t("errGdocsBad");
    }
    return;
  }
  const btn = $("btn-gdocs");
  if (btn) btn.disabled = true;
  try {
    setStatus(i18n.t("loadingDocs"));
    const text = await docs.fetchGoogleDocText(raw);
    $("field-lyrics").value = text;
    // switch to main pane
    document.querySelector('[data-lyric-tab="main"]')?.click();
    haptics.success();
  } catch (err) {
    console.error(err);
    if (errEl) {
      errEl.hidden = false;
      const cors =
        err?.message === "FETCH_FAILED" ||
        err?.name === "TypeError" ||
        /Failed to fetch|NetworkError|CORS/i.test(String(err?.message || err));
      errEl.textContent = cors ? i18n.t("errGdocsCors") : i18n.t("errGdocs");
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function doTap() {
  if (!state.project.lines.length) return;
  if (sync.isSyncComplete(state.project.lines)) return;
  const tMs = Math.round(audio.getCurrentTime() * 1000);
  const idx = Math.min(state.tapIndex, state.project.lines.length - 1);
  const before = sync.snapshotTimings(state.project.lines);
  const beforeTap = state.tapIndex;
  const beforeSel = state.selectedIndex;
  const result = sync.tapLine(state.project, idx, tMs);
  if (!result || result.noop) return;
  const after = sync.snapshotTimings(state.project.lines);
  const afterTap = result.nextIndex;
  const afterSel = Math.min(afterTap, state.project.lines.length - 1);
  // Revert then push as command so redo works
  sync.undoTimings(state.project.lines, before);
  history.push({
    label: "tap",
    do: () => {
      sync.undoTimings(state.project.lines, after);
      state.tapIndex = afterTap;
      state.selectedIndex = afterSel;
      renderLineList();
      persist();
    },
    undo: () => {
      sync.undoTimings(state.project.lines, before);
      state.tapIndex = beforeTap;
      state.selectedIndex = beforeSel;
      renderLineList();
      persist();
    },
  });
  haptics.tap();
  flashTapConfirm();
  if (result.done) showToast(i18n.t("allLinesTimed"));
  scrollTapLineIntoView();
}

function doUndo() {
  if (!history.canUndo()) return;
  history.undo();
  haptics.soft();
}

function doRedo() {
  if (!history.canRedo()) return;
  history.redo();
  haptics.soft();
}

function countUntimed() {
  return state.project.lines.filter((l) => sync.isLyric(l) && l.startMs == null).length;
}

function countTimed() {
  return state.project.lines.filter((l) => sync.isLyric(l) && l.startMs != null).length;
}

function updateExportButtons() {
  const timed = countTimed();
  [
    "btn-export-lrc",
    "btn-export-srt",
    "btn-export-vtt",
    "btn-export-json",
    "btn-export-tr-files",
  ].forEach((id) => {
    const btn = $(id);
    if (btn) btn.disabled = timed === 0 && id !== "btn-export-json";
  });
}

function askExportGuard(untimed) {
  return new Promise((resolve) => {
    const detail = $("export-guard-detail");
    if (detail) {
      detail.textContent = i18n.t("exportGuardDetail").replace("{n}", String(untimed));
    }
    openSheet("export-guard-dialog");
    const finish = (ok) => {
      closeSheet("export-guard-dialog");
      $("btn-export-anyway").onclick = null;
      $("btn-export-fix").onclick = null;
      resolve(ok);
    };
    $("btn-export-anyway").onclick = () => finish(true);
    $("btn-export-fix").onclick = () => {
      finish(false);
      showScreen("sync");
    };
  });
}

async function runExport(fn) {
  const timed = countTimed();
  if (timed === 0) {
    showToast(i18n.t("exportNoneTimed"));
    return;
  }
  const untimed = countUntimed();
  if (untimed > 0) {
    const ok = await askExportGuard(untimed);
    if (!ok) return;
  }
  fn();
  haptics.success();
}

function exportOpts() {
  return {
    includeTr: $("opt-include-tr").checked,
    trLang: $("select-tr-lang").value,
  };
}

function syncFieldsFromProject() {
  $("field-title").value = state.project.title || "";
  $("field-artist").value = state.project.artist || "";
  $("field-lyrics").value = state.project.lines
    .filter(sync.isLyric)
    .map((l) => lineMainText(l))
    .join("\n");
  $("field-fr").value = state.project.lines.filter(sync.isLyric).map((l) => lineFr(l)).join("\n");
  $("field-en").value = state.project.lines.filter(sync.isLyric).map((l) => lineEn(l)).join("\n");
  const s = state.project.settings || {};
  if (s.playbackRate) {
    $("select-speed").value = String(s.playbackRate);
    audio.setPlaybackRate(s.playbackRate);
  }
  const v = s.video || {};
  if (v.aspect) $("select-aspect").value = v.aspect;
  if (v.style) $("select-anim").value = v.style;
  if (v.background) $("select-bg").value = v.background;
  if (v.blur != null) $("bg-blur").value = v.blur;
  if (v.darken != null) $("bg-darken").value = v.darken;
  $("bg-zoom").checked = v.zoom !== false;
  $("video-show-tr").checked = Boolean(v.showTranslation);
  if (v.translationLang) $("select-video-tr").value = v.translationLang;
  $("opt-include-tr").checked = Boolean(s.includeTranslationInExport);
  if (s.translationLang) $("select-tr-lang").value = s.translationLang;
  const fileName = state.project.audio?.fileName || state.project.audioFileName;
  if (fileName) {
    updateAudioLoadedUI(fileName, durationSec(state.project) || state.project.duration || 0);
  }
}

function readVideoSettings({ save = true } = {}) {
  if (!state.project.settings.video) {
    state.project.settings.video = sync.createEmptyProject().settings.video;
  }
  const v = state.project.settings.video;
  v.aspect = $("select-aspect").value;
  v.style = $("select-anim").value;
  v.background = $("select-bg").value;
  v.blur = Number($("bg-blur").value);
  v.darken = Number($("bg-darken").value);
  v.zoom = $("bg-zoom").checked;
  v.showTranslation = $("video-show-tr").checked;
  v.translationLang = $("select-video-tr").value;
  if (save) persist();
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function isDialogOpen() {
  return dialogIsOpen();
}

function setupKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) return;
    if (isDialogOpen()) return;
    const key = e.key;

    // Play/pause stays available on every screen
    if (key === "p" || key === "P" || key === "k" || key === "K") {
      e.preventDefault();
      audio.togglePlay().then(updatePlayButton);
      return;
    }

    // Remaining shortcuts only on Sync (avoid re-timing on Export/Film)
    if (state.screen !== "sync") return;

    if (key === " " || key === "Spacebar") {
      e.preventDefault();
      doTap();
      return;
    }
    if (key === "Backspace") {
      e.preventDefault();
      doUndo();
      return;
    }
    if (key === "ArrowUp") {
      e.preventDefault();
      selectLine(Math.max(0, state.selectedIndex - 1), true);
      return;
    }
    if (key === "ArrowDown") {
      e.preventDefault();
      selectLine(Math.min(state.project.lines.length - 1, state.selectedIndex + 1), true);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (key === "z" || key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (key === "y" || key === "Y")) {
      e.preventDefault();
      doRedo();
      return;
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      e.preventDefault();
      const stepMs = e.shiftKey ? 500 : 50;
      const delta = key === "ArrowLeft" ? -stepMs : stepMs;
      const before = sync.snapshotTimings(state.project.lines);
      sync.nudgeLine(state.project, state.selectedIndex, delta);
      const after = sync.snapshotTimings(state.project.lines);
      sync.undoTimings(state.project.lines, before);
      history.push({
        label: "nudge",
        do: () => {
          sync.undoTimings(state.project.lines, after);
          renderLineList();
          persist();
        },
        undo: () => {
          sync.undoTimings(state.project.lines, before);
          renderLineList();
          persist();
        },
      });
      return;
    }
    if (key === "j" || key === "J") {
      e.preventDefault();
      audio.seek(Math.max(0, audio.getCurrentTime() - 5));
      updateTimeDisplay();
      return;
    }
    if (key === "l" || key === "L") {
      e.preventDefault();
      audio.seek(audio.getCurrentTime() + 5);
      updateTimeDisplay();
      return;
    }
    if (key === "," || key === "<") {
      e.preventDefault();
      bumpSpeed(-0.25);
      return;
    }
    if (key === "." || key === ">") {
      e.preventDefault();
      bumpSpeed(0.25);
    }
  });
}

function bumpSpeed(delta) {
  const rates = [0.5, 0.75, 1, 1.25, 1.5];
  const cur = audio.getPlaybackRate();
  let i = rates.findIndex((r) => Math.abs(r - cur) < 0.01);
  if (i < 0) i = 2;
  i = Math.max(0, Math.min(rates.length - 1, i + (delta > 0 ? 1 : -1)));
  $("select-speed").value = String(rates[i]);
  audio.setPlaybackRate(rates[i]);
  state.project.settings.playbackRate = rates[i];
  persist();
}

function setupNavigation() {
  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => {
      // After audio load, continue requires focusing title flow
      if (el.id === "btn-continue-lyrics" && state.audioReady && !$("field-title").value.trim()) {
        $("field-title")?.focus();
        // still allow continue — title optional but prompted
      }
      showScreen(el.dataset.goto);
    });
  });

  document.querySelectorAll("[data-lyric-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.lyricTab;
      document.querySelectorAll("[data-lyric-tab]").forEach((b) => {
        const on = b.dataset.lyricTab === tab;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      document.querySelectorAll("[data-lyric-pane]").forEach((pane) => {
        const on = pane.dataset.lyricPane === tab;
        pane.classList.toggle("is-active", on);
        pane.hidden = !on;
      });
      haptics.tick();
    });
  });

  $("btn-more")?.addEventListener("click", () => openSheet("more-sheet"));
  $("btn-more-close")?.addEventListener("click", () => closeSheet("more-sheet"));
  $("more-sheet")?.addEventListener("click", (e) => {
    if (e.target === $("more-sheet")) closeSheet("more-sheet");
  });
  $("btn-save-project")?.addEventListener("click", () => closeSheet("more-sheet"));
  $("input-project")?.addEventListener("change", () => closeSheet("more-sheet"));
  $("input-import")?.addEventListener("change", () => closeSheet("more-sheet"));

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      i18n.setLang(btn.dataset.lang);
      haptics.tick();
      updatePlayButton();
      state.waveform?.setEmptyLabel?.(i18n.t("loadWaveform"));
      if (state.audioReady) {
        const b = $("btn-continue-lyrics");
        if (b) b.textContent = i18n.t("loadedContinue");
      }
    });
  });
}

function setupDropZone() {
  const zone = $("drop-zone");
  const input = $("input-audio");
  zone?.addEventListener("click", (e) => {
    e.preventDefault();
    input.click();
  });
  input?.addEventListener("change", () => {
    handleAudioFile(input.files?.[0]);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach((ev) => {
    zone?.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    zone?.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
    });
  });
  zone?.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleAudioFile(file);
  });
  $("btn-change-audio")?.addEventListener("click", () => {
    resetAudioPickUI();
    input?.click();
  });
  $("btn-load-url")?.addEventListener("click", handleAudioUrl);
  $("field-audio-url")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAudioUrl();
    }
  });
}

function setupScrubber() {
  const scrub = $("scrubber");
  if (!scrub) return;

  const seekFromScrub = () => {
    const dur = audio.getDuration() || durationSec(state.project) || state.project.duration || 0;
    if (!dur) return;
    const t = (Number(scrub.value) / SCRUB_MAX) * dur;
    audio.seek(t);
    updateTimeDisplay();
  };

  scrub.addEventListener("pointerdown", () => {
    state.scrubbing = true;
    scrub.classList.add("is-scrubbing");
  });
  scrub.addEventListener("input", () => {
    state.scrubbing = true;
    seekFromScrub();
  });
  const endScrub = () => {
    if (!state.scrubbing) return;
    state.scrubbing = false;
    scrub.classList.remove("is-scrubbing");
    seekFromScrub();
    haptics.scrubCommit();
  };
  scrub.addEventListener("pointerup", endScrub);
  scrub.addEventListener("change", endScrub);
  scrub.addEventListener("pointercancel", () => {
    state.scrubbing = false;
    scrub.classList.remove("is-scrubbing");
  });

  $("btn-go-start")?.addEventListener("click", () => {
    audio.seek(0);
    updateTimeDisplay();
    haptics.soft();
  });
}

function isMeaningfulSession(meta) {
  if (!meta) return false;
  return Boolean(
    meta.audioFileName ||
      meta.title ||
      meta.artist ||
      (Array.isArray(meta.lines) && meta.lines.length > 0)
  );
}

async function offerRestore() {
  if (!storage.hasSavedSession()) return;
  const meta = storage.loadProjectMeta();
  if (!isMeaningfulSession(meta)) {
    await storage.clearSession();
    return;
  }
  const banner = $("restore-banner");
  const detail = $("restore-detail");
  const when = meta.savedAt ? new Date(meta.savedAt).toLocaleString() : "—";
  detail.textContent = i18n
    .t("restoreDetail")
    .replace("{title}", meta.title || "—")
    .replace("{file}", meta.audioFileName || "—")
    .replace("{when}", when);
  banner.hidden = false;
  await new Promise((resolve) => {
    $("btn-restore").onclick = async () => {
      banner.hidden = true;
      await restoreSession(meta);
      resolve();
    };
    $("btn-fresh").onclick = async () => {
      banner.hidden = true;
      await storage.clearSession();
      resolve();
    };
  });
}

async function restoreSession(meta) {
  state.project = migrateProject(meta);
  history.clear();
  syncFieldsFromProject();
  renderLineList();
  state.tapIndex = sync.nextTapIndex(state.project.lines);
  let audioData = null;
  if (state.project.audio?.storedAudioId) {
    audioData = await db.loadAudio(state.project.audio.storedAudioId);
  }
  if (!audioData?.blob) {
    audioData = await storage.loadAudioBlob();
  }
  if (audioData?.blob) {
    const file = new File(
      [audioData.blob],
      audioData.fileName || state.project.audio?.fileName || meta.audioFileName || "audio",
      { type: audioData.blob.type || "audio/mpeg" }
    );
    await handleAudioFile(file, { stayOnScreen: true });
  } else if (state.project.audio?.fileName || meta.audioFileName) {
    setStatus(`${state.project.audio?.fileName || meta.audioFileName}`);
  }
  const last = state.project.lastScreen || meta.lastScreen;
  showScreen(SCREENS.includes(last) ? last : "audio", { persistScreen: false });
}

function askImportMultiLine() {
  return new Promise((resolve) => {
    const dialog = $("import-dialog");
    if (!dialog) {
      resolve({ secondLineIsTranslation: false });
      return;
    }
    openSheet("import-dialog");
    const finish = (secondLineIsTranslation) => {
      closeSheet("import-dialog");
      $("btn-import-join").onclick = null;
      $("btn-import-tr").onclick = null;
      resolve({ secondLineIsTranslation });
    };
    $("btn-import-join").onclick = () => finish(false);
    $("btn-import-tr").onclick = () => finish(true);
  });
}

function isValidProjectShape(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!Array.isArray(data.lines)) return false;
  return data.lines.every((l) => {
    if (!l || typeof l !== "object") return false;
    if (l.type === "section") return true;
    const startOk =
      l.start == null ||
      typeof l.start === "number" ||
      l.startMs == null ||
      typeof l.startMs === "number";
    const endOk =
      l.end == null ||
      typeof l.end === "number" ||
      l.endMs == null ||
      typeof l.endMs === "number";
    return startOk && endOk;
  });
}

function mergeImported(data) {
  const before = migrateProject(state.project);
  const incoming = migrateProject({
    ...state.project,
    ...data,
    title: data.title || state.project.title,
    artist: data.artist || state.project.artist,
    lines: data.lines || state.project.lines,
    settings: {
      ...state.project.settings,
      ...(data.settings || {}),
      video: { ...state.project.settings.video, ...(data.settings?.video || {}) },
    },
  });
  if (data.audio?.durationMs) incoming.audio.durationMs = data.audio.durationMs;
  else if (data.duration) setDurationSec(incoming, data.duration);
  if (data.audioFileName && !incoming.audio.fileName) incoming.audio.fileName = data.audioFileName;
  sync.recomputeEnds(incoming.lines, incoming.audio.durationMs);

  history.push({
    label: "import",
    do: () => {
      state.project = incoming;
      syncFieldsFromProject();
      state.selectedIndex = 0;
      state.tapIndex = sync.firstUntimedIndex(state.project.lines);
      renderLineList();
      persist();
    },
    undo: () => {
      state.project = before;
      syncFieldsFromProject();
      state.selectedIndex = 0;
      state.tapIndex = sync.nextTapIndex(state.project.lines);
      renderLineList();
      persist();
    },
  });
  haptics.success();
}

function setupUI() {
  document.body.classList.add("has-tabbar");
  i18n.initI18n();
  setupNavigation();
  setupDropZone();
  setupKeyboard();
  setupScrubber();

  const initial = (location.hash || "").replace(/^#/, "");
  showScreen(SCREENS.includes(initial) ? initial : "audio", {
    pushHash: !SCREENS.includes(initial),
  });

  $("line-list")?.addEventListener(
    "scroll",
    () => {
      state.userScrollPauseUntil = Date.now() + 3000;
    },
    { passive: true }
  );

  state.waveform = initWaveform($("waveform"), {
    onMarkerDrag: (index, tSec) => {
      const before = sync.snapshotTimings(state.project.lines);
      sync.setLineStart(state.project, index, Math.round(tSec * 1000));
      const after = sync.snapshotTimings(state.project.lines);
      // Live preview while dragging (not every move as history — commit on pointerup via separate path)
      state.selectedIndex = index;
      renderLineList();
      // Store last drag as single command when timings change
      if (!state._dragCmd) {
        state._dragCmd = { index, before };
      }
      state._dragAfter = after;
      persist();
    },
    onSelect: (index) => selectLine(index, false),
  });
  state.waveform?.setEmptyLabel?.(i18n.t("loadWaveform"));

  $("btn-apply-lyrics").addEventListener("click", applyLyricsFromFields);
  $("btn-gdocs")?.addEventListener("click", handleGoogleDocs);
  $("field-gdocs")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGoogleDocs();
    }
  });

  $("btn-play").addEventListener("click", () => {
    audio.togglePlay().then(updatePlayButton);
    haptics.tick();
  });
  $("btn-tap").addEventListener("click", doTap);
  $("btn-undo").addEventListener("click", doUndo);
  $("btn-redo")?.addEventListener("click", doRedo);
  history.subscribe(() => updateTapButtons());

  $("waveform")?.addEventListener("pointerup", () => {
    if (!state._dragCmd || !state._dragAfter) {
      state._dragCmd = null;
      state._dragAfter = null;
      return;
    }
    const before = state._dragCmd.before;
    const after = state._dragAfter;
    state._dragCmd = null;
    state._dragAfter = null;
    sync.undoTimings(state.project.lines, before);
    history.push({
      label: "drag",
      do: () => {
        sync.undoTimings(state.project.lines, after);
        renderLineList();
        persist();
      },
      undo: () => {
        sync.undoTimings(state.project.lines, before);
        renderLineList();
        persist();
      },
    });
  });

  $("btn-seek-back")?.addEventListener("click", () => {
    audio.seek(Math.max(0, audio.getCurrentTime() - 5));
    updateTimeDisplay();
    haptics.soft();
  });
  $("btn-seek-fwd")?.addEventListener("click", () => {
    audio.seek(audio.getCurrentTime() + 5);
    updateTimeDisplay();
    haptics.soft();
  });

  $("bg-blur")?.addEventListener("input", () => {
    if ($("bg-blur-out")) $("bg-blur-out").textContent = $("bg-blur").value;
  });
  $("bg-darken")?.addEventListener("input", () => {
    if ($("bg-darken-out")) $("bg-darken-out").textContent = $("bg-darken").value;
  });

  $("select-speed").addEventListener("change", () => {
    const rate = Number($("select-speed").value);
    audio.setPlaybackRate(rate);
    state.project.settings.playbackRate = rate;
    persist();
  });

  $("field-title").addEventListener("input", () => {
    state.project.title = $("field-title").value;
    persist();
  });
  $("field-artist").addEventListener("input", () => {
    state.project.artist = $("field-artist").value;
    persist();
  });

  $("btn-export-lrc").addEventListener("click", () => runExport(() => exp.downloadLRC(state.project)));
  $("btn-export-srt").addEventListener("click", () => runExport(() => exp.downloadSRT(state.project, exportOpts())));
  $("btn-export-vtt").addEventListener("click", () => runExport(() => exp.downloadVTT(state.project, exportOpts())));
  $("btn-export-json").addEventListener("click", () => {
    exp.downloadJSON(state.project);
    haptics.success();
  });
  $("btn-export-tr-files").addEventListener("click", () =>
    runExport(() => exp.downloadPerLanguage(state.project, "srt"))
  );
  updateExportButtons();

  $("opt-include-tr").addEventListener("change", () => {
    state.project.settings.includeTranslationInExport = $("opt-include-tr").checked;
    persist();
  });
  $("select-tr-lang").addEventListener("change", () => {
    state.project.settings.translationLang = $("select-tr-lang").value;
    persist();
    updatePreview(audio.getCurrentTime());
  });

  $("btn-save-project").addEventListener("click", () => {
    storage.downloadProjectFile(state.project);
    haptics.success();
  });

  $("input-project").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(i18n.t("errProjectJson"));
      }
      if (!isValidProjectShape(data)) throw new Error(i18n.t("errProjectShape"));
      mergeImported(data);
    } catch (err) {
      showToast(err.message || i18n.t("errImport"));
    }
    e.target.value = "";
  });

  $("input-import").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const lower = file.name.toLowerCase();
      const isCue =
        lower.endsWith(".srt") ||
        lower.endsWith(".vtt") ||
        text.trim().startsWith("WEBVTT") ||
        /\d{1,2}:\d{2}[,.]\d/.test(text);
      let opts = {};
      if (isCue && !lower.endsWith(".lrc") && exp.hasMultiLineCues(text, file.name)) {
        opts = await askImportMultiLine();
      }
      mergeImported(exp.parseImportedProject(text, file.name, opts));
    } catch (err) {
      showToast(err.message || i18n.t("errImport"));
    }
    e.target.value = "";
  });

  [
    "select-aspect",
    "select-anim",
    "select-bg",
    "bg-blur",
    "bg-darken",
    "bg-zoom",
    "video-show-tr",
    "select-video-tr",
  ].forEach((id) => {
    $(id)?.addEventListener("change", () => {
      readVideoSettings();
      video.renderFrame(state.project);
    });
    $(id)?.addEventListener("input", () => {
      readVideoSettings();
      video.renderFrame(state.project);
    });
  });

  $("input-bg").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    video.setBackgroundFile(file);
    if (file?.type.startsWith("video/")) $("select-bg").value = "video";
    else if (file) $("select-bg").value = "image";
    readVideoSettings();
    video.renderFrame(state.project);
  });

  $("btn-preview-video").addEventListener("click", async () => {
    readVideoSettings();
    if (video.isPreviewEnabled()) {
      video.disablePreview();
      $("btn-preview-video").textContent = i18n.t("livePreview");
    } else {
      await video.ensureVideoFonts();
      video.enablePreview();
      $("btn-preview-video").textContent = i18n.t("stopPreview");
    }
  });

  let recordPausedByHide = false;
  $("btn-record").addEventListener("click", async () => {
    const status = $("record-status");
    if (recordPausedByHide) {
      if (video.resumeRecordingIfPaused()) {
        recordPausedByHide = false;
        $("btn-record").disabled = true;
        $("btn-record").textContent = i18n.t("recordVideo");
        if (status) status.textContent = i18n.t("recordingKeep");
      }
      return;
    }
    readVideoSettings();
    const prog = $("record-progress");
    const bar = $("record-bar");
    prog.hidden = false;
    $("btn-stop-record").hidden = false;
    $("btn-record").disabled = true;
    status.textContent = i18n.t("recordingKeep");
    await video.startRecording(state.project, {
      onProgress: (p) => {
        bar.style.width = `${Math.round(p * 100)}%`;
        status.textContent = `${i18n.t("recordingKeep")} ${Math.round(p * 100)}%`;
      },
      onDone: () => {
        recordPausedByHide = false;
        bar.style.width = "100%";
        status.textContent = "✓";
        $("btn-stop-record").hidden = true;
        $("btn-record").disabled = false;
        $("btn-record").textContent = i18n.t("recordVideo");
        $("btn-preview-video").textContent = i18n.t("livePreview");
        haptics.success();
      },
      onError: (err) => {
        recordPausedByHide = false;
        status.textContent = err?.message || i18n.t("recordingFailed");
        $("btn-stop-record").hidden = true;
        $("btn-record").disabled = false;
      },
      onHidden: () => {
        recordPausedByHide = true;
        status.textContent = i18n.t("recordTabHidden");
        showToast(i18n.t("recordTabHidden"));
        $("btn-record").disabled = false;
        $("btn-record").textContent = i18n.t("resumeRecording");
      },
    });
  });

  $("btn-stop-record").addEventListener("click", () => {
    recordPausedByHide = false;
    video.stopRecording();
    $("btn-stop-record").hidden = true;
    $("btn-record").disabled = false;
    $("btn-record").textContent = i18n.t("recordVideo");
  });

  audio.onTimeUpdate(updateTimeDisplay);
  audio.onPlayState(() => updatePlayButton());

  const tick = () => {
    if (audio.isPlaying()) updateTimeDisplay();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  readVideoSettings({ save: false });
  video.renderFrame(state.project);
}

async function boot() {
  // Pinch-zoom allowed (B20). Double-tap zoom on Tap is blocked via CSS
  // touch-action: manipulation on #btn-tap / .dock-tap.
  applyIcons(document);
  await db.requestPersistentStorage();
  setupUI();
  renderLineList();
  updateTapButtons();

  // Migrate legacy v1 session into IndexedDB once
  const prefs = db.loadPrefs();
  if (prefs.lastProjectId) {
    const existing = await db.getProject(prefs.lastProjectId);
    if (existing) {
      await offerRestoreFromProject(existing);
    } else {
      await offerRestore();
    }
  } else {
    const legacy = await db.readLegacySession();
    if (legacy.meta) {
      const migrated = migrateProject(legacy.meta);
      if (legacy.audio?.blob) {
        if (!migrated.audio.storedAudioId) migrated.audio.storedAudioId = audioId();
        await db.saveAudio(migrated.audio.storedAudioId, legacy.audio.blob, legacy.audio.fileName || "");
      }
      await db.saveProject(migrated);
      await db.clearLegacySession();
      await offerRestoreFromProject(migrated);
    } else {
      await offerRestore();
    }
  }

  window.addEventListener("hashchange", () => {
    const name = (location.hash || "").replace(/^#/, "");
    if (SCREENS.includes(name)) showScreen(name, { pushHash: false });
  });
}

async function offerRestoreFromProject(project) {
  if (!project) return;
  const banner = $("restore-banner");
  const detail = $("restore-detail");
  if (!banner) {
    await restoreSession(project);
    return;
  }
  const when = project.updatedAt ? new Date(project.updatedAt).toLocaleString() : "—";
  if (detail) {
    detail.textContent = i18n
      .t("restoreDetail")
      .replace("{title}", project.title || "—")
      .replace("{file}", project.audio?.fileName || "—")
      .replace("{when}", when);
  }
  banner.hidden = false;
  await new Promise((resolve) => {
    $("btn-restore").onclick = async () => {
      banner.hidden = true;
      await restoreSession(project);
      resolve();
    };
    $("btn-fresh").onclick = async () => {
      banner.hidden = true;
      resolve();
    };
  });
}

boot();
