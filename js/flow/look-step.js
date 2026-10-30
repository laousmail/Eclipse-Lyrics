/** Step 6: the look (fonts, colour, size, place, motion, shape) with a live player, then Watch / Export. */

import { createPlayer } from "./player.js";
import { FONTS, COLORS, SIZES, MOTIONS, outputVideoSettings, colorClashes } from "./helpers.js";
import { lineMainText, isLyric } from "../core/project.js";
import * as audio from "../audio.js";
import { lineAtTime } from "../sync.js";

const SHAPES = [
  { aspect: "1080x1920", label: "shape916", ar: "9 / 16" },
  { aspect: "1080x1350", label: "shape45", ar: "4 / 5" },
  { aspect: "1080x1080", label: "shape11", ar: "1" },
  { aspect: "1920x1080", label: "shape169", ar: "16 / 9" },
];

function videoSettings(p) {
  if (!p.settings) p.settings = {};
  if (!p.settings.video) p.settings.video = {};
  return p.settings.video;
}

/** Which background the preview shows: the first chosen video output unless the user picked one. */
function previewModes(f) {
  return ["full", "transparent", "black", "green"].filter((id) => f.outputs.includes(id));
}

/** Open the preview on a sung line, not on silence after the song or before it. */
function seekToLyrics(p) {
  const nowMs = Math.round(audio.getCurrentTime() * 1000);
  const line = p.lines?.[lineAtTime(p.lines || [], nowMs)];
  const showing = line && isLyric(line) && nowMs < (line.endMs ?? Infinity);
  if (showing) return;
  const first = (p.lines || []).find((l) => isLyric(l) && l.startMs != null);
  if (first) audio.seek(first.startMs / 1000 + 0.6);
}

function makePlayer(c) {
  const p = c.project();
  seekToLyrics(p);
  const f = c.flow();
  const modes = previewModes(f);
  if (!modes.includes(f.previewMode)) f.previewMode = modes[0] || "full";
  const player = createPlayer({
    project: c.project,
    settings: () => outputVideoSettings(f.previewMode, videoSettings(p), { transparentWebm: c.transparentWebm() }),
    t: c.t,
    esc: c.esc,
  });
  // Preview-on chips (only when more than one kind of video was chosen)
  if (modes.length > 1) {
    const chips = document.createElement("div");
    chips.className = "fl-modes";
    chips.setAttribute("role", "radiogroup");
    chips.setAttribute("aria-label", c.t("previewOn"));
    chips.innerHTML = `<span class="fl-modes-label">${c.esc(c.t("previewOn"))}</span>${modes
      .map(
        (m) =>
          `<button type="button" role="radio" aria-checked="${m === f.previewMode}" data-mode="${m}">${c.esc(c.t(`pv_${m}`))}</button>`
      )
      .join("")}`;
    chips.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mode]");
      if (!b) return;
      f.previewMode = b.dataset.mode;
      chips.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      c.save();
      player.redraw();
    });
    player.el.appendChild(chips);
  }
  player.onKey = (e) => {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      player.toggle();
    }
  };
  return player;
}

function optionRow(c, { title, items, current, onPick, className = "" }) {
  const row = document.createElement("fieldset");
  row.className = `fl-row ${className}`;
  row.innerHTML = `<legend class="fl-legend">${c.esc(title)}</legend><div class="fl-opts" role="radiogroup"></div>`;
  const box = row.querySelector(".fl-opts");
  items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `fl-opt ${it.className || ""}`;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(it.value === current));
    b.dataset.value = it.value;
    if (it.style) b.setAttribute("style", it.style);
    b.innerHTML = it.html;
    if (it.title) b.title = it.title;
    box.appendChild(b);
  });
  box.addEventListener("click", (e) => {
    const b = e.target.closest(".fl-opt");
    if (!b) return;
    box.querySelectorAll(".fl-opt").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    onPick(b.dataset.value, b);
  });
  return row;
}

