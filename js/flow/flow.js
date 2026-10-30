/**
 * Guided form: one question per screen, Typeform-style.
 * Song → name → lyrics → translation → outputs → tap along → look → export.
 * Uses the app's own engine through `app` (see flowApi() in main.js).
 */

import { ft } from "./strings.js";
import {
  titleFromFileName,
  isGenericSongName,
  analyzeLyrics,
  translationMatch,
  needsVideo,
  OUTPUTS,
} from "./helpers.js";
import { fetchGoogleDocText } from "../docs.js";
import { lineMainText, lineFr, lineEn, isLyric } from "../core/project.js";
import { isSectionText } from "../core/lyrics.js";
import * as i18n from "../i18n.js";
import * as audio from "../audio.js";
import { formatTime } from "../sync.js";
import { renderSyncStep } from "./sync-step.js";
import { renderLookStep, renderReadyStep } from "./look-step.js";
import { renderExportStep } from "./export-step.js";

const PREF_KEY = "eclipse-flow-mode"; // "editor" when the user chose the full editor

let app = null;
let root = null;
let stage = null;
let current = null; // { step, el, cleanup }
let transparentWebm = true;

// Read before the app boots: boot rewrites the hash to the screen it restores
const INITIAL_HASH = typeof location !== "undefined" ? (location.hash || "").replace(/^#/, "") : "";

/** Guided form by default; Pro (the editor) when the user chose it or opened a Pro link (#pro, #sync…). */
export function flowWanted() {
  let mode = "";
  try {
    mode = localStorage.getItem(PREF_KEY) || "";
  } catch {
    /* storage blocked: default to the form */
  }
  // Shareable links: #guided / #pro pick the mode (and it is remembered)
  if (INITIAL_HASH === "guided" || INITIAL_HASH === "pro") {
    rememberMode(INITIAL_HASH === "pro" ? "editor" : "flow");
    return INITIAL_HASH === "guided";
  }
  if (mode) return mode !== "editor";
  // First visit: an editor link (#sync…) opens the editor; anything else, the form.
  // Later visits follow the last choice, since the app rewrites the hash as it goes.
  return !["prepare", "sync", "video", "export", "help"].includes(INITIAL_HASH);
}

function rememberMode(mode) {
  try {
    localStorage.setItem(PREF_KEY, mode);
  } catch {
    /* ignore */
  }
}

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* ——— state stored with the project ——— */

function project() {
  return app.getProject();
}

export function flowState() {
  const p = project();
  if (!p.flow) p.flow = {};
  const f = p.flow;
  if (!Array.isArray(f.outputs)) f.outputs = ["srt", "transparent"];
  if (!f.translation) f.translation = "none";
  if (f.lyricsText == null) f.lyricsText = lyricsTextFromProject(p);
  if (f.frText == null) f.frText = translationTextFromProject(p, "fr");
  if (f.enText == null) f.enText = translationTextFromProject(p, "en");
  return f;
}

function lyricsTextFromProject(p) {
  return (p.lines || []).map((l) => (isLyric(l) ? lineMainText(l) : `[${l.label || "Section"}]`)).join("\n");
}

function translationTextFromProject(p, lang) {
  const rows = (p.lines || []).filter(isLyric).map((l) => (lang === "fr" ? lineFr(l) : lineEn(l)));
  return rows.some(Boolean) ? rows.join("\n") : "";
}

function save() {
  app.persist();
}

/* ——— steps ——— */

const STEPS = [
  { id: "welcome", counted: false, render: renderWelcome },
  { id: "audio", render: renderAudio, next: () => app.hasAudio() },
  { id: "name", render: renderName },
  { id: "artist", render: renderArtist },
  { id: "linecheck", render: renderLineCheck },
  { id: "linehelp", sub: true, visible: () => flowState().linesOk === false, render: renderLineHelp },
  { id: "lyrics", render: renderLyrics },
  { id: "translate", render: renderTranslate },
  { id: "tr-fr", sub: true, visible: () => ["fr", "both"].includes(flowState().translation), render: (c) => renderTranslation(c, "fr") },
  { id: "tr-en", sub: true, visible: () => ["en", "both"].includes(flowState().translation), render: (c) => renderTranslation(c, "en") },
  { id: "outputs", render: renderOutputs },
  { id: "sync", render: (c) => renderSyncStep(c), wide: true },
  { id: "look", visible: () => needsVideo(flowState().outputs), render: (c) => renderLookStep(c), wide: true },
  { id: "ready", sub: true, visible: () => needsVideo(flowState().outputs), render: (c) => renderReadyStep(c), wide: true },
  { id: "export", render: (c) => renderExportStep(c), wide: true },
];

function visibleSteps() {
  return STEPS.filter((s) => !s.visible || s.visible());
}

function stepById(id) {
  return STEPS.find((s) => s.id === id);
}

/** Context handed to every step. */
function ctx() {
  return {
    app,
    t: ft,
    esc,
    project,
    flow: flowState,
    save,
    next,
    back,
    go,
    transparentWebm: () => transparentWebm,
    question,
    choiceList,
    bindChoices,
    setOkEnabled,
    formatTime,
  };
}

/* ——— shell ——— */

export function initFlow(api) {
  app = api;
  root = document.createElement("div");
  root.id = "flow";
  root.className = "flow";
  root.hidden = true;
  root.setAttribute("role", "main");
  root.innerHTML = `
    <div class="flow-progress" aria-hidden="true"><span></span></div>
    <header class="flow-top">
      <button type="button" class="flow-brand" data-act="home">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="flow-brand-name">${esc(ft("brand"))}</span>
      </button>
      <p class="flow-steplabel" aria-live="polite"></p>
      ${modeSwitchHtml("guided")}
      <button type="button" class="flow-menu-btn" data-act="menu" aria-haspopup="true" aria-expanded="false" aria-label="${esc(ft("menu"))}">
        <span></span><span></span>
      </button>
    </header>
    <div class="flow-menu" hidden>
      <button type="button" data-act="songs">${esc(ft("yourSongs"))}</button>
      <div class="flow-menu-lang" role="group" aria-label="${esc(ft("language"))}">
        <button type="button" data-lang="en">EN</button>
        <button type="button" data-lang="fr">FR</button>
      </div>
    </div>
    <div class="flow-stage"></div>
    <nav class="flow-nav" aria-label="Steps">
      <button type="button" data-act="back" aria-label="${esc(ft("back"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>
      <button type="button" data-act="next" aria-label="${esc(ft("next"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
    </nav>`;
  document.body.appendChild(root);
  stage = root.querySelector(".flow-stage");

  root.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "back") back();
    if (act === "next") next();
    if (act === "home") go("welcome", -1);
    if (act === "menu") toggleMenu();
    if (act === "songs") {
      toggleMenu(false);
      go("welcome", -1);
    }
    if (act === "mode-pro") openEditor();
  });
  root.querySelectorAll(".flow-menu-lang [data-lang]").forEach((b) =>
    b.addEventListener("click", () => {
      i18n.setLang(b.dataset.lang);
      toggleMenu(false);
      refreshChrome();
      rerender();
    })
  );
  document.addEventListener("keydown", onKey);

  import("../../video/export-overlay.js")
    .then((m) => m.canExportTransparentWebm())
    .then((ok) => {
      transparentWebm = ok;
    })
    .catch(() => {
      transparentWebm = false;
    });
}

