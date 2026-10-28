/** Tap-to-sync logic, nudging, line helpers — integer milliseconds. */

import {
  uid,
  createEmptyProject,
  createLyricLine,
  lineMainText,
  lineFr,
  lineEn,
  isLyric,
  durationSec,
  msToSec,
  secToMs,
  migrateProject,
} from "./core/project.js";

export {
  uid,
  createEmptyProject,
  createLyricLine,
  lineMainText,
  lineFr,
  lineEn,
  isLyric,
  durationSec,
  msToSec,
  secToMs,
  migrateProject,
};

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
    warnings.push({ key: "warnFrCount", fr: fr.length, main: main.length });
  }
  if (en.length && en.length !== main.length) {
    warnings.push({ key: "warnEnCount", en: en.length, main: main.length });
  }

  const prev = (project.lines || []).filter(isLyric);
  const map = lcsIndexMap(
    prev.map((l) => lineMainText(l)),
    main
  );
  const usedOld = new Set(map.filter((idx) => idx >= 0));

  let changed = 0;
  let added = 0;

  const lines = main.map((text, i) => {
    let oldIdx = map[i];
    let kind = "match";
    if (oldIdx < 0) {
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
    if (kind === "match" && old && lineMainText(old) !== text) changed += 1;

    return createLyricLine({
      id: old?.id,
      startMs: kind === "add" ? null : (old?.startMs ?? null),
      endMs: kind === "add" ? null : (old?.endMs ?? null),
      kab: text,
      fr: fr[i] || "",
      en: en[i] || "",
      endManual: kind === "add" ? false : Boolean(old?.endManual),
    });
  });

  recomputeEnds(lines, project.audio?.durationMs || 0);
  return { lines, warnings, main, fr, en, changed, added };
}

/** @param {number} durationMs song length in integer milliseconds */
export function recomputeEnds(lines, durationMs = 0) {
  const dur = Math.max(0, Math.round(Number(durationMs) || 0));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isLyric(line)) continue;
    const next = lines.slice(i + 1).find(isLyric);
    if (line.startMs == null) {
      line.endMs = null;
      continue;
    }
    // Preserve manually set end on the last timed lyric (B5)
    if (line.endManual && !(next && next.startMs != null)) continue;
    if (next && next.startMs != null) {
      line.endMs = next.startMs;
    } else if (dur > 0) {
      line.endMs = dur;
    } else {
      line.endMs = line.startMs + 3000;
    }
  }
  return lines;
}

/** @param {number} timeMs */
export function tapLine(project, lineIndex, timeMs) {
  const lines = project.lines;
  if (!lines.length) return null;

  const t = snapMs(timeMs);
  const prevState = snapshotTimings(lines);
  const lyrics = lines.map((l, i) => ({ l, i })).filter(({ l }) => isLyric(l));
  if (!lyrics.length) return null;

  const allStarted = lyrics.every(({ l }) => l.startMs != null);
  const lastEntry = lyrics[lyrics.length - 1];
  const last = lastEntry.l;

  if (allStarted) {
    if (last.endManual) {
      return { prevState, nextIndex: lines.length, done: true, noop: true };
    }
    const minEnd = last.startMs + 10;
    last.endMs = Math.max(minEnd, t);
    last.endManual = true;
    return { prevState, nextIndex: lines.length, done: true, setEnd: true };
  }

  if (lineIndex < 0 || lineIndex >= lines.length) return null;
  const line = lines[lineIndex];
  if (!isLyric(line)) return null;

  line.startMs = t;
  line.endManual = false;
  const prevLyric = lyrics.filter(({ i }) => i < lineIndex).at(-1);
  if (prevLyric && prevLyric.l.startMs != null && !prevLyric.l.endManual) {
    prevLyric.l.endMs = t;
  }
  recomputeEnds(lines, project.audio?.durationMs || 0);

  const nextUntimed = lines.findIndex((l) => isLyric(l) && l.startMs == null);
  if (nextUntimed === -1) {
    return { prevState, nextIndex: lastEntry.i, awaitingEnd: true };
  }
  return { prevState, nextIndex: nextUntimed };
}

