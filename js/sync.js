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

/** Longest common subsequence indices: equal strings only. */
export function lcsIndexMap(oldTexts, newTexts) {
  const n = oldTexts.length;
  const m = newTexts.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldTexts[i - 1] === newTexts[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const newToOld = Array(m).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (oldTexts[i - 1] === newTexts[j - 1]) {
      newToOld[j - 1] = i - 1;
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i -= 1;
    else j -= 1;
  }
  return newToOld;
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

  const prev = project.lines || [];
  const map = lcsIndexMap(
    prev.map((l) => l.text),
    main
  );
  const usedOld = new Set(map.filter((idx) => idx >= 0));

  let changed = 0;
  let added = 0;

  const lines = main.map((text, i) => {
    let oldIdx = map[i];
    let kind = "match";
    if (oldIdx < 0) {
      // Edited line staying in the same slot (old index unused by LCS)
      if (prev[i] && !usedOld.has(i)) {
        oldIdx = i;
        usedOld.add(i);
        kind = "edit";
      } else {
        kind = "add";
      }
    }

    const old = oldIdx >= 0 ? prev[oldIdx] : null;
    if (kind === "edit") changed += 1;
    if (kind === "add") added += 1;
    if (kind === "match" && old && old.text !== text) changed += 1;

    return {
      id: old?.id || uid(),
      // Exact LCS match or same-slot edit keeps timing; pure inserts are untimed
      start: kind === "add" ? null : (old?.start ?? null),
      end: kind === "add" ? null : (old?.end ?? null),
      text,
      fr: fr[i] || "",
      en: en[i] || "",
    };
  });

  recomputeEnds(lines, project.duration);

  return { lines, warnings, main, fr, en, changed, added };
}

export function recomputeEnds(lines, duration = 0) {
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    if (lines[i].start == null) {
      lines[i].end = null;
      continue;
    }
    // Preserve manually set end on the last line (B5)
    if (lines[i].endManual && i === lines.length - 1) continue;
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
  if (!lines.length) return null;

  const t = snapTime(time);
  const prevState = snapshotTimings(lines);
  const allStarted = lines.every((l) => l.start != null);
  const last = lines[lines.length - 1];

  // After every line has a start, next tap sets the last line's end, then done
  if (allStarted) {
    if (last.endManual) {
      return { prevState, nextIndex: lines.length, done: true, noop: true };
    }
    const minEnd = last.start + 0.01;
    last.end = Math.max(minEnd, t);
    last.endManual = true;
    return { prevState, nextIndex: lines.length, done: true, setEnd: true };
  }

  if (lineIndex < 0 || lineIndex >= lines.length) return null;

  lines[lineIndex].start = t;
  lines[lineIndex].endManual = false;
  if (lineIndex > 0 && lines[lineIndex - 1].start != null && !lines[lineIndex - 1].endManual) {
    lines[lineIndex - 1].end = t;
  }
  recomputeEnds(lines, project.duration);

  const nextUntimed = lines.findIndex((l) => l.start == null);
  if (nextUntimed === -1) {
    return { prevState, nextIndex: lines.length - 1, awaitingEnd: true };
  }
  return { prevState, nextIndex: nextUntimed };
}

export function undoTimings(lines, prevState) {
  if (!prevState) return;
  for (let i = 0; i < lines.length; i++) {
    if (prevState[i]) {
      lines[i].start = prevState[i].start;
      lines[i].end = prevState[i].end;
      lines[i].endManual = prevState[i].endManual || false;
    }
  }
}

export function snapshotTimings(lines) {
  return lines.map((l) => ({ start: l.start, end: l.end, endManual: Boolean(l.endManual) }));
}

/** Neighbour clamp so markers never cross (±10 ms gap). */
export function clampLineStart(lines, lineIndex, time, duration = 0) {
  const GAP = 0.01; // 10 ms
  let min = 0;
  let max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
  for (let i = lineIndex - 1; i >= 0; i--) {
    if (lines[i]?.start != null) {
      min = lines[i].start + GAP;
      break;
    }
  }
  for (let i = lineIndex + 1; i < lines.length; i++) {
    if (lines[i]?.start != null) {
      max = lines[i].start - GAP;
      break;
    }
  }
  if (max < min) max = min;
  const t = Math.max(min, Math.min(max, time));
  return snapTime(Math.max(0, t));
}

export function nudgeLine(project, lineIndex, delta) {
  const line = project.lines[lineIndex];
  if (!line || line.start == null) return;
  line.start = clampLineStart(project.lines, lineIndex, line.start + delta, project.duration);
  recomputeEnds(project.lines, project.duration);
}

export function setLineStart(project, lineIndex, time) {
  const line = project.lines[lineIndex];
  if (!line) return;
  line.start = clampLineStart(project.lines, lineIndex, time, project.duration);
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

/** Tap pointer: untimed line, or lines.length when awaiting/done last end. */
export function nextTapIndex(lines) {
  const untimed = lines.findIndex((l) => l.start == null);
  if (untimed !== -1) return untimed;
  if (!lines.length) return 0;
  const last = lines[lines.length - 1];
  if (last.start != null && !last.endManual) return lines.length; // awaiting end tap
  return lines.length; // done
}

export function isSyncComplete(lines) {
  return lines.length > 0 && lines.every((l) => l.start != null) && Boolean(lines.at(-1)?.endManual);
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