export function showFlow(stepId) {
  if (!root) return;
  rememberMode("flow");
  root.hidden = false;
  document.body.classList.add("flow-on");
  refreshChrome();
  go(stepId || "welcome", 1, { instant: true });
}

function openEditor() {
  rememberMode("editor");
  teardown();
  root.hidden = true;
  document.body.classList.remove("flow-on");
  app.showEditor(app.getProject()?.lines?.length ? "sync" : "prepare");
}

function toggleMenu(force) {
  const menu = root.querySelector(".flow-menu");
  const open = force ?? menu.hidden;
  menu.hidden = !open;
  root.querySelector(".flow-menu-btn").setAttribute("aria-expanded", String(open));
}

function refreshChrome() {
  root.querySelector(".flow-brand-name").textContent = ft("brand");
  root.querySelector('[data-act="songs"]').textContent = ft("yourSongs");
  root.querySelector(".mode-switch").outerHTML = modeSwitchHtml("guided");
  root.querySelectorAll(".flow-menu-lang [data-lang]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.lang === i18n.getLang()))
  );
}

/**
 * The Guided | Pro switch, shown in both modes. Pro is the full editor: every
 * tool on one screen for people who know what they want. Same song in both.
 */
export function modeSwitchHtml(active) {
  const btn = (mode, act) =>
    `<button type="button" data-act="${act}" data-mode="${mode}" aria-pressed="${mode === active}" title="${esc(ft(`mode_${mode}Hint`))}">${esc(ft(`mode_${mode}`))}</button>`;
  return `<div class="mode-switch" role="group" aria-label="${esc(ft("modeAria"))}">${btn("guided", "mode-guided")}${btn("pro", "mode-pro")}</div>`;
}

