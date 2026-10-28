/** LRC, SRT, VTT, JSON writers and import. */

import { recomputeEnds, uid } from "./sync.js";
import { triggerDownload } from "./storage.js";

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
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
  recomputeEnds(project.lines, project.duration || 0);
}

function cueText(line, { includeTr, trLang }) {
  let text = line.text;
  if (includeTr) {
    const tr = trLang === "en" ? line.en : line.fr;
    if (tr) text += `\n${tr}`;
  }
  return text;
}

export function toLRC(project) {
  ensureEnds(project);
  const lines = [];
  if (project.title) lines.push(`[ti:${project.title}]`);
  if (project.artist) lines.push(`[ar:${project.artist}]`);
  lines.push("");
  for (const line of project.lines) {
    if (line.start == null) continue;
    lines.push(`${toLrcTime(line.start)}${line.text}`);
  }
  return lines.join("\n") + "\n";
}

export function toSRT(project, opts = {}) {
  ensureEnds(project);
  const blocks = [];
  let n = 1;
  for (const line of project.lines) {
    if (line.start == null) continue;
    const end = line.end != null ? line.end : line.start + 3;
    const text = cueText(line, opts);
    blocks.push(`${n}\n${toSrtTime(line.start)} --> ${toSrtTime(end)}\n${text}\n`);
    n += 1;
  }
  return blocks.join("\n");
}

export function toVTT(project, opts = {}) {
  ensureEnds(project);
  const blocks = ["WEBVTT", ""];
  for (const line of project.lines) {
    if (line.start == null) continue;
    const end = line.end != null ? line.end : line.start + 3;
    const text = cueText(line, opts);
    blocks.push(`${toVttTime(line.start)} --> ${toVttTime(end)}\n${text}\n`);
  }
  return blocks.join("\n");
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

export function downloadLRC(project) {
  const blob = new Blob([toLRC(project)], { type: "text/plain;charset=utf-8" });
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
  const blob = new Blob([toJSON(project)], { type: "application/json;charset=utf-8" });
  triggerDownload(blob, `${safeBase(project)}.json`);
}

/** Export separate files for main / fr / en where content exists. */
export function downloadPerLanguage(project, format = "srt") {
  const writer = format === "vtt" ? toVTT : toSRT;
  const ext = format === "vtt" ? "vtt" : "srt";
  const base = safeBase(project);

  const mainProj = {
    ...project,
    lines: project.lines.map((l) => ({ ...l, fr: "", en: "" })),
  };
  triggerDownload(
    new Blob([writer(mainProj, { includeTr: false })], { type: "text/plain;charset=utf-8" }),
    `${base}.main.${ext}`
  );

  if (project.lines.some((l) => l.fr)) {
    const frProj = {
      ...project,
      lines: project.lines.map((l) => ({ ...l, text: l.fr || l.text, fr: "", en: "" })),
    };
    triggerDownload(
      new Blob([writer(frProj, { includeTr: false })], { type: "text/plain;charset=utf-8" }),
      `${base}.fr.${ext}`
    );
  }
  if (project.lines.some((l) => l.en)) {
    const enProj = {
      ...project,
      lines: project.lines.map((l) => ({ ...l, text: l.en || l.text, fr: "", en: "" })),
    };
    triggerDownload(
      new Blob([writer(enProj, { includeTr: false })], { type: "text/plain;charset=utf-8" }),
      `${base}.en.${ext}`
    );
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
    return data;
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
      lines.push({
        id: uid(),
        start: start + offsetMs / 1000,
        end: null,
        text: lyric,
        fr: "",
        en: "",
      });
    }
  }
  lines.sort((a, b) => a.start - b.start);
  recomputeEnds(lines);
  return { title, artist, audioFileName: "", duration: 0, lines, settings: {} };
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
    lines.push({
      id: uid(),
      start,
      end,
      text,
      fr,
      en: "",
    });
  }
  return { title: "", artist: "", audioFileName: "", duration: 0, lines, settings: {} };
}

function importVTT(text, opts = {}) {
  const cleaned = text
    .replace(/^\uFEFF/, "")
    .replace(/^WEBVTT[^\n]*\n/, "")
    .replace(/^(NOTE|STYLE|REGION)[\s\S]*?(?:\n\n|$)/gm, "\n");
  return importSRT(cleaned, opts);
}