export function undoTimings(lines, prevState) {
  if (!prevState) return;
  for (let i = 0; i < lines.length; i++) {
    if (prevState[i] && isLyric(lines[i])) {
      lines[i].startMs = prevState[i].startMs;
      lines[i].endMs = prevState[i].endMs;
      lines[i].endManual = prevState[i].endManual || false;
    }
  }
}

export function snapshotTimings(lines) {
  return lines.map((l) =>
    isLyric(l)
      ? { startMs: l.startMs, endMs: l.endMs, endManual: Boolean(l.endManual) }
      : { startMs: null, endMs: null, endManual: false }
  );
}

/** Neighbour clamp (±10 ms gap). timeMs in ms. */
export function clampLineStart(lines, lineIndex, timeMs, durationMs = 0) {
  const GAP = 10;
  let min = 0;
  let max = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  for (let i = lineIndex - 1; i >= 0; i--) {
    if (isLyric(lines[i]) && lines[i].startMs != null) {
      min = lines[i].startMs + GAP;
      break;
    }
  }
  for (let i = lineIndex + 1; i < lines.length; i++) {
    if (isLyric(lines[i]) && lines[i].startMs != null) {
      max = lines[i].startMs - GAP;
      break;
    }
  }
  if (max < min) max = min;
  const t = Math.max(min, Math.min(max, timeMs));
  return snapMs(Math.max(0, t));
}

/** @param {number} deltaMs */
export function nudgeLine(project, lineIndex, deltaMs) {
  const line = project.lines[lineIndex];
  if (!line || !isLyric(line) || line.startMs == null) return;
  const dur = project.audio?.durationMs || 0;
  line.startMs = clampLineStart(project.lines, lineIndex, line.startMs + deltaMs, dur);
  recomputeEnds(project.lines, dur);
}

/** @param {number} timeMs */
export function setLineStart(project, lineIndex, timeMs) {
  const line = project.lines[lineIndex];
  if (!line || !isLyric(line)) return;
  const dur = project.audio?.durationMs || 0;
  line.startMs = clampLineStart(project.lines, lineIndex, timeMs, dur);
  recomputeEnds(project.lines, dur);
}

export function snapMs(ms, step = 10) {
  return Math.round(Number(ms) / step) * step;
}

/** @deprecated use snapMs */
export function snapTime(t, step = 0.01) {
  return msToSec(snapMs(secToMs(t) ?? 0, Math.round(step * 1000))) ?? 0;
}

/** @param {number} timeMs */
export function lineAtTime(lines, timeMs) {
  let active = -1;
  const t = Math.round(Number(timeMs) || 0);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!isLyric(l) || l.startMs == null) continue;
    if (t >= l.startMs) active = i;
    else break;
  }
  return active;
}

export function firstUntimedIndex(lines) {
  const i = lines.findIndex((l) => isLyric(l) && l.startMs == null);
  return i === -1 ? Math.max(0, lines.length - 1) : i;
}

export function nextTapIndex(lines) {
  const untimed = lines.findIndex((l) => isLyric(l) && l.startMs == null);
  if (untimed !== -1) return untimed;
  if (!lines.length) return 0;
  const lyrics = lines.filter(isLyric);
  const last = lyrics.at(-1);
  if (last?.startMs != null && !last.endManual) return lines.length;
  return lines.length;
}

export function isSyncComplete(lines) {
  const lyrics = lines.filter(isLyric);
  return (
    lyrics.length > 0 &&
    lyrics.every((l) => l.startMs != null) &&
    Boolean(lyrics.at(-1)?.endManual)
  );
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

export function formatMs(ms, opts) {
  return formatTime(msToSec(ms) ?? 0, opts);
}

export function timedLines(lines) {
  return lines.filter((l) => isLyric(l) && l.startMs != null);
}
