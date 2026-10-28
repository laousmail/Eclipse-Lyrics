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

export function parseImportedProject(text, filename = "") {
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
    return importVTT(text);
  }
  return importSRT(text);
}

function importLRC(text) {
  const lines = [];
  let title = "";
  let artist = "";
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
    const m = raw.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)$/);
    if (!m) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const frac = m[3].length === 3 ? Number(m[3]) / 1000 : Number(m[3]) / 100;
    lines.push({
      id: uid(),
      start: min * 60 + sec + frac,
      end: null,
      text: m[4].trim(),
      fr: "",
      en: "",
    });
  }
  recomputeEnds(lines);
  return { title, artist, audioFileName: "", duration: 0, lines, settings: {} };
}

function importSRT(text) {
  const blocks = text.replace(/^\uFEFF/, "").trim().split(/\n\s*\n/);
  const lines = [];
  for (const block of blocks) {
    const parts = block.split(/\r?\n/).filter(Boolean);
    if (parts.length < 2) continue;
    let idx = 0;
    if (/^\d+$/.test(parts[0])) idx = 1;
    const timeLine = parts[idx];
    const tm = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!tm) continue;
    const start =
      Number(tm[1]) * 3600 + Number(tm[2]) * 60 + Number(tm[3]) + Number(tm[4]) / 1000;
    const end =
      Number(tm[5]) * 3600 + Number(tm[6]) * 60 + Number(tm[7]) + Number(tm[8]) / 1000;
    const body = parts.slice(idx + 1);
    lines.push({
      id: uid(),
      start,
      end,
      text: body[0] || "",
      fr: body[1] || "",
      en: "",
    });
  }
  return { title: "", artist: "", audioFileName: "", duration: 0, lines, settings: {} };
}

function importVTT(text) {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/^WEBVTT[^\n]*\n/, "");
  return importSRT(cleaned);
}
