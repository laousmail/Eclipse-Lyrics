/** Grid lyric editor: one row per line, Main | FR | EN. */

import { isSectionText, isOverCharLimit, MAX_SUBTITLE_CHARS, rowMismatch } from "../core/lyrics.js";
import { createLyricLine, createSectionLine, lineMainText, lineFr, lineEn, isLyric } from "../core/project.js";

/**
 * Render editable grid into container.
 * @param {HTMLElement} root
 * @param {{ rows: Array<{main:string,fr:string,en:string}>, onChange: Function }} opts
 */
export function renderLyricsGrid(root, { rows, onChange, onFocusField }) {
  if (!root) return;
  root.innerHTML = "";
  rows.forEach((row, i) => {
    const el = document.createElement("div");
    el.className = "lyrics-row";
    el.dataset.index = String(i);
    const main = String(row.main || "");
    const fr = String(row.fr || "");
    const en = String(row.en || "");
    const section = isSectionText(main);
    const mismatch = rowMismatch(main, fr, en);
    const over = !section && main.length > MAX_SUBTITLE_CHARS;
    el.classList.toggle("is-section-row", section);
    el.classList.toggle("is-mismatch", mismatch);
    el.classList.toggle("is-over", over);

    el.innerHTML = `
      <span class="lyrics-row-num">${i + 1}</span>
      <div class="lyrics-row-fields">
        <input type="text" data-col="main" spellcheck="false" placeholder="Main" value="" />
        <input type="text" data-col="fr" spellcheck="false" placeholder="FR" value="" />
        <input type="text" data-col="en" spellcheck="false" placeholder="EN" value="" />
      </div>`;
    const mainInput = el.querySelector('[data-col="main"]');
    const frInput = el.querySelector('[data-col="fr"]');
    const enInput = el.querySelector('[data-col="en"]');
    mainInput.value = main;
    frInput.value = fr;
    enInput.value = en;
    if (section) {
      frInput.disabled = true;
      enInput.disabled = true;
    }

    const readRow = () => ({
      main: mainInput.value,
      fr: frInput.value,
      en: enInput.value,
    });

    const emit = (reason) => onChange?.(readRow(), { reason, index: i });

    [mainInput, frInput, enInput].forEach((input) => {
      input.addEventListener("input", () => emit("input"));
      input.addEventListener("blur", () => emit("blur"));
      input.addEventListener("focus", () => onFocusField?.(input));
      input.addEventListener("paste", () => {
        queueMicrotask(() => emit("paste"));
      });
    });

    root.appendChild(el);
  });
}

export function rowsFromProject(project) {
  return (project.lines || []).map((line) => {
    if (line.type === "section") {
      return { main: `[${line.label || "Section"}]`, fr: "", en: "" };
    }
    return {
      main: lineMainText(line),
      fr: lineFr(line),
      en: lineEn(line),
    };
  });
}

export function ensureRows(rows) {
  if (rows?.length) return rows.map((r) => ({ main: r.main || "", fr: r.fr || "", en: r.en || "" }));
  return [{ main: "", fr: "", en: "" }];
}

export function countOverLimit(rows) {
  return rows.filter((r) => {
    const m = String(r.main || "");
    return !isSectionText(m) && m.length > MAX_SUBTITLE_CHARS;
  }).length;
}

export { createLyricLine, createSectionLine, isLyric, isOverCharLimit, MAX_SUBTITLE_CHARS };