/** 1-based number of a step among the main questions; sub-steps share their parent's. */
function stepNumber(stepId) {
  let n = 0;
  for (const s of visibleSteps()) {
    if (s.counted === false) continue;
    if (!s.sub) n += 1;
    if (s.id === stepId) return n;
  }
  return 0;
}

function updateProgress(stepId) {
  const steps = visibleSteps().filter((s) => s.counted !== false && !s.sub);
  const n = stepNumber(stepId);
  const idx = n - 1;
  const pct = idx < 0 ? 0 : ((idx + 1) / steps.length) * 100;
  root.querySelector(".flow-progress span").style.width = `${pct}%`;
  root.querySelector(".flow-steplabel").textContent =
    idx < 0 ? "" : ft("stepOf", { n: idx + 1, total: steps.length });
  const all = visibleSteps();
  const pos = all.findIndex((s) => s.id === stepId);
  root.querySelector('[data-act="back"]').disabled = pos <= 0;
  root.querySelector('[data-act="next"]').disabled = pos < 0 || pos >= all.length - 1;
}

function teardown() {
  if (current?.cleanup) {
    try {
      current.cleanup();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Show a step. dir: 1 = forward (comes up from below), -1 = back (comes down from above).
 */
export function go(stepId, dir = 1, { instant = false } = {}) {
  // The form has no speed control: always play the song as recorded, even if
  // the editor was left on 0.75× (the editor puts its speed back when opened)
  if (audio.getPlaybackRate() !== 1) audio.setPlaybackRate(1);
  const step = stepById(stepId) || STEPS[0];
  if (step.visible && !step.visible()) {
    // Asked for a hidden step: move on in that direction
    const list = visibleSteps();
    const all = STEPS.map((s) => s.id);
    const after = all.slice(all.indexOf(stepId) + (dir > 0 ? 1 : -1));
    const target = dir > 0 ? after.find((id) => list.some((s) => s.id === id)) : [...all.slice(0, all.indexOf(stepId))].reverse().find((id) => list.some((s) => s.id === id));
    return go(target || "welcome", dir, { instant });
  }
  teardown();
  const prev = current?.el;
  const el = document.createElement("section");
  el.className = `flow-step${step.wide ? " is-wide" : ""}`;
  el.dataset.step = step.id;
  const result = step.render({ ...ctx(), el }) || {};
  if (result.el) el.appendChild(result.el);
  current = { step, el, cleanup: result.cleanup, onEnter: result.onEnter, canNext: result.canNext, onKey: result.onKey };

  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (prev && !instant && !reduce) {
    prev.classList.add(dir > 0 ? "leave-up" : "leave-down");
    prev.addEventListener("animationend", () => prev.remove(), { once: true });
    setTimeout(() => prev.remove(), 600);
    el.classList.add(dir > 0 ? "enter-up" : "enter-down");
  } else if (prev) {
    prev.remove();
  }
  const num = el.querySelector(".fq-num");
  if (num) num.firstChild.textContent = `${stepNumber(step.id)} `;
  stage.appendChild(el);
  stage.scrollTop = 0;
  root.classList.toggle("is-welcome", step.id === "welcome");

  if (step.id !== "welcome") {
    flowState().step = step.id;
    save();
  }
  updateProgress(step.id);
  // Focus the first field so typing works right away (not on touch: no surprise keyboard)
  requestAnimationFrame(() => {
    current?.onEnter?.();
    const field = el.querySelector("[data-autofocus]");
    if (field && !window.matchMedia?.("(pointer: coarse)")?.matches) field.focus({ preventScroll: true });
  });
}

function rerender() {
  if (current) go(current.step.id, 1, { instant: true });
}

export async function next() {
  if (!current) return;
  const { step } = current;
  if (current.canNext) {
    const ok = await current.canNext();
    if (!ok) return;
  }
  if (step.next && !step.next()) return;
  const list = visibleSteps();
  const idx = list.findIndex((s) => s.id === step.id);
  if (idx >= 0 && idx < list.length - 1) go(list[idx + 1].id, 1);
}

export function back() {
  if (!current) return;
  const list = visibleSteps();
  const idx = list.findIndex((s) => s.id === current.step.id);
  if (idx > 0) go(list[idx - 1].id, -1);
}

function onKey(e) {
  if (root.hidden || !current) return;
  const typing = e.target.closest?.("textarea, input:not([type=checkbox]):not([type=radio]), select");
  if (e.key === "Escape") {
    toggleMenu(false);
    return;
  }
  // Enter = OK (Shift+Enter keeps new lines in text boxes)
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    if (e.target.tagName === "TEXTAREA") return;
    if (e.target.tagName === "BUTTON" && !e.target.classList.contains("f-ok")) return;
    const ok = current.el.querySelector(".f-ok:not([disabled])");
    if (ok) {
      e.preventDefault();
      ok.click();
    }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  // A, B, C… pick a choice, like Typeform
  if (/^[a-z]$/i.test(e.key)) {
    const btn = current.el.querySelector(`.f-choice[data-key="${e.key.toUpperCase()}"]`);
    if (btn) {
      e.preventDefault();
      btn.click();
    }
  }
  current.onKey?.(e);
}

/* ——— building blocks ——— */

/**
 * Typeform-style question block.
 * @returns {HTMLElement} with .fq-body to fill and a .f-ok button
 */
function question({ num = true, title, help = "", ok = true, okLabel, skip = false }) {
  const wrap = document.createElement("div");
  wrap.className = "fq";
  wrap.innerHTML = `
    ${num !== false ? `<p class="fq-num">&nbsp;<span aria-hidden="true">→</span></p>` : ""}
    <h2 class="fq-title">${title}</h2>
    ${help ? `<p class="fq-help">${help}</p>` : ""}
    <div class="fq-body"></div>
    <p class="fq-error" role="alert" hidden></p>
    ${
      ok
        ? `<div class="fq-actions">
            <button type="button" class="f-ok">${esc(okLabel || ft("ok"))} <span aria-hidden="true">✓</span></button>
            ${skip ? `<button type="button" class="f-skip">${esc(ft("skip"))}</button>` : ""}
            <span class="f-hint">${esc(ft("pressEnter"))}</span>
          </div>`
        : ""
    }`;
  wrap.querySelector(".f-ok")?.addEventListener("click", () => next());
  wrap.querySelector(".f-skip")?.addEventListener("click", () => next());
  return wrap;
}

function showError(q, msg) {
  const e = q.querySelector(".fq-error");
  if (!e) return;
  e.textContent = msg || "";
  e.hidden = !msg;
}

function setOkEnabled(q, on) {
  const ok = q.querySelector(".f-ok");
  if (ok) ok.disabled = !on;
}

/** Choice buttons with A/B/C keys. items: [{ value, label, sub }] */
function choiceList(items, { multi = false, selected = [] } = {}) {
  const list = document.createElement("div");
  list.className = `f-choices${multi ? " is-multi" : ""}`;
  list.setAttribute("role", multi ? "group" : "radiogroup");
  items.forEach((item, i) => {
    const key = String.fromCharCode(65 + i);
    const on = selected.includes(item.value);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "f-choice";
    b.dataset.key = key;
    b.dataset.value = item.value;
    b.setAttribute("role", multi ? "checkbox" : "radio");
    b.setAttribute("aria-checked", String(on));
    if (item.disabled) b.disabled = true;
    b.innerHTML = `<span class="f-key" aria-hidden="true">${key}</span>
      <span class="f-choice-text"><span class="f-choice-label">${esc(item.label)}</span>${
        item.sub ? `<span class="f-choice-sub">${esc(item.sub)}</span>` : ""
      }</span>
      <span class="f-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>`;
    list.appendChild(b);
  });
  return list;
}

/** Wire a choice list. onPick(value, selectedValues). Single choice flashes then continues. */
function bindChoices(list, { multi = false, onPick, autoNext = true } = {}) {
  list.querySelectorAll(".f-choice").forEach((b) => {
    b.addEventListener("click", () => {
      if (multi) {
        const on = b.getAttribute("aria-checked") !== "true";
        b.setAttribute("aria-checked", String(on));
      } else {
        list.querySelectorAll(".f-choice").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      }
      const values = [...list.querySelectorAll('.f-choice[aria-checked="true"]')].map((x) => x.dataset.value);
      const res = onPick?.(b.dataset.value, values);
      if (!multi && autoNext && res !== false) {
        b.classList.add("is-flash");
        setTimeout(() => next(), 380);
      }
    });
  });
}

/** Big text area with Google Docs import underneath. */
function lyricsField({ value, placeholder, onInput, withDocs = true }) {
  const wrap = document.createElement("div");
  wrap.className = "f-lyrics";
  wrap.innerHTML = `
    <textarea class="f-textarea" rows="9" spellcheck="false" data-autofocus placeholder="${esc(placeholder)}"></textarea>
    <p class="f-meta" aria-live="polite"></p>
    ${
      withDocs
        ? `<details class="f-docs">
            <summary><span class="f-or">${esc(ft("lyricsOr"))}</span> ${esc(ft("lyricsDocs"))}</summary>
            <p class="fq-help">${esc(ft("lyricsDocsHelp"))}</p>
            <div class="f-docs-row">
              <input type="url" class="f-input f-docs-url" inputmode="url" autocomplete="off" placeholder="${esc(ft("lyricsDocsPlaceholder"))}" />
              <button type="button" class="f-btn f-docs-go">${esc(ft("lyricsDocsFetch"))}</button>
            </div>
            <p class="f-docs-status" aria-live="polite"></p>
          </details>`
        : ""
    }`;
  const ta = wrap.querySelector("textarea");
  ta.value = value || "";
  ta.addEventListener("input", () => onInput(ta.value));
  const go = wrap.querySelector(".f-docs-go");
  if (go) {
    const status = wrap.querySelector(".f-docs-status");
    const url = wrap.querySelector(".f-docs-url");
    const fetchDoc = async () => {
      const link = url.value.trim();
      if (!link) return;
      status.textContent = ft("lyricsDocsLoading");
      status.classList.remove("is-error");
      go.disabled = true;
      try {
        const text = await fetchGoogleDocText(link);
        ta.value = String(text || "").trim();
        onInput(ta.value);
        status.textContent = "";
        wrap.querySelector(".f-docs").open = false;
      } catch {
        status.textContent = ft("lyricsDocsError");
        status.classList.add("is-error");
      } finally {
        go.disabled = false;
      }
    };
    go.addEventListener("click", fetchDoc);
    url.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        fetchDoc();
      }
    });
  }
  return { wrap, textarea: ta, meta: wrap.querySelector(".f-meta") };
}

