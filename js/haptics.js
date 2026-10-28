/** Subtle Vibration API helpers — no-op when unsupported or before a gesture. */

const canVibrate =
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

let unlocked = false;

function unlock() {
  unlocked = true;
  if (typeof window === "undefined") return;
  window.removeEventListener("pointerdown", unlock, true);
  window.removeEventListener("keydown", unlock, true);
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

function pulse(pattern) {
  if (!canVibrate || !unlocked) return;
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
