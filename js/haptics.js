/** Subtle Vibration API helpers — no-op when unsupported. */

const canVibrate =
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

function pulse(pattern) {
  if (!canVibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

/** Light tick — tab switch, soft confirm */
export function tick() {
  pulse(8);
}

/** Medium — tap-to-sync mark */
export function tap() {
  pulse(14);
}

/** Soft double — success (apply lyrics, load audio, export) */
export function success() {
  pulse([10, 40, 12]);
}

/** Scrub commit (pointer up on scrubber) */
export function scrubCommit() {
  pulse(6);
}

/** Undo / caution */
export function soft() {
  pulse(5);
}