/* ——— steps ——— */

function renderWelcome(c) {
  const el = document.createElement("div");
  el.className = "fw";
  el.innerHTML = `
    <p class="fw-eyebrow">${esc(ft("welcomeEyebrow"))}</p>
    <h1 class="fw-title">${esc(ft("welcomeTitle"))}</h1>
    <p class="fw-lead">${esc(ft("welcomeLead"))}</p>
    <ol class="fw-path" aria-hidden="true">
      <li><span>1</span>${esc(ft("welcomeWhat1"))}</li>
      <li><span>2</span>${esc(ft("welcomeWhat2"))}</li>
      <li><span>3</span>${esc(ft("welcomeWhat3"))}</li>
      <li><span>4</span>${esc(ft("welcomeWhat4"))}</li>
    </ol>
    <div class="fq-actions">
      <button type="button" class="f-ok fw-start">${esc(ft("welcomeStart"))} <span aria-hidden="true">→</span></button>
      <span class="f-hint">${esc(ft("pressEnter"))}</span>
    </div>
    <button type="button" class="f-link fw-demo">${esc(ft("welcomeDemo"))}</button>
    <button type="button" class="fw-pro">
      <span class="fw-pro-text"><b>${esc(ft("welcomeProTitle"))}</b><small>${esc(ft("welcomeProHelp"))}</small></span>
      <span class="fw-pro-go">${esc(ft("welcomeProGo"))} <span aria-hidden="true">→</span></span>
    </button>
    <section class="fw-recent" hidden>
      <h2 class="fw-recent-title">${esc(ft("welcomeRecent"))}</h2>
      <ul class="fw-recent-list"></ul>
    </section>`;
  el.querySelector(".fw-start").addEventListener("click", async () => {
    await c.app.newProject();
    go("audio", 1);
  });
  el.querySelector(".fw-pro").addEventListener("click", () => openEditor());
  el.querySelector(".fw-demo").addEventListener("click", async () => {
    await c.app.loadDemo();
    const f = flowState();
    f.lyricsText = lyricsTextFromProject(project());
    f.frText = translationTextFromProject(project(), "fr");
    f.enText = translationTextFromProject(project(), "en");
    f.translation = f.frText && f.enText ? "both" : f.frText ? "fr" : f.enText ? "en" : "none";
    f.linesOk = true;
    save();
    go("sync", 1);
  });

  c.app.listProjects().then((list) => {
    const real = (list || []).filter((p) => p.audio?.fileName || String(p.title || "").trim()).slice(0, 4);
    if (!real.length) return;
    const ul = el.querySelector(".fw-recent-list");
    real.forEach((p) => {
      const li = document.createElement("li");
      li.innerHTML = `<button type="button" class="fw-song">
          <span class="fw-song-title">${esc(p.title || p.audio?.fileName || "—")}</span>
          <span class="fw-song-meta">${esc(p.artist || "")}</span>
          <span class="fw-song-go">${esc(ft("welcomeOpen"))} <span aria-hidden="true">→</span></span>
        </button>`;
      li.querySelector("button").addEventListener("click", async () => {
        if (!(await c.app.openProject(p.id))) return;
        const f = flowState();
        go(f.step && stepById(f.step) ? f.step : c.app.hasAudio() ? "name" : "audio", 1);
      });
      ul.appendChild(li);
    });
    el.querySelector(".fw-recent").hidden = false;
  });
  return { el };
}

