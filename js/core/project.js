/** Project model v2 (integer ms) + migration from v1. */

let idCounter = 0;

export function uid(prefix = "L") {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}_${idCounter}`;
}

export function projectId() {
  return uid("p_");
}

export function audioId() {
  return uid("a_");
}

export function secToMs(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return null;
  return Math.round(Number(seconds) * 1000);
}

export function msToSec(ms) {
  if (ms == null || Number.isNaN(Number(ms))) return null;
  return Number(ms) / 1000;
}

export function lineMainText(line) {
  if (!line) return "";
  if (line.type === "section") return line.label || "";
  if (line.text && typeof line.text === "object") {
    return line.text.kab || line.text.main || "";
  }
  return String(line.text || "");
}

export function lineFr(line) {
  if (!line) return "";
  if (line.text && typeof line.text === "object") return line.text.fr || "";
  return String(line.fr || "");
}

export function lineEn(line) {
  if (!line) return "";
  if (line.text && typeof line.text === "object") return line.text.en || "";
  return String(line.en || "");
}

export function isLyric(line) {
  return !line || line.type !== "section";
}

export function createEmptyProject() {
  const now = Date.now();
  return {
    version: 2,
    id: projectId(),
    title: "",
    artist: "",
    audio: {
      fileName: "",
      durationMs: 0,
      storedAudioId: "",
    },
    languages: ["kab", "fr", "en"],
    lines: [],
    settings: {
      tapOffsetMs: -150,
      translationLang: "fr",
      includeTranslationInExport: false,
      playbackRate: 1,
      export: {
        languages: "main", // main | main+fr | main+en | separate
        globalOffsetMs: 0,
        minLineMs: 700,
        maxGapMs: 8000,
      },
      video: {
        aspect: "1080x1920",
        style: "fadeUp",
        background: "eclipse",
        blur: 8,
        darken: 45,
        zoom: true,
        showTranslation: false,
        translationLang: "fr",
        template: "eclipse",
      },
    },
    lastScreen: "audio",
    createdAt: now,
    updatedAt: now,
  };
}

export function createLyricLine({
  id,
  startMs = null,
  endMs = null,
  kab = "",
  fr = "",
  en = "",
  endManual = false,
  words = [],
} = {}) {
  return {
    id: id || uid("L"),
    type: "lyric",
    startMs: startMs == null ? null : Math.round(startMs),
    endMs: endMs == null ? null : Math.round(endMs),
    text: { kab: kab || "", fr: fr || "", en: en || "" },
    words: Array.isArray(words) ? words : [],
    endManual: Boolean(endManual),
  };
}

export function createSectionLine({ id, label = "Section" } = {}) {
  return {
    id: id || uid("S"),
    type: "section",
    label: String(label || "Section"),
  };
}

/** Detect v1 (seconds, flat text) vs v2. */
export function isV2Project(data) {
  return Boolean(data && Number(data.version) >= 2 && data.audio && typeof data.audio === "object");
}

/**
 * Migrate v1 localStorage / import shapes to v2.
 * Safe to call on already-v2 projects (returns normalized clone).
 */
export function migrateProject(raw) {
  if (!raw || typeof raw !== "object") return createEmptyProject();
  if (isV2Project(raw)) return normalizeV2(raw);

  const base = createEmptyProject();
  const durationMs =
    secToMs(raw.duration) ??
    (typeof raw.durationMs === "number" ? Math.round(raw.durationMs) : 0) ??
    0;

  const lines = (Array.isArray(raw.lines) ? raw.lines : []).map((l) => {
    if (l?.type === "section") {
      return createSectionLine({ id: l.id, label: l.label || l.text || "Section" });
    }
    // Already partially ms-shaped
    if (l && (l.startMs != null || (l.text && typeof l.text === "object"))) {
      return createLyricLine({
        id: l.id,
        startMs: l.startMs ?? secToMs(l.start),
        endMs: l.endMs ?? secToMs(l.end),
        kab: l.text?.kab ?? l.text?.main ?? (typeof l.text === "string" ? l.text : "") ?? "",
        fr: l.text?.fr ?? l.fr ?? "",
        en: l.text?.en ?? l.en ?? "",
        endManual: Boolean(l.endManual),
        words: l.words,
      });
    }
    return createLyricLine({
      id: l?.id,
      startMs: secToMs(l?.start),
      endMs: secToMs(l?.end),
      kab: typeof l?.text === "string" ? l.text : "",
      fr: l?.fr || "",
      en: l?.en || "",
      endManual: Boolean(l?.endManual),
    });
  });

  const video = {
    ...base.settings.video,
    ...(raw.settings?.video || {}),
  };

  return {
    ...base,
    id: raw.id || base.id,
    title: raw.title || "",
    artist: raw.artist || "",
    audio: {
      fileName: raw.audioFileName || raw.audio?.fileName || "",
      durationMs: durationMs || 0,
      storedAudioId: raw.audio?.storedAudioId || base.audio.storedAudioId || audioId(),
    },
    languages: Array.isArray(raw.languages) ? raw.languages : base.languages,
    lines,
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      tapOffsetMs:
        raw.settings?.tapOffsetMs != null
          ? Number(raw.settings.tapOffsetMs)
          : base.settings.tapOffsetMs,
      translationLang: raw.settings?.translationLang || "fr",
      includeTranslationInExport: Boolean(raw.settings?.includeTranslationInExport),
      playbackRate: Number(raw.settings?.playbackRate) || 1,
      export: {
        ...base.settings.export,
        ...(raw.settings?.export || {}),
      },
      video,
    },
    lastScreen: raw.lastScreen || "audio",
    createdAt: raw.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

function normalizeV2(raw) {
  const base = createEmptyProject();
  return {
    ...base,
    ...raw,
    version: 2,
    id: raw.id || base.id,
    audio: {
      ...base.audio,
      ...(raw.audio || {}),
      durationMs: Math.round(Number(raw.audio?.durationMs) || 0),
      fileName: raw.audio?.fileName || "",
      storedAudioId: raw.audio?.storedAudioId || audioId(),
    },
    lines: (raw.lines || []).map((l) => {
      if (l?.type === "section") return createSectionLine({ id: l.id, label: l.label });
      return createLyricLine({
        id: l.id,
        startMs: l.startMs,
        endMs: l.endMs,
        kab: l.text?.kab ?? "",
        fr: l.text?.fr ?? "",
        en: l.text?.en ?? "",
        endManual: Boolean(l.endManual),
        words: l.words,
      });
    }),
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      export: { ...base.settings.export, ...(raw.settings?.export || {}) },
      video: { ...base.settings.video, ...(raw.settings?.video || {}) },
    },
    updatedAt: Date.now(),
  };
}

/** Duration in seconds (for audio / waveform APIs). */
export function durationSec(project) {
  return msToSec(project?.audio?.durationMs) || 0;
}

/** Set duration from seconds (audio load). */
export function setDurationSec(project, seconds) {
  if (!project.audio) project.audio = { fileName: "", durationMs: 0, storedAudioId: audioId() };
  project.audio.durationMs = secToMs(seconds) || 0;
  project.updatedAt = Date.now();
  return project;
}

/**
 * Legacy-compatible view of a lyric line for code still using .start/.text/.fr.
 * Returns a shallow proxy-like plain object (not live).
 */
export function toLegacyLine(line) {
  if (!line) return null;
  if (line.type === "section") {
    return {
      id: line.id,
      type: "section",
      start: null,
      end: null,
      text: line.label || "",
      fr: "",
      en: "",
      endManual: false,
    };
  }
  return {
    id: line.id,
    type: "lyric",
    start: msToSec(line.startMs),
    end: msToSec(line.endMs),
    text: lineMainText(line),
    fr: lineFr(line),
    en: lineEn(line),
    endManual: Boolean(line.endManual),
    startMs: line.startMs,
    endMs: line.endMs,
  };
}

export function toLegacyProject(project) {
  const p = migrateProject(project);
  return {
    ...p,
    audioFileName: p.audio.fileName,
    duration: durationSec(p),
    lines: p.lines.map(toLegacyLine),
  };
}
