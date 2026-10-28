/** App state and wiring for Eclipse Lyrics Sync. */

import * as audio from "./audio.js";
import * as sync from "./sync.js";
import * as storage from "./storage.js";
import * as exp from "./export.js";
import { initWaveform, computePeaks } from "./waveform.js";
import * as video from "./video.js";

const state = {
  project: sync.createEmptyProject(),
  selectedIndex: 0,
  tapIndex: 0,
  undoStack: [],
  audioBlob: null,
  waveform: null,
  syncMode: true,
};

video.bindProject(() => state.project);

const $ = (id) => document.getElementById(id);

function persist() {
  storage.scheduleSave(state.project);
}

function setStatus(msg) {
  const el = $("audio-status");
  if (el) el.textContent = msg;
}

function formatClock(t) {
  return sync.formatTime(t);
}

function updateTimeDisplay() {
  const cur = audio.getCurrentTime();
  const dur = audio.getDuration() || state.project.duration || 0;
  $("time-display").textContent = `${formatClock(cur)} / ${formatClock(dur)}`;
  state.waveform?.setPlayhead(cur);
  updatePreview(cur);
  updateActiveLine(cur);
}

function updatePlayButton() {
  $("btn-play").textContent = audio.isPlaying() ? "⏸ Pause" : "▶ Play";
}

function updateTapButtons() {
  const hasLines = state.project.lines.length > 0;
  $("btn-tap").disabled = !hasLines || !state.project.audioFileName;
  $("btn-undo").disabled = state.undoStack.length === 0;
}

function renderLineList() {
  const list = $("line-list");
  list.innerHTML = "";
  state.project.lines.forEach((line, i) => {
    const li = document.createElement("li");
    li.className = "line-item";
    li.setAttribute("role", "option");
    li.dataset.index = String(i);
    if (line.start == null) li.classList.add("untimed");
    if (i === state.selectedIndex) {
      li.classList.add("selected");
      li.setAttribute("aria-selected", "true");
    }
    const time =
      line.start != null ? formatClock(line.start) : "—:—";
    li.innerHTML = `
      <span class="time">${time}</span>
      <span class="text">
        <p class="text-main"></p>
        <p class="text-tr"></p>
      </span>`;
    li.querySelector(".text-main").textContent = line.text;
    const trParts = [line.fr, line.en].filter(Boolean);
    li.querySelector(".text-tr").textContent = trParts.join(" · ");
    li.addEventListener("click", () => selectLine(i, true));
    list.appendChild(li);
  });
  state.waveform?.setLines(state.project.lines);
  state.waveform?.setSelected(state.selectedIndex);
  updateTapButtons();
}

function selectLine(i, seekTo = false) {
  if (i < 0 || i >= state.project.lines.length) return;
  state.selectedIndex = i;
  state.tapIndex = i;
  renderLineList();
  if (seekTo && state.project.lines[i].start != null) {
    audio.seek(state.project.lines[i].start);
    updateTimeDisplay();
  }
}

function updateActiveLine(t) {
  const idx = sync.lineAtTime(state.project.lines, t);
  document.querySelectorAll(".line-item").forEach((el) => {
    el.classList.toggle("active-play", Number(el.dataset.index) === idx);
  });
}

function updatePreview(t) {
  const lines = state.project.lines;
  const idx = sync.lineAtTime(lines, t);
  const prev = $("preview-prev");
  const cur = $("preview-current");
  const next = $("preview-next");
  const tr = $("preview-tr");

  if (idx < 0) {
    prev.textContent = "";
    cur.textContent = lines[0]?.text || "—";
    next.textContent = lines[1]?.text || "";
    tr.textContent = "";
    return;
  }

  prev.textContent = lines[idx - 1]?.text || "";
  cur.textContent = lines[idx]?.text || "—";
  next.textContent = lines[idx + 1]?.text || "";
  const lang = state.project.settings.translationLang || "fr";
  const translation = lang === "en" ? lines[idx]?.en : lines[idx]?.fr;
  tr.textContent = translation || "";
}

function applyLyricsFromFields() {
  const result = sync.applyLyrics(
    state.project,
    $("field-lyrics").value,
    $("field-fr").value,
    $("field-en").value
  );
  state.project.lines = result.lines;
  const warn = $("translation-warn");
  if (result.warnings.length) {
    warn.hidden = false;
    warn.textContent = result.warnings.join(" ");
  } else {
    warn.hidden = true;
    warn.textContent = "";
  }
  state.selectedIndex = 0;
  state.tapIndex = sync.firstUntimedIndex(state.project.lines);
  state.undoStack = [];
  renderLineList();
  persist();
}

