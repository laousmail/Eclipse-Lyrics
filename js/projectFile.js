/** Project file v2 (.eclipse.json) and optional audio bundle (.eclipselyrics zip). */

import { migrateProject, projectId, audioId } from "./core/project.js";
import { createZip, readZip } from "./zip.js";
import { triggerDownload } from "./storage.js";

function safeBase(project) {
  const t = (project.title || project.audio?.fileName || "project").trim() || "project";
  return (
    t
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[^\p{L}\p{N}\-_ ]+/gu, "")
      .replace(/\s+/g, "-")
      .slice(0, 60) || "project"
  );
}

/** Serialize project for .eclipse.json (no blob). */
export function toEclipseJson(project) {
  const p = migrateProject(project);
  const data = {
    version: 2,
    id: p.id,
    title: p.title,
    artist: p.artist,
    audio: {
      fileName: p.audio?.fileName || "",
      durationMs: p.audio?.durationMs || 0,
      storedAudioId: p.audio?.storedAudioId || "",
      waveformThumb: Array.isArray(p.audio?.waveformThumb) ? p.audio.waveformThumb : undefined,
    },
    languages: p.languages,
    lines: p.lines,
    settings: p.settings,
    lastScreen: p.lastScreen,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
  return JSON.stringify(data, null, 2);
}

export function downloadEclipseJson(project) {
  const blob = new Blob([toEclipseJson(project)], { type: "application/json;charset=utf-8" });
  triggerDownload(blob, `${safeBase(project)}.eclipse.json`);
}

/**
 * Bundle project + optional audio as .eclipselyrics (zip).
 * @param {object} project
 * @param {Blob|null} audioBlob
 */
export async function downloadEclipseBundle(project, audioBlob) {
  const files = [{ name: "project.eclipse.json", data: toEclipseJson(project) }];
  if (audioBlob) {
    const ext = guessExt(project.audio?.fileName || audioBlob.type || "audio.mp3");
    const bytes = new Uint8Array(await audioBlob.arrayBuffer());
    files.push({ name: `audio${ext}`, data: bytes });
    files.push({
      name: "meta.json",
      data: JSON.stringify({
        audioFileName: project.audio?.fileName || `audio${ext}`,
        audioEntry: `audio${ext}`,
      }),
    });
  }
  const zip = createZip(files);
  triggerDownload(zip, `${safeBase(project)}.eclipselyrics`);
}

function guessExt(nameOrType) {
  const s = String(nameOrType).toLowerCase();
  if (s.includes("wav") || s.endsWith(".wav")) return ".wav";
  if (s.includes("ogg") || s.endsWith(".ogg")) return ".ogg";
  if (s.includes("m4a") || s.endsWith(".m4a") || s.includes("mp4")) return ".m4a";
  if (s.endsWith(".mp3") || s.includes("mpeg")) return ".mp3";
  if (s.startsWith(".")) return s;
  return ".mp3";
}

/**
 * Parse dropped .eclipse.json / .json / .eclipselyrics / .zip
 * @returns {Promise<{ project: object, audioBlob?: Blob, audioFileName?: string }>}
 */
export async function importProjectFile(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".eclipselyrics") || name.endsWith(".zip")) {
    const entries = await readZip(file);
    const jsonBytes =
      entries.get("project.eclipse.json") ||
      [...entries.entries()].find(([k]) => k.endsWith(".json") && k !== "meta.json")?.[1];
    if (!jsonBytes) throw new Error("Bundle missing project.eclipse.json");
    const text = new TextDecoder().decode(jsonBytes);
    const project = migrateProject(JSON.parse(text));
    project.id = projectId();
    if (!project.audio) project.audio = { fileName: "", durationMs: 0, storedAudioId: "" };
    project.audio.storedAudioId = audioId();

    let meta = {};
    const metaBytes = entries.get("meta.json");
    if (metaBytes) {
      try {
        meta = JSON.parse(new TextDecoder().decode(metaBytes));
      } catch {
        meta = {};
      }
    }
    const audioName = meta.audioEntry || [...entries.keys()].find((k) => k.startsWith("audio."));
    let audioBlob = null;
    let audioFileName = meta.audioFileName || project.audio.fileName || "";
    if (audioName && entries.has(audioName)) {
      const bytes = entries.get(audioName);
      const type = mimeFromName(audioName);
      audioBlob = new Blob([bytes], { type });
      if (!audioFileName) audioFileName = audioName;
      project.audio.fileName = audioFileName;
    }
    return { project, audioBlob, audioFileName };
  }

  const text = await file.text();
  const data = JSON.parse(text);
  const project = migrateProject(data);
  project.id = projectId();
  if (!project.audio) project.audio = { fileName: "", durationMs: 0, storedAudioId: "" };
  project.audio.storedAudioId = audioId();
  return { project };
}

function mimeFromName(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  return "audio/mpeg";
}

/** Compact waveform thumb (0–1) from peak buffer. */
export function peaksToThumb(peaks, count = 48) {
  if (!peaks?.length) return [];
  const stride = 3;
  const pairCount = Math.floor(peaks.length / stride);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor((i / count) * pairCount);
    const b = Math.floor(((i + 1) / count) * pairCount);
    let max = 0;
    for (let j = a; j < b; j++) {
      const rms = peaks[j * stride + 2] || 0;
      if (rms > max) max = rms;
    }
    out.push(Math.round(max * 1000) / 1000);
  }
  return out;
}
