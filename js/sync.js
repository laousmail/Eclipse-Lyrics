/** Tap-to-sync logic, nudging, line helpers — integer milliseconds. */

import {
  uid,
  createEmptyProject,
  createLyricLine,
  createSectionLine,
  lineMainText,
  lineFr,
  lineEn,
  isLyric,
  durationSec,
  msToSec,
  secToMs,
  migrateProject,
} from "./core/project.js";
import { applyTapOffset, DEFAULT_TAP_OFFSET_MS, gapEndLine as gapEndLineCore } from "./core/timing.js";
import { isSectionText, sectionLabel, parseLinesWithSections } from "./core/lyrics.js";

export {
  uid,
  createEmptyProject,
  createLyricLine,
  createSectionLine,
  lineMainText,
  lineFr,
  lineEn,
  isLyric,
  durationSec,
  msToSec,
  secToMs,
  migrateProject,
  applyTapOffset,
  DEFAULT_TAP_OFFSET_MS,
  isSectionText,
  sectionLabel,
  parseLinesWithSections,
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
  const mainRaw = parseLyricText(mainText);
  const fr = parseLyricText(frText);
  const en = parseLyricText(enText);

  const draft = parseLinesWithSections(mainRaw, fr, en);
  const mainLyrics = draft.filter(isLyric).map((l) => lineMainText(l));

  const warnings = [];
  if (fr.length && fr.length !== mainLyrics.length) {
    warnings.push({ key: "warnFrCount", fr: fr.length, main: mainLyrics.length });
  }
  if (en.length && en.length !== mainLyrics.length) {
    warnings.push({ key: "warnEnCount", en: en.length, main: mainLyrics.length });
  }

  const prev = (project.lines || []).filter(isLyric);
  const map = lcsIndexMap(
    prev.map((l) => lineMainText(l)),
    mainLyrics
  );
  const usedOld = new Set(map.filter((idx) => idx >= 0));

  let changed = 0;
  let added = 0;
  let lyricSlot = 0;

  const lines = draft.map((row) => {
    if (row.type === "section") {
      const oldSec = (project.lines || []).find(
        (l) => l.type === "section" && l.label === row.label
      );
      return createSectionLine({ id: oldSec?.id, label: row.label });
    }

    const text = lineMainText(row);
    let oldIdx = map[lyricSlot];
    let kind = "match";
    if (oldIdx < 0) {
      if (prev[lyricSlot] && !usedOld.has(lyricSlot)) {
        oldIdx = lyricSlot;
        usedOld.add(lyricSlot);
        kind = "edit";
      } else {
        kind = "add";
      }
    }

    const old = oldIdx >= 0 ? prev[oldIdx] : null;
    if (kind === "edit") changed += 1;
    if (kind === "add") added += 1;
    if (kind === "match" && old && lineMainText(old) !== text) changed += 1;

    const line = createLyricLine({
      id: old?.id,
      startMs: kind === "add" ? null : (old?.startMs ?? null),
      endMs: kind === "add" ? null : (old?.endMs ?? null),
      kab: text,
      fr: lineFr(row),
      en: lineEn(row),
      endManual: kind === "add" ? false : Boolean(old?.endManual),
    });
    lyricSlot += 1;
    return line;
  });

  recomputeEnds(lines, project.audio?.durationMs || 0);
  return { lines, warnings, main: mainLyrics, fr, en, changed, added };
}

