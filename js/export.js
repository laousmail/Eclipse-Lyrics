/** LRC, SRT, VTT, JSON writers and import. */

import { recomputeEnds, uid, isLyric, lineMainText, lineFr, lineEn, msToSec, secToMs } from "./sync.js";
import { createLyricLine, migrateProject } from "./core/project.js";
import { triggerDownload } from "./storage.js";
import { createZip } from "./zip.js";
import { toEclipseJson } from "./projectFile.js";

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}

function lineStartSec(line) {
  if (line.startMs != null) return msToSec(line.startMs);
  if (line.start != null) return Number(line.start);
  return null;
}

function lineEndSec(line) {
  if (line.endMs != null) return msToSec(line.endMs);
  if (line.end != null) return Number(line.end);
  return null;
}

function durationMsOf(project) {
  if (project?.audio?.durationMs) return project.audio.durationMs;
  if (project?.duration) return secToMs(project.duration) || 0;
  return 0;
}

/** Round seconds → integer ms, then split with integer math (no 1000 overflow). */
export function secondsToParts(seconds) {
  let total = Math.round(Number(seconds) * 1000);
  if (!Number.isFinite(total) || total < 0) total = 0;
  const ms = total % 1000;
  const totalSec = Math.floor(total / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return { h, m, s, ms, totalMs: total };
}

export function toLrcTime(seconds) {
  // Centiseconds via integer path: round(ms/10) from total ms
  const { totalMs } = secondsToParts(seconds);
  let totalCs = Math.round(totalMs / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `[${pad(m)}:${pad(s)}.${pad(cs)}]`;
}

export function toSrtTime(seconds) {
  const { h, m, s, ms } = secondsToParts(seconds);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function toVttTime(seconds) {
  const { h, m, s, ms } = secondsToParts(seconds);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

function ensureEnds(project) {
  recomputeEnds(project.lines, durationMsOf(project));
}

function cueText(line, { includeTr, trLang }) {
  let text = lineMainText(line);
  if (includeTr) {
    const tr = trLang === "en" ? lineEn(line) : lineFr(line);
    if (tr) text += `\n${tr}`;
  }
  return text;
}

/** Normalize language mode from UI / legacy opts. */
export function resolveExportLang(opts = {}) {
  const mode = opts.languages || opts.mode || "main";
  if (mode === "main+fr" || (opts.includeTr && opts.trLang === "fr")) {
    return { includeTr: true, trLang: "fr", mode: "main+fr" };
  }
  if (mode === "main+en" || (opts.includeTr && opts.trLang === "en")) {
    return { includeTr: true, trLang: "en", mode: "main+en" };
  }
  if (mode === "separate") return { includeTr: false, trLang: "fr", mode: "separate" };
  return { includeTr: false, trLang: "fr", mode: "main" };
}

/**
 * Apply global offset, min duration, max gap to a cloned line list (ms).
 * Does not mutate the project.
 */
export function prepareExportLines(project, exportSettings = {}) {
  const offset = Math.round(Number(exportSettings.globalOffsetMs) || 0);
  // Number(undefined) is NaN, which `??` lets through, so check finiteness instead
  const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : fallback);
  const minLineMs = Math.max(0, Math.round(num(exportSettings.minLineMs, 700)));
  const maxGapMs = Math.max(0, Math.round(num(exportSettings.maxGapMs, 8000)));
  const dur = durationMsOf(project);

  const lines = (project.lines || []).map((l) => {
    if (!isLyric(l) || l.startMs == null) return { ...l, text: l.text ? { ...l.text } : l.text };
    const startMs = Math.max(0, l.startMs + offset);
    let endMs = l.endMs != null ? l.endMs + offset : null;
    return {
      ...l,
      startMs,
      endMs,
      text: l.text ? { ...l.text } : l.text,
      endManual: l.endManual,
    };
  });

  // Recompute sequential ends then enforce min duration + max gap
  recomputeEnds(lines, dur > 0 ? dur + Math.max(0, offset) : 0);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isLyric(line) || line.startMs == null) continue;
    let end = line.endMs != null ? line.endMs : line.startMs + minLineMs;
    if (end - line.startMs < minLineMs) end = line.startMs + minLineMs;
    if (maxGapMs > 0 && end - line.startMs > maxGapMs) end = line.startMs + maxGapMs;
    // Don't overrun next lyric start
    for (let j = i + 1; j < lines.length; j++) {
      if (isLyric(lines[j]) && lines[j].startMs != null) {
        end = Math.min(end, lines[j].startMs);
        break;
      }
    }
    if (end < line.startMs + 10) end = line.startMs + 10;
    line.endMs = end;
  }
  return lines;
}

function projectForExport(project, opts = {}) {
  const exportSettings = {
    ...(project.settings?.export || {}),
    ...(opts.export || {}),
    globalOffsetMs: opts.globalOffsetMs ?? project.settings?.export?.globalOffsetMs,
    minLineMs: opts.minLineMs ?? project.settings?.export?.minLineMs,
    maxGapMs: opts.maxGapMs ?? project.settings?.export?.maxGapMs,
  };
  const lines = prepareExportLines(project, exportSettings);
  return { ...project, lines };
}

export function toLRC(project, opts = {}) {
  const p = projectForExport(project, opts);
  const lines = [];
  if (p.title) lines.push(`[ti:${p.title}]`);
  if (p.artist) lines.push(`[ar:${p.artist}]`);
  lines.push("");
  for (const line of p.lines) {
    if (!isLyric(line)) continue;
    const start = lineStartSec(line);
    if (start == null) continue;
    lines.push(`${toLrcTime(start)}${lineMainText(line)}`);
  }
  return lines.join("\n") + "\n";
}

export function toSRT(project, opts = {}) {
  const lang = resolveExportLang(opts);
  const p = projectForExport(project, opts);
  const blocks = [];
  let n = 1;
  for (const line of p.lines) {
    if (!isLyric(line)) continue;
    const start = lineStartSec(line);
    if (start == null) continue;
    const end = lineEndSec(line) != null ? lineEndSec(line) : start + 3;
    const text = cueText(line, lang);
    blocks.push(`${n}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${text}\n`);
    n += 1;
  }
  return blocks.join("\n");
}

export function toVTT(project, opts = {}) {
  const lang = resolveExportLang(opts);
  const p = projectForExport(project, opts);
  const blocks = ["WEBVTT", ""];
  for (const line of p.lines) {
    if (!isLyric(line)) continue;
    const start = lineStartSec(line);
    if (start == null) continue;
    const end = lineEndSec(line) != null ? lineEndSec(line) : start + 3;
    const text = cueText(line, lang);
    blocks.push(`${toVttTime(start)} --> ${toVttTime(end)}\n${text}\n`);
  }
  return blocks.join("\n");
}

export function toTXT(project) {
  return (project.lines || [])
    .filter(isLyric)
    .map((l) => lineMainText(l))
    .filter(Boolean)
    .join("\n") + "\n";
}

/** First N cues as plain text for preview (SRT-shaped). */
export function previewCues(project, opts = {}, limit = 10) {
  const srt = toSRT(project, opts);
  const blocks = srt.trim().split(/\n\s*\n/).filter(Boolean);
  return blocks.slice(0, limit).join("\n\n") + (blocks.length > limit ? "\n\n…" : "");
}

/**
 * Lyrics JSON for laousmail.com — release entry shape + timed lyrics.
 * Matches fields used in releases.js so it can be merged into LAOUSMAIL_RELEASES.
 */
export function toLaousmailReleaseJson(project) {
  const p = projectForExport(project);
  const year = new Date().getFullYear();
  return {
    title: p.title || "",
    year,
    artist: p.artist || "laousmail",
    lang: {
      en: "Kabyle · Amazigh",
      fr: "Kabyle · Amazigh",
    },
    description: {
      en: "",
      fr: "",
    },
    lyrics: (p.lines || [])
      .filter((l) => isLyric(l) && l.startMs != null)
      .map((l) => ({
        startMs: l.startMs,
        endMs: l.endMs,
        text: {
          kab: lineMainText(l),
          fr: lineFr(l),
          en: lineEn(l),
        },
      })),
  };
}

export function toJSON(project) {
  const data = { ...project };
  delete data.audioBlob;
  delete data._peaks;
  return JSON.stringify(data, null, 2);
}

function safeBase(project) {
  const t = (project.title || "lyrics").trim() || "lyrics";
  return t.replace(/[^\p{L}\p{N}\-_ ]+/gu, "").replace(/\s+/g, "-").slice(0, 60) || "lyrics";
}

export function downloadLRC(project, opts) {
  const blob = new Blob([toLRC(project, opts)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${safeBase(project)}.lrc`);
}

export function downloadSRT(project, opts) {
  const blob = new Blob([toSRT(project, opts)], { type: "application/x-subrip;charset=utf-8" });
  triggerDownload(blob, `${safeBase(project)}.srt`);
}

export function downloadVTT(project, opts) {
  const blob = new Blob([toVTT(project, opts)], { type: "text/vtt;charset=utf-8" });
  triggerDownload(blob, `${safeBase(project)}.vtt`);
}

export function downloadJSON(project) {
  const blob = new Blob([toEclipseJson(project)], { type: "application/json;charset=utf-8" });
  triggerDownload(blob, `${safeBase(project)}.eclipse.json`);
}

export function downloadTXT(project) {
  const blob = new Blob([toTXT(project)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${safeBase(project)}.txt`);
}

export function downloadLaousmailJson(project) {
  const blob = new Blob([JSON.stringify(toLaousmailReleaseJson(project), null, 2)], {
    type: "application/json;charset=utf-8",
  });
  triggerDownload(blob, `${safeBase(project)}.releases.json`);
}

export function srtBlob(project, opts) {
  return new Blob([toSRT(project, opts)], { type: "application/x-subrip;charset=utf-8" });
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

export async function shareFiles(files, title = "Eclipse Lyrics") {
  if (!navigator.share) return false;
  try {
    if (navigator.canShare && !navigator.canShare({ files })) {
      await navigator.share({ title, text: title });
      return true;
    }
    await navigator.share({ files, title });
    return true;
  } catch (err) {
    if (err?.name === "AbortError") return false;
    throw err;
  }
}

/** ZIP of SRT + VTT + LRC + project JSON + laousmail JSON (+ per-lang if separate). */
export function downloadAllZip(project, opts = {}) {
  const base = safeBase(project);
  const lang = resolveExportLang(opts);
  const files = [
    { name: `${base}.srt`, data: toSRT(project, opts) },
    { name: `${base}.vtt`, data: toVTT(project, opts) },
    { name: `${base}.lrc`, data: toLRC(project, opts) },
    { name: `${base}.txt`, data: toTXT(project) },
    { name: `${base}.eclipse.json`, data: toEclipseJson(project) },
    { name: `${base}.releases.json`, data: JSON.stringify(toLaousmailReleaseJson(project), null, 2) },
  ];
  if (lang.mode === "separate") {
    const per = buildPerLanguageStrings(project, "srt", opts);
    for (const [name, body] of per) files.push({ name, data: body });
  }
  const zip = createZip(files);
  triggerDownload(zip, `${base}-subtitles.zip`);
}

function buildPerLanguageStrings(project, format, opts) {
  const writer = format === "vtt" ? toVTT : toSRT;
  const ext = format === "vtt" ? "vtt" : "srt";
  const base = safeBase(project);
  const out = [];
  const stripTr = (l) =>
    isLyric(l)
      ? createLyricLine({
          id: l.id,
          startMs: l.startMs,
          endMs: l.endMs,
          kab: lineMainText(l),
          endManual: l.endManual,
        })
      : l;
  const mainProj = { ...project, lines: project.lines.map(stripTr) };
  out.push([`${base}.main.${ext}`, writer(mainProj, { ...opts, languages: "main" })]);
  if (project.lines.some((l) => lineFr(l))) {
    const frProj = {
      ...project,
      lines: project.lines.map((l) =>
        isLyric(l)
          ? createLyricLine({
              id: l.id,
              startMs: l.startMs,
              endMs: l.endMs,
              kab: lineFr(l) || lineMainText(l),
              endManual: l.endManual,
            })
          : l
      ),
    };
    out.push([`${base}.fr.${ext}`, writer(frProj, { ...opts, languages: "main" })]);
  }
  if (project.lines.some((l) => lineEn(l))) {
    const enProj = {
      ...project,
      lines: project.lines.map((l) =>
        isLyric(l)
          ? createLyricLine({
              id: l.id,
              startMs: l.startMs,
              endMs: l.endMs,
              kab: lineEn(l) || lineMainText(l),
              endManual: l.endManual,
            })
          : l
      ),
    };
    out.push([`${base}.en.${ext}`, writer(enProj, { ...opts, languages: "main" })]);
  }
  return out;
}

/** Export separate files for main / fr / en where content exists. */
export function downloadPerLanguage(project, format = "srt", opts = {}) {
  for (const [name, body] of buildPerLanguageStrings(project, format, opts)) {
    triggerDownload(new Blob([body], { type: "text/plain;charset=utf-8" }), name);
  }
}

/** True when any cue body has 2+ text lines (SRT/VTT). */
export function hasMultiLineCues(text, filename = "") {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".lrc") || lower.endsWith(".json")) return false;
  const raw = text.replace(/^\uFEFF/, "").replace(/^WEBVTT[^\n]*\n/, "");
  const blocks = raw.trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const parts = block.split(/\r?\n/).filter((p) => p.trim().length);
    if (parts.length < 2) continue;
    let idx = 0;
    if (/^\d+$/.test(parts[0].trim())) idx = 1;
    if (!parts[idx]?.includes("-->")) continue;
    if (parts.slice(idx + 1).filter((p) => p.trim()).length >= 2) return true;
  }
  return false;
}

