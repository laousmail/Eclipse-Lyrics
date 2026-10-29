/** Lyric editor helpers: sections, grid rows, length warnings. */

import { createLyricLine, createSectionLine, lineMainText, isLyric } from "./project.js";

export const SECTION_RE = /^\[([^\]]+)\]\s*$/;
export const MAX_SUBTITLE_CHARS = 42;
export const KABYLE_CHARS = ["ɛ", "ɣ", "č", "ḍ", "ḥ", "ṛ", "ṣ", "ṭ", "ẓ", "ǧ"];

export function isSectionText(text) {
  return SECTION_RE.test(String(text || "").trim());
}

export function sectionLabel(text) {
  const m = String(text || "").trim().match(SECTION_RE);
  return m ? m[1].trim() : "";
}

/** Parse pasted main lines into lyric + section line objects.
 * FR/EN arrays are lyric-aligned (skip section rows in main).
 */
export function parseLinesWithSections(mainLines, frLines = [], enLines = []) {
  const out = [];
  let lyricIdx = 0;
  for (const raw of mainLines) {
    const text = String(raw || "").trim();
    if (!text) continue;
    if (isSectionText(text)) {
      out.push(createSectionLine({ label: sectionLabel(text) }));
    } else {
      out.push(
        createLyricLine({
          kab: text,
          fr: frLines[lyricIdx] || "",
          en: enLines[lyricIdx] || "",
        })
      );
      lyricIdx += 1;
    }
  }
  return out;
}

export function lineCharCount(line) {
  return lineMainText(line).length;
}

export function isOverCharLimit(line, limit = MAX_SUBTITLE_CHARS) {
  return isLyric(line) && lineCharCount(line) > limit;
}

/** Mismatch when FR or EN has a non-empty cell but different non-empty count vs main. */
export function rowMismatch(main, fr, en) {
  const m = String(main || "").trim();
  const f = String(fr || "").trim();
  const e = String(en || "").trim();
  if (!m && (f || e)) return true;
  return false;
}

export function splitLineText(text, at) {
  const s = String(text || "");
  const i = Math.max(0, Math.min(s.length, at));
  const left = s.slice(0, i).trim();
  const right = s.slice(i).trim();
  return [left, right];
}

export function exportableLines(lines) {
  return (lines || []).filter(isLyric);
}

const GRID_COLS = ["main", "fr", "en"];

/**
 * Multi-line paste into the lyric grid (inputs drop newlines on their own).
 * Main column: line 1 goes into the focused cell, the rest become new rows below.
 * FR/EN column: lines fill that column down the following lyric rows (sections
 * skipped), adding rows when the song runs out.
 * Tab-separated lines (copied from a sheet) spread across the columns.
 *
 * @returns {{ rows: Array<{main:string,fr:string,en:string}>, added: number, last: number, count: number } | null}
 *   null when the text has a single line (let the input paste normally).
 */
export function pasteIntoRows(rows, { index = 0, col = "main", text = "", before = "", after = "" } = {}) {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim());
  if (lines.length < 2 && !/\t/.test(lines[0] || "")) return null;

  const out = rows.map((r) => ({ main: r.main || "", fr: r.fr || "", en: r.en || "" }));
  const startCol = Math.max(0, GRID_COLS.indexOf(col));
  const cellsOf = (line) => line.split("\t").map((c) => c.trim());
  const put = (row, cells, first) => {
    cells.slice(0, GRID_COLS.length - startCol).forEach((cell, k) => {
      const key = GRID_COLS[startCol + k];
      row[key] = first && k === 0 ? `${before}${cell}${after}` : cell;
    });
  };
  const empty = () => ({ main: "", fr: "", en: "" });
  let at = Math.max(0, Math.min(index, out.length - 1));
  if (!out.length) out.push(empty());
  let added = 0;

  if (startCol === 0) {
    lines.forEach((line, k) => {
      if (k === 0) {
        put(out[at], cellsOf(line), true);
        return;
      }
      const row = empty();
      put(row, cellsOf(line), false);
      at += 1;
      out.splice(at, 0, row);
      added += 1;
    });
    return { rows: out, added, last: at, count: lines.length };
  }

  lines.forEach((line, k) => {
    if (k > 0) {
      at += 1;
      while (at < out.length && isSectionText(out[at].main)) at += 1;
    }
    if (at >= out.length) {
      out.push(empty());
      added += 1;
    }
    put(out[at], cellsOf(line), k === 0);
  });
  return { rows: out, added, last: at, count: lines.length };
}