/** Build lines from grid rows [{main,fr,en}, ...]. Rematches timings via LCS. */
export function applyLyricsFromRows(project, rows) {
  const cleaned = (rows || []).filter((r) => {
    const m = String(r?.main || "").trim();
    const f = String(r?.fr || "").trim();
    const e = String(r?.en || "").trim();
    return m || f || e;
  });

  const prev = (project.lines || []).filter(isLyric);
  const newLyricTexts = cleaned
    .filter((r) => !isSectionText(String(r.main || "").trim()))
    .map((r) => String(r.main || "").trim());
  const map = lcsIndexMap(
    prev.map((l) => lineMainText(l)),
    newLyricTexts
  );
  const usedOld = new Set(map.filter((idx) => idx >= 0));

  let changed = 0;
  let added = 0;
  let lyricSlot = 0;
  const frCount = cleaned.filter((r) => !isSectionText(String(r.main || "").trim()) && String(r.fr || "").trim()).length;
  const enCount = cleaned.filter((r) => !isSectionText(String(r.main || "").trim()) && String(r.en || "").trim()).length;
  const mainCount = newLyricTexts.length;
  const warnings = [];
  if (frCount && frCount !== mainCount) {
    warnings.push({ key: "warnFrCount", fr: frCount, main: mainCount });
  }
  if (enCount && enCount !== mainCount) {
    warnings.push({ key: "warnEnCount", en: enCount, main: mainCount });
  }

  const lines = cleaned.map((r) => {
    const main = String(r.main || "").trim();
    if (isSectionText(main)) {
      return createSectionLine({ label: sectionLabel(main) });
    }
    let oldIdx = map[lyricSlot];
    let kind = "match";
    if (oldIdx < 0) {
      if (prev[lyricSlot] && !usedOld.has(lyricSlot)) {
        oldIdx = lyricSlot;
        usedOld.add(lyricSlot);
        kind = "edit";
      } else {
        kind = "add";
      }
    }
    const old = oldIdx >= 0 ? prev[oldIdx] : null;
    if (kind === "edit") changed += 1;
    if (kind === "add") added += 1;
    if (kind === "match" && old && lineMainText(old) !== main) changed += 1;
    const line = createLyricLine({
      id: old?.id,
      startMs: kind === "add" ? null : (old?.startMs ?? null),
      endMs: kind === "add" ? null : (old?.endMs ?? null),
      kab: main,
      fr: String(r.fr || "").trim(),
      en: String(r.en || "").trim(),
      endManual: kind === "add" ? false : Boolean(old?.endManual),
    });
    lyricSlot += 1;
    return line;
  });

  recomputeEnds(lines, project.audio?.durationMs || 0);
  return { lines, warnings, main: newLyricTexts, changed, added };
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

/** @param {number} timeMs raw audio clock; offset applied inside */
export function tapLine(project, lineIndex, timeMs) {
  const lines = project.lines;
  if (!lines.length) return null;

  const offset = project.settings?.tapOffsetMs ?? DEFAULT_TAP_OFFSET_MS;
  const t = snapMs(applyTapOffset(timeMs, offset));
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

/** Gap: end current lyric now without starting the next. */
export function gapEndCurrent(project, activeIndex, timeMs) {
  const offset = project.settings?.tapOffsetMs ?? DEFAULT_TAP_OFFSET_MS;
  const t = snapMs(applyTapOffset(timeMs, offset));
  const prevState = snapshotTimings(project.lines);
  const changed = gapEndLineCore(project.lines, activeIndex, t, {
    isLyric,
    snapMs,
    clampEnd: (end, line, idx) => {
      const GAP = 10;
      let max = project.audio?.durationMs || end;
      for (let i = idx + 1; i < project.lines.length; i++) {
        if (isLyric(project.lines[i]) && project.lines[i].startMs != null) {
          max = project.lines[i].startMs - GAP;
          break;
        }
      }
      return Math.min(end, max);
    },
  });
  if (!changed) return null;
  return { prevState, nextIndex: activeIndex };
}

/** Hold-to-sing: press starts the line (same as tap start). */
export function holdPress(project, lineIndex, timeMs) {
  return tapLine(project, lineIndex, timeMs);
}

/**
 * Hold-to-sing: release ends the current line and advances pointer.
 * Prefer the line that was just started (lineIndex), not awaiting-end last.
 */
export function holdRelease(project, lineIndex, timeMs) {
  const lines = project.lines;
  if (!lines.length) return null;
  let idx = lineIndex;
  if (idx < 0 || idx >= lines.length || !isLyric(lines[idx]) || lines[idx].startMs == null) {
    // Fall back to last started lyric without manual end
    for (let i = lines.length - 1; i >= 0; i--) {
      if (isLyric(lines[i]) && lines[i].startMs != null && !lines[i].endManual) {
        idx = i;
        break;
      }
    }
  }
  const line = lines[idx];
  if (!line || !isLyric(line) || line.startMs == null) return null;

  const offset = project.settings?.tapOffsetMs ?? DEFAULT_TAP_OFFSET_MS;
  const t = snapMs(applyTapOffset(timeMs, offset));
  const prevState = snapshotTimings(lines);
  const minEnd = line.startMs + 10;
  line.endMs = Math.max(minEnd, t);
  line.endManual = true;

  // Do not auto-start next; pointer moves to next untimed
  const nextUntimed = lines.findIndex((l) => isLyric(l) && l.startMs == null);
  const nextIndex = nextUntimed === -1 ? lines.length : nextUntimed;
  return { prevState, nextIndex, setEnd: true, done: isSyncComplete(lines) };
}

/** Clamp end edge when dragging region; neighbors enforce order. */
export function clampLineEnd(lines, lineIndex, timeMs, durationMs = 0) {
  const line = lines[lineIndex];
  if (!line || !isLyric(line) || line.startMs == null) return null;
  const GAP = 10;
  let min = line.startMs + GAP;
  let max = durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY;
  for (let i = lineIndex + 1; i < lines.length; i++) {
    if (isLyric(lines[i]) && lines[i].startMs != null) {
      max = lines[i].startMs - GAP;
      break;
    }
  }
  if (max < min) max = min;
  return snapMs(Math.max(min, Math.min(max, timeMs)));
}

export function setLineEnd(project, lineIndex, timeMs) {
  const line = project.lines[lineIndex];
  if (!line || !isLyric(line) || line.startMs == null) return;
  const dur = project.audio?.durationMs || 0;
  line.endMs = clampLineEnd(project.lines, lineIndex, timeMs, dur);
  line.endManual = true;
}

/** Move a timed line by deltaMs, clamping neighbors. */
export function moveLineTiming(project, lineIndex, deltaMs) {
  const line = project.lines[lineIndex];
  if (!line || !isLyric(line) || line.startMs == null) return;
  const dur = project.audio?.durationMs || 0;
  const span = line.endMs != null ? line.endMs - line.startMs : 2000;
  const newStart = clampLineStart(project.lines, lineIndex, line.startMs + deltaMs, dur);
  line.startMs = newStart;
  line.endMs = clampLineEnd(project.lines, lineIndex, newStart + span, dur);
  line.endManual = true;
}

/** Lyric line ops used by Sync row menu. */
export function splitLyricAt(project, lineIndex, atChar) {
  const line = project.lines[lineIndex];
  if (!line || !isLyric(line)) return false;
  const text = lineMainText(line);
  const i = Math.max(0, Math.min(text.length, atChar ?? Math.ceil(text.length / 2)));
  const left = text.slice(0, i).trim();
  const right = text.slice(i).trim();
  if (!left || !right) return false;
  line.text.kab = left;
  const neu = createLyricLine({
    kab: right,
    fr: "",
    en: "",
    startMs: null,
    endMs: null,
  });
  project.lines.splice(lineIndex + 1, 0, neu);
  recomputeEnds(project.lines, project.audio?.durationMs || 0);
  return true;
}

export function mergeWithNext(project, lineIndex) {
  const a = project.lines[lineIndex];
  const b = project.lines[lineIndex + 1];
  if (!a || !b || !isLyric(a) || !isLyric(b)) return false;
  a.text.kab = `${lineMainText(a)} ${lineMainText(b)}`.trim();
  if (lineFr(b)) a.text.fr = `${lineFr(a)} ${lineFr(b)}`.trim();
  if (lineEn(b)) a.text.en = `${lineEn(a)} ${lineEn(b)}`.trim();
  if (b.endMs != null) a.endMs = b.endMs;
  if (b.endManual) a.endManual = true;
  project.lines.splice(lineIndex + 1, 1);
  recomputeEnds(project.lines, project.audio?.durationMs || 0);
  return true;
}

export function insertLineBelow(project, lineIndex) {
  const neu = createLyricLine({ kab: "" });
  project.lines.splice(lineIndex + 1, 0, neu);
  return true;
}

export function deleteLineAt(project, lineIndex) {
  if (lineIndex < 0 || lineIndex >= project.lines.length) return false;
  project.lines.splice(lineIndex, 1);
  recomputeEnds(project.lines, project.audio?.durationMs || 0);
  return true;
}

export function clearLineTime(project, lineIndex) {
  const line = project.lines[lineIndex];
  if (!line || !isLyric(line)) return false;
  line.startMs = null;
  line.endMs = null;
  line.endManual = false;
  recomputeEnds(project.lines, project.audio?.durationMs || 0);
  return true;
}

export function progressTimed(lines) {
  const lyrics = (lines || []).filter(isLyric);
  const timed = lyrics.filter((l) => l.startMs != null).length;
  return { timed, total: lyrics.length };
}