function renderAudio(c) {
  const p = project();
  const q = question({ title: esc(ft("audioQ")), help: esc(ft("audioHelp")) });
  const body = q.querySelector(".fq-body");
  body.innerHTML = `
    <label class="f-drop" tabindex="0">
      <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" hidden />
      <span class="f-drop-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>
      <span class="f-drop-label">${esc(ft("audioPick"))}</span>
      <span class="f-drop-sub">${esc(ft("audioDrop"))}</span>
    </label>
    <p class="f-file" hidden></p>
    <p class="f-privacy">${esc(ft("audioPrivacy"))}</p>`;
  const drop = body.querySelector(".f-drop");
  const input = body.querySelector("input");
  const fileLine = body.querySelector(".f-file");
  const showLoaded = () => {
    const name = p.audio?.fileName;
    if (!c.app.hasAudio() || !name) {
      fileLine.hidden = true;
      setOkEnabled(q, false);
      return;
    }
    fileLine.hidden = false;
    fileLine.innerHTML = `<span class="f-file-ok" aria-hidden="true">✓</span> ${esc(
      ft("audioLoaded", { file: name, dur: formatTime((p.audio.durationMs || 0) / 1000) })
    )}`;
    drop.querySelector(".f-drop-label").textContent = ft("audioReplace");
    setOkEnabled(q, true);
  };
  const load = async (file) => {
    if (!file) return;
    showError(q, "");
    drop.classList.add("is-loading");
    drop.querySelector(".f-drop-label").textContent = ft("audioLoading");
    const ok = await c.app.loadAudio(file);
    drop.classList.remove("is-loading");
    if (!ok) {
      drop.querySelector(".f-drop-label").textContent = ft("audioPick");
      showError(q, ft("audioError"));
      return;
    }
    // Fresh file name → fresh title guess
    const f = flowState();
    if (!f.titleConfirmed) p.title = titleFromFileName(file.name);
    save();
    showLoaded();
    setTimeout(() => next(), 450);
  };
  input.addEventListener("change", () => load(input.files?.[0]));
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("is-over");
    })
  );
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("is-over")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    load(e.dataTransfer?.files?.[0]);
  });
  showLoaded();
  return { el: q };
}

