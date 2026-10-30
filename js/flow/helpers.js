/** Pure helpers for the guided form (no DOM): song names, lyric checks, choices. */

import { isSectionText, MAX_SUBTITLE_CHARS } from "../core/lyrics.js";

/** "my_song-final.mp3" → "my song final" */
export function titleFromFileName(fileName) {
  return String(fileName || "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Words phones, DAWs and messaging apps put in file names, never song titles
const GENERIC_WORDS = [
  "audio", "recording", "new recording", "voice memo", "voice", "memo", "record", "rec",
  "track", "song", "untitled", "sans titre", "nouvel enregistrement", "enregistrement",
  "mix", "mixdown", "master", "mastered", "final", "bounce", "export", "demo", "take",
  "whatsapp audio", "ptt", "aud", "img", "vid", "voice note", "sound", "music", "file",
  "beat", "instrumental", "version", "copy", "v", "ver",
];

/**
 * True when a title looks like a default file name rather than a song name:
 * "New Recording 12", "AUD-20240611-WA0003", "track 01", "final mix v3", "20241030 1012", "".
 */
export function isGenericSongName(title) {
  const raw = String(title || "").trim();
  if (!raw) return true;
  const s = raw.toLowerCase();
  // Mostly digits / dates / ids
  const letters = s.replace(/[^a-zà-ÿɛɣčḍḥṛṣṭẓǧ]/gi, "");
  if (letters.length < 2) return true;
  if (/\d{6,}/.test(s.replace(/\s/g, ""))) return true;
  // Strip generic words, numbers and separators; nothing meaningful left → generic
  let rest = ` ${s} `;
  for (const w of [...GENERIC_WORDS].sort((a, b) => b.length - a.length)) {
    rest = rest.replace(new RegExp(`(^|[\\s()\\[\\]])${w.replace(/\s/g, "\\s+")}(?=[\\s()\\[\\]\\d]|$)`, "g"), " ");
  }
  rest = rest.replace(/[\d\s()[\]#.,:+&]+/g, " ").trim();
  return rest.length < 2;
}

/** Non-empty trimmed lines of pasted text. */
export function splitLines(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * What the form needs to know about pasted lyrics.
 * @returns {{ lines: string[], lyricCount: number, sectionCount: number,
 *            longLines: Array<{ n: number, text: string }>, looksLikeParagraphs: boolean }}
 */
export function analyzeLyrics(text, maxChars = MAX_SUBTITLE_CHARS) {
  const lines = splitLines(text);
  const lyrics = lines.filter((l) => !isSectionText(l));
  const longLines = [];
  lines.forEach((l, i) => {
    if (!isSectionText(l) && l.length > maxChars) longLines.push({ n: i + 1, text: l });
  });
  const avg = lyrics.length ? lyrics.reduce((n, l) => n + l.length, 0) / lyrics.length : 0;
  return {
    lines,
    lyricCount: lyrics.length,
    sectionCount: lines.length - lyrics.length,
    longLines,
    // A few very long lines usually means verses pasted as paragraphs
    looksLikeParagraphs: lyrics.length > 0 && (avg > maxChars * 1.6 || (lyrics.length <= 3 && avg > maxChars)),
  };
}

/** Does a translation have one line per lyric line? */
export function translationMatch(lyricCount, translationText) {
  const count = splitLines(translationText).filter((l) => !isSectionText(l)).length;
  return { count, matches: count === lyricCount, diff: count - lyricCount };
}

/** What the user can export (step 4). Order is the order of the export queue. */
export const OUTPUTS = [
  { id: "srt", kind: "subtitles" },
  { id: "transparent", kind: "overlay", overlayFormat: "webm" },
  { id: "black", kind: "overlay", overlayFormat: "black" },
  { id: "green", kind: "overlay", overlayFormat: "green" },
  { id: "full", kind: "video" },
];

/** Outputs that need a rendered video (so the look step is shown). */
export function needsVideo(outputs) {
  return (outputs || []).some((id) => id !== "srt");
}

/**
 * Video settings for one output. "transparent" falls back to PNG frames when the
 * browser can't encode transparent WebM.
 */
export function outputVideoSettings(id, base = {}, { transparentWebm = true } = {}) {
  if (id === "full") return { ...base, output: "full" };
  const out = OUTPUTS.find((o) => o.id === id);
  if (!out || out.kind !== "overlay") return { ...base };
  const overlayFormat = id === "transparent" && !transparentWebm ? "png" : out.overlayFormat;
  return { ...base, output: "overlay", overlayFormat };
}

/** Lyric fonts offered in the look step (all self-hosted; Noto Sans covers Kabyle + Tifinagh). */
export const FONTS = [
  { id: "outfit", family: "Outfit", weight: 600, mood: "clean" },
  { id: "montserrat", family: "Montserrat", weight: 700, mood: "bold" },
  { id: "poppins", family: "Poppins", weight: 700, mood: "friendly" },
  { id: "bebas", family: "Bebas Neue", weight: 400, mood: "poster" },
  { id: "anton", family: "Anton", weight: 400, mood: "loud" },
  { id: "oswald", family: "Oswald", weight: 700, mood: "tall" },
  { id: "playfair", family: "Playfair Display", weight: 700, mood: "elegant" },
  { id: "dancing", family: "Dancing Script", weight: 700, mood: "handwritten" },
  { id: "caveat", family: "Caveat", weight: 700, mood: "notebook" },
  { id: "noto", family: "Noto Sans", weight: 600, mood: "everyLanguage" },
];

export const COLORS = [
  { id: "white", text: "#ffffff", translation: "#ffd8b0" },
  { id: "cream", text: "#f4ebe6", translation: "#ffb088" },
  { id: "gold", text: "#ffc861", translation: "#fff1d6" },
  { id: "ember", text: "#ff7a2f", translation: "#ffe2c8" },
  { id: "rose", text: "#ff8fb1", translation: "#ffe3ec" },
  { id: "sky", text: "#8fd3ff", translation: "#e3f4ff" },
  { id: "black", text: "#111111", translation: "#4a4a4a" },
];

export const SIZES = [
  { id: "small", fontSize: 54 },
  { id: "medium", fontSize: 72 },
  { id: "large", fontSize: 96 },
];

export const MOTIONS = ["fadeUp", "glowSweep", "typewriter", "blurIn", "smoke"];

/** Is this colour unusable on the chosen outputs (e.g. black text on a black screen)? */
export function colorClashes(colorId, outputs = []) {
  if (colorId === "black") return outputs.some((o) => o === "black" || o === "full");
  return false;
}