async function handleAudioFile(file) {
  if (!file) return;
  setStatus(`Loading ${file.name}…`);
  try {
    const result = await audio.loadAudioFile(file);
    state.audioBlob = result.blob;
    state.project.audioFileName = result.fileName;
    state.project.duration = result.duration;
    const peaks = computePeaks(result.buffer);
    state.waveform?.setPeaks(peaks, result.duration);
    state.waveform?.setDuration(result.duration);
    setStatus(`${result.fileName} · ${formatClock(result.duration)}`);
    sync.recomputeEnds(state.project.lines, result.duration);
    renderLineList();
    persist();
    storage.saveAudioBlob(result.blob, result.fileName);
    updateTimeDisplay();
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Failed to load audio");
  }
}

function doTap() {
  if (!state.project.lines.length) return;
  const t = audio.getCurrentTime();
  const idx = state.tapIndex;
  const result = sync.tapLine(state.project, idx, t);
  if (!result) return;
  state.undoStack.push(result.prevState);
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.tapIndex = result.nextIndex;
  state.selectedIndex = state.tapIndex;
  renderLineList();
  persist();
}

function doUndo() {
  const prev = state.undoStack.pop();
  if (!prev) return;
  sync.undoTimings(state.project.lines, prev);
  state.tapIndex = sync.firstUntimedIndex(state.project.lines);
  state.selectedIndex = state.tapIndex;
  renderLineList();
  persist();
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
  $("field-lyrics").value = state.project.lines.map((l) => l.text).join("\n");
  $("field-fr").value = state.project.lines.map((l) => l.fr || "").join("\n");
  $("field-en").value = state.project.lines.map((l) => l.en || "").join("\n");
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

function setupKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) {
      // Allow Space only outside text fields for tap
      return;
    }

    const key = e.key;
    if (key === " " || key === "Spacebar") {
      e.preventDefault();
      doTap();
      return;
    }
    if (key === "p" || key === "P" || key === "k" || key === "K") {
      e.preventDefault();
      audio.togglePlay().then(updatePlayButton);
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
    if (key === "ArrowLeft" || key === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 0.5 : 0.05;
      const delta = key === "ArrowLeft" ? -step : step;
      sync.nudgeLine(state.project, state.selectedIndex, delta);
      renderLineList();
      persist();
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
      return;
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

function setupDropZone() {
  const zone = $("drop-zone");
  const input = $("input-audio");

  const openPicker = () => input.click();
  zone.addEventListener("click", openPicker);
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  });
  input.addEventListener("change", () => handleAudioFile(input.files?.[0]));

  ["dragenter", "dragover"].forEach((ev) => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
    });
  });
  zone.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) handleAudioFile(file);
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
  const when = meta.savedAt ? new Date(meta.savedAt).toLocaleString() : "unknown time";
  detail.textContent = `${meta.title || "Untitled"} · ${meta.audioFileName || "no audio"} · saved ${when}`;
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
  state.project = {
    ...sync.createEmptyProject(),
    ...meta,
    settings: {
      ...sync.createEmptyProject().settings,
      ...(meta.settings || {}),
      video: {
        ...sync.createEmptyProject().settings.video,
        ...(meta.settings?.video || {}),
      },
    },
  };
  syncFieldsFromProject();
  renderLineList();
  state.tapIndex = sync.firstUntimedIndex(state.project.lines);

  const audioData = await storage.loadAudioBlob();
  if (audioData?.blob) {
    const file = new File([audioData.blob], audioData.fileName || meta.audioFileName || "audio", {
      type: audioData.blob.type || "audio/mpeg",
    });
    await handleAudioFile(file);
  } else if (meta.audioFileName) {
    setStatus(`Restored project — reload “${meta.audioFileName}” to hear audio`);
  }
}

function mergeImported(data) {
  state.project.title = data.title || state.project.title;
  state.project.artist = data.artist || state.project.artist;
  if (data.duration) state.project.duration = data.duration;
  if (data.audioFileName) state.project.audioFileName = data.audioFileName;
  state.project.lines = (data.lines || []).map((l) => ({
    id: l.id || sync.uid(),
    start: l.start ?? null,
    end: l.end ?? null,
    text: l.text || "",
    fr: l.fr || "",
    en: l.en || "",
  }));
  if (data.settings) {
    state.project.settings = {
      ...state.project.settings,
      ...data.settings,
      video: { ...state.project.settings.video, ...(data.settings.video || {}) },
    };
  }
  sync.recomputeEnds(state.project.lines, state.project.duration);
  syncFieldsFromProject();
  state.selectedIndex = 0;
  state.tapIndex = sync.firstUntimedIndex(state.project.lines);
  state.undoStack = [];
  renderLineList();
  persist();
}

