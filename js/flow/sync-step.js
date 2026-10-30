/** Step 5: tap along. Big current line, one big button, nothing else to think about. */

import * as audio from "../audio.js";
import * as sync from "../sync.js";
import * as haptics from "../haptics.js";
import { lineMainText, isLyric } from "../core/project.js";

/** Where the tapping stands. */
export function syncStatus(lines) {
  const lyrics = (lines || []).map((l, i) => ({ l, i })).filter(({ l }) => isLyric(l));
  const total = lyrics.length;
  const untimed = lyrics.find(({ l }) => l.startMs == null);
  const timed = lyrics.filter(({ l }) => l.startMs != null).length;
  const done = sync.isSyncComplete(lines || []);
  const awaitingEnd = !untimed && total > 0 && !done;
  const tapIndex = untimed ? untimed.i : -1;
  const position = untimed ? lyrics.indexOf(untimed) : total;
  return { total, timed, done, awaitingEnd, tapIndex, position, lyrics };
}

export function renderSyncStep(c) {
  const { t, esc, app } = c;
  const p = c.project();
  const el = document.createElement("div");
  el.className = "fs";

  if (!app.hasAudio()) {
    el.innerHTML = `<div class="fq"><h2 class="fq-title">${esc(t("syncQ"))}</h2>
      <p class="fq-help">${esc(t("syncNoAudio"))}</p>
      <div class="fq-actions"><button type="button" class="f-ok">${esc(t("audioPick"))}</button></div></div>`;
    el.querySelector(".f-ok").addEventListener("click", () => c.go("audio", -1));
    return { el };
  }

  el.innerHTML = `
    <header class="fs-head">
      <h2 class="fq-title">${esc(t("syncQ"))}</h2>
      <p class="fq-help">${esc(t("syncHelp"))}</p>
    </header>
    <div class="fs-stage">
      <p class="fs-count" aria-live="polite"></p>
      <p class="fs-prev" aria-hidden="true"></p>
      <p class="fs-current" aria-live="polite"></p>
      <p class="fs-hint"></p>
      <p class="fs-next"></p>
    </div>
    <div class="fs-done" hidden>
      <p class="fs-done-title"></p>
      <p class="fq-help">${esc(t("syncDoneHelp"))}</p>
      <div class="fs-done-actions">
        <button type="button" class="f-btn fs-check"></button>
        <button type="button" class="f-ok fs-continue">${esc(t("syncContinue"))} <span aria-hidden="true">→</span></button>
      </div>
    </div>
    <div class="fs-time" aria-hidden="true"><span class="fs-bar"><i></i></span><span class="fs-clock"></span></div>
    <div class="fs-controls">
      <button type="button" class="fs-play" aria-label="${esc(t("syncPlay"))}">
        <svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>
        <svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>
      </button>
      <button type="button" class="fs-tap"><span class="fs-tap-label"></span><span class="fs-tap-sub"></span></button>
      <button type="button" class="fs-undo" aria-label="${esc(t("syncUndo"))}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
      </button>
    </div>
    <div class="fs-foot">
      <button type="button" class="f-link fs-redo">${esc(t("syncRedo"))}</button>
      <span class="f-hint fs-space">${esc(t("syncSpace"))}</span>
    </div>`;

  const $ = (sel) => el.querySelector(sel);
  const undoStack = [];
  let watching = false;
  let raf = 0;

  const render = () => {
    const s = syncStatus(p.lines);
    const playing = audio.isPlaying();
    el.classList.toggle("is-playing", playing);
    $(".fs-play").setAttribute("aria-label", t(playing ? "syncPause" : "syncPlay"));
    $(".fs-undo").disabled = !undoStack.length;
    $(".fs-done").hidden = !s.done;
    el.classList.toggle("is-done", s.done);
    el.classList.toggle("is-watching", watching);
    $(".fs-done-title").textContent = t("syncDone", { n: s.total });
    $(".fs-check").textContent = watching && playing ? t("syncPause") : t("syncCheck");

    if (s.done && !watching) {
      const last = s.lyrics.at(-1);
      $(".fs-count").textContent = "";
      $(".fs-prev").textContent = "";
      $(".fs-current").textContent = last ? lineMainText(last.l) : "";
      $(".fs-hint").textContent = "";
      $(".fs-next").textContent = "";
    } else if (!watching) {
      const cur = s.awaitingEnd ? s.lyrics.at(-1) : s.lyrics[s.position];
      const prev = s.awaitingEnd ? s.lyrics.at(-2) : s.lyrics[s.position - 1];
      const nxt = s.awaitingEnd ? null : s.lyrics[s.position + 1];
      $(".fs-count").textContent = t("syncLine", { n: Math.min(s.position + 1, s.total), total: s.total });
      $(".fs-prev").textContent = prev ? lineMainText(prev.l) : "";
      $(".fs-current").textContent = cur ? lineMainText(cur.l) : "";
      $(".fs-hint").textContent = s.awaitingEnd ? t("syncTapEnd") : t("syncTapHint");
      $(".fs-next").innerHTML = nxt ? `<span>${esc(t("syncNext"))}</span> ${esc(lineMainText(nxt.l))}` : "";
    }
    const tap = $(".fs-tap");
    tap.disabled = s.done;
    $(".fs-tap-label").textContent = playing || s.timed ? t("syncTap") : t("syncStart");
    $(".fs-tap-sub").textContent = playing || s.timed ? "" : "";
  };

  // Clock + playback-check line follow the audio
  const tick = () => {
    const now = audio.getCurrentTime();
    const dur = audio.getDuration() || (p.audio?.durationMs || 0) / 1000;
    $(".fs-bar i").style.width = `${dur ? Math.min(100, (now / dur) * 100) : 0}%`;
    $(".fs-clock").textContent = `${c.formatTime(now)} / ${c.formatTime(dur)}`;
    if (watching) {
      const idx = sync.lineAtTime(p.lines, Math.round(now * 1000));
      const line = p.lines[idx];
      const lyrics = p.lines.filter(isLyric);
      const pos = line ? lyrics.indexOf(line) : -1;
      $(".fs-count").textContent = pos >= 0 ? t("syncLine", { n: pos + 1, total: lyrics.length }) : "";
      $(".fs-prev").textContent = pos > 0 ? lineMainText(lyrics[pos - 1]) : "";
      $(".fs-current").textContent = line && isLyric(line) ? lineMainText(line) : "♪";
      $(".fs-hint").textContent = "";
      $(".fs-next").textContent = lyrics[pos + 1] ? lineMainText(lyrics[pos + 1]) : "";
    }
    raf = requestAnimationFrame(tick);
  };

  const flash = () => {
    const cur = $(".fs-current");
    cur.classList.remove("is-flash");
    void cur.offsetWidth;
    cur.classList.add("is-flash");
  };

  const doTap = async () => {
    const s = syncStatus(p.lines);
    if (s.done) return;
    if (!audio.isPlaying()) {
      // First press starts the song; the next presses time the lines
      await audio.resumeContext?.();
      await audio.play();
      render();
      return;
    }
    const res = sync.tapLine(p, s.awaitingEnd ? s.lyrics.at(-1).i : s.tapIndex, Math.round(audio.getCurrentTime() * 1000));
    if (!res || res.noop) return;
    undoStack.push(res.prevState);
    haptics.tap?.();
    flash();
    c.save();
    if (res.done) {
      haptics.success?.();
      audio.pause();
    }
    render();
  };

  $(".fs-tap").addEventListener("pointerdown", (e) => {
    // pointerdown, not click: the tap counts the moment the finger lands
    e.preventDefault();
    doTap();
  });
  $(".fs-tap").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doTap();
    }
  });
  $(".fs-play").addEventListener("click", async () => {
    if (audio.isPlaying()) audio.pause();
    else {
      await audio.resumeContext?.();
      await audio.play();
    }
    render();
  });
  $(".fs-undo").addEventListener("click", () => {
    const prev = undoStack.pop();
    if (!prev) return;
    sync.undoTimings(p.lines, prev);
    sync.recomputeEnds(p.lines, p.audio?.durationMs || 0);
    // Step back a little so the line can be tapped again
    audio.seek(Math.max(0, audio.getCurrentTime() - 3));
    c.save();
    render();
  });
  $(".fs-redo").addEventListener("click", () => {
    if (!window.confirm(t("syncRedoConfirm"))) return;
    undoStack.push(sync.snapshotTimings(p.lines));
    p.lines.forEach((l) => {
      if (isLyric(l)) {
        l.startMs = null;
        l.endMs = null;
        l.endManual = false;
      }
    });
    watching = false;
    audio.pause();
    audio.seek(0);
    c.save();
    render();
  });
  $(".fs-check").addEventListener("click", async () => {
    if (watching && audio.isPlaying()) {
      audio.pause();
      render();
      return;
    }
    // First time (or after the end): watch from the top
    if (!watching || audio.getCurrentTime() >= (audio.getDuration() || 0) - 0.5) audio.seek(0);
    watching = true;
    await audio.resumeContext?.();
    await audio.play();
    render();
  });
  $(".fs-continue").addEventListener("click", () => c.next());

  const offPlay = audio.onPlayState?.(() => render());
  const onKey = (e) => {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (e.repeat) return;
      if (syncStatus(p.lines).done) $(".fs-check").click();
      else doTap();
    }
  };

  // Start from the top unless some lines are already timed
  if (!syncStatus(p.lines).timed) audio.seek(0);
  else if (syncStatus(p.lines).done) watching = false;
  render();
  raf = requestAnimationFrame(tick);

  return {
    el,
    onKey,
    canNext: () => true,
    cleanup: () => {
      cancelAnimationFrame(raf);
      audio.pause();
      if (typeof offPlay === "function") offPlay();
    },
  };
}