function renderName(c) {
  const p = project();
  const f = flowState();
  const guess = String(p.title || "").trim();
  const generic = isGenericSongName(guess) && !f.titleConfirmed;

  if (generic && guess && f.nameAsk !== "typing") {
    const q = question({ title: esc(ft("nameGenericQ", { name: guess })),
      help: esc(ft("nameGenericHelp")),
      ok: false,
    });
    const list = choiceList([
      { value: "yes", label: ft("nameYes") },
      { value: "no", label: ft("nameNo") },
    ]);
    q.querySelector(".fq-body").appendChild(list);
    bindChoices(list, {
      onPick: (v) => {
        if (v === "yes") {
          f.titleConfirmed = true;
          save();
          return true;
        }
        f.nameAsk = "typing";
        p.title = "";
        save();
        setTimeout(() => go("name", 1, { instant: true }), 200);
        return false;
      },
    });
    return { el: q };
  }

  const q = question({ title: esc(ft("nameQ")), help: guess ? esc(ft("nameHelp")) : "" });
  const input = document.createElement("input");
  input.className = "f-input f-input-big";
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = ft("namePlaceholder");
  input.value = guess;
  input.dataset.autofocus = "";
  q.querySelector(".fq-body").appendChild(input);
  const update = () => {
    p.title = input.value;
    f.titleConfirmed = Boolean(input.value.trim());
    setOkEnabled(q, Boolean(input.value.trim()));
    save();
  };
  input.addEventListener("input", update);
  setOkEnabled(q, Boolean(guess));
  return {
    el: q,
    canNext: () => {
      if (!input.value.trim()) {
        showError(q, ft("nameRequired"));
        return false;
      }
      f.nameAsk = "";
      return true;
    },
  };
}