function setupUI() {
  setupDropZone();
  setupKeyboard();

  state.waveform = initWaveform($("waveform"), {
    onSeek: (t) => {
      audio.seek(t);
      updateTimeDisplay();
    },
    onMarkerDrag: (index, t) => {
      sync.setLineStart(state.project, index, t);
      state.selectedIndex = index;
      renderLineList();
      persist();
    },
    onSelect: (index) => selectLine(index, false),
  });

  $("btn-apply-lyrics").addEventListener("click", applyLyricsFromFields);
  $("btn-play").addEventListener("click", () => {
    audio.togglePlay().then(updatePlayButton);
  });
  $("btn-tap").addEventListener("click", doTap);
  $("btn-undo").addEventListener("click", doUndo);

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

  $("btn-export-lrc").addEventListener("click", () => exp.downloadLRC(state.project));
  $("btn-export-srt").addEventListener("click", () => exp.downloadSRT(state.project, exportOpts()));
  $("btn-export-vtt").addEventListener("click", () => exp.downloadVTT(state.project, exportOpts()));
  $("btn-export-json").addEventListener("click", () => exp.downloadJSON(state.project));
  $("btn-export-tr-files").addEventListener("click", () =>
    exp.downloadPerLanguage(state.project, "srt")
  );

  $("opt-include-tr").addEventListener("change", () => {
    state.project.settings.includeTranslationInExport = $("opt-include-tr").checked;
    persist();
  });
  $("select-tr-lang").addEventListener("change", () => {
    state.project.settings.translationLang = $("select-tr-lang").value;
    persist();
    updatePreview(audio.getCurrentTime());
  });

  $("btn-save-project").addEventListener("click", () =>
    storage.downloadProjectFile(state.project)
  );

  $("input-project").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    mergeImported(JSON.parse(text));
    e.target.value = "";
  });

  $("input-import").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = exp.parseImportedProject(text, file.name);
      mergeImported(data);
    } catch (err) {
      alert(err.message || "Could not import file");
    }
    e.target.value = "";
  });

  // Video controls
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
    $(id).addEventListener("change", () => {
      readVideoSettings();
      video.renderFrame(state.project);
    });
    $(id).addEventListener("input", () => {
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

  $("btn-preview-video").addEventListener("click", () => {
    readVideoSettings();
    if (video.isPreviewEnabled()) {
      video.disablePreview();
      $("btn-preview-video").textContent = "Toggle live preview";
    } else {
      video.enablePreview();
      $("btn-preview-video").textContent = "Stop live preview";
    }
  });

  $("btn-record").addEventListener("click", async () => {
    readVideoSettings();
    const prog = $("record-progress");
    const bar = $("record-bar");
    const status = $("record-status");
    prog.hidden = false;
    $("btn-stop-record").hidden = false;
    $("btn-record").disabled = true;
    status.textContent = "Recording… keep this tab focused";

    await video.startRecording(state.project, {
      onProgress: (p) => {
        bar.style.width = `${Math.round(p * 100)}%`;
        status.textContent = `Recording… ${Math.round(p * 100)}% — keep this tab focused`;
      },
      onDone: () => {
        prog.hidden = false;
        bar.style.width = "100%";
        status.textContent = "Done — video downloaded";
        $("btn-stop-record").hidden = true;
        $("btn-record").disabled = false;
        $("btn-preview-video").textContent = "Toggle live preview";
      },
      onError: (err) => {
        status.textContent = err?.message || "Recording failed";
        $("btn-stop-record").hidden = true;
        $("btn-record").disabled = false;
      },
    });
  });

  $("btn-stop-record").addEventListener("click", () => {
    video.stopRecording();
    $("btn-stop-record").hidden = true;
    $("btn-record").disabled = false;
  });

  audio.onTimeUpdate(updateTimeDisplay);
  audio.onPlayState(() => updatePlayButton());

  // Smooth playhead via rAF while playing
  const tick = () => {
    if (audio.isPlaying()) updateTimeDisplay();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Initial empty video frame (don't persist empty defaults)
  readVideoSettings({ save: false });
  video.renderFrame(state.project);
}

async function boot() {
  setupUI();
  renderLineList();
  updateTapButtons();
  await offerRestore();
}

boot();