export function parseImportedProject(text, filename = "", opts = {}) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json") || text.trim().startsWith("{")) {
    const data = JSON.parse(text);
    if (!Array.isArray(data.lines)) throw new Error("Invalid project JSON");
    return migrateProject(data);
  }
  if (lower.endsWith(".lrc") || /^\s*\[(\d{2}):/.test(text) || text.includes("[ti:")) {
    return importLRC(text);
  }
  if (lower.endsWith(".vtt") || text.trim().startsWith("WEBVTT")) {
    return importVTT(text, opts);
  }
  return importSRT(text, opts);
}

/** Parse (hh:)?mm:ss[,.]mmm → seconds. */
export function parseCueTime(raw) {
  const m = String(raw)
    .trim()
    .match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!m) return null;
  const h = m[1] != null ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const fracRaw = m[4];
  const ms =
    fracRaw.length === 3
      ? Number(fracRaw)
      : fracRaw.length === 2
        ? Number(fracRaw) * 10
        : Number(fracRaw) * 100;
  return h * 3600 + min * 60 + sec + ms / 1000;
}

function importLRC(text) {
  const lines = [];
  let title = "";
  let artist = "";
  let offsetMs = 0;
  for (const raw of text.split(/\r?\n/)) {
    const ti = raw.match(/^\[ti:(.*)\]$/i);
    if (ti) {
      title = ti[1].trim();
      continue;
    }
    const ar = raw.match(/^\[ar:(.*)\]$/i);
    if (ar) {
      artist = ar[1].trim();
      continue;
    }
    const off = raw.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (off) {
      offsetMs = Number(off[1]) || 0;
      continue;
    }
    // One or more leading timestamps, then lyric text
    const tsRe = /\[(\d{1,3}):(\d{2})\.(\d{2,3})\]/g;
    const stamps = [];
    let match;
    let lastIndex = 0;
    while ((match = tsRe.exec(raw)) && match.index === lastIndex) {
      const min = Number(match[1]);
      const sec = Number(match[2]);
      const frac = match[3].length === 3 ? Number(match[3]) / 1000 : Number(match[3]) / 100;
      stamps.push(min * 60 + sec + frac);
      lastIndex = match.index + match[0].length;
    }
    if (!stamps.length) continue;
    const lyric = raw.slice(lastIndex).trim();
    for (const start of stamps) {
      lines.push(
        createLyricLine({
          startMs: Math.round((start + offsetMs / 1000) * 1000),
          kab: lyric,
        })
      );
    }
  }
  lines.sort((a, b) => (a.startMs || 0) - (b.startMs || 0));
  recomputeEnds(lines, 0);
  return migrateProject({ title, artist, lines, settings: {} });
}

