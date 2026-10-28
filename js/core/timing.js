/** Pure timing helpers: offset, gap, hold mode, calibration. */

export const DEFAULT_TAP_OFFSET_MS = -150;
export const CALIBRATION_CLICKS = 8;
export const CALIBRATION_INTERVAL_MS = 500;

/** Apply tap offset to a raw tap time (ms). */
export function applyTapOffset(timeMs, offsetMs = DEFAULT_TAP_OFFSET_MS) {
  const t = Math.round(Number(timeMs) || 0) + Math.round(Number(offsetMs) || 0);
  return Math.max(0, t);
}

/**
 * Average delay from calibration samples.
 * @param {number[]} expectedMs click times
 * @param {number[]} actualMs user tap times (same length)
 */
export function computeAverageDelayMs(expectedMs, actualMs) {
  if (!expectedMs?.length || expectedMs.length !== actualMs?.length) return 0;
  let sum = 0;
  for (let i = 0; i < expectedMs.length; i++) {
    sum += actualMs[i] - expectedMs[i];
  }
  return Math.round(sum / expectedMs.length);
}

/** Suggested tap offset from average delay (negate so late taps move earlier). */
export function offsetFromAverageDelay(avgDelayMs) {
  return -Math.round(Number(avgDelayMs) || 0);
}

/**
 * End the current line at timeMs without starting the next (Gap).
 * Mutates lines; returns snapshot before change or null.
 */
export function gapEndLine(lines, activeIndex, timeMs, { isLyric, snapMs, clampEnd }) {
  if (activeIndex < 0 || activeIndex >= lines.length) return null;
  const line = lines[activeIndex];
  if (!isLyric(line) || line.startMs == null) return null;
  const t = snapMs(Math.max(line.startMs + 10, timeMs));
  const prev = {
    endMs: line.endMs,
    endManual: line.endManual,
  };
  line.endMs = clampEnd ? clampEnd(t, line, activeIndex) : t;
  line.endManual = true;
  return prev;
}

export function createCalibrationPlan(startMs = 0, count = CALIBRATION_CLICKS, interval = CALIBRATION_INTERVAL_MS) {
  const expected = [];
  for (let i = 0; i < count; i++) expected.push(startMs + i * interval);
  return expected;
}
