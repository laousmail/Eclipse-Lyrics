/** Tap-to-sync logic, nudging, undo, line helpers. */

let idCounter = 0;

export function uid() {
  idCounter += 1;
  return `L${Date.now().toString(36)}_${idCounter}`;
}

export function createEmptyProject() {
  return {
    title: "",
    artist: "",
    audioFileName: "",
    duration: 0,
    lines: [],
    settings: {
      translationLang: "fr",
      includeTranslationInExport: false,
      playbackRate: 1,
      video: {
        aspect: "1080x1920",
        style: "fadeUp",
        background: "eclipse",
        blur: 8,
        darken: 45,
        zoom: true,
        showTranslation: false,
        translationLang: "fr",
      },
    },
  };
}

export function parseLyricText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function applyLyrics(project, mainText, frText, enText) {
  const main = parseLyricText(mainText);
  const fr = parseLyricText(frText);
  const en = parseLyricText(enText);

  const warnings = [];
  if (fr.length && fr.length !== main.length) {
    warnings.push(`French has ${fr.length} lines, main has ${main.length}.`);
  }
  if (en.length && en.length !== main.length) {
    warnings.push(`English has ${en.length} lines, main has ${main.length}.`);
  }

  // Preserve timings when line count matches and texts align by index where possible
  const prev = project.lines || [];
  const lines = main.map((text, i) => {
    const old = prev[i];
    return {
      id: old?.id || uid(),
      start: old && old.text === text ? old.start : old?.start ?? null,
      end: old && old.text === text ? old.end : old?.end ?? null,
      text,
      fr: fr[i] || "",
      en: en[i] || "",
    };
  });

  // Recompute ends from next starts
  recomputeEnds(lines, project.duration);

  return { lines, warnings, main, fr, en };
}

export function recomputeEnds(lines, duration = 0) {
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    if (lines[i].start == null) {
      lines[i].end = null;
      continue;
    }
    if (next && next.start != null) {
      lines[i].end = next.start;
    } else if (duration > 0) {
      lines[i].end = duration;
    } else {
      lines[i].end = lines[i].start + 3;
    }
  }
  return lines;
}

export function tapLine(project, lineIndex, time) {
  const lines = project.lines;
  if (lineIndex < 0 || lineIndex >= lines.length) return null;

  const t = snapTime(time);
  const prevState = snapshotTimings(lines);

  lines[lineIndex].start = t;
  if (lineIndex > 0 && lines[lineIndex - 1].start != null) {
    lines[lineIndex - 1].end = t;
  }
  recomputeEnds(lines, project.duration);

  return { prevState, nextIndex: Math.min(lineIndex + 1, lines.length - 1) };
}

export function undoTimings(lines, prevState) {
  if (!prevState) return;
  for (let i = 0; i < lines.length; i++) {
    if (prevState[i]) {
      lines[i].start = prevState[i].start;
      lines[i].end = prevState[i].end;
    }
  }
}

export function snapshotTimings(lines) {
  return lines.map((l) => ({ start: l.start, end: l.end }));
}

export function nudgeLine(project, lineIndex, delta) {
  const line = project.lines[lineIndex];
  if (!line || line.start == null) return;
  line.start = snapTime(Math.max(0, line.start + delta));
  recomputeEnds(project.lines, project.duration);
}

export function setLineStart(project, lineIndex, time) {
  const line = project.lines[lineIndex];
  if (!line) return;
  line.start = snapTime(Math.max(0, time));
  recomputeEnds(project.lines, project.duration);
}

export function snapTime(t, step = 0.01) {
  return Math.round(t / step) * step;
}

export function lineAtTime(lines, time) {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.start == null) continue;
    if (time >= l.start) active = i;
    else break;
  }
  return active;
}

export function firstUntimedIndex(lines) {
  const i = lines.findIndex((l) => l.start == null);
  return i === -1 ? Math.max(0, lines.length - 1) : i;
}

export function formatTime(seconds, { millis = false } = {}) {
  if (seconds == null || Number.isNaN(seconds)) return "--:--";
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (millis) {
    const whole = Math.floor(sec);
    const ms = Math.round((sec - whole) * 1000);
    return `${m}:${String(whole).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }
  const whole = Math.floor(sec);
  const cs = Math.round((sec - whole) * 100);
  return `${m}:${String(whole).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function timedLines(lines) {
  return lines.filter((l) => l.start != null);
}