function renderArtist() {
  const p = project();
  const q = question({ title: esc(ft("artistQ")), help: esc(ft("artistHelp")), skip: true });
  const input = document.createElement("input");
  input.className = "f-input f-input-big";
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = ft("artistPlaceholder");
  input.value = p.artist || "";
  input.dataset.autofocus = "";
  input.addEventListener("input", () => {
    p.artist = input.value;
    save();
  });
  q.querySelector(".fq-body").appendChild(input);
  return { el: q };
}

function renderLineCheck() {
  const f = flowState();
  const q = question({ title: esc(ft("linesQ")), help: esc(ft("linesHelp")), ok: false });
  const body = q.querySelector(".fq-body");
  body.innerHTML = `
    <div class="f-examples">
      <figure class="f-example is-do">
        <figcaption><span aria-hidden="true">✓</span> ${esc(ft("linesDo"))}</figcaption>
        <pre>${esc(ft("linesDoExample"))}</pre>
      </figure>
      <figure class="f-example is-dont">
        <figcaption><span aria-hidden="true">✕</span> ${esc(ft("linesDont"))}</figcaption>
        <pre>${esc(ft("linesDontExample"))}</pre>
      </figure>
    </div>`;
  const list = choiceList(
    [
      { value: "yes", label: ft("linesYes") },
      { value: "no", label: ft("linesNo") },
    ],
    { selected: f.linesOk === true ? ["yes"] : f.linesOk === false ? ["no"] : [] }
  );
  body.appendChild(list);
  bindChoices(list, {
    onPick: (v) => {
      f.linesOk = v === "yes";
      save();
    },
  });
  return { el: q };
}

function renderLineHelp() {
  const q = question({ title: esc(ft("linesFixQ")), okLabel: ft("linesFixOk") });
  q.querySelector(".fq-body").innerHTML = `
    <ol class="f-tips">
      <li>${esc(ft("linesFixTip1"))}</li>
      <li>${esc(ft("linesFixTip2"))}</li>
      <li>${esc(ft("linesFixTip3"))}</li>
    </ol>
    <figure class="f-example is-do"><figcaption><span aria-hidden="true">✓</span> ${esc(ft("linesDo"))}</figcaption><pre>${esc(ft("linesDoExample"))}</pre></figure>`;
  return { el: q };
}

function renderLyrics(c) {
  const f = flowState();
  const q = question({ title: esc(ft("lyricsQ")), help: esc(ft("lyricsHelp")) });
  const field = lyricsField({
    value: f.lyricsText,
    placeholder: ft("lyricsPlaceholder"),
    onInput: (v) => {
      f.lyricsText = v;
      showError(q, "");
      describe();
      save();
    },
  });
  q.querySelector(".fq-body").appendChild(field.wrap);
  const describe = () => {
    const a = analyzeLyrics(f.lyricsText);
    const parts = [];
    if (a.lyricCount) parts.push(`<span class="f-count">${esc(ft("lyricsCount", { n: a.lyricCount }))}</span>`);
    if (a.looksLikeParagraphs) parts.push(`<span class="f-warn">${esc(ft("lyricsParagraphs"))}</span>`);
    else if (a.longLines.length) parts.push(`<span class="f-note">${esc(ft("lyricsLong", { n: a.longLines.length }))}</span>`);
    field.meta.innerHTML = parts.join(" ");
    setOkEnabled(q, a.lyricCount > 0);
  };
  describe();
  return {
    el: q,
    canNext: () => {
      const a = analyzeLyrics(f.lyricsText);
      if (!a.lyricCount) {
        showError(q, ft("lyricsRequired"));
        return false;
      }
      applyTexts(c);
      return true;
    },
  };
}

/** Push the form's texts into the project (timings of unchanged lines are kept). */
function applyTexts(c) {
  const f = flowState();
  const fr = ["fr", "both"].includes(f.translation) ? f.frText : "";
  const en = ["en", "both"].includes(f.translation) ? f.enText : "";
  c.app.setLyrics(f.lyricsText, fr, en);
  // Lyrics changed → the video should show translations only if there are some
  save();
}