function importSRT(text, opts = {}) {
  const secondLineIsTranslation = Boolean(opts.secondLineIsTranslation);
  const blocks = text.replace(/^\uFEFF/, "").trim().split(/\n\s*\n/);
  const lines = [];
  for (const block of blocks) {
    const parts = block.split(/\r?\n/).filter((p) => p.trim().length);
    if (parts.length < 2) continue;
    let idx = 0;
    if (/^\d+$/.test(parts[0].trim())) idx = 1;
    const timeLine = parts[idx];
    if (!timeLine || !timeLine.includes("-->")) continue;
    const [left, right] = timeLine.split("-->").map((s) => s.trim().split(/\s+/)[0]);
    const start = parseCueTime(left);
    const end = parseCueTime(right);
    if (start == null || end == null) continue;
    const body = parts.slice(idx + 1).map((s) => s.trim()).filter(Boolean);
    let text = "";
    let fr = "";
    if (secondLineIsTranslation && body.length >= 2) {
      text = body[0];
      fr = body[1];
      if (body.length > 2) text = [body[0], ...body.slice(2)].join("\n");
    } else {
      text = body.join("\n");
    }
    lines.push(
      createLyricLine({
        startMs: secToMs(start),
        endMs: secToMs(end),
        kab: text,
        fr,
      })
    );
  }
  return migrateProject({ title: "", artist: "", lines, settings: {} });
}

function importVTT(text, opts = {}) {
  const cleaned = text
    .replace(/^\uFEFF/, "")
    .replace(/^WEBVTT[^\n]*\n/, "")
    .replace(/^(NOTE|STYLE|REGION)[\s\S]*?(?:\n\n|$)/gm, "\n");
  return importSRT(cleaned, opts);
}