export function renderLookStep(c) {
  const { t, esc } = c;
  const p = c.project();
  const f = c.flow();
  const v = videoSettings(p);
  // Sensible first look
  if (!v.aspect) v.aspect = "1080x1920";
  if (!v.font) v.font = "Outfit";
  if (!v.fontWeight) v.fontWeight = 600;
  if (!v.style) v.style = "fadeUp";
  if (!v.position) v.position = "center";
  if (v.introCard == null) v.introCard = true;
  if (!v.fontSize) v.fontSize = 72;

  const el = document.createElement("div");
  el.className = "fl";
  el.innerHTML = `
    <header class="fl-head">
      <h2 class="fq-title">${esc(t("lookQ"))}</h2>
      <p class="fq-help">${esc(t("lookHelp"))}</p>
    </header>
    <div class="fl-preview"></div>
    <div class="fl-panel">
      <div class="fl-rows"></div>
      <div class="fq-actions">
        <button type="button" class="f-ok">${esc(t("next"))} <span aria-hidden="true">→</span></button>
      </div>
    </div>`;
  const player = makePlayer(c);
  el.querySelector(".fl-preview").appendChild(player.el);
  const rows = el.querySelector(".fl-rows");
  const changed = () => {
    c.save();
    player.redraw();
  };
  const sample = lineMainText((p.lines || []).find(isLyric)) || p.title || "Eclipse";

  rows.appendChild(
    optionRow(c, {
      title: t("lookShape"),
      current: v.aspect,
      className: "fl-shapes",
      items: SHAPES.map((s) => ({
        value: s.aspect,
        html: `<span class="fl-shape" style="--ar:${s.ar}" aria-hidden="true"></span><span>${esc(t(s.label))}</span>`,
      })),
      onPick: (val) => {
        v.aspect = val;
        changed();
      },
    })
  );

  rows.appendChild(
    optionRow(c, {
      title: t("lookFont"),
      current: v.font,
      className: "fl-fonts",
      items: FONTS.map((font) => ({
        value: font.family,
        style: `--ff:"${font.family}";--fw:${font.weight}`,
        html: `<span class="fl-font-sample">${esc(sample)}</span><span class="fl-font-name">${esc(t(`font_${font.mood}`))} · ${esc(font.family)}</span>`,
      })),
      onPick: (val) => {
        const font = FONTS.find((x) => x.family === val);
        v.font = font.family;
        v.fontWeight = font.weight;
        changed();
      },
    })
  );

  const clash = document.createElement("p");
  clash.className = "f-warn fl-clash";
  const colorRow = optionRow(c, {
    title: t("lookColor"),
    current: COLORS.find((x) => x.text === v.textColor)?.id || "cream",
    className: "fl-colors",
    items: COLORS.map((col) => ({
      value: col.id,
      style: `--sw:${col.text}`,
      title: t(`color_${col.id}`),
      html: `<span class="fl-swatch" aria-hidden="true"></span><span>${esc(t(`color_${col.id}`))}</span>`,
    })),
    onPick: (id) => {
      const col = COLORS.find((x) => x.id === id);
      v.textColor = col.text;
      v.translationColor = col.translation;
      clash.textContent = colorClashes(id, f.outputs) ? t("colorClash") : "";
      changed();
    },
  });
  colorRow.appendChild(clash);
  rows.appendChild(colorRow);

  const sizeNow = SIZES.reduce((best, s) => (Math.abs(s.fontSize - (v.fontSize || 72)) < Math.abs(best.fontSize - (v.fontSize || 72)) ? s : best), SIZES[1]);
  rows.appendChild(
    optionRow(c, {
      title: t("lookSize"),
      current: sizeNow.id,
      className: "fl-seg",
      items: SIZES.map((s) => ({ value: s.id, html: esc(t(`size_${s.id}`)) })),
      onPick: (id) => {
        v.fontSize = SIZES.find((s) => s.id === id).fontSize;
        changed();
      },
    })
  );

  rows.appendChild(
    optionRow(c, {
      title: t("lookPosition"),
      current: v.position,
      className: "fl-seg",
      items: ["top", "center", "bottom"].map((pos) => ({ value: pos, html: esc(t(`pos_${pos}`)) })),
      onPick: (pos) => {
        v.position = pos;
        changed();
      },
    })
  );

  rows.appendChild(
    optionRow(c, {
      title: t("lookMotion"),
      current: v.style,
      className: "fl-chips",
      items: MOTIONS.map((m) => ({ value: m, html: esc(t(`motion_${m}`)) })),
      onPick: (m) => {
        v.style = m;
        changed();
      },
    })
  );

  if (f.translation !== "none") {
    const opts = [{ value: "off", html: esc(t("lookTrHide")) }];
    if (["fr", "both"].includes(f.translation)) opts.push({ value: "fr", html: `${esc(t("lookTrShow"))} · ${esc(t("trFr"))}` });
    if (["en", "both"].includes(f.translation)) opts.push({ value: "en", html: `${esc(t("lookTrShow"))} · ${esc(t("trEn"))}` });
    rows.appendChild(
      optionRow(c, {
        title: t("lookTranslation"),
        current: v.showTranslation ? v.translationLang || "fr" : "off",
        className: "fl-chips",
        items: opts,
        onPick: (val) => {
          v.showTranslation = val !== "off";
          if (val !== "off") v.translationLang = val;
          changed();
        },
      })
    );
  }

  const toggles = [
    ["introCard", "lookTitleCard", v.introCard !== false],
    ["credit", "lookCredit", v.credit !== false],
  ];
  toggles.forEach(([key, label, on]) => {
    rows.appendChild(
      optionRow(c, {
        title: t(label),
        current: on ? "on" : "off",
        className: "fl-seg",
        items: [
          { value: "on", html: esc(t("on")) },
          { value: "off", html: esc(t("off")) },
        ],
        onPick: (val) => {
          v[key] = val === "on";
          changed();
        },
      })
    );
  });

  el.querySelector(".f-ok").addEventListener("click", () => c.next());
  // Load every font once so the cards show the real faces
  FONTS.forEach((font) => document.fonts?.load?.(`${font.weight} 24px "${font.family}"`).catch(() => {}));

  return { el, onKey: player.onKey, cleanup: () => player.destroy() };
}

export function renderReadyStep(c) {
  const { t, esc } = c;
  const el = document.createElement("div");
  el.className = "fr";
  el.innerHTML = `
    <header class="fr-head">
      <h2 class="fq-title">${esc(t("readyQ"))}</h2>
      <p class="fq-help">${esc(t("readyHelp"))}</p>
    </header>
    <div class="fr-player"></div>
    <div class="fq-actions fr-actions">
      <button type="button" class="f-ok">${esc(t("readyExport"))} <span aria-hidden="true">→</span></button>
      <button type="button" class="f-btn fr-edit">${esc(t("readyEdit"))}</button>
    </div>`;
  const player = makePlayer(c);
  el.querySelector(".fr-player").appendChild(player.el);
  el.querySelector(".f-ok").addEventListener("click", () => c.next());
  el.querySelector(".fr-edit").addEventListener("click", () => c.back());
  return { el, onKey: player.onKey, cleanup: () => player.destroy() };
}