/** Picking a translation means showing it (the look step can still hide it). */
function showTranslationFor(choice) {
  const p = project();
  if (!p.settings) p.settings = {};
  if (!p.settings.video) p.settings.video = {};
  const v = p.settings.video;
  v.showTranslation = choice !== "none";
  if (choice === "fr" || choice === "en") v.translationLang = choice;
  if (choice === "both" && !["fr", "en"].includes(v.translationLang)) v.translationLang = "fr";
}

function renderTranslate(c) {
  const f = flowState();
  const q = question({ title: esc(ft("trQ")), help: esc(ft("trHelp")), ok: false });
  const list = choiceList(
    [
      { value: "none", label: ft("trNone") },
      { value: "fr", label: ft("trFr") },
      { value: "en", label: ft("trEn") },
      { value: "both", label: ft("trBoth") },
    ],
    { selected: [f.translation] }
  );
  q.querySelector(".fq-body").appendChild(list);
  bindChoices(list, {
    onPick: (v) => {
      f.translation = v;
      showTranslationFor(v);
      applyTexts(c);
    },
  });
  return { el: q };
}

function renderTranslation(c, lang) {
  const f = flowState();
  const key = lang === "fr" ? "frText" : "enText";
  const lyricCount = analyzeLyrics(f.lyricsText).lyricCount;
  const q = question({
    title: esc(ft(lang === "fr" ? "trPasteFrQ" : "trPasteEnQ")),
    help: esc(ft("trPasteHelp")),
  });
  // Lyrics side by side, so lines are easy to match
  const pair = document.createElement("div");
  pair.className = "f-pair";
  const ref = document.createElement("ol");
  ref.className = "f-ref";
  ref.setAttribute("aria-hidden", "true");
  analyzeLyrics(f.lyricsText)
    .lines.filter((l) => !isSectionText(l))
    .forEach((l) => {
      const li = document.createElement("li");
      li.textContent = l;
      ref.appendChild(li);
    });
  const field = lyricsField({
    value: f[key],
    placeholder: ft("trPlaceholder"),
    onInput: (v) => {
      f[key] = v;
      describe();
      save();
    },
  });
  pair.append(field.wrap, ref);
  q.querySelector(".fq-body").appendChild(pair);
  const describe = () => {
    const m = translationMatch(lyricCount, f[key]);
    field.meta.innerHTML = !m.count
      ? ""
      : m.matches
        ? `<span class="f-count">${esc(ft("trMatch", { n: m.count }))}</span>`
        : `<span class="f-warn">${esc(ft("trMismatch", { n: m.count, m: lyricCount }))}</span>`;
  };
  describe();
  return {
    el: q,
    canNext: () => {
      applyTexts(c);
      return true;
    },
  };
}

function renderOutputs(c) {
  const f = flowState();
  const q = question({ title: esc(ft("outQ")), help: esc(ft("outHelp")) });
  const labels = {
    srt: [ft("outSrt"), ft("outSrtFor")],
    transparent: [ft("outTransparent"), c.transparentWebm() ? ft("outTransparentFor") : ft("outTransparentPng")],
    black: [ft("outBlack"), ft("outBlackFor")],
    green: [ft("outGreen"), ft("outGreenFor")],
    full: [ft("outFull"), ft("outFullFor")],
  };
  const items = OUTPUTS.map((o) => ({ value: o.id, label: labels[o.id][0], sub: labels[o.id][1] }));
  items.push({ value: "all", label: ft("outAll") });
  const allIds = OUTPUTS.map((o) => o.id);
  const list = choiceList(items, {
    multi: true,
    selected: f.outputs.length === allIds.length ? [...f.outputs, "all"] : f.outputs,
  });
  q.querySelector(".fq-body").appendChild(list);
  const sync = () => {
    const all = list.querySelector('[data-value="all"]');
    all.setAttribute("aria-checked", String(f.outputs.length === allIds.length));
    list.querySelectorAll(".f-choice").forEach((b) => {
      if (b.dataset.value !== "all") b.setAttribute("aria-checked", String(f.outputs.includes(b.dataset.value)));
    });
    setOkEnabled(q, f.outputs.length > 0);
    showError(q, "");
  };
  bindChoices(list, {
    multi: true,
    onPick: (v, values) => {
      if (v === "all") {
        f.outputs = values.includes("all") ? [...allIds] : [];
      } else {
        f.outputs = allIds.filter((id) => values.includes(id));
      }
      save();
      sync();
    },
  });
  sync();
  return {
    el: q,
    canNext: () => {
      if (!f.outputs.length) {
        showError(q, ft("outRequired"));
        return false;
      }
      return true;
    },
  };
}
