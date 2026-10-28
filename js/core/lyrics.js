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

/** Parse pasted main lines into lyric + section line objects. */
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
